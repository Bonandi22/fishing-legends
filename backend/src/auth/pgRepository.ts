import { randomUUID } from 'node:crypto';
import { and, eq, gte, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { DatabaseTransaction } from '../email/pgOutbox.js';
import { authChallenges, playerProgress, refreshTokens, sessions, userProfiles, users } from '../db/schema.js';
import { createPgOutbox } from '../email/pgOutbox.js';
import type { EmailOutbox, Locale } from '../email/types.js';
import { isUniqueViolation } from '../db/pgErrors.js';
import type { AuthChallenge, AuthRepository, AuthSession, AuthUser, ChallengePurpose, RefreshRotation } from './types.js';

function toAuthUser(row: {
  user: typeof users.$inferSelect;
  profile: typeof userProfiles.$inferSelect | null;
}): AuthUser {
  if (!row.profile) throw new Error('USER_PROFILE_MISSING');
  const status = row.user.status;
  if (status !== 'active' && status !== 'suspended' && status !== 'banned' && status !== 'deleted') {
    throw new Error('INVALID_USER_STATUS');
  }
  return {
    id: row.user.id,
    email: row.user.email,
    passwordHash: row.user.passwordHash,
    username: row.profile.username,
    country: row.profile.country,
    status,
    isAdmin: row.user.isAdmin,
    emailVerifiedAt: row.user.emailVerifiedAt,
    locale: row.user.locale as Locale,
  };
}

function toAuthChallenge(row: typeof authChallenges.$inferSelect): AuthChallenge {
  return {
    id: row.id,
    userId: row.userId,
    decoyEmail: row.decoyEmail,
    purpose: row.purpose as ChallengePurpose,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    attempts: row.attempts,
    consumedAt: row.consumedAt,
    invalidatedAt: row.invalidatedAt,
    createdAt: row.createdAt,
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

export function createPgAuthRepository(db: Database, outbox: EmailOutbox = createPgOutbox(db)): AuthRepository {
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
    async isUsernameTaken(username) {
      const [row] = await db.select({ userId: userProfiles.userId }).from(userProfiles)
        .where(sql`lower(${userProfiles.username}) = lower(${username})`).limit(1);
      return Boolean(row);
    },
    async createUser(input) {
      const id = randomUUID();
      try {
        const result = await db.transaction(async tx => {
          await tx.insert(users).values({
            id,
            email: input.email,
            passwordHash: input.passwordHash,
            status: 'active',
            locale: input.locale,
            verificationRequiredSince: sql`now()`,
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
      } catch (error) {
        if (isUniqueViolation(error, 'username')) throw new Error('USERNAME_TAKEN');
        if (isUniqueViolation(error, 'email')) throw new Error('ACCOUNT_ALREADY_EXISTS');
        throw error;
      }
    },
    async updatePasswordHash(userId, passwordHash) {
      await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
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
    async createChallenge(input) {
      const id = randomUUID();
      await db.transaction(async tx => {
        // Serialize concurrent issuance per user so only the newest challenge stays live.
        const locked = await tx.execute(sql`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`);
        if (locked.rows.length === 0) throw new Error('USER_NOT_FOUND');
        await tx.update(authChallenges).set({ invalidatedAt: sql`now()` })
          .where(and(
            eq(authChallenges.userId, input.userId),
            eq(authChallenges.purpose, input.purpose),
            isNull(authChallenges.consumedAt),
            isNull(authChallenges.invalidatedAt),
          ));
        await tx.insert(authChallenges).values({
          id,
          userId: input.userId,
          purpose: input.purpose,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
        });
        if (input.email) await outbox.enqueue({ ...input.email, challengeId: id }, tx);
      });
      return id;
    },
    async findChallenge(id) {
      const [row] = await db.select().from(authChallenges).where(eq(authChallenges.id, id)).limit(1);
      return row ? toAuthChallenge(row) : null;
    },
    async reserveAttempt(id, max) {
      const [row] = await db.update(authChallenges)
        .set({ attempts: sql`${authChallenges.attempts} + 1` })
        .where(and(
          eq(authChallenges.id, id),
          sql`${authChallenges.attempts} < ${max}`,
          isNull(authChallenges.consumedAt),
          isNull(authChallenges.invalidatedAt),
        ))
        .returning({ attempts: authChallenges.attempts });
      return row?.attempts ?? null;
    },
    async createDecoyChallenge(input) {
      const id = randomUUID();
      const email = input.email.toLowerCase();
      await db.transaction(async tx => {
        // Same per-key serialization as createChallenge, keyed on the address.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'decoy:' + email}, 0))`);
        await tx.update(authChallenges).set({ invalidatedAt: sql`now()` })
          .where(and(
            eq(authChallenges.decoyEmail, email),
            eq(authChallenges.purpose, input.purpose),
            isNull(authChallenges.consumedAt),
            isNull(authChallenges.invalidatedAt),
          ));
        await tx.insert(authChallenges).values({
          id,
          decoyEmail: email,
          purpose: input.purpose,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
        });
      });
      return id;
    },
    async countDecoyChallengesSince(email, purpose, since) {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(authChallenges)
        .where(and(eq(authChallenges.decoyEmail, email.toLowerCase()), eq(authChallenges.purpose, purpose), gte(authChallenges.createdAt, since)));
      return row?.n ?? 0;
    },
    async consumeChallenge(id) {
      const rows = await db.update(authChallenges)
        .set({ consumedAt: sql`now()` })
        .where(and(
          eq(authChallenges.id, id),
          isNull(authChallenges.consumedAt),
          isNull(authChallenges.invalidatedAt),
        ))
        .returning({ id: authChallenges.id });
      return rows.length === 1;
    },
    async countChallengesSince(userId, purpose, since) {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(authChallenges)
        .where(and(eq(authChallenges.userId, userId), eq(authChallenges.purpose, purpose), gte(authChallenges.createdAt, since)));
      return row?.n ?? 0;
    },
    countEmailsTo: (address, since, kind) => outbox.countRecipientSince(address, since, kind),
    async countFailedAttemptsSince(email, purpose, since) {
      const target = email.toLowerCase();
      const [row] = await db.select({
        n: sql<number>`coalesce(sum(${authChallenges.attempts} - (${authChallenges.consumedAt} IS NOT NULL)::int), 0)::int`,
      }).from(authChallenges).where(and(
        eq(authChallenges.purpose, purpose),
        gte(authChallenges.createdAt, since),
        sql`(${authChallenges.decoyEmail} = ${target}
          OR ${authChallenges.userId} IN (SELECT ${users.id} FROM ${users} WHERE ${users.email} = ${target}))`,
      ));
      return row?.n ?? 0;
    },
    async markEmailVerified(userId) {
      await db.update(users).set({ emailVerifiedAt: sql`now()`, updatedAt: new Date() }).where(eq(users.id, userId));
    },
    async setLocale(userId, locale) {
      await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, userId));
    },
    async revokeAllSessions(userId, tx) {
      const revoke = async (exec: DatabaseTransaction) => {
        const owned = exec.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
        await exec.update(refreshTokens).set({ revokedAt: new Date() })
          .where(and(sql`${refreshTokens.sessionId} IN (${owned})`, isNull(refreshTokens.revokedAt)));
        await exec.update(sessions).set({ revokedAt: new Date() })
          .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
      };
      if (tx) await revoke(tx as DatabaseTransaction);
      else await db.transaction(revoke);
    },
    async setStatus(userId, status, tx) {
      const exec: Database | DatabaseTransaction = (tx as DatabaseTransaction | undefined) ?? db;
      await exec.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
    },
    async deleteStaleUnverified(olderThan) {
      // Every table referencing users(id) is ON DELETE CASCADE (profiles,
      // sessions -> refresh_tokens, auth_challenges, game state, ...).
      const rows = await db.delete(users)
        .where(and(
          isNull(users.emailVerifiedAt),
          lt(users.verificationRequiredSince, olderThan),
          // Accounts under review or banned are kept as evidence.
          notInArray(users.status, ['suspended', 'banned']),
        ))
        .returning({ id: users.id });
      return rows.length;
    },
    async deleteExpiredChallenges(olderThan) {
      const rows = await db.delete(authChallenges)
        .where(lt(authChallenges.expiresAt, olderThan))
        .returning({ id: authChallenges.id });
      return rows.length;
    },
    deleteFinishedEmails: olderThan => outbox.deleteFinishedBefore(olderThan),
    async enqueueEmail(msg) {
      await outbox.enqueue(msg);
    },
  };
}
