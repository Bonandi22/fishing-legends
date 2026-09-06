import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { createMemoryLeaderboardService } from './service.js';
import type { createPgLeaderboardService } from './pgRepository.js';

type LeaderboardService = ReturnType<typeof createMemoryLeaderboardService> | ReturnType<typeof createPgLeaderboardService>;

const querystring = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export function registerLeaderboardRoutes(app: FastifyInstance, leaderboard: LeaderboardService): void {
  app.withTypeProvider<ZodTypeProvider>().get('/api/v1/leaderboard', {
    schema: { tags: ['leaderboard'], summary: 'Global ranking (paginated)', querystring },
    preHandler: app.requireAuth,
  }, async request => leaderboard.list(request.userId, request.query.limit, request.query.offset));
}
