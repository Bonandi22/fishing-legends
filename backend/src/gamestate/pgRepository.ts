import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerGameState } from '../db/schema.js';

export function createPgGameStateService(db: Database) {
  return {
    async get(userId: string): Promise<{ state: unknown; updatedAt: string } | null> {
      const rows = await db.select().from(playerGameState).where(eq(playerGameState.userId, userId)).limit(1);
      const row = rows[0];
      return row ? { state: row.state, updatedAt: row.updatedAt.toISOString() } : null;
    },
    async put(userId: string, state: unknown): Promise<void> {
      const now = new Date();
      const value = { userId, state, updatedAt: now } as typeof playerGameState.$inferInsert;
      await db.insert(playerGameState)
        .values(value)
        .onConflictDoUpdate({ target: playerGameState.userId, set: { state: value.state, updatedAt: now } });
    },
  };
}
