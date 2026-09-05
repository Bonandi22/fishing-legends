import type { FastifyInstance } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { createMemoryMigrationService } from './memoryRepository.js';
import type { createPgMigrationService } from './pgRepository.js';

type AuthService = ReturnType<typeof createAuthService>;
type MigrationService = ReturnType<typeof createMemoryMigrationService> | ReturnType<typeof createPgMigrationService>;

export function registerMigrationRoutes(app: FastifyInstance, auth: AuthService, migration: MigrationService): void {
  async function userId(request: { headers: { authorization?: string } }) {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    return auth.verifyAccessToken(header.slice(7));
  }

  app.post('/api/v1/migration/local/preview', async request => migration.preview(await userId(request), request.body));
  app.post('/api/v1/migration/local/import', async request => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    return migration.import(await userId(request), request.body, key);
  });
}
