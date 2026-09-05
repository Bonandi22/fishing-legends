import { randomUUID } from 'node:crypto';
import type { AuthRepository, AuthSession, AuthUser, RefreshRotation } from './types.js';

type TokenRecord = {
  id: string;
  sessionId: string;
  replacedAt?: Date;
  revokedAt?: Date;
};

export function createMemoryAuthRepository(): AuthRepository {
  const users = new Map<string, AuthUser>();
  const sessions = new Map<string, AuthSession>();
  const tokensByHash = new Map<string, TokenRecord>();

  function revokeFamily(sessionId: string): void {
    const now = new Date();
    for (const token of tokensByHash.values()) {
      if (token.sessionId === sessionId && !token.revokedAt) token.revokedAt = now;
    }
    const session = sessions.get(sessionId);
    if (session) sessions.set(sessionId, { ...session, revokedAt: now });
  }

  return {
    async findUserByEmail(email) {
      return [...users.values()].find(user => user.email === email) ?? null;
    },
    async findUserById(id) {
      return users.get(id) ?? null;
    },
    async createUser(input) {
      const user: AuthUser = { id: randomUUID(), status: 'active', ...input };
      users.set(user.id, user);
      return user;
    },
    async createSession(input) {
      const session: AuthSession = { id: randomUUID(), userId: input.userId, expiresAt: input.expiresAt };
      sessions.set(session.id, session);
      tokensByHash.set(input.tokenHash, { id: randomUUID(), sessionId: session.id });
      return session;
    },
    async rotateRefreshToken({ presentedHash, nextHash, nextExpiresAt }): Promise<RefreshRotation> {
      const token = tokensByHash.get(presentedHash);
      if (!token) return { outcome: 'invalid' };
      const session = sessions.get(token.sessionId);

      if (token.replacedAt || token.revokedAt || session?.revokedAt) {
        revokeFamily(token.sessionId);
        return { outcome: 'reuse_detected' };
      }
      if (!session || session.expiresAt <= new Date()) return { outcome: 'invalid' };

      token.replacedAt = new Date();
      tokensByHash.set(nextHash, { id: randomUUID(), sessionId: session.id });
      const updated: AuthSession = { ...session, expiresAt: nextExpiresAt };
      sessions.set(session.id, updated);
      return { outcome: 'rotated', session: updated, userId: session.userId };
    },
    async revokeSession(sessionId) {
      revokeFamily(sessionId);
    },
  };
}
