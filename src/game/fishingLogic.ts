import { Fish, Rarity, RARITY_CONFIG } from './types';
import { getFishForLocation } from './data';
import type { FishingLocation } from './types';

export function rollFish(location: FishingLocation, playerLevel: number): Fish {
  const available = getFishForLocation(location);
  const rand = Math.random();

  // bonus for higher level
  const levelBonus = (playerLevel - 1) * 0.005;

  let cumulative = 0;
  const rarityOrder: Rarity[] = ['abyssal', 'legendary', 'mythic', 'uncommon', 'common'];

  let targetRarity: Rarity = 'common';
  for (const r of rarityOrder) {
    cumulative += RARITY_CONFIG[r].chance + (r !== 'common' ? levelBonus : 0);
    if (rand < cumulative) {
      targetRarity = r;
      break;
    }
  }

  const candidates = available.filter(f => f.rarity === targetRarity);
  if (candidates.length === 0) {
    // fallback to common
    const commons = available.filter(f => f.rarity === 'common');
    return commons[Math.floor(Math.random() * commons.length)];
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function rollWeight(fish: Fish): number {
  const weight = fish.minWeight + Math.random() * (fish.maxWeight - fish.minWeight);
  return Math.round(weight * 100) / 100;
}

export function getWaitTime(): number {
  return 3000 + Math.random() * 7000; // 3-10 seconds
}
