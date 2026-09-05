import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { createMemoryLeaderboardService } from './service.js';
import type { createPgLeaderboardService } from './pgRepository.js';

type LeaderboardService = ReturnType<typeof createMemoryLeaderboardService> | ReturnType<typeof createPgLeaderboardService>;

export function registerLeaderboardRoutes(app: FastifyInstance, leaderboard: LeaderboardService): void {
  app.get('/api/v1/leaderboard', { preHandler: app.requireAuth }, async request => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).max(10000).default(0),
    }).parse(request.query);
    return leaderboard.list(request.userId, query.limit, query.offset);
  });
}
