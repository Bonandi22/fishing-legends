import type { FastifyInstance } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { createMemoryEconomyService } from './service.js';
import type { createPgEconomyService } from './pgRepository.js';

type AuthService = ReturnType<typeof createAuthService>;
type EconomyService = ReturnType<typeof createMemoryEconomyService> | ReturnType<typeof createPgEconomyService>;

export function registerEconomyRoutes(app: FastifyInstance, auth: AuthService, economy: EconomyService): void {
  app.get('/api/v1/wallet', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    const userId = await auth.verifyAccessToken(header.slice(7));
    return economy.getBalance(userId);
  });
}
