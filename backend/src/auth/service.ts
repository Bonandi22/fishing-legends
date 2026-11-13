import { SignJWT, jwtVerify } from 'jose';
import { hashPassword, hashToken, needsRehash, verifyPassword, createOpaqueToken } from './crypto.js';
import type { ChallengeService } from './challenges.js';
import type { AuthRepository, AuthUser } from './types.js';
import type { Locale } from '../email/types.js';
import { WeakPasswordError } from '../http/errors.js';
import { checkPassword } from '../../../src/game/passwordPolicy.js';

const ACCESS_ALGORITHM = 'HS256';
/** At most one register_attempt_notice per address in this window. */
const NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type AuthServiceConfig = {
  accessTokenSecret: Uint8Array;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
};

export type AuthServiceDeps = {
  challenges: ChallengeService;
  /** Injectable for tests; defaults to the Argon2id hasher. */
  hashPassword?: (password: string) => Promise<string>;
};

/**
 * Throws the status-specific code for a suspended or banned account. Any other
 * non-active status (deleted) throws `fallback`, revealing nothing new.
 */
function assertUsable(user: AuthUser, fallback: string): void {
  if (user.status === 'active') return;
  if (user.status === 'suspended') throw new Error('ACCOUNT_SUSPENDED');
  if (user.status === 'banned') throw new Error('ACCOUNT_BANNED');
  throw new Error(fallback);
}

