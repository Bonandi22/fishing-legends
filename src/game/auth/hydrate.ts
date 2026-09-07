import type { PlayerState } from '@/game/types';
import { getXpForLevel } from '@/game/types';
import { getUnlockedLocationIds } from '@/game/stateRules';
import { LOCATIONS } from '@/game/data';
import { getMe } from '@/api/endpoints';

/**
 * Pulls `/me` and folds it into the live local state.
 *
 * This is a NON-DESTRUCTIVE merge on purpose: `onAuthenticated` fires on every
 * authenticated app start, and in 10.1 the server is not yet authoritative over
 * progress. Every field takes the more generous of (local, server).
 *
 * `coins` is deliberately NOT read: `/me.coins` is backed by `player_progress.coins`,
 * a column nothing in the backend ever writes, so it is 0 for every account.
 * Applying it would wipe the local wallet. Economy becomes server-authoritative
 * in 10.3 via the `wallets` table.
 */
export async function hydrateFromServer(
  replace: (updater: (prev: PlayerState) => Partial<PlayerState>) => void,
): Promise<void> {
  const { user } = await getMe();
  replace(prev => {
    const level = Math.max(prev.level, user.level);
    // Floor the unlock set at whatever the merged level grants, so a high-level
    // player is never locked out of every location by an empty server payload.
    const unlockedLocations = [...new Set([
      ...prev.unlockedLocations,
      ...user.unlockedLocations,
      ...getUnlockedLocationIds(level, LOCATIONS),
    ])];
    return {
      level,
      xp: Math.max(prev.xp, user.xp),
      xpToNextLevel: getXpForLevel(level),
      totalFishCaught: Math.max(prev.totalFishCaught, user.totalFishCaught),
      unlockedLocations,
    };
  });
}
