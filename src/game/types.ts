export type WaterType = 'saltwater' | 'freshwater';
export type LocationType = 'ocean' | 'river' | 'lake';
export type Rarity = 'common' | 'uncommon' | 'mythic' | 'legendary' | 'abyssal';

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

export interface RodSkin {
  id: string;
  name: string;
  emoji: string;
  price: number;
  color: string;
  rodColor: string;       // main rod blank color
  gripColor: string;      // grip/handle color
  accentColor: string;    // thread wraps / accent color
  reelColor: string;      // reel body color
  metalness: number;      // rod metalness
  emissive?: string;      // optional glow
}

export const ROD_SKINS: RodSkin[] = [
  { id: 'default', name: 'Padrão', emoji: '🎣', price: 0, color: '#8B4513', rodColor: '#141428', gripColor: '#c4a066', accentColor: '#8b0000', reelColor: '#3a3a3a', metalness: 0.25 },
  { id: 'shark', name: 'Tubarão', emoji: '🦈', price: 1000, color: '#607D8B', rodColor: '#37474F', gripColor: '#546E7A', accentColor: '#90A4AE', reelColor: '#455A64', metalness: 0.6 },
  { id: 'fish', name: 'Peixe', emoji: '🐟', price: 1500, color: '#2196F3', rodColor: '#0D47A1', gripColor: '#1565C0', accentColor: '#42A5F5', reelColor: '#1976D2', metalness: 0.4 },
  { id: 'octopus', name: 'Polvo', emoji: '🐙', price: 2000, color: '#9C27B0', rodColor: '#4A148C', gripColor: '#6A1B9A', accentColor: '#CE93D8', reelColor: '#7B1FA2', metalness: 0.35 },
  { id: 'dragon', name: 'Dragão', emoji: '🐉', price: 3000, color: '#F44336', rodColor: '#B71C1C', gripColor: '#C62828', accentColor: '#FF8F00', reelColor: '#D32F2F', metalness: 0.5, emissive: '#ff2200' },
  { id: 'phoenix', name: 'Fênix', emoji: '🔥', price: 4000, color: '#FF9800', rodColor: '#E65100', gripColor: '#F57C00', accentColor: '#FFD54F', reelColor: '#EF6C00', metalness: 0.45, emissive: '#ff6600' },
  { id: 'kraken', name: 'Kraken', emoji: '🦑', price: 5000, color: '#1A237E', rodColor: '#0D1642', gripColor: '#1A237E', accentColor: '#7C4DFF', reelColor: '#283593', metalness: 0.55, emissive: '#3311aa' },
  { id: 'gold', name: 'Ouro', emoji: '✨', price: 7500, color: '#FFD700', rodColor: '#B8860B', gripColor: '#DAA520', accentColor: '#FFD700', reelColor: '#CD950C', metalness: 0.9, emissive: '#aa8800' },
  { id: 'diamond', name: 'Diamante', emoji: '💎', price: 10000, color: '#00BCD4', rodColor: '#006064', gripColor: '#00838F', accentColor: '#80DEEA', reelColor: '#00ACC1', metalness: 0.95, emissive: '#00ccff' },
];

export const FISH_COIN_VALUE: Record<Rarity, number> = {
  common: 10,
  uncommon: 25,
  mythic: 50,
  legendary: 100,
  abyssal: 200,
};

export interface PlayerState {
  level: number;
  xp: number;
  xpToNextLevel: number;
  totalFishCaught: number;
  collection: CaughtFish[];
  unlockedLocations: string[];
  heaviestFish: CaughtFish | null;
  warehouse: CaughtFish[];
  coins: number;
  activeSkin: string;
  ownedSkins: string[];
  luckMultiplierEnd: number | null;
  strengthMultiplierEnd: number | null;
  lastRouletteDate: string | null;
}

export const WAREHOUSE_LIMIT = 15;
export const MULTIPLIER_COST = 3000;
export const MULTIPLIER_DURATION = 60 * 1000; // 1 minute

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
  common: { label: 'Comum', color: '#22c55e', chance: 0.50, greenZoneSize: 0.55, speed: 1 },
  uncommon: { label: 'Incomum', color: '#3b82f6', chance: 0.22, greenZoneSize: 0.42, speed: 1.4 },
  mythic: { label: 'Mítico', color: '#ec4899', chance: 0.15, greenZoneSize: 0.35, speed: 1.5 },
  legendary: { label: 'Lendário', color: '#f59e0b', chance: 0.10, greenZoneSize: 0.30, speed: 1.6 },
  abyssal: { label: 'Abissal', color: '#a855f7', chance: 0.03, greenZoneSize: 0.20, speed: 1.9 },
};

export function getXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}