export function createAuthService(repository: AuthRepository, config: AuthServiceConfig, deps: AuthServiceDeps) {
  const { challenges } = deps;
  const hash = deps.hashPassword ?? hashPassword;
  // Compared against when an account is not found, so login timing does not reveal
  // whether an email is registered. Computed once at startup.
  const decoyPasswordHash = hashPassword('deep-blue-lure/login-timing-equalizer');

  async function issueAccessToken(userId: string, sessionId: string): Promise<string> {
    return new SignJWT({ sub: userId, sid: sessionId, type: 'access' })
      .setProtectedHeader({ alg: ACCESS_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
      .sign(config.accessTokenSecret);
  }

  async function startSession(user: AuthUser) {
    assertUsable(user, 'INVALID_CREDENTIALS');
    const refreshToken = createOpaqueToken();
    const session = await repository.createSession({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + config.refreshTokenTtlSeconds * 1000),
    });
    return { accessToken: await issueAccessToken(user.id, session.id), refreshToken, session, user };
  }

  async function markVerified(user: AuthUser): Promise<AuthUser> {
    if (user.emailVerifiedAt) return user;
    await repository.markEmailVerified(user.id);
    return { ...user, emailVerifiedAt: new Date() };
  }

  /**
   * The answer for an address that already has an account: indistinguishable from a
   * fresh registration (a challenge id that never verifies), while the owner gets a
   * notice instead of a code. The notice is skipped silently at the address cap,
   * and after the first one in 24h: repeats tell the owner nothing new and would
   * only help fill the address cap.
   */
  async function existingEmailResponse(email: string, locale: Locale): Promise<{ challengeId: string }> {
    const challengeId = await challenges.issueDecoy(email, 'verify_email');
    const noticeSentRecently =
      (await repository.countEmailsTo(email, new Date(Date.now() - NOTICE_INTERVAL_MS), 'register_attempt_notice')) > 0;
    if (!noticeSentRecently && !(await challenges.addressAtCap(email))) {
      await repository.enqueueEmail({ kind: 'register_attempt_notice', to: email, locale, payload: {} });
    }
    return { challengeId };
  }

  return {
    async register(input: { email: string; password: string; username: string; country: string; locale?: Locale }) {
      const email = input.email.trim().toLowerCase();
      const username = input.username.trim();
      const locale = input.locale ?? 'en';

      // Everything before the email lookup is independent of whether the email is
      // registered, so neither its outcome nor its cost can reveal that.
      const issue = checkPassword(input.password, { email, username });
      if (issue) throw new WeakPasswordError(issue);
      // Both paths pay for the hash, keeping the response time in one class.
      const passwordHash = await hash(input.password);
      // Usernames are public (ranking): an explicit error leaks nothing about emails.
      if (await repository.isUsernameTaken(username)) throw new Error('USERNAME_TAKEN');

      const existing = await repository.findUserByEmail(email);
      if (existing) return existingEmailResponse(email, existing.locale);

      let user: AuthUser;
      try {
        user = await repository.createUser({ email, passwordHash, username, country: input.country, locale });
      } catch (error) {
        // Lost a race with a concurrent registration of the same email.
        if (error instanceof Error && error.message === 'ACCOUNT_ALREADY_EXISTS') {
          return existingEmailResponse(email, locale);
        }
        throw error;
      }
      return { challengeId: await challenges.issue(user, 'verify_email') };
    },

    async verifyEmail(input: { challengeId: string; code: string }) {
      const user = await challenges.verify(input.challengeId, input.code, ['verify_email']);
      return startSession(await markVerified(user));
    },

    async login(input: { email: string; password: string; locale?: Locale }) {
      let user = await repository.findUserByEmail(input.email.trim().toLowerCase());
      const passwordMatches = await verifyPassword(
        input.password,
        user?.passwordHash ?? (await decoyPasswordHash),
      );
      // A wrong password always wins: only someone holding it learns the account's status.
      if (!user || !passwordMatches) throw new Error('INVALID_CREDENTIALS');
      assertUsable(user, 'INVALID_CREDENTIALS');

      // Transparently migrate a legacy (scrypt) hash to the current scheme.
      if (needsRehash(user.passwordHash)) {
        await repository.updatePasswordHash(user.id, await hashPassword(input.password));
      }
      if (input.locale && input.locale !== user.locale) {
        await repository.setLocale(user.id, input.locale);
        user = { ...user, locale: input.locale };
      }

      // Always a `login` code, even for an account that never confirmed its email
      // (including every pre-existing one): verifyLogin marks it verified, since the
      // code proves the mailbox. Not `verify_email`, whose failed-attempt budget is
      // shared with the decoys anyone can create by registering the address, which
      // would let a stranger lock the owner out of login.
      return { challengeId: await challenges.issue(user, 'login') };
    },

    async verifyLogin(input: { challengeId: string; code: string }) {
      // Still accepts `verify_email`: challenges issued by login before it switched to
      // `login` codes stay usable until they expire.
      const user = await challenges.verify(input.challengeId, input.code, ['login', 'verify_email']);
      return startSession(await markVerified(user));
    },

    /**
     * Always answers with a challenge id. An unknown email gets a stored decoy that
     * goes through the same cap and cooldown, so the answer reveals nothing.
     */
    async forgotPassword(input: { email: string; locale?: Locale }) {
      const email = input.email.trim().toLowerCase();
      const user = await repository.findUserByEmail(email);
      if (!user || user.status !== 'active') {
        return { challengeId: await challenges.issueDecoy(email, 'password_reset') };
      }
      if (input.locale && input.locale !== user.locale) {
        await repository.setLocale(user.id, input.locale);
        user.locale = input.locale;
      }
      return { challengeId: await challenges.issue(user, 'password_reset') };
    },

    async resetPassword(input: { challengeId: string; code: string; newPassword: string }) {
      // The code is checked first: a wrong code costs an attempt and nothing else leaks.
      // A decoy challenge never verifies, so it can never reach the policy check. The
      // policy runs before the code is consumed, so a rejected password costs one
      // attempt, not the code.
      const user = await challenges.verify(input.challengeId, input.code, ['password_reset'], async u => {
        const issue = checkPassword(input.newPassword, { email: u.email, username: u.username });
        if (issue) throw new WeakPasswordError(issue);
        if (await verifyPassword(input.newPassword, u.passwordHash)) throw new WeakPasswordError('SAME_AS_CURRENT');
      });

      // No transaction spans these writes and the code is already consumed, so the order
      // decides the worst case: sessions revoked but password unchanged (the user simply
      // requests a new code), never a changed password with live sessions.
      await repository.revokeAllSessions(user.id);
      await repository.updatePasswordHash(user.id, await hash(input.newPassword));
      // The code proved possession of the mailbox.
      await markVerified(user);
    },

    async resendChallenge(challengeId: string) {
      return { challengeId: await challenges.resend(challengeId) };
    },

    async refresh(refreshToken: string) {
      const nextRefreshToken = createOpaqueToken();
      const rotation = await repository.rotateRefreshToken({
        presentedHash: hashToken(refreshToken),
        nextHash: hashToken(nextRefreshToken),
        nextExpiresAt: new Date(Date.now() + config.refreshTokenTtlSeconds * 1000),
      });
      if (rotation.outcome === 'reuse_detected') throw new Error('REFRESH_TOKEN_REUSED');
      if (rotation.outcome === 'invalid') throw new Error('INVALID_REFRESH_TOKEN');

      const user = await repository.findUserById(rotation.userId);
      if (!user) throw new Error('INVALID_REFRESH_TOKEN');
      assertUsable(user, 'INVALID_REFRESH_TOKEN');

      return { accessToken: await issueAccessToken(user.id, rotation.session.id), refreshToken: nextRefreshToken, session: rotation.session, user };
    },

    async logout(sessionId: string) {
      await repository.revokeSession(sessionId);
    },

    /** Runs on every authenticated request: one lookup by primary key. */
    async assertActive(userId: string): Promise<{ isAdmin: boolean }> {
      const user = await repository.findUserById(userId);
      if (!user) throw new Error('INVALID_ACCESS_TOKEN');
      assertUsable(user, 'INVALID_ACCESS_TOKEN');
      return { isAdmin: user.isAdmin };
    },

    async verifyAccessToken(token: string): Promise<{ userId: string; sessionId?: string }> {
      let result;
      try {
        result = await jwtVerify(token, config.accessTokenSecret, { algorithms: [ACCESS_ALGORITHM] });
      } catch {
        throw new Error('INVALID_ACCESS_TOKEN');
      }
      if (result.payload.type !== 'access' || typeof result.payload.sub !== 'string') {
        throw new Error('INVALID_ACCESS_TOKEN');
      }
      const sid = result.payload.sid;
      return { userId: result.payload.sub, sessionId: typeof sid === 'string' ? sid : undefined };
    },
  };
}
