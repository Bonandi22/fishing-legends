import type { FastifyInstance } from 'fastify';
import type { createMemoryRewardsService } from './memoryRepository.js';
import type { createPgRewardsService } from './pgRepository.js';

type RewardsService = ReturnType<typeof createMemoryRewardsService> | ReturnType<typeof createPgRewardsService>;

export function registerRewardsRoutes(app: FastifyInstance, rewards: RewardsService): void {
  // The reward day follows the server-computed streak; the client cannot choose it.
  app.post('/api/v1/rewards/daily/claim', { preHandler: app.requireAuth }, async request => {
    return rewards.claim(request.userId);
  });
}
