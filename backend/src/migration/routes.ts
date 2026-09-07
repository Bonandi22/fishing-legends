import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { createMemoryMigrationService } from './memoryRepository.js';
import type { createPgMigrationService } from './pgRepository.js';
import { idempotencyKey } from '../http/idempotency.js';

type MigrationService = ReturnType<typeof createMemoryMigrationService> | ReturnType<typeof createPgMigrationService>;

// A local save (warehouse + aquarium history) can be larger than the default body.
const LOCAL_SAVE_BODY_LIMIT = 2 * 1024 * 1024;

// The envelope is validated in depth by the service (validateLocalSave); here it is
// just "some object".
const localSaveBody = z.object({}).passthrough();

export function registerMigrationRoutes(app: FastifyInstance, migration: MigrationService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/migration/local/preview', {
    schema: { tags: ['migration'], summary: 'Dry-run validation of a local save', body: localSaveBody },
    preHandler: app.requireAuth,
    bodyLimit: LOCAL_SAVE_BODY_LIMIT,
  }, async request => migration.preview(request.userId, request.body));

  r.post('/api/v1/migration/local/import', {
    schema: { tags: ['migration'], summary: 'Import a local save (once per user, needs Idempotency-Key)', body: localSaveBody },
    preHandler: app.requireAuth,
    bodyLimit: LOCAL_SAVE_BODY_LIMIT,
  }, async request => {
    const key = idempotencyKey(request.headers['idempotency-key']);
    return migration.import(request.userId, request.body, key);
  });
}
