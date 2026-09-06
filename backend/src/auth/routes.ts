import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { loginSchema, refreshSchema, registerSchema } from './schemas.js';
import type { createAuthService } from './service.js';

type AuthService = ReturnType<typeof createAuthService>;

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  country: z.string(),
});
const tokenPairSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });
const sessionSchema = tokenPairSchema.extend({ user: userSchema });

export async function registerAuthRoutes(app: FastifyInstance, service: AuthService): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/auth/register', {
    schema: { tags: ['auth'], summary: 'Create an account', body: registerSchema, response: { 201: sessionSchema } },
  }, async (request, reply) => {
    const result = await service.register(request.body);
    return reply.status(201).send({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: pickUser(result.user),
    });
  });

  r.post('/api/v1/auth/login', {
    schema: { tags: ['auth'], summary: 'Start an authenticated session', body: loginSchema, response: { 200: sessionSchema } },
  }, async (request) => {
    const result = await service.login(request.body);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: pickUser(result.user) };
  });

  r.post('/api/v1/auth/refresh', {
    schema: { tags: ['auth'], summary: 'Rotate the refresh token', body: refreshSchema, response: { 200: tokenPairSchema } },
  }, async (request) => {
    const result = await service.refresh(request.body.refreshToken);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  });

  r.post('/api/v1/auth/logout', {
    schema: { tags: ['auth'], summary: 'Revoke the current session' },
    preHandler: app.requireAuth,
  }, async (request, reply) => {
    if (request.sessionId) await service.logout(request.sessionId);
    return reply.status(204).send();
  });
}

function pickUser(user: { id: string; email: string; username: string; country: string }) {
  return { id: user.id, email: user.email, username: user.username, country: user.country };
}
