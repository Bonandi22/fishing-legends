import { randomInt, randomUUID } from 'node:crypto';
import type { MemoryGameStateStore } from '../gamestate/memoryService.js';
import { SAVE_SCHEMA_VERSION, saveSchema, type SaveEnvelope } from '../../../src/game/persistence.js';
import { rollFish, rollWeight, rollSubmarineBatch, SUBMARINE_ROSTER_SIZE } from '../../../src/game/fishingLogic.js';
import { applyCatch, resolveLuckyMode } from '../../../src/game/stateRules.js';
import { rollNet } from '../../../src/game/netTypes.js';
import { FISH, LOCATIONS, getFishForLocation, SUBMARINE_LOCATION_ID } from '../../../src/game/data.js';
import { isSessionExpired } from './session.js';

/** Server RNG in [0, 1). Not audited this slice (matches slice 5's roulettes). */
const random = () => randomInt(1_000_000) / 1_000_000;

export type CastMode = 'rod' | 'net' | 'submarine';

export type NetInfo = { id: string; rarity: string; fishCount: number; greenZoneSize: number; speed: number };
export type BatchEntry = { fishId: string; weight: number };
export type SubmarineEntry = { id: string; fishId: string; weight: number };
export type SessionCatch = { id?: string; fishId: string; weight: number };

export type FishingSessionRow = {
  id: string;
  userId: string;
  locationId: string;
  idempotencyKey: string;
  mode: 'rod' | 'net' | 'submarine';
  status: 'open' | 'completed' | 'expired';
  createdAt: Date;
  resultFishId: string | null;
  resultWeight: number | null;
  resultXp: number | null;
  resultLucky: boolean;
  resultCatches: SessionCatch[] | null;
};

type CastBase = { sessionId: string; lucky: boolean; state: SaveEnvelope; version: number };
export type CastResult =
  | (CastBase & { mode: 'rod'; fishId: string; weight: number; xp: number })
  | (CastBase & { mode: 'net'; net: NetInfo; catches: BatchEntry[] })
  | (CastBase & { mode: 'submarine'; catches: SubmarineEntry[] });

export type Caught = { fishId: string; weight: number; location: string };
export type LandResult = { state: SaveEnvelope; version: number; caught: Caught[] };

export interface FishingService {
  cast(userId: string, idempotencyKey: string, locationId: string, mode?: CastMode): Promise<CastResult>;
  land(userId: string, idempotencyKey: string, sessionId: string, catchId?: string): Promise<LandResult>;
}

type RodRoll = {
  mode: 'rod'; fishId: string; weight: number; xp: number;
  lucky: boolean; luckyUntil: number | null; luckyCooldownUntil: number | null;
};
type NetRoll = {
  mode: 'net'; net: NetInfo; catches: BatchEntry[]; netsAfter: number;
  lucky: boolean; luckyUntil: number | null; luckyCooldownUntil: number | null;
};
type SubmarineRoll = { mode: 'submarine'; catches: SubmarineEntry[] };
export type CastRoll = RodRoll | NetRoll | SubmarineRoll;

/**
 * Roll a cast. Rod → one fish. Net → spend a net and roll `fishCount` fish of the
 * net's rarity (fallback: the whole location pool). Shared by memory + PG services.
 * Throws before any write: `INVALID_FISHING_REQUEST` / `LOCATION_LOCKED` / `NO_NETS`
 * / `NO_FISH_AVAILABLE`.
 */
