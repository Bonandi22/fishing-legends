import type { EmailKind, EmailMessage, Locale } from '../email/types.js';

export type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  username: string;
  country: string;
  status: 'active' | 'suspended' | 'banned' | 'deleted';
  isAdmin: boolean;
  emailVerifiedAt: Date | null;
  locale: Locale;
};

export type ChallengePurpose = 'verify_email' | 'login' | 'password_reset';

export type AuthChallenge = {
  id: string;
  /** Null for a decoy challenge (anti-enumeration; never emailed). */
  userId: string | null;
  decoyEmail: string | null;
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
  /** Case-insensitive, like the unique index on lower(username). */
  isUsernameTaken(username: string): Promise<boolean>;
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
   * inserts the challenge, and enqueues the email with its challengeId. `email:
   * null` stores the challenge without sending anything (address over its cap).
   */
  createChallenge(input: {
    userId: string;
    purpose: ChallengePurpose;
    codeHash: string;
    expiresAt: Date;
    email: Omit<EmailMessage, 'id' | 'createdAt' | 'challengeId'> | null;
  }): Promise<string>;
  findChallenge(id: string): Promise<AuthChallenge | null>;
  /**
   * Atomically reserves one guess on a live challenge. Returns the new attempt
   * count, or null when the challenge is not live or already used `max` attempts.
   */
  reserveAttempt(id: string, max: number): Promise<number | null>;
  /** Stores a decoy row (no user, never emailed); invalidates prior live decoys for the same email+purpose. */
  createDecoyChallenge(input: {
    email: string;
    purpose: ChallengePurpose;
    codeHash: string;
    expiresAt: Date;
  }): Promise<string>;
  countDecoyChallengesSince(email: string, purpose: ChallengePurpose, since: Date): Promise<number>;
  /** Atomic: true only for the single caller that consumed a live challenge. */
  consumeChallenge(id: string): Promise<boolean>;
  countChallengesSince(userId: string, purpose: ChallengePurpose, since: Date): Promise<number>;
  /** Emails (any status; any kind unless `kind` is given) addressed to the address since `since`. */
  countEmailsTo(address: string, since: Date, kind?: EmailKind): Promise<number>;
  /**
   * Failed code attempts on `purpose` challenges created since `since` that belong
   * to the address: the account registered with it and decoys issued for it.
   * Every reserved attempt counts as failed except the one that consumed a challenge.
   */
  countFailedAttemptsSince(email: string, purpose: ChallengePurpose, since: Date): Promise<number>;
  markEmailVerified(userId: string): Promise<void>;
  setLocale(userId: string, locale: Locale): Promise<void>;
  /** `tx` is an implementation-specific transaction handle (a Drizzle transaction in PostgreSQL). */
  revokeAllSessions(userId: string, tx?: unknown): Promise<void>;
  /** `tx` as in `revokeAllSessions`: joins the caller's transaction when given. */
  setStatus(userId: string, status: AuthUser['status'], tx?: unknown): Promise<void>;
  /**
   * Deletes unverified accounts whose verification window started before `olderThan`.
   * Never deletes suspended or banned accounts. Returns the count.
   */
  deleteStaleUnverified(olderThan: Date): Promise<number>;
  /** Deletes challenges (real and decoy) that expired before `olderThan`. Returns the count. */
  deleteExpiredChallenges(olderThan: Date): Promise<number>;
  /** Retention: deletes sent/failed outbox rows created before `olderThan`. Returns the count. */
  deleteFinishedEmails(olderThan: Date): Promise<number>;
  /** Enqueue a notice that has no challenge. */
  enqueueEmail(msg: Omit<EmailMessage, 'id' | 'createdAt'>): Promise<void>;
  /** In-memory only — backs the leaderboard's dev/test listing. */
  listUsers?(): Promise<AuthUser[]>;
};
