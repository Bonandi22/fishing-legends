import { randomInt, randomUUID } from 'node:crypto';
import type { MemoryGameStateStore } from '../gamestate/memoryService.js';
import { SAVE_SCHEMA_VERSION, saveSchema, type SaveEnvelope } from '../../../src/game/persistence.js';
import { rollFish, rollWeight, rollSubmarineBatch, SUBMARINE_ROSTER_SIZE } from '../../../src/game/fishingLogic.js';
import { applyCatch, resolveLuckyMode } from '../../../src/game/stateRules.js';
import { rollNet } from '../../../src/game/netTypes.js';
import { FISH, LOCATIONS, getFishForLocation, SUBMARINE_LOCATION_ID } from '../../../src/game/data.js';
import { isSessionExpired } from './session.js';
import { checkCastAllowed, checkLandAllowed, type LastCast } from '../anticheat/hardRules.js';

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
  clientId: string | null;
  strengthActive: boolean;
  completedAt: Date | null;
};

export type FishingLandRow = {
  id: string;
  userId: string;
  sessionId: string;
  mode: CastMode;
  fishId: string;
  landedAt: Date;
};

export type AntiCheatEventType = 'cast_too_fast' | 'land_too_fast';

export type AntiCheatEventRow = {
  id: string;
  userId: string;
  type: AntiCheatEventType;
  sessionId: string | null;
  detail: Record<string, unknown>;
  createdAt: Date;
};

/** In-memory anti-cheat tables (sessions, landing log, events). Read by the anti-cheat analysis. */
export type MemoryAntiCheatStore = {
  lands: FishingLandRow[];
  events: AntiCheatEventRow[];
  sessions: Map<string, FishingSessionRow>;
};

export function createMemoryAntiCheatStore(): MemoryAntiCheatStore {
  return { lands: [], events: [], sessions: new Map() };
}

/** Injectable clock for the fishing services (tests drive it; production uses the wall clock). */
export type FishingServiceOptions = { now?: () => Date };

/** Whether the player's strength boost is active at `now` (recorded on the session for the analysis). */
export function isStrengthActive(player: SaveEnvelope['player'], now: Date): boolean {
  return player.strengthMultiplierEnd != null && player.strengthMultiplierEnd > now.getTime();
}

type CastBase = { sessionId: string; lucky: boolean; state: SaveEnvelope; version: number };
export type CastResult =
  | (CastBase & { mode: 'rod'; fishId: string; weight: number; xp: number })
  | (CastBase & { mode: 'net'; net: NetInfo; catches: BatchEntry[] })
  | (CastBase & { mode: 'submarine'; catches: SubmarineEntry[] });

export type Caught = { fishId: string; weight: number; location: string };
export type LandResult = { state: SaveEnvelope; version: number; caught: Caught[] };

export interface FishingService {
  cast(userId: string, idempotencyKey: string, locationId: string, mode?: CastMode, clientId?: string): Promise<CastResult>;
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

/**
 * Apply a session's roll to a player blob. Rod → one fish; net → the whole batch
 * (`fromNet`); submarine → exactly the roster entry whose `id` matches
 * `opts.catchId`, and `remaining` carries the roster minus that entry (rod/net
 * return `remaining: null`).
 */
export function applyLand(
  player: SaveEnvelope['player'],
  session: Pick<FishingSessionRow, 'mode' | 'locationId' | 'resultFishId' | 'resultWeight' | 'resultCatches'>,
  now: number,
  opts: { catchId?: string } = {},
): { player: SaveEnvelope['player']; caught: Caught[]; remaining: SessionCatch[] | null } {
  if (session.mode === 'submarine') {
    const roster = session.resultCatches ?? [];
    const entry = opts.catchId ? roster.find(e => e.id === opts.catchId) : undefined;
    if (!entry) throw new Error('INVALID_FISHING_SESSION');
    const fish = FISH.find(f => f.id === entry.fishId);
    if (!fish) throw new Error('INVALID_FISHING_SESSION');
    const caught = { fish, weight: entry.weight, location: SUBMARINE_LOCATION_ID, timestamp: now };
    return {
      player: applyCatch(player, [caught], { fromNet: false }, LOCATIONS),
      caught: [{ fishId: fish.id, weight: entry.weight, location: SUBMARINE_LOCATION_ID }],
      remaining: roster.filter(e => e.id !== opts.catchId),
    };
  }

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
    remaining: null,
  };
}

function castResultFor(roll: CastRoll, sessionId: string, state: SaveEnvelope, version: number): CastResult {
  const base: CastBase = { sessionId, lucky: roll.mode === 'submarine' ? false : roll.lucky, state, version };
  if (roll.mode === 'submarine') return { ...base, mode: 'submarine', catches: roll.catches };
  if (roll.mode === 'net') return { ...base, mode: 'net', net: roll.net, catches: roll.catches };
  return { ...base, mode: 'rod', fishId: roll.fishId, weight: roll.weight, xp: roll.xp };
}

