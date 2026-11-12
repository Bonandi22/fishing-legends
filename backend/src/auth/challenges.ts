import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config/env.js';
import type { EmailKind } from '../email/types.js';
import type { AuthRepository, AuthUser, ChallengePurpose } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const MAX_CHALLENGES_PER_HOUR = 5;
const MAX_EMAILS_PER_ADDRESS_PER_HOUR = 10;
/**
 * Rolling ceiling on failed code attempts per (address, purpose). Per purpose so
 * that exhausting the anonymous reset budget cannot block login or verify_email.
 */
const MAX_FAILED_ATTEMPTS_PER_WINDOW = 30;
const FAILED_ATTEMPTS_WINDOW_MS = 24 * HOUR_MS;

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

  /**
   * The per-address cap only ever suppresses sending: it never throws. Notices can
   * push a real address over it while a decoy never reaches it, so an error here
   * would tell a caller whether the address has an account.
   */
  async function addressAtCap(address: string): Promise<boolean> {
    return (await repo.countEmailsTo(address, new Date(now().getTime() - HOUR_MS))) >= MAX_EMAILS_PER_ADDRESS_PER_HOUR;
  }

  /**
   * `afterPasswordCheck`: the caller has just verified the account's password.
   * Such codes (and every `login` code, which is only ever issued or resent after
   * that check) skip the per-address cap: a stranger cannot trigger them, so they
   * cannot flood the inbox, and capping them would let anyone who fills the address
   * with resets and notices keep its owner from logging in. The per-user hourly cap
   * still applies.
   */
  async function issue(
    user: AuthUser,
    purpose: ChallengePurpose,
    opts: { afterPasswordCheck?: boolean } = {},
  ): Promise<string> {
    const since = new Date(now().getTime() - HOUR_MS);
    if ((await repo.countChallengesSince(user.id, purpose, since)) >= MAX_CHALLENGES_PER_HOUR) {
      throw new Error('RESEND_TOO_SOON');
    }
    const code = newCode();
    const passwordGated = purpose === 'login' || opts.afterPasswordCheck === true;
    const suppressEmail = !passwordGated && (await addressAtCap(user.email));
    return repo.createChallenge({
      userId: user.id,
      purpose,
      codeHash: hash(code),
      expiresAt: expiry(),
      email: suppressEmail ? null : {
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
    if ((await repo.countDecoyChallengesSince(email, purpose, since)) >= MAX_CHALLENGES_PER_HOUR) {
      throw new Error('RESEND_TOO_SOON');
    }
    return repo.createDecoyChallenge({ email, purpose, codeHash: hash(newCode()), expiresAt: expiry() });
  }

  /**
   * `beforeConsume` runs after the code matched and before the challenge is
   * consumed; if it throws, the challenge stays usable (the attempt still counts).
   */
  async function verify(
    challengeId: string,
    code: string,
    purposes: ChallengePurpose[],
    beforeConsume?: (user: AuthUser) => Promise<void>,
  ): Promise<AuthUser> {
    const challenge = await repo.findChallenge(challengeId);
    if (!challenge || challenge.invalidatedAt || challenge.consumedAt || !purposes.includes(challenge.purpose)) {
      throw new Error('CHALLENGE_NOT_FOUND');
    }
    if (now().getTime() >= challenge.expiresAt.getTime()) throw new Error('CHALLENGE_EXPIRED');

    const user = challenge.userId === null ? null : await repo.findUserById(challenge.userId);
    if (challenge.userId !== null && !user) throw new Error('CHALLENGE_NOT_FOUND');

    // Long-horizon ceiling per (address, purpose), keyed on the address so a decoy
    // issued for a registered address shares that account's budget (otherwise the
    // two would diverge and reveal that the address exists). Checked before
    // reserving: a refused guess costs nothing, and the right code is refused too
    // until the window clears.
    const subject = user ? user.email : challenge.decoyEmail ?? '';
    const windowStart = new Date(now().getTime() - FAILED_ATTEMPTS_WINDOW_MS);
    if ((await repo.countFailedAttemptsSince(subject, challenge.purpose, windowStart)) >= MAX_FAILED_ATTEMPTS_PER_WINDOW) {
      throw new Error('TOO_MANY_ATTEMPTS');
    }

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
    if (!codeOk || !user) {
      throw new Error(reserved >= cfg.maxAttempts ? 'TOO_MANY_ATTEMPTS' : 'INVALID_CODE');
    }

    if (beforeConsume) await beforeConsume(user);
    if (!(await repo.consumeChallenge(challengeId))) throw new Error('CHALLENGE_NOT_FOUND');
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

  return { issue, issueDecoy, verify, resend, isStillValid, addressAtCap };
}

export type ChallengeService = ReturnType<typeof createChallengeService>;
