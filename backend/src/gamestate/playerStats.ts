import { saveSchema } from '../../../src/game/persistence.js';
import { LOCATIONS } from '../../../src/game/data.js';
import type { PlayerState } from '../../../src/game/types.js';

export type PlayerStats = {
  level: number;
  xp: number;
  totalFishCaught: number;
  coins: number;
  unlockedLocations: string[];
  ownedSkins: string[];
  ownedBoatSkins: string[];
  luckMultiplierPower: number;
  strengthMultiplierPower: number;
};

const DEFAULT_STATS: PlayerStats = {
  level: 1,
  xp: 0,
  totalFishCaught: 0,
  coins: 0,
  unlockedLocations: LOCATIONS.filter(location => location.requiredLevel <= 1).map(location => location.id),
  ownedSkins: ['default'],
  ownedBoatSkins: ['classic'],
  luckMultiplierPower: 0,
  strengthMultiplierPower: 0,
};

function statsOf(player: PlayerState): PlayerStats {
  return {
    level: player.level,
    xp: player.xp,
    totalFishCaught: player.totalFishCaught,
    coins: player.coins,
    unlockedLocations: player.unlockedLocations,
    ownedSkins: player.ownedSkins,
    ownedBoatSkins: player.ownedBoatSkins,
    luckMultiplierPower: player.luckMultiplierPower ?? 0,
    strengthMultiplierPower: player.strengthMultiplierPower ?? 0,
  };
}

/**
 * Normalizes a raw `player_game_state.state` blob into the stats the `/me`
 * profile and the leaderboard need. `null` (no row yet) and a blob that fails
 * validation both degrade to defaults instead of throwing — this runs over
 * every player for the leaderboard, so one corrupt row must not break the
 * whole listing.
 */
export function extractPlayerStats(state: unknown): PlayerStats {
  if (state == null) return DEFAULT_STATS;
  const parsed = saveSchema.safeParse(state);
  return parsed.success ? statsOf(parsed.data.player) : DEFAULT_STATS;
}