export function rollCast(
  player: SaveEnvelope['player'],
  locationId: string,
  mode: CastMode,
  now: number,
): CastRoll {
  if (mode === 'submarine') {
    // Lucky-neutral: its own rarity table, no location, no level gate.
    const batch = rollSubmarineBatch(SUBMARINE_ROSTER_SIZE, player.level, random);
    return {
      mode: 'submarine',
      catches: batch.map(f => ({ id: randomUUID(), fishId: f.id, weight: rollWeight(f, random) })),
    };
  }

  const location = LOCATIONS.find(l => l.id === locationId);
  if (!location) throw new Error('INVALID_FISHING_REQUEST');
  if (player.level < location.requiredLevel) throw new Error('LOCATION_LOCKED');

  const luck = resolveLuckyMode(player, now, random);
  const luckActive = !!player.luckMultiplierEnd && player.luckMultiplierEnd > now;
  const luckPower = luckActive ? (player.luckMultiplierPower ?? 2) : 2;

  if (mode === 'rod') {
    let fish;
    try {
      fish = rollFish(location, player.level, luck.lucky || luckActive, luckPower, random);
    } catch {
      throw new Error('NO_FISH_AVAILABLE');
    }
    return {
      mode: 'rod', fishId: fish.id, weight: rollWeight(fish, random), xp: fish.xp,
      lucky: luck.lucky, luckyUntil: luck.luckyUntil, luckyCooldownUntil: luck.luckyCooldownUntil,
    };
  }

  if (mode === 'net') {
    if ((player.nets ?? 0) < 1) throw new Error('NO_NETS');
    const net = rollNet(random);
    const pool = getFishForLocation(location);
    const tier = pool.filter(f => f.rarity === net.rarity);
    const draw = tier.length > 0 ? tier : pool;
    if (draw.length === 0) throw new Error('NO_FISH_AVAILABLE');
    const catches: BatchEntry[] = Array.from({ length: net.fishCount }, () => {
      const f = draw[Math.floor(random() * draw.length)];
      return { fishId: f.id, weight: rollWeight(f, random) };
    });
    return {
      mode: 'net',
      net: { id: net.id, rarity: net.rarity, fishCount: net.fishCount, greenZoneSize: net.greenZoneSize, speed: net.speed },
      catches, netsAfter: (player.nets ?? 0) - 1,
      lucky: luck.lucky, luckyUntil: luck.luckyUntil, luckyCooldownUntil: luck.luckyCooldownUntil,
    };
  }

  throw new Error('INVALID_FISHING_REQUEST'); // submarine — slice 6b-2
}

/** Apply a session's roll (rod single or net batch) to a player blob. */
export function applyLand(
  player: SaveEnvelope['player'],
  session: Pick<FishingSessionRow, 'mode' | 'locationId' | 'resultFishId' | 'resultWeight' | 'resultCatches'>,
  now: number,
): { player: SaveEnvelope['player']; caught: Caught[] } {
  const rows: BatchEntry[] = session.resultCatches
    ?? [{ fishId: session.resultFishId!, weight: Number(session.resultWeight) }];
  const catches = rows.map(r => {
    const fish = FISH.find(f => f.id === r.fishId);
    if (!fish) throw new Error('INVALID_FISHING_SESSION');
    return { fish, weight: r.weight, location: session.locationId, timestamp: now };
  });
  return {
    player: applyCatch(player, catches, { fromNet: session.mode === 'net' }, LOCATIONS),
    caught: catches.map(c => ({ fishId: c.fish.id, weight: c.weight, location: session.locationId })),
  };
}

function castResultFor(roll: CastRoll, sessionId: string, state: SaveEnvelope, version: number): CastResult {
  const base: CastBase = { sessionId, lucky: roll.mode === 'submarine' ? false : roll.lucky, state, version };
  if (roll.mode === 'submarine') return { ...base, mode: 'submarine', catches: roll.catches };
  if (roll.mode === 'net') return { ...base, mode: 'net', net: roll.net, catches: roll.catches };
  return { ...base, mode: 'rod', fishId: roll.fishId, weight: roll.weight, xp: roll.xp };
}

