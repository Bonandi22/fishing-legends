import { describe, expect, it } from 'vitest';
import {
  DAILY_ROULETTE_SLOTS,
  SKIN_ROULETTE_COST,
  DAILY_GIFT_DUPLICATE_COINS,
  ROULETTE_DUPLICATE_COINS,
} from '@/game/rewards';

describe('rewards module', () => {
  it('has an 8-slot daily roulette table mirroring the legacy wheel', () => {
    expect(DAILY_ROULETTE_SLOTS).toHaveLength(8);
    expect(DAILY_ROULETTE_SLOTS.filter(s => s.kind === 'multiplier')).toHaveLength(2);
    expect(DAILY_ROULETTE_SLOTS.filter(s => s.kind === 'skinOrCoins')).toHaveLength(2);
    const coinTotals = DAILY_ROULETTE_SLOTS
      .filter((s): s is { kind: 'coins'; amount: number } => s.kind === 'coins')
      .map(s => s.amount);
    expect(coinTotals).toEqual([100, 250, 1000, 150]);
  });

  it('carries the legacy economy constants unchanged', () => {
    expect(SKIN_ROULETTE_COST).toBe(1500);
    expect(DAILY_GIFT_DUPLICATE_COINS).toBe(1000);
    expect(ROULETTE_DUPLICATE_COINS).toBe(500);
  });
});
