import { RARITY_CONFIG, type Rarity } from '../../../src/game/types.js';

// Server-side port of getNormalizedRarityWeights + the non-lucky path of rollFish
// from src/game/fishingLogic.ts. RARITY_CONFIG is the shared source of truth for
// the odds; the selection algorithm is duplicated here (the frontend version is
// coupled to its own Fish type and getFishForLocation).

export type RollableFish = {
  id: string;
  rarity: string;
  minWeight: number;
  maxWeight: number;
};

const RARITY_ORDER: Rarity[] = [
  'cosmic', 'legends', 'platinum', 'volcanic', 'abyssal', 'legendary', 'mythic', 'uncommon', 'common',
];

export function normalizedRarityWeights(
  fish: RollableFish[],
  playerLevel: number,
): { rarity: Rarity; weight: number }[] {
  const levelBonus = Math.min(Math.max(playerLevel - 1, 0) * 0.005, 0.05);
  const present = RARITY_ORDER.filter(rarity => fish.some(f => f.rarity === rarity));
  const raw = present.map(rarity => ({
    rarity,
    weight: RARITY_CONFIG[rarity].chance + (rarity !== 'common' ? levelBonus : 0),
  }));
  const total = raw.reduce((sum, entry) => sum + entry.weight, 0);
  return total > 0 ? raw.map(entry => ({ rarity: entry.rarity, weight: entry.weight / total })) : [];
}

export function rollCatch<T extends RollableFish>(
  fish: T[],
  playerLevel: number,
  random: () => number = Math.random,
): { fish: T; weight: number } {
  if (fish.length === 0) throw new Error('NO_FISH_AVAILABLE');

  const weights = normalizedRarityWeights(fish, playerLevel);
  const roll = random();
  let targetRarity: string = weights[weights.length - 1]?.rarity ?? fish[0].rarity;
  let cumulative = 0;
  for (const entry of weights) {
    cumulative += entry.weight;
    if (roll < cumulative) {
      targetRarity = entry.rarity;
      break;
    }
  }

  const candidates = fish.filter(f => f.rarity === targetRarity);
  const pool = candidates.length > 0 ? candidates : fish;
  const picked = pool[Math.floor(random() * pool.length)] ?? pool[0];
  const weight = Math.round((picked.minWeight + random() * (picked.maxWeight - picked.minWeight)) * 100) / 100;
  return { fish: picked, weight };
}
