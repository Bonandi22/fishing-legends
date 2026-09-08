import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { fishingSessions, gameStateOperations, playerGameState } from '../db/schema.js';
import { readRecordedResult } from '../gamestate/opReplay.js';
import { SAVE_SCHEMA_VERSION, saveSchema, type SaveEnvelope } from '../../../src/game/persistence.js';
import { isSessionExpired } from './session.js';
import { applyLand, rollCast, type CastResult, type FishingService, type LandResult } from './service.js';

const RULESET_VERSION = 'blob-1';

export function createPgFishingService(db: Database): FishingService {
  return {
    async cast(userId, idempotencyKey, locationId): Promise<CastResult> {
      return db.transaction(async (tx) => {
        const dupe = await tx.select().from(fishingSessions)
          .where(and(eq(fishingSessions.userId, userId), eq(fishingSessions.idempotencyKey, idempotencyKey)))
          .limit(1);

        const rows = await tx.select().from(playerGameState)
          .where(eq(playerGameState.userId, userId)).limit(1).for('update');
        const row = rows[0];
        if (!row) throw new Error('GAME_STATE_NOT_FOUND');

        if (dupe[0]) {
          const s = dupe[0];
          return {
            sessionId: s.id, fishId: s.resultFishId ?? '', weight: Number(s.resultWeight ?? 0),
            xp: s.resultXp ?? 0, lucky: s.resultLucky,
            state: { schemaVersion: SAVE_SCHEMA_VERSION, player: saveSchema.parse(row.state).player },
            version: row.version,
          };
        }

        const player = saveSchema.parse(row.state).player;
        const now = Date.now();
        const roll = rollCast(player, locationId, now);

        const version = row.version + 1;
        const state: SaveEnvelope = {
          schemaVersion: SAVE_SCHEMA_VERSION,
          player: { ...player, luckyUntil: roll.luckyUntil, luckyCooldownUntil: roll.luckyCooldownUntil },
        };
        await tx.update(playerGameState).set({ state, version, updatedAt: new Date() })
          .where(eq(playerGameState.userId, userId));

        const [session] = await tx.insert(fishingSessions).values({
          id: randomUUID(), userId, locationId, rulesetVersion: RULESET_VERSION, idempotencyKey, status: 'open',
          resultFishId: roll.fishId, resultWeight: roll.weight.toFixed(2), resultXp: roll.xp, resultLucky: roll.lucky,
        }).returning();

        return {
          sessionId: session.id, fishId: roll.fishId, weight: roll.weight, xp: roll.xp, lucky: roll.lucky, state, version,
        };
      });
    },

    async land(userId, idempotencyKey, sessionId): Promise<LandResult> {
      return db.transaction(async (tx) => {
        const prior = await readRecordedResult<LandResult>(tx, userId, 'fishing_land', idempotencyKey);
        if (prior) return prior;

        const found = await tx.select().from(fishingSessions)
          .where(eq(fishingSessions.id, sessionId)).limit(1).for('update');
        const session = found[0];
        if (!session || session.userId !== userId) throw new Error('INVALID_FISHING_SESSION');

        const locked = await readRecordedResult<LandResult>(tx, userId, 'fishing_land', idempotencyKey);
        if (locked) return locked;

        const blobRows = await tx.select().from(playerGameState)
          .where(eq(playerGameState.userId, userId)).limit(1).for('update');
        const blob = blobRows[0];
        if (!blob) throw new Error('GAME_STATE_NOT_FOUND');

        if (session.status === 'completed') {
          return {
            state: { schemaVersion: SAVE_SCHEMA_VERSION, player: saveSchema.parse(blob.state).player },
            version: blob.version,
            caught: {
              fishId: session.resultFishId ?? '', weight: Number(session.resultWeight ?? 0), location: session.locationId,
            },
          };
        }
        if (session.status === 'expired' || isSessionExpired(session.createdAt)) {
          await tx.update(fishingSessions).set({ status: 'expired' })
            .where(and(eq(fishingSessions.id, sessionId), eq(fishingSessions.status, 'open')));
          throw new Error('FISHING_SESSION_EXPIRED');
        }

        const now = Date.now();
        const applied = applyLand(saveSchema.parse(blob.state).player, {
          resultFishId: session.resultFishId ?? '',
          resultWeight: Number(session.resultWeight ?? 0),
          locationId: session.locationId,
        }, now);
        const version = blob.version + 1;
        const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: applied.player };

        await tx.update(playerGameState).set({ state, version, updatedAt: new Date() })
          .where(eq(playerGameState.userId, userId));
        await tx.update(fishingSessions).set({ status: 'completed', completedAt: new Date() })
          .where(eq(fishingSessions.id, sessionId));

        const result: LandResult = { state, version, caught: applied.caught };
        await tx.insert(gameStateOperations).values({
          userId, idempotencyKey, operation: 'fishing_land',
          result: result as typeof gameStateOperations.$inferInsert['result'],
        });
        return result;
      });
    },
  };
}
