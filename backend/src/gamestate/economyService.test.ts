import { describe, expect, it } from 'vitest';
import { createMemoryGameStateStore } from './memoryService.js';
import { createMemoryGameStateEconomyService } from './economyService.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';
import { FISH } from '../../../src/game/data.js';

const withFish = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 3, xp: 0, xpToNextLevel: 300, totalFishCaught: 2,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null,
    warehouse: [
      { fish: FISH[0], weight: 2, location: 'atlantic', timestamp: 1 },
      { fish: FISH[0], weight: 2, location: 'atlantic', timestamp: 2 },
    ],
    coins: 100, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
    ...over,
  },
});

describe('memory game-state economy service — sellWarehouse', () => {
  it('sells: clears the warehouse, adds coins, bumps the version', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withFish(), updatedAt: 'now', version: 4 });
    const svc = createMemoryGameStateEconomyService(store);

    const res = await svc.sellWarehouse('u1', 'idem-key-aaaaaaaaaaaa');

    expect(res.version).toBe(5);
    expect(res.state.player.warehouse).toEqual([]);
    expect(res.state.player.coins).toBeGreaterThan(100);
    expect(store.get('u1')!.version).toBe(5);
  });

  it('replays the same key without moving coins again', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withFish(), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const first = await svc.sellWarehouse('u1', 'idem-key-bbbbbbbbbbbb');
    const replay = await svc.sellWarehouse('u1', 'idem-key-bbbbbbbbbbbb');

    expect(replay).toEqual(first);
    expect(store.get('u1')!.version).toBe(2); // still 2, not 3
  });

  it('rejects an empty warehouse with WAREHOUSE_EMPTY', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withFish({ warehouse: [] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    await expect(svc.sellWarehouse('u1', 'idem-key-cccccccccccc')).rejects.toThrow('WAREHOUSE_EMPTY');
  });

  it('rejects a user with no blob with GAME_STATE_NOT_FOUND', async () => {
    const svc = createMemoryGameStateEconomyService(createMemoryGameStateStore());
    await expect(svc.sellWarehouse('ghost', 'idem-key-dddddddddddd')).rejects.toThrow('GAME_STATE_NOT_FOUND');
  });

  it('F2: the replay key is scoped to the operation, so same-op replay still hits', async () => {
    // The memory `ops` Map is keyed `${userId}:${OP}:${idempotencyKey}`. A second
    // sellWarehouse with the same key still replays (proves the OP segment does
    // not break the happy path). A genuine cross-operation collision test lands
    // with slice 2, when a second economy endpoint exists to reuse the key from.
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withFish(), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const first = await svc.sellWarehouse('u1', 'idem-key-f2-aaaaaaaaaa');
    const replay = await svc.sellWarehouse('u1', 'idem-key-f2-aaaaaaaaaa');
    expect(replay).toEqual(first);
    expect(store.get('u1')!.version).toBe(2);
  });

  // The pg service double-checks `game_state_operations` a second time AFTER
  // taking the `FOR UPDATE` lock on `player_game_state`: under READ COMMITTED a
  // concurrent same-key request can commit its sale (emptying the warehouse)
  // while we wait on the lock, and without the post-lock re-read `computeSale`
  // would throw a spurious WAREHOUSE_EMPTY on the retry race instead of
  // replaying the recorded result. That race is not deterministically
  // reproducible against the single-threaded memory store; the "concurrent
  // same-key" and "concurrent different keys" cases in
  // economyService.integration.test.ts assert it against a real PostgreSQL.
});

const withCoins = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 3, xp: 0, xpToNextLevel: 300, totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 10_000, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
    ...over,
  },
});

