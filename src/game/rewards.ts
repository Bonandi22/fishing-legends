export type RewardGrant =
  | { type: 'coins'; amount: number }
  | { type: 'multiplier'; kind: 'luck' | 'strength' }
  | { type: 'rodSkin'; skinId: string; duplicate?: boolean }
  | { type: 'boatSkin'; skinId: string; duplicate?: boolean };

export type RouletteSlot =
  | { kind: 'coins'; amount: number }
  | { kind: 'multiplier'; mult: 'luck' | 'strength' }
  | { kind: 'skinOrCoins'; skin: 'rod' | 'boat'; fallbackCoins: number };

/** 8 uniform slots — mirrors the legacy Roulette.tsx prize table. */
export const DAILY_ROULETTE_SLOTS: RouletteSlot[] = [
  { kind: 'coins', amount: 100 },
  { kind: 'multiplier', mult: 'luck' },
  { kind: 'coins', amount: 250 },
  { kind: 'multiplier', mult: 'strength' },
  { kind: 'skinOrCoins', skin: 'boat', fallbackCoins: 500 },
  { kind: 'skinOrCoins', skin: 'rod', fallbackCoins: 1000 },
  { kind: 'coins', amount: 1000 },
  { kind: 'coins', amount: 150 },
];

export const SKIN_ROULETTE_COST = 1500;
export const DAILY_GIFT_DUPLICATE_COINS = 1000;
export const ROULETTE_DUPLICATE_COINS = 500;
