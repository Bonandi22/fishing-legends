import { describe, expect, it, vi } from 'vitest';
import * as endpoints from '@/api/endpoints';
import type { PlayerState } from '@/game/types';
import { getXpForLevel } from '@/game/types';
import { getUnlockedLocationIds } from '@/game/stateRules';
import { LOCATIONS } from '@/game/data';
import { hydrateFromServer } from './hydrate';

function playerAt(overrides: Partial<PlayerState>): PlayerState {
  return {
    level: 1, xp: 0, xpToNextLevel: getXpForLevel(1), totalFishCaught: 0,
    collection: [], unlockedLocations: getUnlockedLocationIds(1, LOCATIONS),
    heaviestFish: null, warehouse: [], coins: 0,
    activeSkin: 'default', ownedSkins: ['default'],
    activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...overrides,
  };
}

/** Runs hydrateFromServer against `prev` and returns the merged PlayerState. */
async function hydrateOver(prev: PlayerState): Promise<PlayerState> {
  let merged: PlayerState = prev;
  await hydrateFromServer(updater => { merged = { ...prev, ...updater(prev) }; });
  return merged;
}

describe('hydrateFromServer', () => {
  it('merges /me into the current state through the updater', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({
      user: {
        userId: 'u1', email: 'e', username: 'A', country: 'BR',
        level: 5, xp: 40, totalFishCaught: 12, coins: 999, unlockedLocations: ['atlantic'],
      },
    });
    const merged = await hydrateOver(playerAt({}));
    expect(merged.level).toBe(5);
    expect(merged.xp).toBe(40);
    expect(merged.totalFishCaught).toBe(12);
    expect(merged.unlockedLocations).toContain('atlantic');
    // xpToNextLevel is derived from the merged level
    expect(merged.xpToNextLevel).toBe(getXpForLevel(5));
  });

  it('never applies server coins (dead 0 column until 10.3)', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({
      user: {
        userId: 'u1', email: 'e', username: 'A', country: 'BR',
        level: 5, xp: 40, totalFishCaught: 12, coins: 999, unlockedLocations: [],
      },
    });
    const replace = vi.fn();
    await hydrateFromServer(replace);
    const partial = replace.mock.calls[0][0](playerAt({ coins: 5000 }));
    expect(partial).not.toHaveProperty('coins');
  });

  it('does not regress a level-8 local player against an empty server payload', async () => {
    const eight = getUnlockedLocationIds(8, LOCATIONS);
    expect(eight.length).toBeGreaterThan(1);
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({
      user: {
        userId: 'u1', email: 'e', username: 'A', country: 'BR',
        level: 1, xp: 0, totalFishCaught: 0, coins: 0, unlockedLocations: [],
      },
    });

    const merged = await hydrateOver(playerAt({
      level: 8, xp: 500, coins: 5000, totalFishCaught: 40, unlockedLocations: eight,
    }));

    expect(merged.coins).toBe(5000);
    expect(merged.level).toBe(8);
    expect(merged.xp).toBe(500);
    expect(merged.totalFishCaught).toBe(40);
    for (const id of eight) expect(merged.unlockedLocations).toContain(id);
  });

  it('floors unlockedLocations at what the merged level grants', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({
      user: {
        userId: 'u1', email: 'e', username: 'A', country: 'BR',
        level: 8, xp: 0, totalFishCaught: 0, coins: 0, unlockedLocations: [],
      },
    });
    const merged = await hydrateOver(playerAt({ level: 1, unlockedLocations: [] }));
    for (const id of getUnlockedLocationIds(8, LOCATIONS)) {
      expect(merged.unlockedLocations).toContain(id);
    }
  });
});
