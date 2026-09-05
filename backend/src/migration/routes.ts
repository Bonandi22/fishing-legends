import type { FastifyInstance } from 'fastify';
import type { createMemoryMigrationService } from './memoryRepository.js';
import type { createPgMigrationService } from './pgRepository.js';

type MigrationService = ReturnType<typeof createMemoryMigrationService> | ReturnType<typeof createPgMigrationService>;

export function registerMigrationRoutes(app: FastifyInstance, migration: MigrationService): void {
  app.post('/api/v1/migration/local/preview', { preHandler: app.requireAuth }, async request =>
    migration.preview(request.userId, request.body));

  app.post('/api/v1/migration/local/import', { preHandler: app.requireAuth }, async request => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    return migration.import(request.userId, request.body, key);
  });
}
