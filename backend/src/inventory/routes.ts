import type { FastifyInstance } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { createMemoryInventoryService } from './service.js';
import type { createPgInventoryService } from './pgRepository.js';

type AuthService = ReturnType<typeof createAuthService>;
type InventoryService = ReturnType<typeof createMemoryInventoryService> | ReturnType<typeof createPgInventoryService>;

export function registerInventoryRoutes(app: FastifyInstance, auth: AuthService, inventory: InventoryService): void {
  app.get('/api/v1/inventory/warehouse', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    return inventory.list(await auth.verifyAccessToken(header.slice(7)));
  });

  app.post('/api/v1/inventory/warehouse/sell', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    return inventory.sell(await auth.verifyAccessToken(header.slice(7)), key);
  });
}
