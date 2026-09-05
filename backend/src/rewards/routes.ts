import type { FastifyInstance } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { createMemoryRewardsService } from './memoryRepository.js';
import type { createPgRewardsService } from './pgRepository.js';

type RewardsService = ReturnType<typeof createMemoryRewardsService> | ReturnType<typeof createPgRewardsService>;

export function registerRewardsRoutes(app: FastifyInstance, auth: ReturnType<typeof createAuthService>, rewards: RewardsService): void {
  // The reward day follows the server-computed streak; the client cannot choose it.
  app.post('/api/v1/rewards/daily/claim', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    return rewards.claim(await auth.verifyAccessToken(header.slice(7)));
  });
}
