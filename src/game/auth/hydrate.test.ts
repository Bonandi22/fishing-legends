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
  it('loads a valid blob and replaces local state', async () => {
    vi.spyOn(endpoints, 'getGameState').mockResolvedValue({
      state: { schemaVersion: SAVE_SCHEMA_VERSION, player: validPlayer }, updatedAt: '2026-09-07T00:00:00Z',
    });
    const replace = vi.fn();
    const res = await hydrateFromServer(replace);
    expect(res).toEqual({ kind: 'loaded' });
    const applied = replace.mock.calls[0][0]({ level: 1, coins: 0 });
    expect(applied).toMatchObject({ level: 7, coins: 900, totalFishCaught: 20 });
  });

  it('returns empty when the server has no state', async () => {
    vi.spyOn(endpoints, 'getGameState').mockResolvedValue({ state: null, updatedAt: null });
    const replace = vi.fn();
    expect(await hydrateFromServer(replace)).toEqual({ kind: 'empty' });
    expect(replace).not.toHaveBeenCalled();
  });

  it('returns empty when the blob fails validation', async () => {
    vi.spyOn(endpoints, 'getGameState').mockResolvedValue({ state: { schemaVersion: 1, player: { level: 0 } }, updatedAt: 'x' });
    const replace = vi.fn();
    expect(await hydrateFromServer(replace)).toEqual({ kind: 'empty' });
    expect(replace).not.toHaveBeenCalled();
  });

  it('returns error when the GET fails', async () => {
    vi.spyOn(endpoints, 'getGameState').mockRejectedValue(new Error('network'));
    const replace = vi.fn();
    expect(await hydrateFromServer(replace)).toEqual({ kind: 'error' });
    expect(replace).not.toHaveBeenCalled();
  });
});
