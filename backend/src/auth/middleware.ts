import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { createAuthService } from './service.js';

type AuthService = ReturnType<typeof createAuthService>;

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated user id, populated by the `requireAuth` preHandler. */
    userId: string;
  }
  interface FastifyInstance {
    /** preHandler that verifies the bearer access token and sets `request.userId`. */
    requireAuth: preHandlerHookHandler;
  }
}

export function createRequireAuth(authService: AuthService): preHandlerHookHandler {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('INVALID_ACCESS_TOKEN');
    request.userId = await authService.verifyAccessToken(header.slice(7));
  };
}
