import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';
import { extractPlayerStats } from './playerStats.js';

const envelope = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 5, xp: 40, xpToNextLevel: 500, totalFishCaught: 12,
    collection: [], unlockedLocations: ['atlantic', 'amazon'], heaviestFish: null, warehouse: [],
    coins: 300, activeSkin: 'gold', ownedSkins: ['default', 'gold'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, luckMultiplierPower: 2, strengthMultiplierPower: 4,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...over,
  },
});

describe('extractPlayerStats', () => {
  it('reads stats out of a valid envelope', () => {
    expect(extractPlayerStats(envelope())).toEqual({
      level: 5, xp: 40, totalFishCaught: 12, coins: 300,
      unlockedLocations: ['atlantic', 'amazon'], ownedSkins: ['default', 'gold'], ownedBoatSkins: ['classic'],
      luckMultiplierPower: 2, strengthMultiplierPower: 4,
    });
  });

  it('defaults luck/strength multiplier power when absent (older saves)', () => {
    const { player, ...rest } = envelope();
    const { luckMultiplierPower, strengthMultiplierPower, ...playerRest } = player as Record<string, unknown>;
    const stats = extractPlayerStats({ ...rest, player: playerRest });
    expect(stats.luckMultiplierPower).toBe(0);
    expect(stats.strengthMultiplierPower).toBe(0);
  });

  it('returns defaults for a player who has never written a game state (null)', () => {
    const stats = extractPlayerStats(null);
    expect(stats).toEqual({
      level: 1, xp: 0, totalFishCaught: 0, coins: 0,
      unlockedLocations: ['atlantic', 'amazon'], ownedSkins: ['default'], ownedBoatSkins: ['classic'],
      luckMultiplierPower: 0, strengthMultiplierPower: 0,
    });
  });

  it('returns defaults instead of throwing for a blob that fails validation', () => {
    expect(extractPlayerStats({ not: 'a valid envelope' })).toEqual({
      level: 1, xp: 0, totalFishCaught: 0, coins: 0,
      unlockedLocations: ['atlantic', 'amazon'], ownedSkins: ['default'], ownedBoatSkins: ['classic'],
      luckMultiplierPower: 0, strengthMultiplierPower: 0,
    });
  });
});
