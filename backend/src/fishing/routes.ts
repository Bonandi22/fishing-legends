import type { FastifyInstance } from 'fastify';
import type { createFishingService } from './service.js';
import { z } from 'zod';

const startSchema = z.object({
  locationId: z.string().min(1).max(120),
});

type FishingService = ReturnType<typeof createFishingService>;

export function registerFishingRoutes(app: FastifyInstance, fishingService: FishingService): void {
  app.post('/api/v1/fishing/sessions', { preHandler: app.requireAuth }, async request => {
    const input = startSchema.parse(request.body);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    return fishingService.start(request.userId, input.locationId, key);
  });

  app.post('/api/v1/fishing/sessions/:sessionId/complete', { preHandler: app.requireAuth }, async request => {
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    return fishingService.complete(request.userId, params.sessionId);
  });
}
