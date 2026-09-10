export type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  username: string;
  country: string;
  status: 'active' | 'suspended' | 'deleted';
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
  /** In-memory only — backs the leaderboard's dev/test listing. */
  listUsers?(): Promise<AuthUser[]>;
};
