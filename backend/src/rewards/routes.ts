import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { createMemoryRewardsService } from './memoryRepository.js';
import type { createPgRewardsService } from './pgRepository.js';

type RewardsService = ReturnType<typeof createMemoryRewardsService> | ReturnType<typeof createPgRewardsService>;
export function registerRewardsRoutes(app: FastifyInstance, auth: ReturnType<typeof createAuthService>, rewards: RewardsService): void {
  app.post('/api/v1/rewards/daily/claim', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    const body = z.object({ day: z.number().int().min(1).max(7) }).parse(request.body);
    return rewards.claim(await auth.verifyAccessToken(header.slice(7)), body.day);
  });
}
