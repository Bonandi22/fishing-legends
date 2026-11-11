import type { EmailMessage, Locale } from '../email/types.js';

export type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  username: string;
  country: string;
  status: 'active' | 'suspended' | 'deleted';
  emailVerifiedAt: Date | null;
  locale: Locale;
};

export type ChallengePurpose = 'verify_email' | 'login' | 'password_reset';

export type AuthChallenge = {
  id: string;
  userId: string;
  purpose: ChallengePurpose;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
};

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt?: Date;
};

/**
 * Result of presenting a refresh token for rotation.
 * - `rotated`: the token was the live tip of its chain; a new token was issued.
 * - `reuse_detected`: the token had already been rotated away or revoked — the
 *   whole session family has now been revoked.
 * - `invalid`: unknown token, or the session is expired/revoked.
 */
export type RefreshRotation =
  | { outcome: 'rotated'; session: AuthSession; userId: string }
  | { outcome: 'reuse_detected' }
  | { outcome: 'invalid' };

export type AuthRepository = {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  createUser(input: {
    email: string;
    passwordHash: string;
    username: string;
    country: string;
    locale: Locale;
  }): Promise<AuthUser>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<AuthSession>;
  rotateRefreshToken(input: {
    presentedHash: string;
    nextHash: string;
    nextExpiresAt: Date;
  }): Promise<RefreshRotation>;
  revokeSession(sessionId: string): Promise<void>;
  /**
   * One transaction: invalidates the user's live challenges of the same purpose,
   * inserts the challenge, and enqueues the email with its challengeId.
   */
  createChallenge(input: {
    userId: string;
    purpose: ChallengePurpose;
    codeHash: string;
    expiresAt: Date;
    email: Omit<EmailMessage, 'id' | 'createdAt' | 'challengeId'>;
  }): Promise<string>;
  findChallenge(id: string): Promise<AuthChallenge | null>;
  /** Returns the new attempt count. */
  recordFailedAttempt(id: string): Promise<number>;
  /** Atomic: true only for the single caller that consumed a live challenge. */
  consumeChallenge(id: string): Promise<boolean>;
  countChallengesSince(userId: string, since: Date): Promise<number>;
  /** Emails (any kind/status) addressed to the address since `since`. */
  countEmailsTo(address: string, since: Date): Promise<number>;
  markEmailVerified(userId: string): Promise<void>;
  setLocale(userId: string, locale: Locale): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;
  /** Deletes unverified accounts whose verification window started before `olderThan`. Returns the count. */
  deleteStaleUnverified(olderThan: Date): Promise<number>;
  /** Enqueue a notice that has no challenge. */
  enqueueEmail(msg: Omit<EmailMessage, 'id' | 'createdAt'>): Promise<void>;
  /** In-memory only — backs the leaderboard's dev/test listing. */
  listUsers?(): Promise<AuthUser[]>;
};
