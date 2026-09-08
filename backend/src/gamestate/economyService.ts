import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { gameStateOperations, playerGameState } from '../db/schema.js';
import { readRecordedResult } from './opReplay.js';
import { SAVE_SCHEMA_VERSION, saveSchema, type SaveEnvelope } from '../../../src/game/persistence.js';
import {
  buyMultiplier as applyMultiplierPurchase,
  buyNet as applyNetPurchase,
  buyOwnedItem as applySkinPurchase,
  placeAquariumFish as applyAquariumPlace,
  resolveDailyGift,
  sellWarehouse as applyWarehouseSale,
  spinDailyRoulette,
  spinSkinRoulette,
} from '../../../src/game/stateRules.js';
import type { RewardGrant } from '../../../src/game/rewards.js';
import { LOCATIONS } from '../../../src/game/data.js';
import {
  BOAT_SKINS,
  MULTIPLIER_COST,
  MULTIPLIER_COST_4X,
  NET_LIMIT,
  NET_PRICE,
  ROD_SKINS,
} from '../../../src/game/types.js';

export type MultiplierType = 'luck' | 'strength';
export type MultiplierPower = 2 | 4;
export type SkinKind = 'rod' | 'boat';
import type { MemoryGameStateStore } from './memoryService.js';

type Player = SaveEnvelope['player'];
type Result = { state: SaveEnvelope; version: number; reward?: RewardGrant };

/**
 * A pure blob transformation: takes the parsed envelope, returns the next player
 * state (and an optional `reward` descriptor for the reward ops), or throws a
 * mapped domain error (`WAREHOUSE_EMPTY`, `INSUFFICIENT_FUNDS`, `NET_LIMIT_REACHED`,
 * `ROULETTE_ALREADY_USED`, …) BEFORE any write. Each `compute` checks the
 * preconditions explicitly and only then delegates to the pure rule.
 */
type Compute = (envelope: SaveEnvelope) => { player: Player; reward?: RewardGrant };

const OPS = {
  warehouseSell: 'warehouse_sell',
  netPurchase: 'net_purchase',
  multiplierPurchase: 'multiplier_purchase',
  skinPurchase: 'skin_purchase',
  rouletteSpin: 'roulette_spin',
  skinRouletteSpin: 'skin_roulette_spin',
  dailyGiftClaim: 'daily_gift_claim',
  aquariumPlace: 'aquarium_place',
} as const;

const roll = (n: number) => randomInt(n);
const todayUtc = () => new Date().toISOString().slice(0, 10);

function computeSale(envelope: SaveEnvelope): { player: Player } {
  if (envelope.player.warehouse.length === 0) throw new Error('WAREHOUSE_EMPTY');
  return { player: applyWarehouseSale(envelope.player, LOCATIONS) };
}

function computeNetPurchase(envelope: SaveEnvelope): { player: Player } {
  const player = envelope.player;
  if ((player.nets ?? NET_LIMIT) >= NET_LIMIT) throw new Error('NET_LIMIT_REACHED');
  if (player.coins < NET_PRICE) throw new Error('INSUFFICIENT_FUNDS');
  return { player: applyNetPurchase(player) };
}

function computeMultiplierPurchase(
  envelope: SaveEnvelope,
  type: MultiplierType,
  power: MultiplierPower,
  now: number,
): { player: Player } {
  const cost = power === 4 ? MULTIPLIER_COST_4X : MULTIPLIER_COST;
  if (envelope.player.coins < cost) throw new Error('INSUFFICIENT_FUNDS');
  return { player: applyMultiplierPurchase(envelope.player, type, power, now) };
}

/**
 * Skin pricing is server-owned: the price comes from the `ROD_SKINS` / `BOAT_SKINS`
 * catalog, never from the client. Exclusive skins are roulette-only and cannot be
 * bought here (treated as not found).
 */
function computeSkinPurchase(envelope: SaveEnvelope, kind: SkinKind, skinId: string): { player: Player } {
  const catalog = kind === 'rod' ? ROD_SKINS : BOAT_SKINS;
  const skin = catalog.find(s => s.id === skinId);
  if (!skin || skin.exclusive) throw new Error('SKIN_NOT_FOUND');

  const owned = kind === 'rod' ? envelope.player.ownedSkins : envelope.player.ownedBoatSkins;
  if (owned.includes(skinId)) throw new Error('SKIN_ALREADY_OWNED');
  if (envelope.player.coins < skin.price) throw new Error('INSUFFICIENT_FUNDS');

  return { player: applySkinPurchase(envelope.player, kind, skinId, skin.price) };
}

