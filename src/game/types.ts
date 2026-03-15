export type WaterType = 'saltwater' | 'freshwater';
export type LocationType = 'ocean' | 'river' | 'lake';
export type Rarity = 'common' | 'uncommon' | 'legendary' | 'abyssal';

export interface Fish {
  id: string;
  name: string;
  rarity: Rarity;
  waterType: WaterType;
  minWeight: number;
  maxWeight: number;
  xp: number;
  description: string;
  emoji: string;
}

export interface FishingLocation {
  id: string;
  name: string;
  type: LocationType;
  waterType: WaterType;
  description: string;
  requiredLevel: number;
  waterColor: string;
  skyColor: string;
  ambientColor: string;
  fishIds: string[];
  emoji: string;
}

export interface CaughtFish {
  fish: Fish;
  weight: number;
  location: string;
  timestamp: number;
}

export interface PlayerState {
  level: number;
  xp: number;
  xpToNextLevel: number;
  totalFishCaught: number;
  collection: CaughtFish[];
  unlockedLocations: string[];
  heaviestFish: CaughtFish | null;
}

export interface PullGameState {
  isActive: boolean;
  greenTime: number;
  redTime: number;
  linePosition: number;
  greenZoneStart: number;
  greenZoneSize: number;
  speed: number;
}

export const RARITY_CONFIG: Record<Rarity, { label: string; color: string; chance: number; greenZoneSize: number; speed: number }> = {
  common: { label: 'Comum', color: '#22c55e', chance: 0.60, greenZoneSize: 0.55, speed: 1 },
  uncommon: { label: 'Incomum', color: '#3b82f6', chance: 0.25, greenZoneSize: 0.42, speed: 1.4 },
  legendary: { label: 'Lendário', color: '#f59e0b', chance: 0.12, greenZoneSize: 0.30, speed: 1.4 },
  abyssal: { label: 'Abissal', color: '#a855f7', chance: 0.03, greenZoneSize: 0.20, speed: 1.9 },
};

export function getXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}
