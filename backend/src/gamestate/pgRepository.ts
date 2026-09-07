import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerGameState } from '../db/schema.js';

/**
 * Transactional game-state store with optimistic concurrency. Each write carries
 * the `baseVersion` it was based on:
 * - `baseVersion === null` → first write; succeeds only if no row exists (creates version 1).
 * - `baseVersion === N`    → succeeds only if the stored version is still N (bumps to N + 1).
 * A mismatch throws `STATE_VERSION_CONFLICT` and writes nothing. Both branches are
 * a single statement, so concurrent writers cannot both win.
 */
export function createPgGameStateService(db: Database) {
  return {
    async get(userId: string): Promise<{ state: unknown; updatedAt: string; version: number } | null> {
      const rows = await db.select().from(playerGameState).where(eq(playerGameState.userId, userId)).limit(1);
      const row = rows[0];
      return row ? { state: row.state, updatedAt: row.updatedAt.toISOString(), version: row.version } : null;
    },
    async put(userId: string, state: unknown, baseVersion: number | null): Promise<{ version: number }> {
      const now = new Date();

      if (baseVersion === null) {
        const value = { userId, state, updatedAt: now, version: 1 } as typeof playerGameState.$inferInsert;
        const inserted = await db.insert(playerGameState)
          .values(value)
          .onConflictDoNothing({ target: playerGameState.userId })
          .returning({ version: playerGameState.version });
        if (inserted.length === 0) throw new Error('STATE_VERSION_CONFLICT');
        return { version: inserted[0].version };
      }

      const updated = await db.update(playerGameState)
        .set({ state: state as typeof playerGameState.$inferInsert.state, updatedAt: now, version: baseVersion + 1 })
        .where(and(eq(playerGameState.userId, userId), eq(playerGameState.version, baseVersion)))
        .returning({ version: playerGameState.version });
      if (updated.length === 0) throw new Error('STATE_VERSION_CONFLICT');
      return { version: updated[0].version };
    },
  };
}
