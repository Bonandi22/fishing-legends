import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { antiCheatEvents, fishingLands, fishingSessions, gameStateOperations, playerGameState } from '../db/schema.js';
import { readRecordedResult } from '../gamestate/opReplay.js';
import { SAVE_SCHEMA_VERSION, saveSchema, type SaveEnvelope } from '../../../src/game/persistence.js';
import { isSessionExpired } from './session.js';
import { checkCastAllowed, checkLandAllowed } from '../anticheat/hardRules.js';
import {
  applyLand, castPlayerPatch, isStrengthActive, rollCast,
  type Caught, type CastMode, type CastResult, type FishingService, type FishingServiceOptions, type LandResult,
} from './service.js';

const RULESET_VERSION = 'blob-1';

function recordedCaught(session: typeof fishingSessions.$inferSelect): Caught[] {
  const rows = session.resultCatches ?? [{ fishId: session.resultFishId ?? '', weight: Number(session.resultWeight ?? 0) }];
  return rows.map(r => ({ fishId: r.fishId, weight: r.weight, location: session.locationId }));
}

/**
 * A hard-rule violation detected inside a transaction. The transaction returns it
 * (so the violation's own writes — event row, expired session — commit) and the
 * caller throws its code afterwards. Writing them on a separate connection while
 * the transaction holds the row locks would deadlock.
 */
type Violation = { violation: 'CAST_TOO_FAST' | 'LAND_TOO_FAST' };
const isViolation = (r: object): r is Violation => 'violation' in r;

