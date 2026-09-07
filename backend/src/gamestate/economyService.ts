import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { gameStateOperations, playerGameState } from '../db/schema.js';
import { SAVE_SCHEMA_VERSION, saveSchema, type SaveEnvelope } from '../../../src/game/persistence.js';
import { sellWarehouse as applyWarehouseSale } from '../../../src/game/stateRules.js';
import { LOCATIONS } from '../../../src/game/data.js';
import type { MemoryGameStateStore } from './memoryService.js';

const OP = 'warehouse_sell';

export interface GameStateEconomyService {
  sellWarehouse(userId: string, idempotencyKey: string): Promise<{ state: SaveEnvelope; version: number }>;
}

type Result = { state: SaveEnvelope; version: number };

/** Runs the pure `sellWarehouse` rule on `envelope.player`. Throws WAREHOUSE_EMPTY. */
function computeSale(envelope: SaveEnvelope): SaveEnvelope['player'] {
  if (envelope.player.warehouse.length === 0) throw new Error('WAREHOUSE_EMPTY');
  return applyWarehouseSale(envelope.player, LOCATIONS);
}

export function createMemoryGameStateEconomyService(store: MemoryGameStateStore): GameStateEconomyService {
  // F2: the replay identity is (userId, operation, idempotencyKey) — NOT just
  // (userId, idempotencyKey). Once slices 2–7 add more economy endpoints, a
  // client that reuses one Idempotency-Key across two of them must not get the
  // first op's recorded envelope back from the second. The pg service enforces
  // the same by adding `eq(gameStateOperations.operation, OP)` to its lookup.
  const ops = new Map<string, Result>(); // key: `${userId}:${OP}:${idempotencyKey}`
  return {
    async sellWarehouse(userId, idempotencyKey) {
      const opKey = `${userId}:${OP}:${idempotencyKey}`;
      const seen = ops.get(opKey);
      if (seen) return seen;

      const entry = store.get(userId);
      if (!entry) throw new Error('GAME_STATE_NOT_FOUND');
      const envelope = saveSchema.parse(entry.state);
      const nextPlayer = computeSale(envelope);
      const version = entry.version + 1;
      const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: nextPlayer };
      store.set(userId, { state, updatedAt: new Date().toISOString(), version });
      const result: Result = { state, version };
      ops.set(opKey, result);
      return result;
    },
  };
}

export function createPgGameStateEconomyService(db: Database): GameStateEconomyService {
  return {
    async sellWarehouse(userId, idempotencyKey) {
      // The pre-lock / post-lock double read of `game_state_operations` assumes
      // READ COMMITTED (the project default): the post-lock read must see a row
      // a concurrent same-key transaction committed while we waited on the lock.
      // Under REPEATABLE READ the post-lock read would still see the frozen
      // snapshot and the `UPDATE` below would raise a serialization error.
      return db.transaction(async (tx) => {
        const readRecordedResult = async (): Promise<Result | null> => {
          // F2: scope the replay lookup to this operation, not just
          // (userId, idempotencyKey) — a key reused across two economy endpoints
          // must not replay the wrong op's envelope.
          const found = await tx.select({ result: gameStateOperations.result })
            .from(gameStateOperations)
            .where(and(
              eq(gameStateOperations.userId, userId),
              eq(gameStateOperations.operation, OP),
              eq(gameStateOperations.idempotencyKey, idempotencyKey),
            ))
            .limit(1);
          return found[0] ? (found[0].result as Result) : null;
        };

        // Fast path: a prior operation already recorded (common sequential retry).
        const priorResult = await readRecordedResult();
        if (priorResult) return priorResult;

        // Lock the row: the UPDATE below is keyed on user_id only (no version
        // guard in the WHERE), so without FOR UPDATE two concurrent ops both
        // read version N and both write N+1 (lost update).
        const rows = await tx.select().from(playerGameState)
          .where(eq(playerGameState.userId, userId)).limit(1).for('update');
        const row = rows[0];
        if (!row) throw new Error('GAME_STATE_NOT_FOUND');

        // Race guard: under READ COMMITTED, a concurrent request with the same
        // (userId, idempotencyKey) may have committed its sale — emptying the
        // warehouse and inserting the operation row — while we waited on the
        // lock above. Re-read the operation row now that we hold the lock and
        // replay its recorded result, before computeSale would spuriously throw
        // WAREHOUSE_EMPTY. Covered by the "concurrent same-key" and
        // "concurrent different keys" cases in economyService.integration.test.ts
        // (real PostgreSQL); not deterministically reproducible at the unit layer.
        const lockedPriorResult = await readRecordedResult();
        if (lockedPriorResult) return lockedPriorResult;

        const envelope = saveSchema.parse(row.state);
        const nextPlayer = computeSale(envelope);
        const version = row.version + 1;
        const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: nextPlayer };

        await tx.update(playerGameState)
          .set({ state, version, updatedAt: new Date() })
          .where(eq(playerGameState.userId, userId));

        const result: Result = { state, version };
        await tx.insert(gameStateOperations).values({
          userId,
          idempotencyKey,
          operation: OP,
          result: result as typeof gameStateOperations.$inferInsert['result'],
        });
        return result;
      });
    },
  };
}
