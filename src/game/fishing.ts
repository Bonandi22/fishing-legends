import type { Fish, Rarity } from './types';

/** A rod fish the server (or the local roll) hooked, pending the minigame. */
export type RodHooked = { kind: 'rod'; fish: Fish; weight: number; lucky: boolean; sessionId: string };

/** A net's rolled grade + pre-rolled haul, pending the net minigame. */
export type NetHooked = {
  kind: 'net';
  net: { rarity: Rarity; fishCount: number; greenZoneSize: number; speed: number };
  catches: Array<{ fish: Fish; weight: number }>;
  lucky: boolean;
  sessionId: string;
};

/** One roster entry the server (or the local roll) produced for the submarine. */
export type SubmarineCatch = { id: string; fish: Fish; weight: number };

/** A server-rolled submarine roster, harvested one fish per click by `id`. */
export type SubmarineHooked = {
  kind: 'submarine';
  catches: SubmarineCatch[];
  sessionId: string;   // '' for the anonymous local roll
};

export type Hooked = RodHooked | NetHooked | SubmarineHooked;
