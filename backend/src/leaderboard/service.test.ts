import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';
import { createMemoryAuthRepository } from '../auth/memoryRepository.js';
import { createMemoryGameStateStore } from '../gamestate/memoryService.js';
import { createMemoryLeaderboardService } from './service.js';

const state = {
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 2, xp: 0, xpToNextLevel: 500, totalFishCaught: 1,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
  },
};

describe('memory leaderboard service', () => {
  it('lists only active accounts (never suspended or banned ones)', async () => {
    const auth = createMemoryAuthRepository();
    const store = createMemoryGameStateStore();
    const ids: string[] = [];
    for (const name of ['active_one', 'suspended_one', 'banned_one']) {
      const user = await auth.createUser({ email: `${name}@example.com`, passwordHash: 'h', username: name, country: 'BR', locale: 'en' });
      store.set(user.id, { state, updatedAt: new Date().toISOString(), version: 1 });
      ids.push(user.id);
    }
    await auth.setStatus(ids[1], 'suspended');
    await auth.setStatus(ids[2], 'banned');

    const page = await createMemoryLeaderboardService(auth, store).list('anyone', 50, 0);
    expect(page.total).toBe(1);
    expect(page.entries.map(e => e.userId)).toEqual([ids[0]]);
  });
});
