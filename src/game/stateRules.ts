import {
  CaughtFish,
  FishingLocation,
  AQUARIUM_REWARDS,
  BOAT_SKINS,
  FISH_COIN_VALUE,
  getDailyGiftsForWeek,
  getXpForLevel,
  MAX_LEVEL,
  MULTIPLIER_COST,
  MULTIPLIER_COST_4X,
  MULTIPLIER_DURATION,
  NET_LIMIT,
  NET_PRICE,
  PlayerState,
  ROD_SKINS,
  WAREHOUSE_LIMIT,
} from './types.js';
import {
  DAILY_GIFT_DUPLICATE_COINS,
  DAILY_ROULETTE_SLOTS,
  ROULETTE_DUPLICATE_COINS,
  SKIN_ROULETTE_COST,
  type RewardGrant,
} from './rewards.js';

export interface Progression {
  xp: number;
  level: number;
  xpToNextLevel: number;
}

export function sellWarehouse(state: PlayerState, locations: FishingLocation[]): PlayerState {
  if (state.warehouse.length === 0) return state;
  const bonusXp = state.warehouse.reduce((sum, caught) => sum + Math.floor(caught.fish.xp * 0.5), 0);
  const bonusCoins = state.warehouse.reduce((sum, caught) => sum + FISH_COIN_VALUE[caught.fish.rarity], 0);
  const progression = applyXp(state.xp, state.level, state.xpToNextLevel, bonusXp);

  return {
    ...state,
    ...progression,
    unlockedLocations: getUnlockedLocationIds(progression.level, locations),
    warehouse: [],
    coins: state.coins + bonusCoins,
  };
}

/**
 * Applies one or more catches to the player: XP (net = ×0.3), level-up, unlocked
 * locations, collection, `heaviestFish`, warehouse (cap 15 → overflow to the
 * aquarium warehouse), `totalFishCaught`. Ported verbatim from the former
 * `useGameState.catchFishBatch`. `catches` carry their timestamps already.
 */
export function applyCatch(
  state: PlayerState,
  catches: CaughtFish[],
  opts: { fromNet: boolean },
  locations: FishingLocation[],
): PlayerState {
  if (catches.length === 0) return state;

  const xpGain = catches.reduce(
    (sum, caught) => sum + (opts.fromNet ? Math.floor(caught.fish.xp * 0.3) : caught.fish.xp),
    0,
  );
  const progression = applyXp(state.xp, state.level, state.xpToNextLevel, xpGain);
  const collection = [...state.collection, ...catches];
  const heaviestFish = catches.reduce<CaughtFish | null>(
    (current, caught) => (!current || caught.weight > current.weight ? caught : current),
    state.heaviestFish,
  );
  const unlockedLocations = getUnlockedLocationIds(progression.level, locations);
  const inventory = catches.reduce(
    (inv, caught) => addToWarehouse(inv.warehouse, inv.aquariumWarehouse, caught),
    { warehouse: state.warehouse, aquariumWarehouse: state.aquariumWarehouse || [] },
  );

  return {
    ...state,
    ...progression,
    totalFishCaught: state.totalFishCaught + catches.length,
    collection,
    unlockedLocations,
    heaviestFish,
    ...inventory,
  };
}

const LUCKY_WINDOW_MS = 60_000;
const LUCKY_COOLDOWN_MS = 7 * 60_000;

/**
 * Server-owned "lucky mode": if a window is active it stays lucky; past the
 * cooldown it re-rolls (`random() < 0.5` → a 60s window + 7min cooldown; a miss
 * still starts the cooldown); inside the cooldown it is not lucky and the fields
 * are unchanged. `now` and `random` are injected for purity.
 */
export function resolveLuckyMode(
  state: PlayerState,
  now: number,
  random: () => number = Math.random,
): { lucky: boolean; luckyUntil: number | null; luckyCooldownUntil: number | null } {
  const until = state.luckyUntil ?? null;
  const cooldown = state.luckyCooldownUntil ?? null;

  if (until && now < until) {
    return { lucky: true, luckyUntil: until, luckyCooldownUntil: cooldown };
  }
  if (!cooldown || now >= cooldown) {
    if (random() < 0.5) {
      return { lucky: true, luckyUntil: now + LUCKY_WINDOW_MS, luckyCooldownUntil: now + LUCKY_COOLDOWN_MS };
    }
    return { lucky: false, luckyUntil: null, luckyCooldownUntil: now + LUCKY_COOLDOWN_MS };
  }
  return { lucky: false, luckyUntil: until, luckyCooldownUntil: cooldown };
}

export function placeAquariumFish(
  state: PlayerState,
  timestamp: number,
  sector: number,
  locations: FishingLocation[],
): PlayerState {
  const aquariumWarehouse = state.aquariumWarehouse || [];
  const index = aquariumWarehouse.findIndex(caught => caught.timestamp === timestamp);
  if (index < 0) return state;

  const caught = aquariumWarehouse[index];
  const reward = AQUARIUM_REWARDS[caught.fish.rarity];
  const progression = applyXp(state.xp, state.level, state.xpToNextLevel, reward.xp);
  const sectors = { ...(state.aquariumSectors || {}) };

  return {
    ...state,
    ...progression,
    unlockedLocations: getUnlockedLocationIds(progression.level, locations),
    coins: state.coins + reward.coins,
    aquariumWarehouse: aquariumWarehouse.filter((_, itemIndex) => itemIndex !== index),
    aquariumSectors: { ...sectors, [sector]: [...(sectors[sector] || []), caught] },
  };
}

