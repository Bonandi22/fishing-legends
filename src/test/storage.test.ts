import { describe, expect, it } from 'vitest';
import { loadPlayerState, savePlayerState } from '@/game/useGameState';
import { getXpForLevel, PlayerState } from '@/game/types';

const state: PlayerState = {
  level: 1, xp: 0, xpToNextLevel: getXpForLevel(1), totalFishCaught: 0,
  collection: [], unlockedLocations: ['amazon'], heaviestFish: null, warehouse: [],
  coins: 25, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
  ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
  lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: string) => { values.set(key, value); },
    remove: (key: string) => { values.delete(key); },
  };
}

describe('player storage boundary', () => {
  it('round-trips player state through an injected storage adapter', () => {
    const storage = memoryStorage();

    savePlayerState(state, storage);

    expect(loadPlayerState(storage)).toEqual(state);
  });
});
