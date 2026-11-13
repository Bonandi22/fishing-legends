import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { createAuthService } from './service.js';
import { readAccessToken } from './cookies.js';

type AuthService = ReturnType<typeof createAuthService>;

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated user id, populated by the `requireAuth` preHandler. */
    userId: string;
    /** Session id from the access token (`sid`), when present. */
    sessionId?: string;
    /** Whether the authenticated account is an admin, populated by `requireAuth`. */
    isAdmin: boolean;
  }
  interface FastifyInstance {
    /**
     * preHandler that verifies the access token (cookie, then Bearer), rejects
     * suspended/banned accounts, and sets `request.userId` and `request.isAdmin`.
     */
    requireAuth: preHandlerHookHandler;
  }
}

export function createRequireAuth(authService: AuthService): preHandlerHookHandler {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    const cookieToken = readAccessToken(request);
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = cookieToken ?? bearer;
    if (!token) throw new Error('INVALID_ACCESS_TOKEN');
    const { userId, sessionId } = await authService.verifyAccessToken(token);
    const { isAdmin } = await authService.assertActive(userId);
    request.userId = userId;
    request.sessionId = sessionId;
    request.isAdmin = isAdmin;
  };
}
