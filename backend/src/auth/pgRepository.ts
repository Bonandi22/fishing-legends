import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerProgress, refreshTokens, sessions, userProfiles, users } from '../db/schema.js';
import type { AuthRepository, AuthSession, AuthUser, RefreshRotation } from './types.js';

function toAuthUser(row: {
  user: typeof users.$inferSelect;
  profile: typeof userProfiles.$inferSelect | null;
}): AuthUser {
  if (!row.profile) throw new Error('USER_PROFILE_MISSING');
  if (row.user.status !== 'active' && row.user.status !== 'suspended' && row.user.status !== 'deleted') {
    throw new Error('INVALID_USER_STATUS');
  }
  return {
    id: row.user.id,
    email: row.user.email,
    passwordHash: row.user.passwordHash,
    username: row.profile.username,
    country: row.profile.country,
    status: row.user.status,
  };
}

function toAuthSession(row: typeof sessions.$inferSelect): AuthSession {
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt ?? undefined,
  };
}

export function createPgAuthRepository(db: Database): AuthRepository {
  async function findUser(where: ReturnType<typeof eq>): Promise<AuthUser | null> {
    const rows = await db
      .select({ user: users, profile: userProfiles })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(where)
      .limit(1);
    return rows[0] ? toAuthUser(rows[0]) : null;
  }

  return {
    findUserByEmail: email => findUser(eq(users.email, email)),
    findUserById: id => findUser(eq(users.id, id)),
    async createUser(input) {
      const id = randomUUID();
      const result = await db.transaction(async tx => {
        await tx.insert(users).values({
          id,
          email: input.email,
          passwordHash: input.passwordHash,
          status: 'active',
        });
        await tx.insert(userProfiles).values({
          userId: id,
          username: input.username,
          country: input.country,
        });
        await tx.insert(playerProgress).values({ userId: id });
        return tx
          .select({ user: users, profile: userProfiles })
          .from(users)
          .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
          .where(eq(users.id, id))
          .limit(1);
      });
      return toAuthUser(result[0]);
    },
    async createSession(input) {
      const sessionId = randomUUID();
      return db.transaction(async tx => {
        const [session] = await tx.insert(sessions).values({
          id: sessionId,
          userId: input.userId,
          expiresAt: input.expiresAt,
        }).returning();
        await tx.insert(refreshTokens).values({
          id: randomUUID(),
          sessionId,
          tokenHash: input.tokenHash,
        });
        return toAuthSession(session);
      });
    },
    async rotateRefreshToken({ presentedHash, nextHash, nextExpiresAt }): Promise<RefreshRotation> {
      return db.transaction(async tx => {
        const [token] = await tx.select().from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, presentedHash)).limit(1);
        if (!token) return { outcome: 'invalid' };
        const [session] = await tx.select().from(sessions)
          .where(eq(sessions.id, token.sessionId)).limit(1);

        if (token.replacedAt || token.revokedAt || session?.revokedAt) {
          const now = new Date();
          await tx.update(refreshTokens).set({ revokedAt: now })
            .where(and(eq(refreshTokens.sessionId, token.sessionId), isNull(refreshTokens.revokedAt)));
          await tx.update(sessions).set({ revokedAt: now })
            .where(and(eq(sessions.id, token.sessionId), isNull(sessions.revokedAt)));
          return { outcome: 'reuse_detected' };
        }

        if (!session || session.expiresAt <= new Date()) return { outcome: 'invalid' };

        const nextId = randomUUID();
        await tx.insert(refreshTokens).values({ id: nextId, sessionId: token.sessionId, tokenHash: nextHash });
        await tx.update(refreshTokens)
          .set({ replacedBy: nextId, replacedAt: new Date() })
          .where(eq(refreshTokens.id, token.id));
        const [updated] = await tx.update(sessions)
          .set({ expiresAt: nextExpiresAt, lastUsedAt: new Date() })
          .where(eq(sessions.id, token.sessionId))
          .returning();
        return { outcome: 'rotated', session: toAuthSession(updated), userId: session.userId };
      });
    },
    async revokeSession(sessionId) {
      await db.transaction(async tx => {
        await tx.update(refreshTokens).set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.sessionId, sessionId), isNull(refreshTokens.revokedAt)));
        await tx.update(sessions).set({ revokedAt: new Date() })
          .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
      });
    },
  };
}
