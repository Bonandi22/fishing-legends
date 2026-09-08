import { randomInt, randomUUID } from 'node:crypto';
import type { MemoryGameStateStore } from '../gamestate/memoryService.js';
import { SAVE_SCHEMA_VERSION, saveSchema, type SaveEnvelope } from '../../../src/game/persistence.js';
import { rollFish, rollWeight } from '../../../src/game/fishingLogic.js';
import { applyCatch, resolveLuckyMode } from '../../../src/game/stateRules.js';
import { FISH, LOCATIONS } from '../../../src/game/data.js';
import { isSessionExpired } from './session.js';

/** Server RNG in [0, 1). Not audited this slice (matches slice 5's roulettes). */
const random = () => randomInt(1_000_000) / 1_000_000;

export type FishingSessionRow = {
  id: string;
  userId: string;
  locationId: string;
  idempotencyKey: string;
  status: 'open' | 'completed' | 'expired';
  createdAt: Date;
  resultFishId: string;
  resultWeight: number;
  resultXp: number;
  resultLucky: boolean;
};

export type CastResult = {
  sessionId: string;
  fishId: string;
  weight: number;
  xp: number;
  lucky: boolean;
  state: SaveEnvelope;
  version: number;
};

export type LandResult = {
  state: SaveEnvelope;
  version: number;
  caught: { fishId: string; weight: number; location: string };
};

export interface FishingService {
  cast(userId: string, idempotencyKey: string, locationId: string): Promise<CastResult>;
  land(userId: string, idempotencyKey: string, sessionId: string): Promise<LandResult>;
}

/** Roll a fish + weight for a cast. Shared by the memory and PG services. */
export function rollCast(
  player: SaveEnvelope['player'],
  locationId: string,
  now: number,
): {
  fishId: string;
  weight: number;
  xp: number;
  lucky: boolean;
  luckyUntil: number | null;
  luckyCooldownUntil: number | null;
} {
  const location = LOCATIONS.find(l => l.id === locationId);
  if (!location) throw new Error('INVALID_FISHING_REQUEST');
  if (player.level < location.requiredLevel) throw new Error('LOCATION_LOCKED');

  const luck = resolveLuckyMode(player, now, random);
  const luckActive = !!player.luckMultiplierEnd && player.luckMultiplierEnd > now;
  const luckPower = luckActive ? (player.luckMultiplierPower ?? 2) : 2;

  let fish;
  try {
    fish = rollFish(location, player.level, luck.lucky || luckActive, luckPower, random);
  } catch {
    throw new Error('NO_FISH_AVAILABLE');
  }
  const weight = rollWeight(fish, random);
  return {
    fishId: fish.id,
    weight,
    xp: fish.xp,
    lucky: luck.lucky,
    luckyUntil: luck.luckyUntil,
    luckyCooldownUntil: luck.luckyCooldownUntil,
  };
}

/** Apply a session's roll to a player blob. Shared by both services. */
export function applyLand(
  player: SaveEnvelope['player'],
  session: Pick<FishingSessionRow, 'resultFishId' | 'resultWeight' | 'locationId'>,
  now: number,
): { player: SaveEnvelope['player']; caught: { fishId: string; weight: number; location: string } } {
  const fish = FISH.find(f => f.id === session.resultFishId);
  if (!fish) throw new Error('INVALID_FISHING_SESSION');
  const caught = { fish, weight: session.resultWeight, location: session.locationId, timestamp: now };
  return {
    player: applyCatch(player, [caught], { fromNet: false }, LOCATIONS),
    caught: { fishId: fish.id, weight: session.resultWeight, location: session.locationId },
  };
}

export function createMemoryFishingService(store: MemoryGameStateStore): FishingService {
  const sessions = new Map<string, FishingSessionRow>();
  const castByKey = new Map<string, string>();   // `${userId}:${key}` -> sessionId
  const landByKey = new Map<string, LandResult>(); // `${userId}:${key}` -> result

  const envelopeOf = (state: unknown): SaveEnvelope => saveSchema.parse(state);

  return {
    async cast(userId, idempotencyKey, locationId) {
      const entry = store.get(userId);
      if (!entry) throw new Error('GAME_STATE_NOT_FOUND');

      const dedupeKey = `${userId}:${idempotencyKey}`;
      const existingId = castByKey.get(dedupeKey);
      if (existingId) {
        const s = sessions.get(existingId)!;
        return {
          sessionId: s.id, fishId: s.resultFishId, weight: s.resultWeight, xp: s.resultXp,
          lucky: s.resultLucky, state: { schemaVersion: SAVE_SCHEMA_VERSION, player: envelopeOf(entry.state).player },
          version: entry.version,
        };
      }

      const player = envelopeOf(entry.state).player;
      const now = Date.now();
      const roll = rollCast(player, locationId, now);

      const nextPlayer = { ...player, luckyUntil: roll.luckyUntil, luckyCooldownUntil: roll.luckyCooldownUntil };
      const version = entry.version + 1;
      const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: nextPlayer };
      store.set(userId, { state, updatedAt: new Date().toISOString(), version });

      const session: FishingSessionRow = {
        id: randomUUID(), userId, locationId, idempotencyKey, status: 'open', createdAt: new Date(),
        resultFishId: roll.fishId, resultWeight: roll.weight, resultXp: roll.xp, resultLucky: roll.lucky,
      };
      sessions.set(session.id, session);
      castByKey.set(dedupeKey, session.id);

      return { sessionId: session.id, fishId: roll.fishId, weight: roll.weight, xp: roll.xp, lucky: roll.lucky, state, version };
    },

    async land(userId, idempotencyKey, sessionId) {
      const replayKey = `${userId}:${idempotencyKey}`;
      const replayed = landByKey.get(replayKey);
      if (replayed) return replayed;

      const session = sessions.get(sessionId);
      if (!session || session.userId !== userId) throw new Error('INVALID_FISHING_SESSION');

      const entry = store.get(userId);
      if (!entry) throw new Error('GAME_STATE_NOT_FOUND');

      if (session.status === 'completed') {
        const player = envelopeOf(entry.state).player;
        const result: LandResult = {
          state: { schemaVersion: SAVE_SCHEMA_VERSION, player },
          version: entry.version,
          caught: { fishId: session.resultFishId, weight: session.resultWeight, location: session.locationId },
        };
        landByKey.set(replayKey, result);
        return result;
      }
      if (session.status === 'expired' || isSessionExpired(session.createdAt)) {
        session.status = 'expired';
        throw new Error('FISHING_SESSION_EXPIRED');
      }

      const now = Date.now();
      const applied = applyLand(envelopeOf(entry.state).player, session, now);
      const version = entry.version + 1;
      const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: applied.player };
      store.set(userId, { state, updatedAt: new Date().toISOString(), version });
      session.status = 'completed';

      const result: LandResult = { state, version, caught: applied.caught };
      landByKey.set(replayKey, result);
      return result;
    },
  };
}
