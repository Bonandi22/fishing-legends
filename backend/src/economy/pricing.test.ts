// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { fishSaleValue, multiplierPrice, netUnitPrice } from './pricing.js';
import { FISH_COIN_VALUE, MULTIPLIER_COST, MULTIPLIER_COST_4X, NET_PRICE } from '../../../src/game/types.js';

describe('economy pricing', () => {
  it('values a sold fish by its rarity, matching the client catalogue', () => {
    expect(fishSaleValue('common')).toBe(FISH_COIN_VALUE.common);
    expect(fishSaleValue('legendary')).toBe(FISH_COIN_VALUE.legendary);
    expect(fishSaleValue('cosmic')).toBe(FISH_COIN_VALUE.cosmic);
  });

  it('returns 0 for an unknown rarity rather than NaN', () => {
    expect(fishSaleValue('not-a-rarity')).toBe(0);
  });

  it('mirrors the client net and multiplier prices', () => {
    expect(netUnitPrice).toBe(NET_PRICE);
    expect(multiplierPrice(2)).toBe(MULTIPLIER_COST);
    expect(multiplierPrice(4)).toBe(MULTIPLIER_COST_4X);
  });
});
