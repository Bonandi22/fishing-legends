import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PlayerRepository } from './types.js';

export function registerPlayerRoutes(app: FastifyInstance, repository: PlayerRepository): void {
  app.withTypeProvider<ZodTypeProvider>().get('/api/v1/me', {
    schema: { tags: ['players'], summary: 'Current player profile and progress' },
    preHandler: app.requireAuth,
  }, async request => {
    const profile = await repository.getProfile(request.userId);
    if (!profile) throw new Error('INVALID_ACCESS_TOKEN');
    return { user: profile };
  });
}
