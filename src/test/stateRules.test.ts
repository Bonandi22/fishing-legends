import { describe, expect, it } from 'vitest';
import { FISH, LOCATIONS } from '@/game/data';
import {
  applyCatch,
  applyXp,
  addToWarehouse,
  buyMultiplier,
  buyNet,
  buyOwnedItem,
  consumeNet,
  getUnlockedLocationIds,
  grantOwnedItem,
  placeAquariumFish,
  resolveDailyGift,
  resolveLuckyMode,
  sellWarehouse,
  spendCoins,
  spinDailyRoulette,
  spinSkinRoulette,
} from '@/game/stateRules';
import { ROD_SKINS } from '@/game/types';
import { SKIN_ROULETTE_COST } from '@/game/rewards';

/** A roll() stub: returns queued values in order, then 0. */
const queuedRoll = (...vals: number[]) => {
  const q = [...vals];
  return () => (q.length ? q.shift()! : 0);
};

const player = {
  level: 1, xp: 0, xpToNextLevel: 100, totalFishCaught: 0, collection: [],
  unlockedLocations: [], heaviestFish: null, warehouse: [], coins: 6000,
  activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
  ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
  lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
};

describe('state rules', () => {
  it('levels through multiple thresholds and caps at the maximum level', () => {
    const progression = applyXp(0, 1, 100000000, Number.MAX_SAFE_INTEGER);

    expect(progression.level).toBe(30);
    expect(progression.xp).toBeGreaterThanOrEqual(0);
    expect(progression.xpToNextLevel).toBeGreaterThan(0);
  });

  it('unlocks locations by required level', () => {
    const unlocked = getUnlockedLocationIds(28, LOCATIONS);

    expect(unlocked).toContain('amazon');
    expect(unlocked).toContain('astral-lake');
    expect(getUnlockedLocationIds(1, LOCATIONS)).not.toContain('astral-lake');
  });

  it('moves overflow catches to the aquarium warehouse without mutating inputs', () => {
    const caught = { fish: FISH[0], weight: 1, location: 'amazon', timestamp: 1 };
    const warehouse = Array.from({ length: 15 }, (_, index) => ({ ...caught, timestamp: index + 2 }));
    const aquariumWarehouse = [];

    const result = addToWarehouse(warehouse, aquariumWarehouse, caught);

    expect(result.warehouse).toBe(warehouse);
    expect(result.aquariumWarehouse).toEqual([caught]);
    expect(warehouse).toHaveLength(15);
    expect(aquariumWarehouse).toHaveLength(0);
  });

  it('keeps economy operations transactional and bounded', () => {
    expect(spendCoins(player, 7000)).toBe(player);
    expect(spendCoins(player, -100).coins).toBe(player.coins);
    expect(buyNet(player).nets).toBe(1);
    expect(consumeNet(player)).toBe(player);
    expect(buyMultiplier(player, 'luck', 4, 1000).coins).toBe(0);
    expect(buyOwnedItem(player, 'rod', 'shark', 1000).ownedSkins).toContain('shark');
    expect(grantOwnedItem(player, 'rod', 'default', 500).coins).toBe(6500);
  });

  it('sells warehouse fish and applies XP, coins and unlocked locations atomically', () => {
    const state = {
      ...player,
      warehouse: [{ fish: FISH[0], weight: 1, location: 'amazon', timestamp: 1 }],
    };
    const sold = sellWarehouse(state, LOCATIONS);

    expect(sold.warehouse).toEqual([]);
    expect(sold.coins).toBe(6010);
    expect(sold.xp).toBe(5);
  });

  it('moves an aquarium fish once and awards its configured reward', () => {
    const state = {
      ...player,
      aquariumWarehouse: [{ fish: FISH[0], weight: 1, location: 'amazon', timestamp: 42 }],
    };
    const placed = placeAquariumFish(state, 42, 1, LOCATIONS);

    expect(placed.aquariumWarehouse).toEqual([]);
    expect(placed.aquariumSectors[1]).toHaveLength(1);
    expect(placed.coins).toBe(6005);
  });
});

