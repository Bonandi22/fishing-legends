import type { PlayerState } from '@/game/types';
import { getXpForLevel } from '@/game/types';
import { getMe } from '@/api/endpoints';

export async function hydrateFromServer(replace: (partial: Partial<PlayerState>) => void): Promise<void> {
  const { user } = await getMe();
  replace({
    level: user.level,
    xp: user.xp,
    xpToNextLevel: getXpForLevel(user.level),
    totalFishCaught: user.totalFishCaught,
    coins: user.coins,
    unlockedLocations: user.unlockedLocations,
  });
}
