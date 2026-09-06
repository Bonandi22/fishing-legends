import { CaughtFish, FISH_COIN_VALUE } from '@/game/types';

/** XP granted when a stored fish is sold — half its catch value, floored. */
export function haulXp(caught: CaughtFish): number {
  return Math.floor(caught.fish.xp * 0.5);
}

/** Coins granted when a stored fish is sold. */
export function haulCoins(caught: CaughtFish): number {
  return FISH_COIN_VALUE[caught.fish.rarity];
}
