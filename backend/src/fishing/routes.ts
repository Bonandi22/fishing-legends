import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { createFishingService } from './service.js';

type FishingService = ReturnType<typeof createFishingService>;

export function registerFishingRoutes(app: FastifyInstance, fishingService: FishingService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/fishing/sessions', {
    schema: {
      tags: ['fishing'],
      summary: 'Start a fishing session (needs Idempotency-Key)',
      body: z.object({ locationId: z.string().min(1).max(120) }),
    },
    preHandler: app.requireAuth,
  }, async request => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    return fishingService.start(request.userId, request.body.locationId, key);
  });

  r.post('/api/v1/fishing/sessions/:sessionId/complete', {
    schema: {
      tags: ['fishing'],
      summary: 'Complete a fishing session; the server rolls the catch',
      params: z.object({ sessionId: z.string().uuid() }),
    },
    preHandler: app.requireAuth,
  }, async request => fishingService.complete(request.userId, request.params.sessionId));
}
