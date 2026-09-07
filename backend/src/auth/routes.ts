import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { loginSchema, registerSchema } from './schemas.js';
import type { createAuthService } from './service.js';
import { setAuthCookies, clearAuthCookies, readRefreshToken, type CookieConfig } from './cookies.js';

type AuthService = ReturnType<typeof createAuthService>;

const userSchema = z.object({ id: z.string(), email: z.string(), username: z.string(), country: z.string() });
const sessionSchema = z.object({ user: userSchema });

function pickUser(u: { id: string; email: string; username: string; country: string }) {
  return { id: u.id, email: u.email, username: u.username, country: u.country };
}

export async function registerAuthRoutes(app: FastifyInstance, service: AuthService, cookieCfg: CookieConfig): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/auth/register', {
    schema: { tags: ['auth'], summary: 'Create an account', body: registerSchema, response: { 201: sessionSchema } },
  }, async (request, reply) => {
    const result = await service.register(request.body);
    setAuthCookies(reply, result, cookieCfg);
    return reply.status(201).send({ user: pickUser(result.user) });
  });

  r.post('/api/v1/auth/login', {
    schema: { tags: ['auth'], summary: 'Start an authenticated session', body: loginSchema, response: { 200: sessionSchema } },
  }, async (request, reply) => {
    const result = await service.login(request.body);
    setAuthCookies(reply, result, cookieCfg);
    return reply.status(200).send({ user: pickUser(result.user) });
  });

  r.post('/api/v1/auth/refresh', {
    schema: { tags: ['auth'], summary: 'Rotate the session' },
  }, async (request, reply) => {
    const token = readRefreshToken(request);
    if (!token) throw new Error('INVALID_REFRESH_TOKEN');
    const result = await service.refresh(token);
    setAuthCookies(reply, result, cookieCfg);
    return reply.status(204).send();
  });

  r.post('/api/v1/auth/logout', {
    schema: { tags: ['auth'], summary: 'Revoke the current session' },
    preHandler: app.requireAuth,
  }, async (request, reply) => {
    if (request.sessionId) await service.logout(request.sessionId);
    clearAuthCookies(reply, cookieCfg);
    return reply.status(204).send();
  });
}
