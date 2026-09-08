import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { FishingService } from './service.js';
import { idempotencyKey } from '../http/idempotency.js';

export function registerFishingRoutes(app: FastifyInstance, service: FishingService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/me/fishing/cast', {
    schema: {
      tags: ['gamestate'],
      summary: 'Cast — the server rolls the fish (needs Idempotency-Key)',
      body: z.object({ locationId: z.string().min(1).max(120) }),
    },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.cast(request.userId, idempotencyKey(request.headers['idempotency-key']), request.body.locationId);
  });

  r.post('/api/v1/me/fishing/land', {
    schema: {
      tags: ['gamestate'],
      summary: 'Land the fish the cast rolled (needs Idempotency-Key)',
      body: z.object({ sessionId: z.string().uuid() }),
    },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.land(request.userId, idempotencyKey(request.headers['idempotency-key']), request.body.sessionId);
  });
}
