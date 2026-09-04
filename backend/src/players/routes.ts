import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { createAuthService } from '../auth/service.js';
import type { PlayerRepository } from './types.js';

type AuthService = ReturnType<typeof createAuthService>;

export function registerPlayerRoutes(app: FastifyInstance, authService: AuthService, repository: PlayerRepository): void {
  app.get('/api/v1/me', async (request: FastifyRequest) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    const userId = await authService.verifyAccessToken(authorization.slice(7));
    const profile = await repository.getProfile(userId);
    if (!profile) throw new Error('INVALID_ACCESS_TOKEN');
    return { user: profile };
  });
}
