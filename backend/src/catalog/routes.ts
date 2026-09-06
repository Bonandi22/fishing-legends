import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { createCatalogService } from './service.js';

export function registerCatalogRoutes(
  app: FastifyInstance,
  catalogService: ReturnType<typeof createCatalogService>,
): void {
  app.withTypeProvider<ZodTypeProvider>().get('/api/v1/catalog', {
    schema: { tags: ['catalog'], summary: 'Public fish and location catalogue' },
  }, async () => catalogService.getPublicCatalog());
}
