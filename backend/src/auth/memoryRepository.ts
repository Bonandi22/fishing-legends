import { randomUUID } from 'node:crypto';
import type { AuthRepository, AuthSession, AuthUser } from './types.js';

export function createMemoryAuthRepository(): AuthRepository {
  const users = new Map<string, AuthUser>();
  const sessions = new Map<string, AuthSession>();

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
      const session: AuthSession = { id: randomUUID(), ...input };
      sessions.set(session.id, session);
      return session;
    },
    async rotateSession(input) {
      const current = sessions.get(input.sessionId);
      if (!current || current.revokedAt) return null;
      const next = { ...current, ...input };
      sessions.set(next.id, next);
      return next;
    },
    async revokeSession(sessionId) {
      const current = sessions.get(sessionId);
      if (current) sessions.set(sessionId, { ...current, revokedAt: new Date() });
    },
    async findSessionByTokenHash(tokenHash) {
      return [...sessions.values()].find(session => session.refreshTokenHash === tokenHash) ?? null;
    },
  };
}
