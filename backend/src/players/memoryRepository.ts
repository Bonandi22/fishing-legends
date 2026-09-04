import type { AuthRepository } from '../auth/types.js';
import type { PlayerProfile, PlayerRepository } from './types.js';

export function createMemoryPlayerRepository(authRepository: AuthRepository): PlayerRepository {
  return {
    async getProfile(userId) {
      const user = await authRepository.findUserById(userId);
      if (!user) return null;
      return {
        userId: user.id,
        email: user.email,
        username: user.username,
        country: user.country,
        level: 1,
        xp: 0,
        totalFishCaught: 0,
        coins: 0,
        unlockedLocations: [],
      };
    },
  };
}