/**
 * Move a fish already in `aquariumWarehouse` into a display sector. The pure rule
 * grants `AQUARIUM_REWARDS` (coins + xp) folded straight into the blob — there is
 * no `reward` descriptor. The `timestamp` must match a stored fish (checked here,
 * before the write, like `computeSkinPurchase`).
 */
function computeAquariumPlace(envelope: SaveEnvelope, timestamp: number, sector: number): { player: Player } {
  const has = (envelope.player.aquariumWarehouse ?? []).some(c => c.timestamp === timestamp);
  if (!has) throw new Error('AQUARIUM_FISH_NOT_FOUND');
  return { player: applyAquariumPlace(envelope.player, timestamp, sector, LOCATIONS) };
}

export interface GameStateEconomyService {
  sellWarehouse(userId: string, idempotencyKey: string): Promise<Result>;
  purchaseNet(userId: string, idempotencyKey: string): Promise<Result>;
  purchaseMultiplier(
    userId: string,
    idempotencyKey: string,
    type: MultiplierType,
    power: MultiplierPower,
  ): Promise<Result>;
  purchaseSkin(
    userId: string,
    idempotencyKey: string,
    kind: SkinKind,
    skinId: string,
  ): Promise<Result>;
  spinRoulette(userId: string, idempotencyKey: string): Promise<Result>;
  spinSkinRoulette(userId: string, idempotencyKey: string): Promise<Result>;
  claimDailyGift(userId: string, idempotencyKey: string): Promise<Result>;
  placeAquariumFish(userId: string, idempotencyKey: string, timestamp: number, sector: number): Promise<Result>;
}

/**
 * Runs one economy operation against the in-memory blob store. The replay
 * identity is `(userId, operation, idempotencyKey)` — NOT just
 * `(userId, idempotencyKey)` — so a client that reuses one Idempotency-Key
 * across two economy endpoints does not get the first op's recorded envelope
 * back from the second. The pg path enforces the same via its `WHERE`.
 */
function runMemoryOp(
  store: MemoryGameStateStore,
  ops: Map<string, Result>,
  userId: string,
  operation: string,
  idempotencyKey: string,
  compute: Compute,
): Result {
  const opKey = `${userId}:${operation}:${idempotencyKey}`;
  const seen = ops.get(opKey);
  if (seen) return seen;

  const entry = store.get(userId);
  if (!entry) throw new Error('GAME_STATE_NOT_FOUND');
  const envelope = saveSchema.parse(entry.state);
  const { player: nextPlayer, reward } = compute(envelope);
  const version = entry.version + 1;
  const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: nextPlayer };
  store.set(userId, { state, updatedAt: new Date().toISOString(), version });
  const result: Result = { state, version, ...(reward ? { reward } : {}) };
  ops.set(opKey, result);
  return result;
}

/**
 * Runs one economy operation against PostgreSQL in a single transaction:
 * pre-lock replay check → `SELECT … FOR UPDATE` on the blob row → post-lock
 * replay check → `compute` → `UPDATE` blob + `version + 1` → `INSERT` the
 * operation → commit.
 *
 * The pre-lock / post-lock double read of `game_state_operations` assumes
 * READ COMMITTED (the project default): the post-lock read must see a row a
 * concurrent same-key transaction committed while we waited on the lock. Under
 * REPEATABLE READ the post-lock read would still see the frozen snapshot and the
 * `UPDATE` would raise a serialization error instead.
 *
 * The `FOR UPDATE` lock is load-bearing: the `UPDATE` is keyed on `user_id` only
 * (no version guard in the `WHERE`), so without it two concurrent ops both read
 * version N and both write N+1 (lost update). The post-lock replay re-read stops
 * a concurrent same-key retry from getting a spurious domain error (e.g.
 * `WAREHOUSE_EMPTY`) instead of the recorded result — covered by the concurrent
 * cases in economyService.integration.test.ts.
 */
function runPgOp(
  db: Database,
  userId: string,
  operation: string,
  idempotencyKey: string,
  compute: Compute,
): Promise<Result> {
  return db.transaction(async (tx) => {
    const priorResult = await readRecordedResult<Result>(tx, userId, operation, idempotencyKey);
    if (priorResult) return priorResult;

    const rows = await tx.select().from(playerGameState)
      .where(eq(playerGameState.userId, userId)).limit(1).for('update');
    const row = rows[0];
    if (!row) throw new Error('GAME_STATE_NOT_FOUND');

    const lockedPriorResult = await readRecordedResult<Result>(tx, userId, operation, idempotencyKey);
    if (lockedPriorResult) return lockedPriorResult;

    const envelope = saveSchema.parse(row.state);
    const { player: nextPlayer, reward } = compute(envelope);
    const version = row.version + 1;
    const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: nextPlayer };

    await tx.update(playerGameState)
      .set({ state, version, updatedAt: new Date() })
      .where(eq(playerGameState.userId, userId));

    const result: Result = { state, version, ...(reward ? { reward } : {}) };
    await tx.insert(gameStateOperations).values({
      userId,
      idempotencyKey,
      operation,
      result: result as typeof gameStateOperations.$inferInsert['result'],
    });
    return result;
  });
}

