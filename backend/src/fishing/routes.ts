import type { FastifyInstance } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { createFishingService } from './service.js';
import { z } from 'zod';

const startSchema = z.object({
  locationId: z.string().min(1).max(120),
});

type AuthService = ReturnType<typeof createAuthService>;
type FishingService = ReturnType<typeof createFishingService>;

function getUserId(authService: AuthService, authorization?: string) {
  if (!authorization?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
  return authService.verifyAccessToken(authorization.slice(7));
}

export function registerFishingRoutes(
  app: FastifyInstance,
  authService: AuthService,
  fishingService: FishingService,
): void {
  app.post('/api/v1/fishing/sessions', async request => {
    const userId = await getUserId(authService, request.headers.authorization);
    const input = startSchema.parse(request.body);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    return fishingService.start(userId, input.locationId, key);
  });

  app.post('/api/v1/fishing/sessions/:sessionId/complete', async request => {
    const userId = await getUserId(authService, request.headers.authorization);
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    return fishingService.complete(userId, params.sessionId);
  });
}
