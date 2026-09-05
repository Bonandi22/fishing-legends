import type { FastifyInstance } from 'fastify';
import { loginSchema, refreshSchema, registerSchema } from './schemas.js';
import type { createAuthService } from './service.js';

type AuthService = ReturnType<typeof createAuthService>;

export async function registerAuthRoutes(app: FastifyInstance, service: AuthService): Promise<void> {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const result = await service.register(input);
    return reply.status(201).send({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        country: result.user.country,
      },
    });
  });

  app.post('/api/v1/auth/login', async (request) => {
    const input = loginSchema.parse(request.body);
    const result = await service.login(input);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        country: result.user.country,
      },
    };
  });

  app.post('/api/v1/auth/refresh', async (request) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const result = await service.refresh(refreshToken);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  });

  app.post('/api/v1/auth/logout', { preHandler: app.requireAuth }, async (request, reply) => {
    if (request.sessionId) await service.logout(request.sessionId);
    return reply.status(204).send();
  });
}
