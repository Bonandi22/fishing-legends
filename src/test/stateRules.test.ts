import { describe, expect, it } from 'vitest';
import { FISH, LOCATIONS } from '@/game/data';
import {
  applyXp,
  addToWarehouse,
  buyMultiplier,
  buyNet,
  buyOwnedItem,
  consumeNet,
  getUnlockedLocationIds,
  grantOwnedItem,
  spendCoins,
} from '@/game/stateRules';

const player = {
  level: 1, xp: 0, xpToNextLevel: 100, totalFishCaught: 0, collection: [],
  unlockedLocations: [], heaviestFish: null, warehouse: [], coins: 6000,
  activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
  ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
  lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
};

describe('state rules', () => {
  it('levels through multiple thresholds and caps at the maximum level', () => {
    const progression = applyXp(0, 1, 100000000, Number.MAX_SAFE_INTEGER);

    expect(progression.level).toBe(30);
    expect(progression.xp).toBeGreaterThanOrEqual(0);
    expect(progression.xpToNextLevel).toBeGreaterThan(0);
  });

  it('unlocks locations by required level', () => {
    const unlocked = getUnlockedLocationIds(28, LOCATIONS);

    expect(unlocked).toContain('amazon');
    expect(unlocked).toContain('astral-lake');
    expect(getUnlockedLocationIds(1, LOCATIONS)).not.toContain('astral-lake');
  });

  it('moves overflow catches to the aquarium warehouse without mutating inputs', () => {
    const caught = { fish: FISH[0], weight: 1, location: 'amazon', timestamp: 1 };
    const warehouse = Array.from({ length: 15 }, (_, index) => ({ ...caught, timestamp: index + 2 }));
    const aquariumWarehouse = [];

    const result = addToWarehouse(warehouse, aquariumWarehouse, caught);

    expect(result.warehouse).toBe(warehouse);
    expect(result.aquariumWarehouse).toEqual([caught]);
    expect(warehouse).toHaveLength(15);
    expect(aquariumWarehouse).toHaveLength(0);
  });

  it('keeps economy operations transactional and bounded', () => {
    expect(spendCoins(player, 7000)).toBe(player);
    expect(spendCoins(player, -100).coins).toBe(player.coins);
    expect(buyNet(player).nets).toBe(1);
    expect(consumeNet(player)).toBe(player);
    expect(buyMultiplier(player, 'luck', 4, 1000).coins).toBe(0);
    expect(buyOwnedItem(player, 'rod', 'shark', 1000).ownedSkins).toContain('shark');
    expect(grantOwnedItem(player, 'rod', 'default', 500).coins).toBe(6500);
  });
});
