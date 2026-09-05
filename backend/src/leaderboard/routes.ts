import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { createMemoryLeaderboardService } from './service.js';
import type { createPgLeaderboardService } from './pgRepository.js';

type AuthService = ReturnType<typeof createAuthService>;
type LeaderboardService = ReturnType<typeof createMemoryLeaderboardService> | ReturnType<typeof createPgLeaderboardService>;

export function registerLeaderboardRoutes(app: FastifyInstance, auth: AuthService, leaderboard: LeaderboardService): void {
  app.get('/api/v1/leaderboard', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).max(10000).default(0),
    }).parse(request.query);
    return leaderboard.list(await auth.verifyAccessToken(header.slice(7)), query.limit, query.offset);
  });
}
