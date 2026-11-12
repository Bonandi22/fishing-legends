import { randomUUID } from 'node:crypto';
import { createMemoryOutbox } from '../email/outbox.js';
import type { EmailOutbox } from '../email/types.js';
import type { AuthChallenge, AuthRepository, AuthSession, AuthUser, RefreshRotation } from './types.js';

type TokenRecord = {
  id: string;
  sessionId: string;
  replacedAt?: Date;
  revokedAt?: Date;
};

export function createMemoryAuthRepository(outbox: EmailOutbox = createMemoryOutbox()): AuthRepository {
  const users = new Map<string, AuthUser>();
  const challenges = new Map<string, AuthChallenge>();
  const verificationRequiredSince = new Map<string, Date>();
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
    async isUsernameTaken(username) {
      const target = username.toLowerCase();
      return [...users.values()].some(u => u.username.toLowerCase() === target);
    },
    async createUser(input) {
      if ([...users.values()].some(u => u.email === input.email)) throw new Error('ACCOUNT_ALREADY_EXISTS');
      if ([...users.values()].some(u => u.username.toLowerCase() === input.username.toLowerCase())) {
        throw new Error('USERNAME_TAKEN');
      }
      const user: AuthUser = { id: randomUUID(), status: 'active', emailVerifiedAt: null, ...input };
      users.set(user.id, user);
      verificationRequiredSince.set(user.id, new Date());
      return user;
    },
    async updatePasswordHash(userId, passwordHash) {
      const user = users.get(userId);
      if (user) users.set(userId, { ...user, passwordHash });
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
    async createChallenge(input) {
      if (!users.has(input.userId)) throw new Error('USER_NOT_FOUND');
      const now = new Date();
      for (const [id, c] of challenges) {
        if (c.userId === input.userId && c.purpose === input.purpose && !c.consumedAt && !c.invalidatedAt) {
          challenges.set(id, { ...c, invalidatedAt: now });
        }
      }
      const id = randomUUID();
      challenges.set(id, {
        id,
        userId: input.userId,
        decoyEmail: null,
        purpose: input.purpose,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        attempts: 0,
        consumedAt: null,
        invalidatedAt: null,
        createdAt: now,
      });
      if (input.email) await outbox.enqueue({ ...input.email, challengeId: id });
      return id;
    },
    async findChallenge(id) {
      const c = challenges.get(id);
      return c ? { ...c } : null;
    },
    async reserveAttempt(id, max) {
      const c = challenges.get(id);
      if (!c || c.consumedAt || c.invalidatedAt || c.attempts >= max) return null;
      const attempts = c.attempts + 1;
      challenges.set(id, { ...c, attempts });
      return attempts;
    },
    async createDecoyChallenge(input) {
      const now = new Date();
      const email = input.email.toLowerCase();
      for (const [id, c] of challenges) {
        if (c.decoyEmail === email && c.purpose === input.purpose && !c.consumedAt && !c.invalidatedAt) {
          challenges.set(id, { ...c, invalidatedAt: now });
        }
      }
      const id = randomUUID();
      challenges.set(id, {
        id,
        userId: null,
        decoyEmail: email,
        purpose: input.purpose,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        attempts: 0,
        consumedAt: null,
        invalidatedAt: null,
        createdAt: now,
      });
      return id;
    },
    async countDecoyChallengesSince(email, purpose, since) {
      const target = email.toLowerCase();
      return [...challenges.values()].filter(c => c.decoyEmail === target && c.purpose === purpose && c.createdAt >= since).length;
    },
    async consumeChallenge(id) {
      const c = challenges.get(id);
      if (!c || c.consumedAt || c.invalidatedAt) return false;
      challenges.set(id, { ...c, consumedAt: new Date() });
      return true;
    },
    async countChallengesSince(userId, purpose, since) {
      return [...challenges.values()].filter(c => c.userId === userId && c.purpose === purpose && c.createdAt >= since).length;
    },
    countEmailsTo: (address, since) => outbox.countRecipientSince(address, since),
    async markEmailVerified(userId) {
      const user = users.get(userId);
      if (user) users.set(userId, { ...user, emailVerifiedAt: new Date() });
    },
    async setLocale(userId, locale) {
      const user = users.get(userId);
      if (user) users.set(userId, { ...user, locale });
    },
    async revokeAllSessions(userId) {
      for (const session of [...sessions.values()]) {
        if (session.userId === userId) revokeFamily(session.id);
      }
    },
    async deleteStaleUnverified(olderThan) {
      let deleted = 0;
      for (const user of [...users.values()]) {
        const since = verificationRequiredSince.get(user.id);
        if (user.emailVerifiedAt || !since || since >= olderThan) continue;
        users.delete(user.id);
        verificationRequiredSince.delete(user.id);
        for (const [id, c] of challenges) if (c.userId === user.id) challenges.delete(id);
        for (const [id, s] of sessions) {
          if (s.userId !== user.id) continue;
          sessions.delete(id);
          for (const [hash, t] of tokensByHash) if (t.sessionId === id) tokensByHash.delete(hash);
        }
        deleted += 1;
      }
      return deleted;
    },
    async deleteExpiredChallenges(olderThan) {
      let deleted = 0;
      for (const [id, c] of [...challenges]) {
        if (c.expiresAt < olderThan) {
          challenges.delete(id);
          deleted += 1;
        }
      }
      return deleted;
    },
    async enqueueEmail(msg) {
      await outbox.enqueue(msg);
    },
    async listUsers() {
      return [...users.values()];
    },
  };
}
