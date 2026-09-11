import { describe, expect, it, vi, afterEach } from 'vitest';
import * as endpoints from '@/api/endpoints';
import { SAVE_SCHEMA_VERSION } from '@/game/persistence';
import { hydrateFromServer } from './hydrate';

afterEach(() => vi.restoreAllMocks());

const validPlayer = {
  level: 7, xp: 60, xpToNextLevel: 700, totalFishCaught: 20,
  collection: [], unlockedLocations: ['atlantic', 'amazon'], heaviestFish: null, warehouse: [],
  coins: 900, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
  luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
  aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
};

describe('hydrateFromServer', () => {
  it('loads a valid blob and returns the server version and player, without applying it', async () => {
    vi.spyOn(endpoints, 'getGameState').mockResolvedValue({
      state: { schemaVersion: SAVE_SCHEMA_VERSION, player: validPlayer }, updatedAt: '2026-09-07T00:00:00Z', version: 5,
    });
    const res = await hydrateFromServer();
    expect(res).toMatchObject({ kind: 'loaded', version: 5 });
    expect(res.player).toMatchObject({ level: 7, coins: 900, totalFishCaught: 20 });
  });

  it('returns empty with a null version when the server has no state', async () => {
    vi.spyOn(endpoints, 'getGameState').mockResolvedValue({ state: null, updatedAt: null, version: null });
    expect(await hydrateFromServer()).toEqual({ kind: 'empty', version: null });
  });

  it('returns empty when the blob fails validation', async () => {
    vi.spyOn(endpoints, 'getGameState').mockResolvedValue({ state: { schemaVersion: 1, player: { level: 0 } }, updatedAt: 'x', version: 2 });
    expect(await hydrateFromServer()).toEqual({ kind: 'empty', version: null });
  });

  it('returns error with a null version when the GET fails', async () => {
    vi.spyOn(endpoints, 'getGameState').mockRejectedValue(new Error('network'));
    expect(await hydrateFromServer()).toEqual({ kind: 'error', version: null });
  });
});