export function createPgFishingService(db: Database, options: FishingServiceOptions = {}): FishingService {
  const clock = options.now ?? (() => new Date());
  return {
    async cast(userId, idempotencyKey, locationId, mode = 'rod', clientId): Promise<CastResult> {
      const outcome = await db.transaction(async (tx): Promise<CastResult | Violation> => {
        const dupe = await tx.select().from(fishingSessions)
          .where(and(eq(fishingSessions.userId, userId), eq(fishingSessions.idempotencyKey, idempotencyKey)))
          .limit(1);

        const rows = await tx.select().from(playerGameState)
          .where(eq(playerGameState.userId, userId)).limit(1).for('update');
        const row = rows[0];
        if (!row) throw new Error('GAME_STATE_NOT_FOUND');
        const currentPlayer = saveSchema.parse(row.state).player;

        if (dupe[0]) {
          const s = dupe[0];
          const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: currentPlayer };
          if (s.mode === 'submarine') {
            return {
              sessionId: s.id, mode: 'submarine', lucky: false, state, version: row.version,
              catches: (s.resultCatches ?? []) as Array<{ id: string; fishId: string; weight: number }>,
            };
          }
          return s.mode === 'net'
            ? {
                sessionId: s.id, mode: 'net', lucky: s.resultLucky, state, version: row.version,
                net: { id: '', rarity: '', fishCount: s.resultCatches!.length, greenZoneSize: 0.5, speed: 1 },
                catches: s.resultCatches! as Array<{ fishId: string; weight: number }>,
              }
            : {
                sessionId: s.id, mode: 'rod', lucky: s.resultLucky, state, version: row.version,
                fishId: s.resultFishId ?? '', weight: Number(s.resultWeight ?? 0), xp: s.resultXp ?? 0,
              };
        }

        // Most recent cast in any mode, read after the blob lock so concurrent casts serialize.
        const [last] = await tx.select({
          clientId: fishingSessions.clientId, createdAt: fishingSessions.createdAt, mode: fishingSessions.mode,
        }).from(fishingSessions)
          .where(eq(fishingSessions.userId, userId))
          .orderBy(desc(fishingSessions.createdAt)).limit(1);
        const nowDate = clock();
        const check = checkCastAllowed(
          last ? { clientId: last.clientId, createdAt: last.createdAt, mode: last.mode as CastMode } : null,
          clientId, mode, nowDate,
        );
        if (!check.ok) {
          if (check.code === 'FISHING_ELSEWHERE') throw new Error('FISHING_ELSEWHERE');
          await tx.insert(antiCheatEvents).values({
            id: randomUUID(), userId, type: 'cast_too_fast', detail: { intervalMs: check.intervalMs }, createdAt: nowDate,
          });
          return { violation: 'CAST_TOO_FAST' };
        }

        const now = nowDate.getTime();
        const roll = rollCast(currentPlayer, locationId, mode, now);

        // H1: a new rod/net cast abandons any open session of the same mode.
        if (roll.mode !== 'submarine') {
          await tx.update(fishingSessions).set({ status: 'expired' })
            .where(and(eq(fishingSessions.userId, userId), eq(fishingSessions.mode, roll.mode), eq(fishingSessions.status, 'open')));
        }

        const isSubmarine = roll.mode === 'submarine';
        const version = isSubmarine ? row.version : row.version + 1;
        const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: castPlayerPatch(currentPlayer, roll) };
        if (!isSubmarine) {
          await tx.update(playerGameState).set({ state, version, updatedAt: nowDate })
            .where(eq(playerGameState.userId, userId));
        }

        const [session] = await tx.insert(fishingSessions).values({
          id: randomUUID(), userId, locationId, rulesetVersion: RULESET_VERSION, idempotencyKey, status: 'open',
          mode: roll.mode,
          clientId: clientId ?? null,
          strengthActive: isStrengthActive(currentPlayer, nowDate),
          createdAt: nowDate,
          resultLucky: roll.mode === 'submarine' ? false : roll.lucky,
          ...(roll.mode === 'submarine' || roll.mode === 'net'
            ? { resultCatches: roll.catches }
            : { resultFishId: roll.fishId, resultWeight: roll.weight.toFixed(2), resultXp: roll.xp }),
        }).returning();

        if (roll.mode === 'submarine') {
          return { sessionId: session.id, mode: 'submarine', catches: roll.catches, lucky: false, state, version };
        }
        return roll.mode === 'net'
          ? { sessionId: session.id, mode: 'net', net: roll.net, catches: roll.catches, lucky: roll.lucky, state, version }
          : { sessionId: session.id, mode: 'rod', fishId: roll.fishId, weight: roll.weight, xp: roll.xp, lucky: roll.lucky, state, version };
      });
      if (isViolation(outcome)) throw new Error(outcome.violation);
      return outcome;
    },

    async land(userId, idempotencyKey, sessionId, catchId): Promise<LandResult> {
      const outcome = await db.transaction(async (tx): Promise<LandResult | Violation> => {
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
          // A new key on a drained submarine roster is not a valid harvest.
          if (session.mode === 'submarine') throw new Error('INVALID_FISHING_SESSION');
          return {
            state: { schemaVersion: SAVE_SCHEMA_VERSION, player: saveSchema.parse(blob.state).player },
            version: blob.version,
            caught: recordedCaught(session),
          };
        }
        const nowDate = clock();
        if (session.status === 'expired' || isSessionExpired(session.createdAt, nowDate)) {
          await tx.update(fishingSessions).set({ status: 'expired' })
            .where(and(eq(fishingSessions.id, sessionId), eq(fishingSessions.status, 'open')));
          throw new Error('FISHING_SESSION_EXPIRED');
        }

        const sessionMode = session.mode as CastMode;
        const landCheck = checkLandAllowed(sessionMode, session.createdAt, nowDate);
        if (!landCheck.ok) {
          await tx.update(fishingSessions).set({ status: 'expired' }).where(eq(fishingSessions.id, sessionId));
          await tx.insert(antiCheatEvents).values({
            id: randomUUID(), userId, type: 'land_too_fast', sessionId, detail: { elapsedMs: landCheck.elapsedMs }, createdAt: nowDate,
          });
          return { violation: 'LAND_TOO_FAST' };
        }

        const now = nowDate.getTime();
        const applied = applyLand(saveSchema.parse(blob.state).player, {
          mode: sessionMode,
          locationId: session.locationId,
          resultFishId: session.resultFishId,
          resultWeight: session.resultWeight === null ? null : Number(session.resultWeight),
          resultCatches: session.resultCatches,
        }, now, { catchId });
        const version = blob.version + 1;
        const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: applied.player };

        await tx.update(playerGameState).set({ state, version, updatedAt: nowDate })
          .where(eq(playerGameState.userId, userId));

        if (session.mode === 'submarine') {
          const remaining = applied.remaining ?? [];
          await tx.update(fishingSessions).set({
            resultCatches: remaining,
            createdAt: nowDate,
            ...(remaining.length === 0 ? { status: 'completed' as const, completedAt: nowDate } : {}),
          }).where(eq(fishingSessions.id, sessionId));
        } else {
          await tx.update(fishingSessions).set({ status: 'completed', completedAt: nowDate })
            .where(eq(fishingSessions.id, sessionId));
        }
        if (applied.caught.length > 0) {
          await tx.insert(fishingLands).values(applied.caught.map(c => ({
            id: randomUUID(), userId, sessionId, mode: sessionMode, fishId: c.fishId, landedAt: nowDate,
          })));
        }

        const result: LandResult = { state, version, caught: applied.caught };
        await tx.insert(gameStateOperations).values({
          userId, idempotencyKey, operation: 'fishing_land',
          result: result as typeof gameStateOperations.$inferInsert['result'],
        });
        return result;
      });
      if (isViolation(outcome)) throw new Error(outcome.violation);
      return outcome;
    },
  };
}
