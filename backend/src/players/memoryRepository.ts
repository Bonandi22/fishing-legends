import type { AuthRepository } from '../auth/types.js';
import type { PlayerProfile, PlayerRepository } from './types.js';
import { applyCatchProgress } from './progress.js';

type Progress = Pick<PlayerProfile, 'level' | 'xp' | 'totalFishCaught' | 'coins' | 'unlockedLocations'>;

const initialProgress = (): Progress => ({
  level: 1,
  xp: 0,
  totalFishCaught: 0,
  coins: 0,
  unlockedLocations: [],
});

export function createMemoryPlayerRepository(authRepository: AuthRepository): PlayerRepository {
  const store = new Map<string, Progress>();
  const read = (userId: string): Progress => store.get(userId) ?? initialProgress();

  return {
    async getProfile(userId) {
      const user = await authRepository.findUserById(userId);
      if (!user) return null;
      return {
        userId: user.id,
        email: user.email,
        username: user.username,
        country: user.country,
        ...read(userId),
      };
    },
    async recordCatch(userId, xpGained) {
      const progress = read(userId);
      const next = applyCatchProgress(progress, xpGained);
      store.set(userId, { ...progress, level: next.level, xp: next.xp, totalFishCaught: progress.totalFishCaught + 1 });
    },
  };
}