export function applyXp(xp: number, level: number, xpToNextLevel: number, amount: number): Progression {
  let remainingXp = Math.max(0, xp + Math.max(0, amount));
  let nextLevel = Math.min(Math.max(1, level), MAX_LEVEL);
  let nextThreshold = Math.max(1, xpToNextLevel);

  while (remainingXp >= nextThreshold && nextLevel < MAX_LEVEL) {
    remainingXp -= nextThreshold;
    nextLevel++;
    nextThreshold = getXpForLevel(nextLevel);
  }

  return { xp: remainingXp, level: nextLevel, xpToNextLevel: nextThreshold };
}

export function getUnlockedLocationIds(level: number, locations: FishingLocation[]): string[] {
  return locations.filter(location => location.requiredLevel <= level).map(location => location.id);
}

export function addToWarehouse(
  warehouse: PlayerState['warehouse'],
  aquariumWarehouse: PlayerState['aquariumWarehouse'],
  caught: PlayerState['collection'][number],
): Pick<PlayerState, 'warehouse' | 'aquariumWarehouse'> {
  if (warehouse.length >= WAREHOUSE_LIMIT) {
    return { warehouse, aquariumWarehouse: [...aquariumWarehouse, caught] };
  }

  return { warehouse: [...warehouse, caught], aquariumWarehouse };
}

export function spendCoins(state: PlayerState, amount: number): PlayerState {
  const cost = Math.max(0, amount);
  return state.coins < cost ? state : { ...state, coins: state.coins - cost };
}

export function buyNet(state: PlayerState): PlayerState {
  const nets = state.nets ?? NET_LIMIT;
  if (nets >= NET_LIMIT || state.coins < NET_PRICE) return state;
  return { ...state, nets: nets + 1, coins: state.coins - NET_PRICE };
}

export function consumeNet(state: PlayerState): PlayerState {
  const nets = state.nets ?? NET_LIMIT;
  return nets <= 0 ? state : { ...state, nets: nets - 1 };
}

export function buyMultiplier(
  state: PlayerState,
  type: 'luck' | 'strength',
  power: number,
  now: number,
): PlayerState {
  const normalizedPower = power === 4 ? 4 : 2;
  const cost = normalizedPower === 4 ? MULTIPLIER_COST_4X : MULTIPLIER_COST;
  if (state.coins < cost) return state;

  const multiplier = { end: now + MULTIPLIER_DURATION, power: normalizedPower };
  return {
    ...state,
    coins: state.coins - cost,
    ...(type === 'luck'
      ? { luckMultiplierEnd: multiplier.end, luckMultiplierPower: multiplier.power }
      : { strengthMultiplierEnd: multiplier.end, strengthMultiplierPower: multiplier.power }),
  };
}

export function buyOwnedItem(
  state: PlayerState,
  kind: 'rod' | 'boat',
  id: string,
  price: number,
): PlayerState {
  const cost = Math.max(0, price);
  if (!id || state.coins < cost) return state;

  if (kind === 'rod') {
    if (state.ownedSkins.includes(id)) return state;
    return { ...state, coins: state.coins - cost, ownedSkins: [...state.ownedSkins, id] };
  }

  if (state.ownedBoatSkins.includes(id)) return state;
  return { ...state, coins: state.coins - cost, ownedBoatSkins: [...state.ownedBoatSkins, id] };
}

export function grantOwnedItem(state: PlayerState, kind: 'rod' | 'boat', id: string, duplicateReward: number): PlayerState {
  if (!id) return state;
  const owned = kind === 'rod' ? state.ownedSkins : state.ownedBoatSkins;
  if (owned.includes(id)) return { ...state, coins: state.coins + Math.max(0, duplicateReward) };

  return kind === 'rod'
    ? { ...state, ownedSkins: [...owned, id] }
    : { ...state, ownedBoatSkins: [...owned, id] };
}

/**
 * Daily gift — deterministic (no RNG). Ported from the former
 * `useGameState.claimDailyGift`. Pure: `todayStr` ('YYYY-MM-DD') and `now`
 * (epoch ms) are injected. Throws instead of no-op'ing when already claimed.
 */
