import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { gameStateOperations, users } from '../db/schema.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgGameStateService } from './pgRepository.js';
import { createPgGameStateEconomyService } from './economyService.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';
import { FISH } from '../../../src/game/data.js';
import { AQUARIUM_REWARDS } from '../../../src/game/types.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let gameState: ReturnType<typeof createPgGameStateService>;
let economy: ReturnType<typeof createPgGameStateEconomyService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  gameState = createPgGameStateService(harness.db);
  economy = createPgGameStateEconomyService(harness.db);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `econ-${randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `econ_${randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  return user.id;
}

const blob = (warehouse: unknown[]) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 3, xp: 0, xpToNextLevel: 300, totalFishCaught: warehouse.length,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse,
    coins: 100, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
  },
});
const oneFish = [{ fish: FISH[0], weight: 2, location: 'atlantic', timestamp: 1 }];

const netBlob = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: { ...blob([]).player, coins: 10_000, nets: 0, ...over },
});

describe('pg game-state economy service (integration)', () => {
  it('sells transactionally: warehouse cleared, coins up, version +1, one operation row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob(oneFish));

    const res = await economy.sellWarehouse(userId, 'idem-key-int-aaaaaaaa');
    expect(res.version).toBe(2);
    expect(res.state.player.warehouse).toEqual([]);
    expect(res.state.player.coins).toBeGreaterThan(100);

    const got = await gameState.get(userId);
    expect(got!.version).toBe(2);
    expect((got!.state as { player: { warehouse: unknown[] } }).player.warehouse).toEqual([]);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('replays the same key: identical result, still one row, blob untouched by the replay', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob(oneFish));

    const first = await economy.sellWarehouse(userId, 'idem-key-int-bbbbbbbb');
    const replay = await economy.sellWarehouse(userId, 'idem-key-int-bbbbbbbb');
    expect(replay).toEqual(first);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('empty warehouse -> WAREHOUSE_EMPTY, nothing written', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob([]));

    await expect(economy.sellWarehouse(userId, 'idem-key-int-cccccccc')).rejects.toThrow('WAREHOUSE_EMPTY');

    expect((await gameState.get(userId))!.version).toBe(1);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(0);
  });

  it('concurrent same-key: both resolve identically, exactly one op row, version 2 not 3', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob(oneFish));

    const key = 'idem-key-int-race-same';
    const [a, b] = await Promise.all([
      economy.sellWarehouse(userId, key),
      economy.sellWarehouse(userId, key),
    ]);

    expect(a).toEqual(b);
    expect(a.version).toBe(2);
    expect(a.state.player.warehouse).toEqual([]);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('concurrent different keys: exactly one sells (v2), the other loses the lock race with WAREHOUSE_EMPTY', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob(oneFish));

    const settled = await Promise.allSettled([
      economy.sellWarehouse(userId, 'idem-key-int-race-diff-a'),
      economy.sellWarehouse(userId, 'idem-key-int-race-diff-b'),
    ]);

    const fulfilled = settled.filter(s => s.status === 'fulfilled') as PromiseFulfilledResult<{ version: number }>[];
    const rejected = settled.filter(s => s.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.version).toBe(2);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as Error).message).toBe('WAREHOUSE_EMPTY');

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('buys a net transactionally: -5000 coins, +1 net, version +1, one op row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 8_000, nets: 1 }));

    const res = await economy.purchaseNet(userId, 'net-key-int-aaaaaaaa');
    expect(res.version).toBe(2);
    expect(res.state.player.coins).toBe(3_000);
    expect(res.state.player.nets).toBe(2);

    const got = await gameState.get(userId);
    expect(got!.version).toBe(2);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('net_purchase');
  });

  it('net purchase replays the same key: identical result, still one row, not charged twice', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 8_000 }));

    const first = await economy.purchaseNet(userId, 'net-key-int-bbbbbbbb');
    const replay = await economy.purchaseNet(userId, 'net-key-int-bbbbbbbb');
    expect(replay).toEqual(first);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
    expect((first.state.player as { coins: number }).coins).toBe(3_000);
  });

  it('net purchase: concurrent same-key resolves identically, exactly one op row, version 2', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 20_000 }));

    const key = 'net-key-int-race-same';
    const [a, b] = await Promise.all([
      economy.purchaseNet(userId, key),
      economy.purchaseNet(userId, key),
    ]);

    expect(a).toEqual(b);
    expect(a.version).toBe(2);
    expect(a.state.player.coins).toBe(15_000); // charged once

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('F2: a net purchase does not replay a warehouse sell recorded under the same key', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 8_000, warehouse: oneFish }));

    const key = 'shared-key-int-cross-op';
    await economy.sellWarehouse(userId, key); // version 2, op 'warehouse_sell'
    const net = await economy.purchaseNet(userId, key); // version 3, op 'net_purchase' — fresh

    expect(net.version).toBe(3);
    expect(net.state.player.nets).toBe(1);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(2);
    expect(ops.map(o => o.operation).sort()).toEqual(['net_purchase', 'warehouse_sell']);
  });

  it('buys a multiplier transactionally: -3000 coins, luck power/end set, version +1, one op row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 8_000 }));

    const res = await economy.purchaseMultiplier(userId, 'mult-key-int-aaaaaaaa', 'luck', 2);
    expect(res.version).toBe(2);
    expect(res.state.player.coins).toBe(5_000);
    expect(res.state.player.luckMultiplierPower).toBe(2);
    expect(typeof res.state.player.luckMultiplierEnd).toBe('number');

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('multiplier_purchase');
  });

  it('multiplier purchase replays the same key: identical result, one row, not charged twice', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 8_000 }));

    const first = await economy.purchaseMultiplier(userId, 'mult-key-int-bbbbbbbb', 'strength', 4);
    const replay = await economy.purchaseMultiplier(userId, 'mult-key-int-bbbbbbbb', 'strength', 4);
    expect(replay).toEqual(first);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('multiplier purchase: concurrent same-key resolves identically, one op row, version 2', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 20_000 }));

    const key = 'mult-key-int-race-same';
    const [a, b] = await Promise.all([
      economy.purchaseMultiplier(userId, key, 'luck', 2),
      economy.purchaseMultiplier(userId, key, 'luck', 2),
    ]);

    expect(a).toEqual(b);
    expect(a.version).toBe(2);
    expect(a.state.player.coins).toBe(17_000); // charged once

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('buys a rod skin transactionally: -1000 coins, id owned, version +1, one op row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 8_000 }));

    const res = await economy.purchaseSkin(userId, 'skin-key-int-aaaaaaaa', 'rod', 'shark');
    expect(res.version).toBe(2);
    expect(res.state.player.coins).toBe(7_000);
    expect(res.state.player.ownedSkins).toContain('shark');

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('skin_purchase');
  });

  it('skin purchase replays the same key: identical result, one row, not charged twice', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 8_000 }));

    const first = await economy.purchaseSkin(userId, 'skin-key-int-bbbbbbbb', 'boat', 'yacht');
    const replay = await economy.purchaseSkin(userId, 'skin-key-int-bbbbbbbb', 'boat', 'yacht');
    expect(replay).toEqual(first);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
    expect((first.state.player as { coins: number }).coins).toBe(5_500);
  });

  it('skin purchase: concurrent same-key resolves identically, one op row, version 2', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 20_000 }));

    const key = 'skin-key-int-race-same';
    const [a, b] = await Promise.all([
      economy.purchaseSkin(userId, key, 'rod', 'kraken'),
      economy.purchaseSkin(userId, key, 'rod', 'kraken'),
    ]);

    expect(a).toEqual(b);
    expect(a.version).toBe(2);
    expect(a.state.player.coins).toBe(15_000); // kraken 5000, charged once

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('already-owned skin -> SKIN_ALREADY_OWNED, nothing written', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 8_000, ownedSkins: ['default', 'shark'] }));

    await expect(economy.purchaseSkin(userId, 'skin-key-int-cccccccc', 'rod', 'shark')).rejects.toThrow('SKIN_ALREADY_OWNED');

    expect((await gameState.get(userId))!.version).toBe(1);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(0);
  });

  it('claimDailyGift transactionally: +150 coins, version +1, one op row with the reward', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 0 }));

    const res = await economy.claimDailyGift(userId, 'gift-key-int-aaaaaaaa');
    expect(res.version).toBe(2);
    expect(res.state.player.coins).toBe(150);
    expect(res.reward).toEqual({ type: 'coins', amount: 150 });

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('daily_gift_claim');
    expect((ops[0].result as { reward: unknown }).reward).toEqual({ type: 'coins', amount: 150 });
  });

  it('claimDailyGift replay: identical result incl. reward, one row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 0 }));
    const first = await economy.claimDailyGift(userId, 'gift-key-int-bbbbbbbb');
    const replay = await economy.claimDailyGift(userId, 'gift-key-int-bbbbbbbb');
    expect(replay).toEqual(first);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('second distinct daily claim same day -> DAILY_GIFT_ALREADY_CLAIMED, nothing written', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 0 }));
    await economy.claimDailyGift(userId, 'gift-key-int-cccccccc');
    await expect(economy.claimDailyGift(userId, 'gift-key-int-dddddddd')).rejects.toThrow('DAILY_GIFT_ALREADY_CLAIMED');
    expect((await gameState.get(userId))!.version).toBe(2);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('spinRoulette: concurrent same-key resolves identically, one op row, version 2', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 0 }));
    const key = 'roul-key-int-race-same';
    const [a, b] = await Promise.all([
      economy.spinRoulette(userId, key),
      economy.spinRoulette(userId, key),
    ]);
    expect(a).toEqual(b);
    expect(a.version).toBe(2);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('roulette_spin');
  });

  it('spinSkinRoulette: -1500 (+/- dup refund) coins, one op row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ coins: 5_000 }));
    const res = await economy.spinSkinRoulette(userId, 'skinroul-key-int-aa');
    expect(res.state.player.coins).toBeGreaterThanOrEqual(5_000 - 1_500);
    expect(res.state.player.coins).toBeLessThanOrEqual(5_000 - 1_500 + 500);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('skin_roulette_spin');
  });

  it('placeAquariumFish transactionally: fish moved to sector, coins+xp up, version +1, one op row', async () => {
    const userId = await seedUser();
    const aq = { fish: FISH[0], weight: 1.5, location: 'atlantic', timestamp: 77 };
    await gameState.bootstrap(userId, {
      schemaVersion: SAVE_SCHEMA_VERSION,
      player: { ...blob([]).player, xpToNextLevel: 999999, aquariumWarehouse: [aq] },
    });

    const res = await economy.placeAquariumFish(userId, 'aqua-key-int-aaaa', 77, 4);
    expect(res.version).toBe(2);
    expect(res.state.player.aquariumWarehouse).toEqual([]);
    expect(res.state.player.aquariumSectors[4]).toHaveLength(1);
    expect(res.state.player.coins).toBe(100 + AQUARIUM_REWARDS[FISH[0].rarity].coins);

    const got = await gameState.get(userId);
    expect(got!.version).toBe(2);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('aquarium_place');
  });

  it('placeAquariumFish replays the same key: identical result, one op row', async () => {
    const userId = await seedUser();
    const aq = { fish: FISH[0], weight: 1.5, location: 'atlantic', timestamp: 88 };
    await gameState.bootstrap(userId, {
      schemaVersion: SAVE_SCHEMA_VERSION,
      player: { ...blob([]).player, xpToNextLevel: 999999, aquariumWarehouse: [aq] },
    });
    const first = await economy.placeAquariumFish(userId, 'aqua-key-int-bbbb', 88, 2);
    const replay = await economy.placeAquariumFish(userId, 'aqua-key-int-bbbb', 88, 2);
    expect(replay).toEqual(first);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('placeAquariumFish concurrent same-key: both resolve identically, one op row', async () => {
    const userId = await seedUser();
    const aq = { fish: FISH[0], weight: 1.5, location: 'atlantic', timestamp: 99 };
    await gameState.bootstrap(userId, {
      schemaVersion: SAVE_SCHEMA_VERSION,
      player: { ...blob([]).player, xpToNextLevel: 999999, aquariumWarehouse: [aq] },
    });
    const [a, b] = await Promise.all([
      economy.placeAquariumFish(userId, 'aqua-key-int-cccc', 99, 1),
      economy.placeAquariumFish(userId, 'aqua-key-int-cccc', 99, 1),
    ]);
    expect(a).toEqual(b);
    expect(a.version).toBe(2);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('deleting the user cascades game_state_operations', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob(oneFish));
    await economy.sellWarehouse(userId, 'idem-key-int-dddddddd');

    await harness.db.delete(users).where(eq(users.id, userId));

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(0);
  });
});
