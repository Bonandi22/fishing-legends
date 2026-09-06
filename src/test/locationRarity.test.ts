import { describe, expect, it } from 'vitest';
import { fishRarityComposition } from '@/components/game/locations/rarity';

describe('fishRarityComposition', () => {
  it('groups known fish by rarity and counts each tier', () => {
    // tilapia/carpa = common, bagre = common (see data.ts)
    const slices = fishRarityComposition(['tilapia', 'carpa', 'bagre']);
    expect(slices).toEqual([{ rarity: 'common', count: 3 }]);
  });

  it('orders tiers from common to cosmic regardless of input order', () => {
    // sardinha=common, atum=legendary, dragao-negro=abyssal
    const slices = fishRarityComposition(['dragao-negro', 'sardinha', 'atum']);
    expect(slices.map(s => s.rarity)).toEqual(['common', 'legendary', 'abyssal']);
  });

  it('ignores ids that are not in the catalog', () => {
    const slices = fishRarityComposition(['sardinha', 'not-a-real-fish', '']);
    const total = slices.reduce((sum, s) => sum + s.count, 0);
    expect(total).toBe(1);
  });

  it('returns an empty list for no ids', () => {
    expect(fishRarityComposition([])).toEqual([]);
  });
});
