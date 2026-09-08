import { Fish, Rarity, RARITY_CONFIG } from './types';
import { getFishForLocation } from './data';
import type { FishingLocation } from './types';

export function getNormalizedRarityWeights(
  available: Fish[],
  playerLevel: number,
): { rarity: Rarity; weight: number }[] {
  const levelBonus = Math.min(Math.max(playerLevel - 1, 0) * 0.005, 0.05);
  const rarityOrder: Rarity[] = ['cosmic', 'legends', 'platinum', 'volcanic', 'abyssal', 'legendary', 'mythic', 'uncommon', 'common'];
  const availableRarities = rarityOrder.filter(r => available.some(f => f.rarity === r));
  const rawWeights = availableRarities.map(r => ({
    rarity: r,
    weight: RARITY_CONFIG[r].chance + (r !== 'common' ? levelBonus : 0),
  }));
  const totalWeight = rawWeights.reduce((sum, item) => sum + item.weight, 0);

  return totalWeight > 0
    ? rawWeights.map(item => ({ ...item, weight: item.weight / totalWeight }))
    : [];
}

export function rollFish(
  location: FishingLocation,
  playerLevel: number,
  luckyMode = false,
  luckPower = 2,
  random: () => number = Math.random,
): Fish {
  const available = getFishForLocation(location);
  if (available.length === 0) {
    throw new Error(`Location "${location.id}" has no fish available`);
  }

  if (luckyMode && luckPower >= 4) {
    // 4x luck: apenas abissal para cima
    const topOnly = available.filter(f =>
      f.rarity === 'abyssal' || f.rarity === 'volcanic' || f.rarity === 'platinum' || f.rarity === 'legends' || f.rarity === 'cosmic'
    );
    if (topOnly.length > 0) {
      const weights: { r: Rarity; w: number }[] = [
        { r: 'abyssal', w: 0.45 },
        { r: 'volcanic', w: 0.25 },
        { r: 'platinum', w: 0.18 },
        { r: 'legends', w: 0.08 },
        { r: 'cosmic', w: 0.04 },
      ];
      const rand = random();
      let cum = 0;
      for (const { r, w } of weights) {
        cum += w;
        if (rand < cum) {
          const c = topOnly.filter(f => f.rarity === r);
          if (c.length > 0) return c[Math.floor(random() * c.length)];
          break;
        }
      }
      return topOnly[Math.floor(random() * topOnly.length)];
    }
  }

  if (luckyMode) {
    const rareOnly = available.filter(f => f.rarity === 'mythic' || f.rarity === 'legendary' || f.rarity === 'abyssal');
    if (rareOnly.length > 0) {
      // Weighted: abyssal 15%, legendary 35%, mythic 50%
      const rand = random();
      let targetRarity: Rarity = 'mythic';
      if (rand < 0.15) targetRarity = 'abyssal';
      else if (rand < 0.50) targetRarity = 'legendary';
      const candidates = rareOnly.filter(f => f.rarity === targetRarity);
      if (candidates.length > 0) return candidates[Math.floor(random() * candidates.length)];
      return rareOnly[Math.floor(random() * rareOnly.length)];
    }
  }

  const rand = random();
  const weights = getNormalizedRarityWeights(available, playerLevel);
  let cumulative = 0;
  let targetRarity = weights[weights.length - 1]?.rarity ?? available[0].rarity;
  for (const item of weights) {
    cumulative += item.weight;
    if (rand < cumulative) {
      targetRarity = item.rarity;
      break;
    }
  }

  const candidates = available.filter(f => f.rarity === targetRarity);
  if (candidates.length === 0) {
    return available[Math.floor(random() * available.length)];
  }

  return candidates[Math.floor(random() * candidates.length)];
}

export function rollWeight(fish: Fish, random: () => number = Math.random): number {
  const weight = fish.minWeight + random() * (fish.maxWeight - fish.minWeight);
  return Math.round(weight * 100) / 100;
}

export function getWaitTime(): number {
  return 3000 + Math.random() * 7000; // 3-10 seconds
}
