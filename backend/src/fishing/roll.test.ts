// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { normalizedRarityWeights, rollCatch } from './roll.js';

type F = { id: string; rarity: string; minWeight: number; maxWeight: number; xp: number };

const common: F = { id: 'tilapia', rarity: 'common', minWeight: 0.3, maxWeight: 2.5, xp: 10 };
const uncommon: F = { id: 'dourado', rarity: 'uncommon', minWeight: 3, maxWeight: 15, xp: 40 };
const cosmic: F = { id: 'koi-galactico', rarity: 'cosmic', minWeight: 1, maxWeight: 4, xp: 900 };

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('normalizedRarityWeights', () => {
  it('returns weights that sum to 1', () => {
    const weights = normalizedRarityWeights([common, uncommon, cosmic], 1);
    const total = weights.reduce((sum, w) => sum + w.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('gives a rarer rarity strictly less weight than a common one', () => {
    const weights = normalizedRarityWeights([common, cosmic], 1);
    const commonWeight = weights.find(w => w.rarity === 'common')!.weight;
    const cosmicWeight = weights.find(w => w.rarity === 'cosmic')!.weight;
    expect(cosmicWeight).toBeLessThan(commonWeight);
  });

  it('returns nothing for an empty pool', () => {
    expect(normalizedRarityWeights([], 1)).toEqual([]);
  });
});

describe('rollCatch', () => {
  it('a roll near 0 lands on the rarest available rarity', () => {
    const { fish } = rollCatch([common, uncommon, cosmic], 1, sequence([0, 0, 0.5]));
    expect(fish.id).toBe('koi-galactico');
  });

  it('a roll near 1 lands on the most common rarity', () => {
    const { fish } = rollCatch([common, uncommon, cosmic], 1, sequence([0.999999, 0, 0.5]));
    expect(fish.id).toBe('tilapia');
  });

  it('rolls the weight uniformly inside the fish range', () => {
    const { weight } = rollCatch([common], 1, sequence([0.5, 0, 0.5]));
    expect(weight).toBe(1.4); // 0.3 + 0.5 * (2.5 - 0.3)
  });

  it('respects rarity odds over many samples (not uniform)', () => {
    let commonCount = 0;
    let cosmicCount = 0;
    for (let i = 0; i < 4000; i++) {
      const { fish } = rollCatch([common, cosmic], 1);
      if (fish.rarity === 'common') commonCount++;
      else cosmicCount++;
    }
    expect(commonCount).toBeGreaterThan(cosmicCount * 10);
  });

  it('throws when the pool is empty', () => {
    expect(() => rollCatch([], 1)).toThrow();
  });
});
