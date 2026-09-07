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
});
