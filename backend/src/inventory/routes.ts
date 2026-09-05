import type { FastifyInstance } from 'fastify';
import type { createMemoryInventoryService } from './service.js';
import type { createPgInventoryService } from './pgRepository.js';
import { z } from 'zod';

type InventoryService = ReturnType<typeof createMemoryInventoryService> | ReturnType<typeof createPgInventoryService>;

function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.length < 16 || value.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
  return value;
}

export function registerInventoryRoutes(app: FastifyInstance, inventory: InventoryService): void {
  app.get('/api/v1/inventory/warehouse', { preHandler: app.requireAuth }, async request => {
    return inventory.list(request.userId);
  });

  app.post('/api/v1/inventory/warehouse/sell', { preHandler: app.requireAuth }, async request => {
    return inventory.sell(request.userId, idempotencyKey(request.headers['idempotency-key']));
  });

  app.get('/api/v1/inventory/aquarium/:sector', { preHandler: app.requireAuth }, async request => {
    const { sector } = z.object({ sector: z.coerce.number().int() }).parse(request.params);
    return inventory.aquarium(request.userId, sector);
  });

  app.post('/api/v1/inventory/aquarium', { preHandler: app.requireAuth }, async request => {
    const body = z.object({
      warehouseItemId: z.string().uuid(),
      sector: z.number().int().min(1).max(5),
    }).parse(request.body);
    return inventory.placeInAquarium(request.userId, body.warehouseItemId, body.sector);
  });
}
