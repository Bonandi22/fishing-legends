import type { FastifyInstance } from 'fastify';
import type { PlayerRepository } from './types.js';

export function registerPlayerRoutes(app: FastifyInstance, repository: PlayerRepository): void {
  app.get('/api/v1/me', { preHandler: app.requireAuth }, async request => {
    const profile = await repository.getProfile(request.userId);
    if (!profile) throw new Error('INVALID_ACCESS_TOKEN');
    return { user: profile };
  });
}
