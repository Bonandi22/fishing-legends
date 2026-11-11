import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { challengeResponseSchema, forgotPasswordSchema, resetPasswordSchema, loginSchema, registerSchema, resendSchema, verifyCodeSchema } from './schemas.js';
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

  // Registration and login never issue a session directly: they answer with a
  // challenge, and the session comes from verifying the emailed code. Register
  // answers the same way whether or not the email is already registered.
  r.post('/api/v1/auth/register', {
    schema: { tags: ['auth'], summary: 'Create an account (emails a confirmation code)', body: registerSchema, response: { 202: challengeResponseSchema } },
  }, async (request, reply) => {
    return reply.status(202).send(await service.register(request.body));
  });

  r.post('/api/v1/auth/verify-email', {
    schema: { tags: ['auth'], summary: 'Confirm the email with the code and start a session', body: verifyCodeSchema, response: { 200: sessionSchema } },
  }, async (request, reply) => {
    const result = await service.verifyEmail(request.body);
    setAuthCookies(reply, result, cookieCfg);
    return reply.status(200).send({ user: pickUser(result.user) });
  });

  r.post('/api/v1/auth/login', {
    schema: { tags: ['auth'], summary: 'Check the password (emails a login code)', body: loginSchema, response: { 202: challengeResponseSchema } },
  }, async (request, reply) => {
    return reply.status(202).send(await service.login(request.body));
  });

  r.post('/api/v1/auth/login/verify', {
    schema: { tags: ['auth'], summary: 'Verify the login code and start a session', body: verifyCodeSchema, response: { 200: sessionSchema } },
  }, async (request, reply) => {
    const result = await service.verifyLogin(request.body);
    setAuthCookies(reply, result, cookieCfg);
    return reply.status(200).send({ user: pickUser(result.user) });
  });

  r.post('/api/v1/auth/challenges/resend', {
    schema: { tags: ['auth'], summary: 'Send a new code for a pending challenge', body: resendSchema, response: { 202: challengeResponseSchema } },
  }, async (request, reply) => {
    return reply.status(202).send(await service.resendChallenge(request.body.challengeId));
  });

  r.post('/api/v1/auth/password/forgot', {
    schema: { tags: ['auth'], summary: 'Email a password reset code (same answer for any address)', body: forgotPasswordSchema, response: { 202: challengeResponseSchema } },
  }, async (request, reply) => {
    return reply.status(202).send(await service.forgotPassword(request.body));
  });

  // Never authenticates: the user logs in afterwards, with the new password and a login code.
  r.post('/api/v1/auth/password/reset', {
    schema: { tags: ['auth'], summary: 'Set a new password with the emailed code and revoke all sessions', body: resetPasswordSchema },
  }, async (request, reply) => {
    await service.resetPassword(request.body);
    return reply.status(204).send();
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
