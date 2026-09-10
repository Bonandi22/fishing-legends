import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerGameState } from '../db/schema.js';

/**
 * `bootstrap` is create-only: it succeeds exactly once per account (the row
 * that turns anonymous local progress into the account's starting state) and
 * throws `STATE_VERSION_CONFLICT` if a row already exists. There is no
 * update path any more — every subsequent mutation goes through a dedicated,
 * validated op instead of a free-form overwrite.
 */
export function createPgGameStateService(db: Database) {
  return {
    async get(userId: string): Promise<{ state: unknown; updatedAt: string; version: number } | null> {
      const rows = await db.select().from(playerGameState).where(eq(playerGameState.userId, userId)).limit(1);
      const row = rows[0];
      return row ? { state: row.state, updatedAt: row.updatedAt.toISOString(), version: row.version } : null;
    },
    async bootstrap(userId: string, state: unknown): Promise<{ version: number }> {
      const now = new Date();
      const value = { userId, state, updatedAt: now, version: 1 } as typeof playerGameState.$inferInsert;
      const inserted = await db.insert(playerGameState)
        .values(value)
        .onConflictDoNothing({ target: playerGameState.userId })
        .returning({ version: playerGameState.version });
      if (inserted.length === 0) throw new Error('STATE_VERSION_CONFLICT');
      return { version: inserted[0].version };
    },
  };
}
