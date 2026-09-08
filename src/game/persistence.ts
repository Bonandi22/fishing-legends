import { z } from 'zod';
import { CaughtFish, MAX_LEVEL, NET_LIMIT, PlayerState } from './types.js';
import { FISH, LOCATIONS, SUBMARINE_LOCATION_ID } from './data.js';

export const SAVE_SCHEMA_VERSION = 1;

const fishSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  rarity: z.enum(['common', 'uncommon', 'mythic', 'legendary', 'abyssal', 'volcanic', 'platinum', 'legends', 'cosmic']),
  waterType: z.enum(['saltwater', 'freshwater']),
  minWeight: z.number().finite().nonnegative(),
  maxWeight: z.number().finite().nonnegative(),
  xp: z.number().finite().nonnegative(),
  description: z.string(),
  emoji: z.string(),
  world: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

const caughtFishSchema = z.object({
  fish: fishSchema,
  weight: z.number().finite().nonnegative(),
  location: z.string().min(1),
  timestamp: z.number().finite().nonnegative(),
}).superRefine((caught, context) => {
  const catalogFish = FISH.find((fish) => fish.id === caught.fish.id);
  if (!catalogFish) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown fish id: ${caught.fish.id}`, path: ['fish', 'id'] });
    return;
  }

  if (caught.weight < catalogFish.minWeight || caught.weight > catalogFish.maxWeight) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Fish weight is outside catalog bounds', path: ['weight'] });
  }

  if (caught.location !== SUBMARINE_LOCATION_ID
      && !LOCATIONS.some((location) => location.id === caught.location)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown location id: ${caught.location}`, path: ['location'] });
  }
});

const playerSchema = z.object({
  level: z.number().int().min(1).max(MAX_LEVEL),
  xp: z.number().finite().nonnegative(),
  xpToNextLevel: z.number().finite().positive(),
  totalFishCaught: z.number().int().nonnegative(),
  collection: z.array(caughtFishSchema),
  unlockedLocations: z.array(z.string()),
  heaviestFish: caughtFishSchema.nullable(),
  warehouse: z.array(caughtFishSchema),
  coins: z.number().finite().nonnegative(),
  activeSkin: z.string().min(1),
  ownedSkins: z.array(z.string().min(1)),
  activeBoatSkin: z.string().min(1),
  ownedBoatSkins: z.array(z.string().min(1)),
  luckMultiplierEnd: z.number().finite().positive().nullable(),
  strengthMultiplierEnd: z.number().finite().positive().nullable(),
  luckMultiplierPower: z.number().finite().positive().optional(),
  strengthMultiplierPower: z.number().finite().positive().optional(),
  luckyUntil: z.number().finite().nullable().optional(),
  luckyCooldownUntil: z.number().finite().nullable().optional(),
  lastRouletteDate: z.string().nullable(),
  aquariumWarehouse: z.array(caughtFishSchema),
  aquariumSectors: z.record(z.string(), z.array(caughtFishSchema)),
  dailyGiftsLastClaim: z.string().nullable(),
  dailyGiftsDay: z.number().int().min(1).max(7),
  nets: z.number().int().min(0).max(NET_LIMIT).optional(),
  dailyGiftsWeek: z.number().int().min(1).optional(),
}) as z.ZodType<PlayerState>;

export const saveSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  player: playerSchema,
});

export interface SaveEnvelope {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  player: PlayerState;
}

export function parseSavedState(raw: string | null, defaultState: PlayerState): PlayerState {
  if (!raw) return defaultState;

  try {
    const parsed: unknown = JSON.parse(raw);
    const envelope = saveSchema.safeParse(parsed);
    if (envelope.success) return normalizePlayer(envelope.data.player, defaultState);

    // Version 0 stored PlayerState directly. Validate it after wrapping it.
    const legacy = saveSchema.safeParse({ schemaVersion: SAVE_SCHEMA_VERSION, player: parsed });
    if (legacy.success) return normalizePlayer(legacy.data.player, defaultState);

    console.warn('Ignoring invalid fishing-game-state save');
  } catch (error) {
    console.warn('Ignoring unreadable fishing-game-state save', error);
  }

  return defaultState;
}

export function serializePlayerState(player: PlayerState): string {
  return JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, player });
}

function normalizePlayer(player: PlayerState, fallback: PlayerState): PlayerState {
  const ownedSkins = unique(player.ownedSkins);
  const ownedBoatSkins = unique(player.ownedBoatSkins);
  const activeSkin = ownedSkins.includes(player.activeSkin) ? player.activeSkin : fallback.activeSkin;
  const activeBoatSkin = ownedBoatSkins.includes(player.activeBoatSkin)
    ? player.activeBoatSkin
    : fallback.activeBoatSkin;
  const nets = Math.min(player.nets ?? fallback.nets ?? NET_LIMIT, NET_LIMIT);

  const collection = [...player.collection];
  const heaviestFish = collection.reduce<CaughtFish | null>(
    (heaviest, caught) => !heaviest || caught.weight > heaviest.weight ? caught : heaviest,
    null,
  );

  return {
    ...fallback,
    ...player,
    level: Math.min(Math.max(player.level, 1), MAX_LEVEL),
    coins: Math.max(player.coins, 0),
    totalFishCaught: Math.max(player.totalFishCaught, 0),
    collection,
    heaviestFish,
    ownedSkins,
    ownedBoatSkins,
    activeSkin,
    activeBoatSkin,
    nets,
    aquariumSectors: {
      1: player.aquariumSectors['1'] ?? fallback.aquariumSectors[1] ?? [],
      2: player.aquariumSectors['2'] ?? fallback.aquariumSectors[2] ?? [],
      3: player.aquariumSectors['3'] ?? fallback.aquariumSectors[3] ?? [],
      4: player.aquariumSectors['4'] ?? fallback.aquariumSectors[4] ?? [],
      5: player.aquariumSectors['5'] ?? fallback.aquariumSectors[5] ?? [],
    },
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
