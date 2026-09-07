import type { FastifyInstance } from 'fastify';
import type { GameStateEconomyService } from './economyService.js';
import { idempotencyKey } from '../http/idempotency.js';

export function registerGameStateEconomyRoutes(app: FastifyInstance, service: GameStateEconomyService): void {
  app.post('/api/v1/me/economy/warehouse/sell', {
    schema: { tags: ['gamestate'], summary: 'Sell the whole warehouse (needs Idempotency-Key)' },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.sellWarehouse(request.userId, idempotencyKey(request.headers['idempotency-key']));
  });

  app.post('/api/v1/me/economy/nets/purchase', {
    schema: { tags: ['gamestate'], summary: 'Buy one fishing net at the server price (needs Idempotency-Key)' },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.purchaseNet(request.userId, idempotencyKey(request.headers['idempotency-key']));
  });
}
