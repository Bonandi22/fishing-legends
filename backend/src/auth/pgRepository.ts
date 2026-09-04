import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerProgress, sessions, userProfiles, users } from '../db/schema.js';
import type { AuthRepository, AuthSession, AuthUser } from './types.js';

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
    refreshTokenHash: row.refreshTokenHash,
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
      const id = randomUUID();
      const result = await db.insert(sessions).values({
        id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
      }).returning();
      return toAuthSession(result[0]);
    },
    async rotateSession(input) {
      const result = await db.update(sessions)
        .set({
          refreshTokenHash: input.refreshTokenHash,
          expiresAt: input.expiresAt,
          lastUsedAt: new Date(),
        })
        .where(and(eq(sessions.id, input.sessionId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
        .returning();
      return result[0] ? toAuthSession(result[0]) : null;
    },
    async revokeSession(sessionId) {
      await db.update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    },
    async findSessionByTokenHash(tokenHash) {
      const result = await db.select().from(sessions)
        .where(and(eq(sessions.refreshTokenHash, tokenHash), isNull(sessions.revokedAt)))
        .limit(1);
      return result[0] ? toAuthSession(result[0]) : null;
    },
  };
}
