import type { AuthRepository } from '../auth/types.js';
import type { MemoryGameStateStore } from '../gamestate/memoryService.js';
import { extractPlayerStats } from '../gamestate/playerStats.js';
import { buildLeaderboard, type LeaderboardSource } from './rank.js';

export function createMemoryLeaderboardService(authRepository: AuthRepository, gameStateStore: MemoryGameStateStore) {
  return {
    async list(_userId: string, limit: number, offset: number) {
      const users = await authRepository.listUsers?.() ?? [];
      const sources: LeaderboardSource[] = users.map(user => ({
        userId: user.id,
        username: user.username,
        country: user.country,
        stats: extractPlayerStats(gameStateStore.get(user.id)?.state ?? null),
      }));
      return buildLeaderboard(sources, limit, offset);
    },
  };
}
