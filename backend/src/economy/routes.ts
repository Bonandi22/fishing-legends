import type { FastifyInstance } from 'fastify';
import type { createMemoryEconomyService } from './service.js';
import type { createPgEconomyService } from './pgRepository.js';
import { z } from 'zod';

type EconomyService = ReturnType<typeof createMemoryEconomyService> | ReturnType<typeof createPgEconomyService>;

function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.length < 16 || value.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
  return value;
}

export function registerEconomyRoutes(app: FastifyInstance, economy: EconomyService): void {
  app.get('/api/v1/wallet', { preHandler: app.requireAuth }, async request => {
    return economy.getBalance(request.userId);
  });

  app.post('/api/v1/economy/nets/purchase', { preHandler: app.requireAuth }, async request => {
    const key = idempotencyKey(request.headers['idempotency-key']);
    const body = z.object({ quantity: z.number().int().min(1).max(10) }).parse(request.body);
    return economy.purchaseNets(request.userId, body.quantity, key);
  });

  app.post('/api/v1/economy/multipliers/purchase', { preHandler: app.requireAuth }, async request => {
    const key = idempotencyKey(request.headers['idempotency-key']);
    const body = z.object({
      type: z.enum(['luck', 'strength']),
      power: z.union([z.literal(2), z.literal(4)]),
    }).parse(request.body);
    return economy.purchaseMultiplier(request.userId, body.type, body.power, key);
  });
}
