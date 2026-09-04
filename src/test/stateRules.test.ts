import { describe, expect, it } from 'vitest';
import { FISH, LOCATIONS } from '@/game/data';
import { applyXp, addToWarehouse, getUnlockedLocationIds } from '@/game/stateRules';

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
});
