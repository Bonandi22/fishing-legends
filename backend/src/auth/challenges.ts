import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config/env.js';
import type { EmailKind } from '../email/types.js';
import type { AuthRepository, AuthUser, ChallengePurpose } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const MAX_CHALLENGES_PER_HOUR = 5;
const MAX_EMAILS_PER_ADDRESS_PER_HOUR = 10;

const KIND_BY_PURPOSE: Record<ChallengePurpose, EmailKind> = {
  verify_email: 'verify_email_code',
  login: 'login_code',
  password_reset: 'password_reset_code',
};

export function createChallengeService(
  repo: AuthRepository,
  cfg: AppConfig['authCodes'],
  now: () => Date = () => new Date(),
) {
  const hash = (code: string) => createHmac('sha256', cfg.secret).update(code).digest('hex');

  function matches(code: string, storedHash: string): boolean {
    const a = Buffer.from(hash(code), 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiry = () => new Date(now().getTime() + cfg.ttlSeconds * 1000);

  async function assertUnderCaps(user: AuthUser): Promise<void> {
    const since = new Date(now().getTime() - HOUR_MS);
    if ((await repo.countChallengesSince(user.id, since)) >= MAX_CHALLENGES_PER_HOUR) {
      throw new Error('RESEND_TOO_SOON');
    }
    if ((await repo.countEmailsTo(user.email, since)) >= MAX_EMAILS_PER_ADDRESS_PER_HOUR) {
      throw new Error('RESEND_TOO_SOON');
    }
  }

  async function issue(user: AuthUser, purpose: ChallengePurpose): Promise<string> {
    await assertUnderCaps(user);
    const code = newCode();
    return repo.createChallenge({
      userId: user.id,
      purpose,
      codeHash: hash(code),
      expiresAt: expiry(),
      email: {
        kind: KIND_BY_PURPOSE[purpose],
        to: user.email,
        locale: user.locale,
        payload: { code, minutes: String(cfg.ttlSeconds / 60) },
      },
    });
  }

  /**
   * Stores a challenge for an address with no eligible account. It is rate limited
   * and verifiable exactly like a real one, but its code is random, never sent and
   * never accepted.
   */
  async function issueDecoy(email: string, purpose: ChallengePurpose): Promise<string> {
    const since = new Date(now().getTime() - HOUR_MS);
    if ((await repo.countDecoyChallengesSince(email, since)) >= MAX_CHALLENGES_PER_HOUR) {
      throw new Error('RESEND_TOO_SOON');
    }
    return repo.createDecoyChallenge({ email, purpose, codeHash: hash(newCode()), expiresAt: expiry() });
  }

  async function verify(challengeId: string, code: string, purposes: ChallengePurpose[]): Promise<AuthUser> {
    const challenge = await repo.findChallenge(challengeId);
    if (!challenge || challenge.invalidatedAt || challenge.consumedAt || !purposes.includes(challenge.purpose)) {
      throw new Error('CHALLENGE_NOT_FOUND');
    }
    if (now().getTime() >= challenge.expiresAt.getTime()) throw new Error('CHALLENGE_EXPIRED');

    // Reserve the guess atomically before comparing, so concurrent requests cannot
    // exceed the attempt cap.
    const reserved = await repo.reserveAttempt(challengeId, cfg.maxAttempts);
    if (reserved === null) {
      const current = await repo.findChallenge(challengeId);
      if (!current || current.invalidatedAt || current.consumedAt) throw new Error('CHALLENGE_NOT_FOUND');
      throw new Error('TOO_MANY_ATTEMPTS');
    }

    const candidate = code.trim();
    const codeOk = /^\d{6}$/.test(candidate) && matches(candidate, challenge.codeHash);
    if (!codeOk || challenge.userId === null) {
      throw new Error(reserved >= cfg.maxAttempts ? 'TOO_MANY_ATTEMPTS' : 'INVALID_CODE');
    }

    if (!(await repo.consumeChallenge(challengeId))) throw new Error('CHALLENGE_NOT_FOUND');
    const user = await repo.findUserById(challenge.userId);
    if (!user) throw new Error('CHALLENGE_NOT_FOUND');
    return user;
  }

  async function resend(challengeId: string): Promise<string> {
    const old = await repo.findChallenge(challengeId);
    if (!old || old.invalidatedAt || old.consumedAt) throw new Error('CHALLENGE_NOT_FOUND');
    if (now().getTime() - old.createdAt.getTime() < cfg.resendCooldownSeconds * 1000) {
      throw new Error('RESEND_TOO_SOON');
    }
    if (old.userId === null) {
      if (!old.decoyEmail) throw new Error('CHALLENGE_NOT_FOUND');
      return issueDecoy(old.decoyEmail, old.purpose);
    }
    const user = await repo.findUserById(old.userId);
    if (!user) throw new Error('CHALLENGE_NOT_FOUND');
    return issue(user, old.purpose);
  }

  async function isStillValid(challengeId: string): Promise<boolean> {
    const c = await repo.findChallenge(challengeId);
    return !!c && !c.consumedAt && !c.invalidatedAt && now().getTime() < c.expiresAt.getTime();
  }

  return { issue, issueDecoy, verify, resend, isStillValid };
}

export type ChallengeService = ReturnType<typeof createChallengeService>;
