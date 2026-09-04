import type { FastifyInstance } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { createMemoryEconomyService } from './service.js';
import type { createPgEconomyService } from './pgRepository.js';
import { z } from 'zod';

type AuthService = ReturnType<typeof createAuthService>;
type EconomyService = ReturnType<typeof createMemoryEconomyService> | ReturnType<typeof createPgEconomyService>;

export function registerEconomyRoutes(app: FastifyInstance, auth: AuthService, economy: EconomyService): void {
  app.get('/api/v1/wallet', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    const userId = await auth.verifyAccessToken(header.slice(7));
    return economy.getBalance(userId);
  });

  app.post('/api/v1/economy/nets/purchase', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    const body = z.object({ quantity: z.number().int().min(1).max(10) }).parse(request.body);
    return economy.purchaseNets(await auth.verifyAccessToken(header.slice(7)), body.quantity, key);
  });

  app.post('/api/v1/economy/multipliers/purchase', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    const body = z.object({
      type: z.enum(['luck', 'strength']),
      power: z.union([z.literal(2), z.literal(4)]),
    }).parse(request.body);
    return economy.purchaseMultiplier(await auth.verifyAccessToken(header.slice(7)), body.type, body.power, key);
  });
}
