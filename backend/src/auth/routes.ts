import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { loginSchema, registerSchema } from './schemas.js';
import type { createAuthService } from './service.js';
import { setAuthCookies, clearAuthCookies, readAccessToken, readRefreshToken, type CookieConfig } from './cookies.js';

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
    // Any failure means the browser is holding a token the server will never accept
    // again. Clear the cookies so it stops replaying it for the rest of the 30-day TTL.
    if (!token) {
      clearAuthCookies(reply, cookieCfg);
      throw new Error('INVALID_REFRESH_TOKEN');
    }
    let result;
    try {
      result = await service.refresh(token);
    } catch (error) {
      clearAuthCookies(reply, cookieCfg);
      throw error;
    }
    setAuthCookies(reply, result, cookieCfg);
    return reply.status(204).send();
  });

  // No `requireAuth`: logging out must work with an expired access token, otherwise
  // an idle tab 401s here, the cookies survive, and the next /me silently re-logs in.
  // Still CSRF-protected — the hook in security/http.ts covers POST /api/v1/auth/*.
  r.post('/api/v1/auth/logout', {
    schema: { tags: ['auth'], summary: 'Revoke the current session' },
  }, async (request, reply) => {
    // Best effort: a bad, expired or missing token must never fail the request.
    const accessToken = readAccessToken(request) ?? bearer(request.headers.authorization);
    if (accessToken) {
      try {
        const { sessionId } = await service.verifyAccessToken(accessToken);
        if (sessionId) await service.logout(sessionId);
      } catch {
        // Expired/tampered access token — fall through and just clear the cookies.
        // Known limitation: the auth repository exposes no non-rotating way to
        // resolve a session from a refresh token, so when only `dbl_rt` is present
        // the server-side family stays live until it expires. It is unreachable
        // once the cookies are cleared here, and the refresh route now clears them
        // too, so the browser cannot replay it. Revisit if refresh-token revocation
        // by hash is added.
      }
    }
    clearAuthCookies(reply, cookieCfg);
    return reply.status(204).send();
  });
}

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
