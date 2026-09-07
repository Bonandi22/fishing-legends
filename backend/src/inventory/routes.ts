import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { createMemoryInventoryService } from './service.js';
import type { createPgInventoryService } from './pgRepository.js';
import { idempotencyKey } from '../http/idempotency.js';

type InventoryService = ReturnType<typeof createMemoryInventoryService> | ReturnType<typeof createPgInventoryService>;

export function registerInventoryRoutes(app: FastifyInstance, inventory: InventoryService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/inventory/warehouse', {
    schema: { tags: ['inventory'], summary: 'List the warehouse' },
    preHandler: app.requireAuth,
  }, async request => inventory.list(request.userId));

  r.post('/api/v1/inventory/warehouse/sell', {
    schema: { tags: ['inventory'], summary: 'Sell the whole warehouse (needs Idempotency-Key)' },
    preHandler: app.requireAuth,
  }, async request => inventory.sell(request.userId, idempotencyKey(request.headers['idempotency-key'])));

  r.get('/api/v1/inventory/aquarium/:sector', {
    schema: { tags: ['inventory'], summary: 'List one aquarium sector', params: z.object({ sector: z.coerce.number().int() }) },
    preHandler: app.requireAuth,
  }, async request => inventory.aquarium(request.userId, request.params.sector));

  r.post('/api/v1/inventory/aquarium', {
    schema: {
      tags: ['inventory'],
      summary: 'Move a warehouse fish into an aquarium sector',
      body: z.object({ warehouseItemId: z.string().uuid(), sector: z.number().int().min(1).max(5) }),
    },
    preHandler: app.requireAuth,
  }, async request => inventory.placeInAquarium(request.userId, request.body.warehouseItemId, request.body.sector));
}
