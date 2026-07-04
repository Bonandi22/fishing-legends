export type WaterType = 'saltwater' | 'freshwater';
export type LocationType = 'ocean' | 'river' | 'lake';
export type Rarity = 'common' | 'uncommon' | 'mythic' | 'legendary' | 'abyssal' | 'volcanic' | 'platinum' | 'legends';

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
  world?: 1 | 2;
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
  exclusive?: boolean;    // only obtainable via roulette
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
  { id: 'celestial', name: 'Celestial', emoji: '🌌', price: 99999, color: '#a78bfa', rodColor: '#1b0a3a', gripColor: '#3b1d6e', accentColor: '#f0abfc', reelColor: '#7c3aed', metalness: 1.0, emissive: '#c026d3', exclusive: true },
  { id: 'daily_aurora', name: 'Aurora Diária', emoji: '🌠', price: 99999, color: '#34d399', rodColor: '#062e2b', gripColor: '#0f766e', accentColor: '#a7f3d0', reelColor: '#10b981', metalness: 0.95, emissive: '#22c55e', exclusive: true },
];

export interface BoatSkin {
  id: string;
  name: string;
  emoji: string;
  price: number;
  /** Deck (planks) gradient — top to bottom */
  deck: [string, string, string, string, string];
  /** Hull side gradient — top to bottom */
  hull: [string, string, string];
  /** Rail (gunwale) gradient — top to bottom */
  rail: [string, string, string];
  /** Plank caulking line color */
  caulk: string;
  exclusive?: boolean;
}

export const BOAT_SKINS: BoatSkin[] = [
  {
    id: 'classic', name: 'Madeira Clássica', emoji: '🛶', price: 0,
    deck: ['#a87242', '#8a5a2c', '#5e3818', '#321a08', '#180a02'],
    hull: ['#3d2210', '#1a0c04', '#050200'],
    rail: ['#d49560', '#9a6532', '#4a2c12'],
    caulk: '#0a0401',
  },
  {
    id: 'yacht', name: 'Iate de Luxo', emoji: '⛵', price: 2500,
    deck: ['#f5f5f0', '#e0e0d8', '#c0c0b8', '#8e8e88', '#5a5a55'],
    hull: ['#ffffff', '#d6d6d0', '#9a9a95'],
    rail: ['#f0d8a8', '#b88a4c', '#5a3a18'],
    caulk: '#3a3a36',
  },
  {
    id: 'pirate', name: 'Navio Pirata', emoji: '🏴‍☠️', price: 3500,
    deck: ['#5a3a1a', '#3e260f', '#241406', '#120902', '#060300'],
    hull: ['#1a0a02', '#080300', '#000000'],
    rail: ['#8a1010', '#5a0808', '#240202'],
    caulk: '#000000',
  },
  {
    id: 'steel', name: 'Aço Naval', emoji: '🚢', price: 4500,
    deck: ['#7a8088', '#5a6068', '#3e444c', '#262a30', '#10131a'],
    hull: ['#2a3038', '#15191f', '#04060a'],
    rail: ['#9aa4ae', '#5e6872', '#2a3038'],
    caulk: '#04060a',
  },
  {
    id: 'gold', name: 'Barco Dourado', emoji: '💰', price: 7000,
    deck: ['#fff0a8', '#e8c860', '#b08820', '#7a5808', '#3a2800'],
    hull: ['#8a6608', '#503c04', '#1a1400'],
    rail: ['#fff5c8', '#d4a830', '#7a5808'],
    caulk: '#3a2800',
  },
  {
    id: 'neon', name: 'Cyber Neon', emoji: '🌀', price: 9500,
    deck: ['#1a2540', '#0c1830', '#06102a', '#040820', '#020414'],
    hull: ['#0a1428', '#040814', '#000208'],
    rail: ['#7df9ff', '#1a90ff', '#0a3a8a'],
    caulk: '#7df9ff',
  },
  {
    id: 'daily_leviathan', name: 'Leviatã Diário', emoji: '🐋', price: 99999,
    deck: ['#1e3a8a', '#1e40af', '#1d4ed8', '#172554', '#0c1638'],
    hull: ['#0c1638', '#050a1c', '#000208'],
    rail: ['#67e8f9', '#06b6d4', '#0e7490'],
    caulk: '#67e8f9',
    exclusive: true,
  },
];