export function createMemoryGameStateEconomyService(store: MemoryGameStateStore): GameStateEconomyService {
  const ops = new Map<string, Result>();
  return {
    async sellWarehouse(userId, idempotencyKey) {
      return runMemoryOp(store, ops, userId, OPS.warehouseSell, idempotencyKey, computeSale);
    },
    async purchaseNet(userId, idempotencyKey) {
      return runMemoryOp(store, ops, userId, OPS.netPurchase, idempotencyKey, computeNetPurchase);
    },
    async purchaseMultiplier(userId, idempotencyKey, type, power) {
      const now = Date.now();
      return runMemoryOp(store, ops, userId, OPS.multiplierPurchase, idempotencyKey,
        env => computeMultiplierPurchase(env, type, power, now));
    },
    async purchaseSkin(userId, idempotencyKey, kind, skinId) {
      return runMemoryOp(store, ops, userId, OPS.skinPurchase, idempotencyKey,
        env => computeSkinPurchase(env, kind, skinId));
    },
    async spinRoulette(userId, idempotencyKey) {
      const today = todayUtc();
      const now = Date.now();
      return runMemoryOp(store, ops, userId, OPS.rouletteSpin, idempotencyKey, env => {
        const { next, reward } = spinDailyRoulette(env.player, today, now, roll);
        return { player: next, reward };
      });
    },
    async spinSkinRoulette(userId, idempotencyKey) {
      return runMemoryOp(store, ops, userId, OPS.skinRouletteSpin, idempotencyKey, env => {
        const { next, reward } = spinSkinRoulette(env.player, roll);
        return { player: next, reward };
      });
    },
    async claimDailyGift(userId, idempotencyKey) {
      const today = todayUtc();
      const now = Date.now();
      return runMemoryOp(store, ops, userId, OPS.dailyGiftClaim, idempotencyKey, env => {
        const { next, reward } = resolveDailyGift(env.player, today, now);
        return { player: next, reward };
      });
    },
    async placeAquariumFish(userId, idempotencyKey, timestamp, sector) {
      return runMemoryOp(store, ops, userId, OPS.aquariumPlace, idempotencyKey,
        env => computeAquariumPlace(env, timestamp, sector));
    },
  };
}

export function createPgGameStateEconomyService(db: Database): GameStateEconomyService {
  return {
    async sellWarehouse(userId, idempotencyKey) {
      return runPgOp(db, userId, OPS.warehouseSell, idempotencyKey, computeSale);
    },
    async purchaseNet(userId, idempotencyKey) {
      return runPgOp(db, userId, OPS.netPurchase, idempotencyKey, computeNetPurchase);
    },
    async purchaseMultiplier(userId, idempotencyKey, type, power) {
      const now = Date.now();
      return runPgOp(db, userId, OPS.multiplierPurchase, idempotencyKey,
        env => computeMultiplierPurchase(env, type, power, now));
    },
    async purchaseSkin(userId, idempotencyKey, kind, skinId) {
      return runPgOp(db, userId, OPS.skinPurchase, idempotencyKey,
        env => computeSkinPurchase(env, kind, skinId));
    },
    async spinRoulette(userId, idempotencyKey) {
      const today = todayUtc();
      const now = Date.now();
      return runPgOp(db, userId, OPS.rouletteSpin, idempotencyKey, env => {
        const { next, reward } = spinDailyRoulette(env.player, today, now, roll);
        return { player: next, reward };
      });
    },
    async spinSkinRoulette(userId, idempotencyKey) {
      return runPgOp(db, userId, OPS.skinRouletteSpin, idempotencyKey, env => {
        const { next, reward } = spinSkinRoulette(env.player, roll);
        return { player: next, reward };
      });
    },
    async claimDailyGift(userId, idempotencyKey) {
      const today = todayUtc();
      const now = Date.now();
      return runPgOp(db, userId, OPS.dailyGiftClaim, idempotencyKey, env => {
        const { next, reward } = resolveDailyGift(env.player, today, now);
        return { player: next, reward };
      });
    },
    async placeAquariumFish(userId, idempotencyKey, timestamp, sector) {
      return runPgOp(db, userId, OPS.aquariumPlace, idempotencyKey,
        env => computeAquariumPlace(env, timestamp, sector));
    },
  };
}
