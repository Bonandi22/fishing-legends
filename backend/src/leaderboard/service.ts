import type { AuthRepository } from '../auth/types.js';
import type { MemoryGameStateStore } from '../gamestate/memoryService.js';
import { extractPlayerStats } from '../gamestate/playerStats.js';
import { buildLeaderboard, type LeaderboardSource } from './rank.js';

export function createMemoryLeaderboardService(authRepository: AuthRepository, gameStateStore: MemoryGameStateStore) {
  return {
    async list(_userId: string, limit: number, offset: number) {
      const users = await authRepository.listUsers?.() ?? [];
      // Same rule as PostgreSQL: only players with game state rank.
      const sources: LeaderboardSource[] = users.flatMap(user => {
        const record = gameStateStore.get(user.id);
        if (!record) return [];
        return [{ userId: user.id, username: user.username, country: user.country, stats: extractPlayerStats(record.state) }];
      });
      return buildLeaderboard(sources, limit, offset);
    },
  };
}