export function resolveDailyGift(
  state: PlayerState,
  todayStr: string,
  now: number,
): { next: PlayerState; reward: RewardGrant } {
  if (state.dailyGiftsLastClaim === todayStr) throw new Error('DAILY_GIFT_ALREADY_CLAIMED');

  const day = state.dailyGiftsDay || 1;
  const week = state.dailyGiftsWeek || 1;
  const entry = getDailyGiftsForWeek(week)[day - 1];
  const nextDay = day >= 7 ? 1 : day + 1;
  const nextWeek = day >= 7 ? week + 1 : week;

  const next: PlayerState = {
    ...state,
    dailyGiftsLastClaim: todayStr,
    dailyGiftsDay: nextDay,
    dailyGiftsWeek: nextWeek,
  };
  let reward: RewardGrant;

  if (entry.type === 'coins') {
    next.coins = state.coins + entry.amount;
    reward = { type: 'coins', amount: entry.amount };
  } else if (entry.type === 'multiplier') {
    const end = now + MULTIPLIER_DURATION;
    if (entry.kind === 'luck') next.luckMultiplierEnd = end;
    else next.strengthMultiplierEnd = end;
    reward = { type: 'multiplier', kind: entry.kind };
  } else if (entry.type === 'boatSkin') {
    const owned = state.ownedBoatSkins.includes(entry.skinId);
    if (owned) next.coins = state.coins + DAILY_GIFT_DUPLICATE_COINS;
    else next.ownedBoatSkins = [...state.ownedBoatSkins, entry.skinId];
    reward = { type: 'boatSkin', skinId: entry.skinId, ...(owned ? { duplicate: true } : {}) };
  } else {
    const owned = state.ownedSkins.includes(entry.skinId);
    if (owned) next.coins = state.coins + DAILY_GIFT_DUPLICATE_COINS;
    else next.ownedSkins = [...state.ownedSkins, entry.skinId];
    reward = { type: 'rodSkin', skinId: entry.skinId, ...(owned ? { duplicate: true } : {}) };
  }

  return { next, reward };
}

/**
 * Daily roulette — free, once per UTC day. `roll(n)` returns an integer in
 * `[0, n)`: called once for the slot, and again for the skin index on a
 * `skinOrCoins` slot with a non-empty unowned pool.
 */
export function spinDailyRoulette(
  state: PlayerState,
  todayStr: string,
  now: number,
  roll: (n: number) => number,
): { next: PlayerState; reward: RewardGrant } {
  if (state.lastRouletteDate === todayStr) throw new Error('ROULETTE_ALREADY_USED');

  const slot = DAILY_ROULETTE_SLOTS[roll(DAILY_ROULETTE_SLOTS.length)];
  const next: PlayerState = { ...state, lastRouletteDate: todayStr };
  let reward: RewardGrant;

  if (slot.kind === 'coins') {
    next.coins = state.coins + slot.amount;
    reward = { type: 'coins', amount: slot.amount };
  } else if (slot.kind === 'multiplier') {
    const end = now + MULTIPLIER_DURATION;
    if (slot.mult === 'luck') next.luckMultiplierEnd = end;
    else next.strengthMultiplierEnd = end;
    reward = { type: 'multiplier', kind: slot.mult };
  } else {
    const catalog = slot.skin === 'rod' ? ROD_SKINS : BOAT_SKINS;
    const ownedIds = slot.skin === 'rod' ? state.ownedSkins : state.ownedBoatSkins;
    const pool = catalog.filter(s => !ownedIds.includes(s.id) && (s.price > 0 || s.exclusive));
    if (pool.length === 0) {
      next.coins = state.coins + slot.fallbackCoins;
      reward = { type: 'coins', amount: slot.fallbackCoins };
    } else {
      const picked = pool[roll(pool.length)];
      if (slot.skin === 'rod') next.ownedSkins = [...state.ownedSkins, picked.id];
      else next.ownedBoatSkins = [...state.ownedBoatSkins, picked.id];
      reward = { type: slot.skin === 'rod' ? 'rodSkin' : 'boatSkin', skinId: picked.id };
    }
  }

  return { next, reward };
}

/**
 * Skin roulette — costs `SKIN_ROULETTE_COST`, no daily limit. `roll(2)` picks
 * rod (0) vs boat (1), then `roll(pool.length)` picks the entry. A duplicate is
 * possible (pool is not filtered by ownership) → coin refund, skin not re-added.
 */
export function spinSkinRoulette(
  state: PlayerState,
  roll: (n: number) => number,
): { next: PlayerState; reward: RewardGrant } {
  if (state.coins < SKIN_ROULETTE_COST) throw new Error('INSUFFICIENT_FUNDS');

  const isRod = roll(2) === 0;
  const catalog = (isRod ? ROD_SKINS : BOAT_SKINS).filter(s => s.price > 0 || s.exclusive);
  const picked = catalog[roll(catalog.length)];
  const ownedIds = isRod ? state.ownedSkins : state.ownedBoatSkins;
  const duplicate = ownedIds.includes(picked.id);

  const next: PlayerState = { ...state, coins: state.coins - SKIN_ROULETTE_COST };
  if (duplicate) {
    next.coins += ROULETTE_DUPLICATE_COINS;
  } else if (isRod) {
    next.ownedSkins = [...state.ownedSkins, picked.id];
  } else {
    next.ownedBoatSkins = [...state.ownedBoatSkins, picked.id];
  }

  return {
    next,
    reward: { type: isRod ? 'rodSkin' : 'boatSkin', skinId: picked.id, ...(duplicate ? { duplicate: true } : {}) },
  };
}
