import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { createMemorySeasonsService } from './service.js';
import type { createPgSeasonsService } from './pgRepository.js';

type SeasonsService = ReturnType<typeof createMemorySeasonsService> | ReturnType<typeof createPgSeasonsService>;

export function registerSeasonsRoutes(app: FastifyInstance, seasons: SeasonsService): void {
  app.withTypeProvider<ZodTypeProvider>().get('/api/v1/seasons/current', {
    schema: { tags: ['seasons'], summary: 'The active season, if any' },
    preHandler: app.requireAuth,
  }, async () => seasons.current());
}