type SessionMeta = { userId: string; locationId: string; idempotencyKey: string; clientId: string | null; strengthActive: boolean; createdAt: Date };

function sessionRowFor(roll: CastRoll, id: string, meta: SessionMeta): FishingSessionRow {
  const common = { id, ...meta, status: 'open' as const, completedAt: null };
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

export function createMemoryFishingService(
  store: MemoryGameStateStore,
  anticheat: MemoryAntiCheatStore,
  options: FishingServiceOptions = {},
): FishingService {
  const clock = options.now ?? (() => new Date());
  const sessions = anticheat.sessions;
  const castByKey = new Map<string, string>();
  const landByKey = new Map<string, LandResult>();

  const envelopeOf = (state: unknown): SaveEnvelope => saveSchema.parse(state);

  const lastCastOf = (userId: string): LastCast => {
    let last: FishingSessionRow | null = null;
    for (const s of sessions.values()) {
      if (s.userId === userId && (last === null || s.createdAt > last.createdAt)) last = s;
    }
    return last && { clientId: last.clientId, createdAt: last.createdAt, mode: last.mode };
  };

  const recordEvent = (userId: string, type: AntiCheatEventType, sessionId: string | null, detail: Record<string, unknown>, at: Date) => {
    anticheat.events.push({ id: randomUUID(), userId, type, sessionId, detail, createdAt: at });
  };

  return {
    async cast(userId, idempotencyKey, locationId, mode = 'rod', clientId) {
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

      const nowDate = clock();
      const check = checkCastAllowed(lastCastOf(userId), clientId, mode, nowDate);
      if (!check.ok) {
        if (check.code === 'CAST_TOO_FAST') {
          recordEvent(userId, 'cast_too_fast', null, { intervalMs: check.intervalMs }, nowDate);
        }
        throw new Error(check.code);
      }

      const player = envelopeOf(entry.state).player;
      const now = nowDate.getTime();
      const roll = rollCast(player, locationId, mode, now);

      // H1: a new rod/net cast abandons any open session of the same mode.
      if (roll.mode !== 'submarine') {
        for (const s of sessions.values()) {
          if (s.userId === userId && s.mode === roll.mode && s.status === 'open') s.status = 'expired';
        }
      }

      const isSubmarine = roll.mode === 'submarine';
      const version = isSubmarine ? entry.version : entry.version + 1;
      const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: castPlayerPatch(player, roll) };
      if (!isSubmarine) {
        store.set(userId, { state, updatedAt: nowDate.toISOString(), version });
      }

      const session = sessionRowFor(roll, randomUUID(), {
        userId, locationId, idempotencyKey,
        clientId: clientId ?? null,
        strengthActive: isStrengthActive(player, nowDate),
        createdAt: nowDate,
      });
      sessions.set(session.id, session);
      castByKey.set(dedupeKey, session.id);

      return castResultFor(roll, session.id, state, version);
    },

    async land(userId, idempotencyKey, sessionId, catchId) {
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
        // A new key on a drained submarine roster is not a valid harvest.
        if (session.mode === 'submarine') throw new Error('INVALID_FISHING_SESSION');
        const result: LandResult = {
          state: { schemaVersion: SAVE_SCHEMA_VERSION, player: envelopeOf(entry.state).player },
          version: entry.version,
          caught: recordedCaught(),
        };
        landByKey.set(replayKey, result);
        return result;
      }
      const nowDate = clock();
      if (session.status === 'expired' || isSessionExpired(session.createdAt, nowDate)) {
        session.status = 'expired';
        throw new Error('FISHING_SESSION_EXPIRED');
      }

      const landCheck = checkLandAllowed(session.mode, session.createdAt, nowDate);
      if (!landCheck.ok) {
        session.status = 'expired';
        recordEvent(userId, 'land_too_fast', session.id, { elapsedMs: landCheck.elapsedMs }, nowDate);
        throw new Error(landCheck.code);
      }

      const now = nowDate.getTime();
      const applied = applyLand(envelopeOf(entry.state).player, session, now, { catchId });
      const version = entry.version + 1;
      const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: applied.player };
      store.set(userId, { state, updatedAt: nowDate.toISOString(), version });

      if (session.mode === 'submarine') {
        session.resultCatches = applied.remaining;
        session.createdAt = nowDate;
        if ((applied.remaining ?? []).length === 0) {
          session.status = 'completed';
          session.completedAt = nowDate;
        }
      } else {
        session.status = 'completed';
        session.completedAt = nowDate;
      }
      for (const c of applied.caught) {
        anticheat.lands.push({ id: randomUUID(), userId, sessionId: session.id, mode: session.mode, fishId: c.fishId, landedAt: nowDate });
      }

      const result: LandResult = { state, version, caught: applied.caught };
      landByKey.set(replayKey, result);
      return result;
    },
  };
}
