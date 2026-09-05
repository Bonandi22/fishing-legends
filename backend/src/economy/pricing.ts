import {
  FISH_COIN_VALUE,
  MULTIPLIER_COST,
  MULTIPLIER_COST_4X,
  NET_PRICE,
  type Rarity,
} from '../../../src/game/types.js';

// Single source of truth for economy prices on the server, mirroring the client
// constants so a wired frontend sees the amounts it expects.

export function fishSaleValue(rarity: string): number {
  return FISH_COIN_VALUE[rarity as Rarity] ?? 0;
}

export const netUnitPrice = NET_PRICE;

export function multiplierPrice(power: 2 | 4): number {
  return power === 4 ? MULTIPLIER_COST_4X : MULTIPLIER_COST;
}
