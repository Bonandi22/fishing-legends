import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { createMemoryEconomyService } from './service.js';
import type { createPgEconomyService } from './pgRepository.js';
import { idempotencyKey } from '../http/idempotency.js';

type EconomyService = ReturnType<typeof createMemoryEconomyService> | ReturnType<typeof createPgEconomyService>;

export function registerEconomyRoutes(app: FastifyInstance, economy: EconomyService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/wallet', {
    schema: { tags: ['economy'], summary: 'Wallet balance', response: { 200: z.object({ balance: z.number() }) } },
    preHandler: app.requireAuth,
  }, async request => economy.getBalance(request.userId));

  r.post('/api/v1/economy/nets/purchase', {
    schema: { tags: ['economy'], summary: 'Buy fishing nets (needs Idempotency-Key)', body: z.object({ quantity: z.number().int().min(1).max(10) }) },
    preHandler: app.requireAuth,
  }, async request => {
    const key = idempotencyKey(request.headers['idempotency-key']);
    return economy.purchaseNets(request.userId, request.body.quantity, key);
  });

  r.post('/api/v1/economy/multipliers/purchase', {
    schema: {
      tags: ['economy'],
      summary: 'Buy a luck/strength multiplier (needs Idempotency-Key)',
      body: z.object({ type: z.enum(['luck', 'strength']), power: z.union([z.literal(2), z.literal(4)]) }),
    },
    preHandler: app.requireAuth,
  }, async request => {
    const key = idempotencyKey(request.headers['idempotency-key']);
    return economy.purchaseMultiplier(request.userId, request.body.type, request.body.power, key);
  });
}
