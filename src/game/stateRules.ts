import { FishingLocation, getXpForLevel, MAX_LEVEL, PlayerState, WAREHOUSE_LIMIT } from './types';

export interface Progression {
  xp: number;
  level: number;
  xpToNextLevel: number;
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