describe('resolveDailyGift', () => {
  const base = { ...player, coins: 1000, dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1 };

  it('grants day 1 of week 1 (150 coins) and advances to day 2', () => {
    const { next, reward } = resolveDailyGift(base, '2026-09-08', 1_000_000);
    expect(reward).toEqual({ type: 'coins', amount: 150 });
    expect(next.coins).toBe(1150);
    expect(next.dailyGiftsLastClaim).toBe('2026-09-08');
    expect(next.dailyGiftsDay).toBe(2);
    expect(next.dailyGiftsWeek).toBe(1);
  });

  it('grants the day 3 luck multiplier ending now + MULTIPLIER_DURATION', () => {
    const { next, reward } = resolveDailyGift({ ...base, dailyGiftsDay: 3 }, '2026-09-08', 5_000);
    expect(reward).toEqual({ type: 'multiplier', kind: 'luck' });
    expect(next.luckMultiplierEnd).toBe(5_000 + 60_000);
  });

  it('grants the day 7 rod skin, wraps to day 1 and bumps the week', () => {
    const { next, reward } = resolveDailyGift({ ...base, dailyGiftsDay: 7 }, '2026-09-08', 0);
    expect(reward).toEqual({ type: 'rodSkin', skinId: 'daily_aurora' });
    expect(next.ownedSkins).toContain('daily_aurora');
    expect(next.dailyGiftsDay).toBe(1);
    expect(next.dailyGiftsWeek).toBe(2);
  });

  it('refunds 1000 coins for an already-owned skin day', () => {
    const { next, reward } = resolveDailyGift(
      { ...base, dailyGiftsDay: 7, ownedSkins: ['default', 'daily_aurora'] }, '2026-09-08', 0,
    );
    expect(reward).toEqual({ type: 'rodSkin', skinId: 'daily_aurora', duplicate: true });
    expect(next.coins).toBe(2000);
    expect(next.ownedSkins).toEqual(['default', 'daily_aurora']);
  });

  it('uses the rotation table from week 2 (day 6 = 1000 coins)', () => {
    const { reward } = resolveDailyGift({ ...base, dailyGiftsWeek: 2, dailyGiftsDay: 6 }, '2026-09-08', 0);
    expect(reward).toEqual({ type: 'coins', amount: 1000 });
  });

  it('throws when already claimed today', () => {
    expect(() => resolveDailyGift({ ...base, dailyGiftsLastClaim: '2026-09-08' }, '2026-09-08', 0))
      .toThrow('DAILY_GIFT_ALREADY_CLAIMED');
  });
});

describe('spinDailyRoulette', () => {
  const base = {
    ...player, coins: 0, lastRouletteDate: null,
    ownedSkins: ['default'], ownedBoatSkins: ['classic'],
  };

  it('slot 0 → 100 coins, marks the date', () => {
    const { next, reward } = spinDailyRoulette(base, '2026-09-08', 0, queuedRoll(0));
    expect(reward).toEqual({ type: 'coins', amount: 100 });
    expect(next.coins).toBe(100);
    expect(next.lastRouletteDate).toBe('2026-09-08');
  });

  it('slot 1 → luck multiplier', () => {
    const { next, reward } = spinDailyRoulette(base, '2026-09-08', 7_000, queuedRoll(1));
    expect(reward).toEqual({ type: 'multiplier', kind: 'luck' });
    expect(next.luckMultiplierEnd).toBe(7_000 + 60_000);
  });

  it('slot 5 (rod skinOrCoins) → an unowned rod skin', () => {
    const { next, reward } = spinDailyRoulette(base, '2026-09-08', 0, queuedRoll(5, 0));
    expect(reward.type).toBe('rodSkin');
    if (reward.type === 'rodSkin') expect(next.ownedSkins).toContain(reward.skinId);
  });

  it('slot 5 falls back to coins when every qualifying rod skin is owned', () => {
    const allRods = ROD_SKINS.filter(s => s.price > 0 || s.exclusive).map(s => s.id);
    const { next, reward } = spinDailyRoulette(
      { ...base, ownedSkins: ['default', ...allRods] }, '2026-09-08', 0, queuedRoll(5),
    );
    expect(reward).toEqual({ type: 'coins', amount: 1000 });
    expect(next.coins).toBe(1000);
  });

  it('throws when already used today', () => {
    expect(() => spinDailyRoulette({ ...base, lastRouletteDate: '2026-09-08' }, '2026-09-08', 0, queuedRoll(0)))
      .toThrow('ROULETTE_ALREADY_USED');
  });
});

