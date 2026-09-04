import {
  FishingLocation,
  AQUARIUM_REWARDS,
  FISH_COIN_VALUE,
  getXpForLevel,
  MAX_LEVEL,
  MULTIPLIER_COST,
  MULTIPLIER_COST_4X,
  MULTIPLIER_DURATION,
  NET_LIMIT,
  NET_PRICE,
  PlayerState,
  WAREHOUSE_LIMIT,
} from './types';

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
