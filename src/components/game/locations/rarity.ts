import { Rarity } from '@/game/types';
import { getFishById } from '@/game/data';

/** Rarity tiers from most common to rarest — the order a spectrum reads left to right. */
export const RARITY_ORDER: Rarity[] = [
  'common', 'uncommon', 'mythic', 'legendary', 'abyssal',
  'volcanic', 'platinum', 'legends', 'cosmic',
];

export interface RaritySlice {
  rarity: Rarity;
  count: number;
}

/**
 * How a roster of fish breaks down by rarity, ordered common → cosmic.
 * Unknown ids are dropped. Tiers with no fish are omitted.
 */
export function fishRarityComposition(fishIds: string[]): RaritySlice[] {
  const counts = new Map<Rarity, number>();
  for (const id of fishIds) {
    const fish = getFishById(id);
    if (fish) counts.set(fish.rarity, (counts.get(fish.rarity) ?? 0) + 1);
  }
  return RARITY_ORDER
    .filter(r => counts.has(r))
    .map(r => ({ rarity: r, count: counts.get(r) as number }));
}

export function rarityColor(rarity: Rarity): string {
  return `hsl(var(--rarity-${rarity}))`;
}