describe('applyCatch', () => {
  const c = (over: Partial<{ fish: typeof FISH[number]; weight: number; location: string; timestamp: number }> = {}) => ({
    fish: FISH[0], weight: 2, location: 'atlantic', timestamp: 1, ...over,
  });
  const base = {
    ...player, level: 3, xp: 0, xpToNextLevel: 300, warehouse: [], collection: [],
    aquariumWarehouse: [], heaviestFish: null, totalFishCaught: 0, unlockedLocations: [],
  };

  it('adds the catch to warehouse + collection, applies XP, bumps totalFishCaught', () => {
    const r = applyCatch(base, [c()], { fromNet: false }, LOCATIONS);
    expect(r.warehouse).toHaveLength(1);
    expect(r.collection).toHaveLength(1);
    expect(r.totalFishCaught).toBe(1);
    expect(r.xp).toBe(FISH[0].xp);
  });

  it('applies a single submarine catch (location "submarine", not fromNet)', () => {
    const r = applyCatch(base, [c({ location: 'submarine' })], { fromNet: false }, LOCATIONS);
    expect(r.warehouse).toHaveLength(1);
    expect(r.warehouse[0].location).toBe('submarine');
    expect(r.totalFishCaught).toBe(1);
    expect(r.xp).toBe(FISH[0].xp);
  });

  it('overflows to the aquarium warehouse when the warehouse is full (15)', () => {
    const full = { ...base, warehouse: Array.from({ length: 15 }, (_, i) => c({ timestamp: i + 100 })) };
    const r = applyCatch(full, [c({ timestamp: 999 })], { fromNet: false }, LOCATIONS);
    expect(r.warehouse).toHaveLength(15);
    expect(r.aquariumWarehouse).toHaveLength(1);
  });

  it('net catches give floor(xp * 0.3)', () => {
    const r = applyCatch(base, [c()], { fromNet: true }, LOCATIONS);
    expect(r.xp).toBe(Math.floor(FISH[0].xp * 0.3));
  });

  it('updates heaviestFish only on a heavier fish', () => {
    const withHeavy = { ...base, heaviestFish: c({ weight: 10 }) };
    expect(applyCatch(withHeavy, [c({ weight: 3 })], { fromNet: false }, LOCATIONS).heaviestFish!.weight).toBe(10);
    expect(applyCatch(withHeavy, [c({ weight: 20 })], { fromNet: false }, LOCATIONS).heaviestFish!.weight).toBe(20);
  });

  it('unlocks locations when a catch crosses a level threshold', () => {
    const almost = { ...base, level: 1, xp: 0, xpToNextLevel: 1 };
    const r = applyCatch(almost, [c()], { fromNet: false }, LOCATIONS);
    expect(r.level).toBeGreaterThan(1);
    expect(r.unlockedLocations.length).toBeGreaterThan(0);
  });
});

describe('resolveLuckyMode', () => {
  const s = (over: Partial<{ luckyUntil: number | null; luckyCooldownUntil: number | null }> = {}) =>
    ({ ...player, luckyUntil: null, luckyCooldownUntil: null, ...over });

  it('fresh state, roll < 0.5 -> lucky for 60s, 7min cooldown', () => {
    expect(resolveLuckyMode(s(), 1_000_000, () => 0.4))
      .toEqual({ lucky: true, luckyUntil: 1_060_000, luckyCooldownUntil: 1_420_000 });
  });

  it('fresh state, roll >= 0.5 -> not lucky, still starts the cooldown', () => {
    expect(resolveLuckyMode(s(), 1_000_000, () => 0.6))
      .toEqual({ lucky: false, luckyUntil: null, luckyCooldownUntil: 1_420_000 });
  });

  it('inside an active window -> stays lucky without re-rolling', () => {
    expect(resolveLuckyMode(s({ luckyUntil: 2_000_000, luckyCooldownUntil: 2_360_000 }), 1_999_000, () => 0.99))
      .toEqual({ lucky: true, luckyUntil: 2_000_000, luckyCooldownUntil: 2_360_000 });
  });

  it('inside cooldown, no active window -> not lucky, fields unchanged', () => {
    expect(resolveLuckyMode(s({ luckyUntil: 500_000, luckyCooldownUntil: 1_400_000 }), 1_000_000, () => 0.1))
      .toEqual({ lucky: false, luckyUntil: 500_000, luckyCooldownUntil: 1_400_000 });
  });
});

describe('spinSkinRoulette', () => {
  const base = { ...player, coins: 5000, ownedSkins: ['default'], ownedBoatSkins: ['classic'] };

  it('charges the cost and grants an unowned rod skin', () => {
    const { next, reward } = spinSkinRoulette(base, queuedRoll(0, 0));
    expect(next.coins).toBe(5000 - SKIN_ROULETTE_COST);
    expect(reward.type).toBe('rodSkin');
    if (reward.type === 'rodSkin') expect(next.ownedSkins).toContain(reward.skinId);
  });

  it('grants a boat skin when roll(2) picks 1', () => {
    const { reward } = spinSkinRoulette(base, queuedRoll(1, 0));
    expect(reward.type).toBe('boatSkin');
  });

  it('refunds 500 coins and does not re-add an already-owned skin', () => {
    const firstRod = ROD_SKINS.filter(s => s.price > 0 || s.exclusive)[0];
    const { next, reward } = spinSkinRoulette(
      { ...base, ownedSkins: ['default', firstRod.id] }, queuedRoll(0, 0),
    );
    expect(reward).toEqual({ type: 'rodSkin', skinId: firstRod.id, duplicate: true });
    expect(next.coins).toBe(5000 - SKIN_ROULETTE_COST + 500);
    expect(next.ownedSkins).toEqual(['default', firstRod.id]);
  });

  it('throws INSUFFICIENT_FUNDS below the cost', () => {
    expect(() => spinSkinRoulette({ ...base, coins: 1499 }, queuedRoll(0, 0)))
      .toThrow('INSUFFICIENT_FUNDS');
  });
});
