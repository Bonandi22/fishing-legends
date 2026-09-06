import { Rarity } from '@/game/types';

export interface NetType {
  id: string;
  rarity: Rarity;
  fishCount: number;
  greenZoneSize: number;
  speed: number;
}

/** The nine net grades, one per rarity — rolled at random each cast. */
export const NET_TYPES: NetType[] = [
  { id: 'net_common', rarity: 'common', fishCount: 20, greenZoneSize: 0.55, speed: 1.0 },
  { id: 'net_uncommon', rarity: 'uncommon', fishCount: 15, greenZoneSize: 0.45, speed: 1.3 },
  { id: 'net_mythic', rarity: 'mythic', fishCount: 10, greenZoneSize: 0.36, speed: 1.6 },
  { id: 'net_legendary', rarity: 'legendary', fishCount: 8, greenZoneSize: 0.35, speed: 1.5 },
  { id: 'net_abyssal', rarity: 'abyssal', fishCount: 5, greenZoneSize: 0.30, speed: 1.7 },
  { id: 'net_volcanic', rarity: 'volcanic', fishCount: 4, greenZoneSize: 0.18, speed: 1.9 },
  { id: 'net_platinum', rarity: 'platinum', fishCount: 2, greenZoneSize: 0.14, speed: 2.0 },
  { id: 'net_legends', rarity: 'legends', fishCount: 1, greenZoneSize: 0.20, speed: 2.4 },
  { id: 'net_cosmic', rarity: 'cosmic', fishCount: 1, greenZoneSize: 0.18, speed: 2.2 },
];

export const randomNet = () => NET_TYPES[Math.floor(Math.random() * NET_TYPES.length)];
