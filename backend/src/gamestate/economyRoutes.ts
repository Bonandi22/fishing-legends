import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { GameStateEconomyService } from './economyService.js';
import { idempotencyKey } from '../http/idempotency.js';

const multiplierBody = z.object({
  type: z.enum(['luck', 'strength']),
  power: z.union([z.literal(2), z.literal(4)]),
});

const skinBody = z.object({
  kind: z.enum(['rod', 'boat']),
  skinId: z.string().min(1).max(64),
});

export function registerGameStateEconomyRoutes(app: FastifyInstance, service: GameStateEconomyService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/me/economy/warehouse/sell', {
    schema: { tags: ['gamestate'], summary: 'Sell the whole warehouse (needs Idempotency-Key)' },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.sellWarehouse(request.userId, idempotencyKey(request.headers['idempotency-key']));
  });

  r.post('/api/v1/me/economy/nets/purchase', {
    schema: { tags: ['gamestate'], summary: 'Buy one fishing net at the server price (needs Idempotency-Key)' },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.purchaseNet(request.userId, idempotencyKey(request.headers['idempotency-key']));
  });

  r.post('/api/v1/me/economy/multipliers/purchase', {
    schema: {
      tags: ['gamestate'],
      summary: 'Buy a luck/strength multiplier at the server price (needs Idempotency-Key)',
      body: multiplierBody,
    },
    preHandler: app.requireAuth,
  }, async (request) => {
    const { type, power } = request.body;
    return service.purchaseMultiplier(request.userId, idempotencyKey(request.headers['idempotency-key']), type, power);
  });

  r.post('/api/v1/me/economy/skins/purchase', {
    schema: {
      tags: ['gamestate'],
      summary: 'Buy a rod or boat skin at the server price (needs Idempotency-Key)',
      body: skinBody,
    },
    preHandler: app.requireAuth,
  }, async (request) => {
    const { kind, skinId } = request.body;
    return service.purchaseSkin(request.userId, idempotencyKey(request.headers['idempotency-key']), kind, skinId);
  });
}
