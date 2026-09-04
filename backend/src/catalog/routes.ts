import type { FastifyInstance } from 'fastify';
import type { createCatalogService } from './service.js';

export function registerCatalogRoutes(
  app: FastifyInstance,
  catalogService: ReturnType<typeof createCatalogService>,
): void {
  app.get('/api/v1/catalog', async () => catalogService.getPublicCatalog());
}
