import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { createMemoryRewardsService } from './memoryRepository.js';
import type { createPgRewardsService } from './pgRepository.js';

type RewardsService = ReturnType<typeof createMemoryRewardsService> | ReturnType<typeof createPgRewardsService>;

export function registerRewardsRoutes(app: FastifyInstance, rewards: RewardsService): void {
  // The reward day follows the server-computed streak; the client cannot choose it.
  app.withTypeProvider<ZodTypeProvider>().post('/api/v1/rewards/daily/claim', {
    schema: { tags: ['rewards'], summary: 'Claim the daily reward (server-computed streak day)' },
    preHandler: app.requireAuth,
  }, async request => rewards.claim(request.userId));
}
