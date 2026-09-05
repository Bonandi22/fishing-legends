import type { FastifyInstance } from 'fastify';
import type { createMemorySeasonsService } from './service.js';
import type { createPgSeasonsService } from './pgRepository.js';

type SeasonsService = ReturnType<typeof createMemorySeasonsService> | ReturnType<typeof createPgSeasonsService>;

export function registerSeasonsRoutes(app: FastifyInstance, seasons: SeasonsService): void {
  app.get('/api/v1/seasons/current', { preHandler: app.requireAuth }, async () => seasons.current());
}