export const FISH_COIN_VALUE: Record<Rarity, number> = {
  common: 10,
  uncommon: 25,
  mythic: 50,
  legendary: 100,
  abyssal: 200,
  volcanic: 300,
  platinum: 400,
  legends: 750,
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
  activeBoatSkin: string;
  ownedBoatSkins: string[];
  luckMultiplierEnd: number | null;
  strengthMultiplierEnd: number | null;
  lastRouletteDate: string | null;
  aquariumWarehouse: CaughtFish[];
  aquariumSectors: Record<number, CaughtFish[]>;
  dailyGiftsLastClaim: string | null;
  dailyGiftsDay: number; // next day to claim (1..7)
  dailyGiftsWeek?: number; // 1 = premium (skins), 2+ = rotation without skins
}

export type DailyGiftReward =
  | { type: 'coins'; amount: number }
  | { type: 'multiplier'; kind: 'luck' | 'strength' }
  | { type: 'boatSkin'; skinId: string }
  | { type: 'rodSkin'; skinId: string };

// Week 1: introdutório com skins exclusivas
export const DAILY_GIFTS: DailyGiftReward[] = [
  { type: 'coins', amount: 150 },
  { type: 'coins', amount: 300 },
  { type: 'multiplier', kind: 'luck' },
  { type: 'coins', amount: 600 },
  { type: 'multiplier', kind: 'strength' },
  { type: 'boatSkin', skinId: 'daily_leviathan' },
  { type: 'rodSkin', skinId: 'daily_aurora' },
];

// Semanas seguintes: rotação de moedas e multiplicadores, sem skins
export const DAILY_GIFTS_ROTATION: DailyGiftReward[] = [
  { type: 'coins', amount: 200 },
  { type: 'coins', amount: 400 },
  { type: 'multiplier', kind: 'luck' },
  { type: 'coins', amount: 700 },
  { type: 'multiplier', kind: 'strength' },
  { type: 'coins', amount: 1000 },
  { type: 'coins', amount: 1500 },
];

export function getDailyGiftsForWeek(week: number): DailyGiftReward[] {
  return week <= 1 ? DAILY_GIFTS : DAILY_GIFTS_ROTATION;
}

export const AQUARIUM_REWARDS: Record<Rarity, { coins: number; xp: number }> = {
  common: { coins: 5, xp: 5 },
  uncommon: { coins: 15, xp: 15 },
  mythic: { coins: 40, xp: 40 },
  legendary: { coins: 100, xp: 80 },
  abyssal: { coins: 250, xp: 200 },
  volcanic: { coins: 350, xp: 280 },
  platinum: { coins: 500, xp: 380 },
  legends: { coins: 1000, xp: 600 },
};

export const AQUARIUM_SECTORS = [1, 2, 3, 4, 5] as const;

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
  mythic: { label: 'Mítico', color: '#ec4899', chance: 0.13, greenZoneSize: 0.35, speed: 1.5 },
  legendary: { label: 'Lendário', color: '#f59e0b', chance: 0.09, greenZoneSize: 0.30, speed: 1.6 },
  abyssal: { label: 'Abissal', color: '#a855f7', chance: 0.03, greenZoneSize: 0.20, speed: 1.9 },
  volcanic: { label: 'Vulcânica', color: '#ef4444', chance: 0.02, greenZoneSize: 0.16, speed: 2.1 },
  platinum: { label: 'Platina', color: '#e5e7eb', chance: 0.01, greenZoneSize: 0.14, speed: 2.3 },
  legends: { label: 'Lendas', color: '#ff45d9', chance: 0.005, greenZoneSize: 0.10, speed: 2.6 },
};

export function getXpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}
