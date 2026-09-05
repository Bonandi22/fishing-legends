import type { FastifyInstance } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { createMemorySeasonsService } from './service.js';
import type { createPgSeasonsService } from './pgRepository.js';

type SeasonsService = ReturnType<typeof createMemorySeasonsService> | ReturnType<typeof createPgSeasonsService>;

export function registerSeasonsRoutes(
  app: FastifyInstance,
  auth: ReturnType<typeof createAuthService>,
  seasons: SeasonsService,
): void {
  app.get('/api/v1/seasons/current', async request => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    return seasons.current();
  });
  void auth;
}
