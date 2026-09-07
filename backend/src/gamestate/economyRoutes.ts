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
}
