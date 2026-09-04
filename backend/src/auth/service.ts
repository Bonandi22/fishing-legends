import { SignJWT, jwtVerify } from 'jose';
import { hashPassword, hashToken, verifyPassword, createOpaqueToken } from './crypto.js';
import type { AuthRepository } from './types.js';

const ACCESS_ALGORITHM = 'HS256';

export type AuthServiceConfig = {
  accessTokenSecret: Uint8Array;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
};

export function createAuthService(repository: AuthRepository, config: AuthServiceConfig) {
  async function issueAccessToken(userId: string): Promise<string> {
    return new SignJWT({ sub: userId, type: 'access' })
      .setProtectedHeader({ alg: ACCESS_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
      .sign(config.accessTokenSecret);
  }

  return {
    async register(input: { email: string; password: string; username: string; country: string }) {
      const email = input.email.trim().toLowerCase();
      const existing = await repository.findUserByEmail(email);
      if (existing) throw new Error('ACCOUNT_ALREADY_EXISTS');

      const user = await repository.createUser({
        email,
        passwordHash: await hashPassword(input.password),
        username: input.username.trim(),
        country: input.country,
      });
      const refreshToken = createOpaqueToken();
      const session = await repository.createSession({
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + config.refreshTokenTtlSeconds * 1000),
      });
      return { accessToken: await issueAccessToken(user.id), refreshToken, session, user };
    },

    async login(input: { email: string; password: string }) {
      const user = await repository.findUserByEmail(input.email.trim().toLowerCase());
      if (!user || !(await verifyPassword(input.password, user.passwordHash)) || user.status !== 'active') {
        throw new Error('INVALID_CREDENTIALS');
      }

      const refreshToken = createOpaqueToken();
      const session = await repository.createSession({
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + config.refreshTokenTtlSeconds * 1000),
      });
      return { accessToken: await issueAccessToken(user.id), refreshToken, session, user };
    },

    async refresh(refreshToken: string) {
      const session = await repository.findSessionByTokenHash(hashToken(refreshToken));
      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        throw new Error('INVALID_REFRESH_TOKEN');
      }

      const user = await repository.findUserById(session.userId);
      if (!user || user.status !== 'active') throw new Error('INVALID_REFRESH_TOKEN');

      const nextRefreshToken = createOpaqueToken();
      const rotated = await repository.rotateSession({
        sessionId: session.id,
        refreshTokenHash: hashToken(nextRefreshToken),
        expiresAt: new Date(Date.now() + config.refreshTokenTtlSeconds * 1000),
      });
      if (!rotated) throw new Error('INVALID_REFRESH_TOKEN');

      return { accessToken: await issueAccessToken(user.id), refreshToken: nextRefreshToken, session: rotated, user };
    },

    async logout(sessionId: string) {
      await repository.revokeSession(sessionId);
    },

    async verifyAccessToken(token: string) {
      const result = await jwtVerify(token, config.accessTokenSecret, { algorithms: [ACCESS_ALGORITHM] });
      if (result.payload.type !== 'access' || typeof result.payload.sub !== 'string') {
        throw new Error('INVALID_ACCESS_TOKEN');
      }
      return result.payload.sub;
    },
  };
}
