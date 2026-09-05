import type { FastifyInstance } from 'fastify';
import type { createMemoryMigrationService } from './memoryRepository.js';
import type { createPgMigrationService } from './pgRepository.js';

type MigrationService = ReturnType<typeof createMemoryMigrationService> | ReturnType<typeof createPgMigrationService>;

// A local save (warehouse + aquarium history) can be larger than the default body.
const LOCAL_SAVE_BODY_LIMIT = 2 * 1024 * 1024;

export function registerMigrationRoutes(app: FastifyInstance, migration: MigrationService): void {
  app.post('/api/v1/migration/local/preview', { preHandler: app.requireAuth, bodyLimit: LOCAL_SAVE_BODY_LIMIT }, async request =>
    migration.preview(request.userId, request.body));

  app.post('/api/v1/migration/local/import', { preHandler: app.requireAuth, bodyLimit: LOCAL_SAVE_BODY_LIMIT }, async request => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
    return migration.import(request.userId, request.body, key);
  });
}
