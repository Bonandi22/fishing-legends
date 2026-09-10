import type { AuthRepository } from '../auth/types.js';
import type { MemoryGameStateStore } from '../gamestate/memoryService.js';
import { extractPlayerStats } from '../gamestate/playerStats.js';
import type { PlayerRepository } from './types.js';

export function createMemoryPlayerRepository(authRepository: AuthRepository, gameStateStore: MemoryGameStateStore): PlayerRepository {
  return {
    async getProfile(userId) {
      const user = await authRepository.findUserById(userId);
      if (!user) return null;
      const stats = extractPlayerStats(gameStateStore.get(userId)?.state ?? null);
      return {
        userId: user.id,
        email: user.email,
        username: user.username,
        country: user.country,
        level: stats.level,
        xp: stats.xp,
        totalFishCaught: stats.totalFishCaught,
        coins: stats.coins,
        unlockedLocations: stats.unlockedLocations,
      };
    },
  };
}