function sessionRowFor(roll: CastRoll, id: string, userId: string, locationId: string, idempotencyKey: string): FishingSessionRow {
  const common = {
    id, userId, locationId, idempotencyKey, status: 'open' as const, createdAt: new Date(),
  };
  if (roll.mode === 'submarine') {
    return { ...common, mode: 'submarine', resultLucky: false, resultFishId: null, resultWeight: null, resultXp: null, resultCatches: roll.catches };
  }
  if (roll.mode === 'net') {
    return { ...common, mode: 'net', resultLucky: roll.lucky, resultFishId: null, resultWeight: null, resultXp: null, resultCatches: roll.catches };
  }
  return { ...common, mode: 'rod', resultLucky: roll.lucky, resultFishId: roll.fishId, resultWeight: roll.weight, resultXp: roll.xp, resultCatches: null };
}

/** Player blob patch a cast writes (rod/net: lucky window, net also spends a net; submarine: nothing). */
export function castPlayerPatch(player: SaveEnvelope['player'], roll: CastRoll): SaveEnvelope['player'] {
  if (roll.mode === 'submarine') return player;
  const next = { ...player, luckyUntil: roll.luckyUntil, luckyCooldownUntil: roll.luckyCooldownUntil };
  if (roll.mode === 'net') next.nets = roll.netsAfter;
  return next;
}

export function createMemoryFishingService(store: MemoryGameStateStore): FishingService {
  const sessions = new Map<string, FishingSessionRow>();
  const castByKey = new Map<string, string>();
  const landByKey = new Map<string, LandResult>();

  const envelopeOf = (state: unknown): SaveEnvelope => saveSchema.parse(state);

  return {
    async cast(userId, idempotencyKey, locationId, mode = 'rod') {
      const entry = store.get(userId);
      if (!entry) throw new Error('GAME_STATE_NOT_FOUND');

      const dedupeKey = `${userId}:${idempotencyKey}`;
      const existingId = castByKey.get(dedupeKey);
      if (existingId) {
        const s = sessions.get(existingId)!;
        const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: envelopeOf(entry.state).player };
        if (s.mode === 'submarine') {
          return { sessionId: s.id, mode: 'submarine', lucky: false, state, version: entry.version, catches: s.resultCatches as SubmarineEntry[] };
        }
        return s.mode === 'net'
          ? {
              sessionId: s.id, mode: 'net', lucky: s.resultLucky, state, version: entry.version,
              net: { id: '', rarity: '', fishCount: s.resultCatches!.length, greenZoneSize: 0.5, speed: 1 },
              catches: s.resultCatches!,
            }
          : {
              sessionId: s.id, mode: 'rod', lucky: s.resultLucky, state, version: entry.version,
              fishId: s.resultFishId!, weight: s.resultWeight!, xp: s.resultXp!,
            };
      }

      const player = envelopeOf(entry.state).player;
      const now = Date.now();
      const roll = rollCast(player, locationId, mode, now);

      const isSubmarine = roll.mode === 'submarine';
      const version = isSubmarine ? entry.version : entry.version + 1;
      const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: castPlayerPatch(player, roll) };
      if (!isSubmarine) {
        store.set(userId, { state, updatedAt: new Date().toISOString(), version });
      }

      const session = sessionRowFor(roll, randomUUID(), userId, locationId, idempotencyKey);
      sessions.set(session.id, session);
      castByKey.set(dedupeKey, session.id);

      return castResultFor(roll, session.id, state, version);
    },

    async land(userId, idempotencyKey, sessionId) {
      const replayKey = `${userId}:${idempotencyKey}`;
      const replayed = landByKey.get(replayKey);
      if (replayed) return replayed;

      const session = sessions.get(sessionId);
      if (!session || session.userId !== userId) throw new Error('INVALID_FISHING_SESSION');

      const entry = store.get(userId);
      if (!entry) throw new Error('GAME_STATE_NOT_FOUND');

      const recordedCaught = (): Caught[] =>
        (session.resultCatches ?? [{ fishId: session.resultFishId!, weight: Number(session.resultWeight) }])
          .map(r => ({ fishId: r.fishId, weight: r.weight, location: session.locationId }));

      if (session.status === 'completed') {
        const result: LandResult = {
          state: { schemaVersion: SAVE_SCHEMA_VERSION, player: envelopeOf(entry.state).player },
          version: entry.version,
          caught: recordedCaught(),
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