describe('memory game-state economy service — purchaseNet', () => {
  it('buys a net: -5000 coins, +1 net, version bump', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 8_000, nets: 2 }), updatedAt: 'now', version: 3 });
    const svc = createMemoryGameStateEconomyService(store);

    const res = await svc.purchaseNet('u1', 'net-key-aaaaaaaaaaaa');

    expect(res.version).toBe(4);
    expect(res.state.player.coins).toBe(3_000);
    expect(res.state.player.nets).toBe(3);
    expect(store.get('u1')!.version).toBe(4);
  });

  it('replays the same key without charging twice', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 8_000, nets: 0 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const first = await svc.purchaseNet('u1', 'net-key-bbbbbbbbbbbb');
    const replay = await svc.purchaseNet('u1', 'net-key-bbbbbbbbbbbb');

    expect(replay).toEqual(first);
    expect(store.get('u1')!.state).toBeDefined();
    expect(store.get('u1')!.version).toBe(2); // not 3
  });

  it('rejects INSUFFICIENT_FUNDS below the net price', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 4_999, nets: 0 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    await expect(svc.purchaseNet('u1', 'net-key-cccccccccccc')).rejects.toThrow('INSUFFICIENT_FUNDS');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('rejects NET_LIMIT_REACHED at the cap', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 1_000_000, nets: 10 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    await expect(svc.purchaseNet('u1', 'net-key-dddddddddddd')).rejects.toThrow('NET_LIMIT_REACHED');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('rejects a user with no blob with GAME_STATE_NOT_FOUND', async () => {
    const svc = createMemoryGameStateEconomyService(createMemoryGameStateStore());
    await expect(svc.purchaseNet('ghost', 'net-key-eeeeeeeeeeee')).rejects.toThrow('GAME_STATE_NOT_FOUND');
  });

  it('F2: a net purchase does NOT replay a warehouse sell recorded under the same key', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 8_000, nets: 0, warehouse: [{ fish: FISH[0], weight: 2, location: 'atlantic', timestamp: 1 }] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const key = 'shared-key-1234567890';
    await svc.sellWarehouse('u1', key);          // records under `${u1}:warehouse_sell:${key}`
    const net = await svc.purchaseNet('u1', key); // must run fresh, not replay the sell

    expect(net.state.player.nets).toBe(1);
    expect(net.state.player.warehouse).toEqual([]); // sale already cleared it
    expect(store.get('u1')!.version).toBe(3);       // sell -> 2, net -> 3
  });
});

describe('memory game-state economy service — purchaseMultiplier', () => {
  it('buys a 2x luck multiplier: -3000 coins, luck end + power set, version bump', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 8_000 }), updatedAt: 'now', version: 2 });
    const svc = createMemoryGameStateEconomyService(store);

    const before = Date.now();
    const res = await svc.purchaseMultiplier('u1', 'mult-key-aaaaaaaaaaaa', 'luck', 2);

    expect(res.version).toBe(3);
    expect(res.state.player.coins).toBe(5_000);
    expect(res.state.player.luckMultiplierPower).toBe(2);
    expect(res.state.player.luckMultiplierEnd).toBeGreaterThanOrEqual(before + 60_000);
    expect(res.state.player.strengthMultiplierEnd).toBeNull();
  });

  it('buys a 4x strength multiplier for 6000 coins', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 8_000 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const res = await svc.purchaseMultiplier('u1', 'mult-key-bbbbbbbbbbbb', 'strength', 4);

    expect(res.state.player.coins).toBe(2_000);
    expect(res.state.player.strengthMultiplierPower).toBe(4);
    expect(res.state.player.luckMultiplierEnd).toBeNull();
  });

  it('replays the same key without charging twice', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 8_000 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const first = await svc.purchaseMultiplier('u1', 'mult-key-cccccccccccc', 'luck', 2);
    const replay = await svc.purchaseMultiplier('u1', 'mult-key-cccccccccccc', 'luck', 2);

    expect(replay).toEqual(first);
    expect(store.get('u1')!.version).toBe(2); // not 3
  });

  it('rejects INSUFFICIENT_FUNDS below the multiplier cost', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 2_999 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    await expect(svc.purchaseMultiplier('u1', 'mult-key-dddddddddddd', 'luck', 2)).rejects.toThrow('INSUFFICIENT_FUNDS');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('rejects a user with no blob with GAME_STATE_NOT_FOUND', async () => {
    const svc = createMemoryGameStateEconomyService(createMemoryGameStateStore());
    await expect(svc.purchaseMultiplier('ghost', 'mult-key-eeeeeeeeeeee', 'strength', 2)).rejects.toThrow('GAME_STATE_NOT_FOUND');
  });
});
