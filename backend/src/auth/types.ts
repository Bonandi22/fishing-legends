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
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
};

export type AuthRepository = {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  createUser(input: {
    email: string;
    passwordHash: string;
    username: string;
    country: string;
  }): Promise<AuthUser>;
  createSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<AuthSession>;
  rotateSession(input: {
    sessionId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<AuthSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSession | null>;
};
