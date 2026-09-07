import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readCsrfCookie } from '../auth/cookies.js';

type SecurityOptions = {
  allowedOrigins: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
};

export function registerSecurityHooks(app: FastifyInstance, options: SecurityOptions): void {
  const requests = new Map<string, { count: number; resetAt: number }>();

  const { allowedOrigins } = options;

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      if (allowedOrigins.includes('*')) {
        reply.header('access-control-allow-origin', '*');
      } else if (allowedOrigins.includes(origin)) {
        reply.header('access-control-allow-origin', origin);
        reply.header('vary', 'Origin');
      } else if (allowedOrigins.length > 0) {
        // An allowlist is configured and this origin is not on it.
        reply.header('vary', 'Origin');
        return reply.status(403).send({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' } });
      }
      // No allowlist configured: emit no ACAO — the browser enforces same-origin.
    }
    reply.header('access-control-allow-headers', 'authorization, content-type, idempotency-key, x-csrf-token');
    reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");

    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const csrfExempt = request.url === '/api/v1/auth/login' || request.url === '/api/v1/auth/register';
    const csrfCookie = readCsrfCookie(request);
    // Double-submit only defends real sessions: with no dbl_csrf cookie there is
    // nothing a browser attaches to forge, and the route's own auth returns 401.
    if (isMutation && request.url.startsWith('/api/v1/') && !csrfExempt && csrfCookie) {
      const header = request.headers['x-csrf-token'];
      if (typeof header !== 'string' || header !== csrfCookie) {
        return reply.status(403).send({ error: { code: 'CSRF_FAILED', message: 'CSRF token missing or invalid' } });
      }
    }

    const key = clientKey(request);
    const now = Date.now();
    const current = requests.get(key);
    if (!current || current.resetAt <= now) {
      requests.set(key, { count: 1, resetAt: now + options.rateLimitWindowMs });
      return;
    }
    current.count += 1;
    if (current.count > options.rateLimitMax) {
      reply.header('retry-after', Math.ceil((current.resetAt - now) / 1000));
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
    }
  });

  app.addHook('onResponse', async request => {
    if (request.url.startsWith('/api/v1/auth/')) {
      request.log.info({ event: 'auth_request', method: request.method, route: request.routeOptions.url }, 'Authentication request completed');
    }
  });
}

function clientKey(request: FastifyRequest): string {
  // request.ip already honours the app's trustProxy setting; never read
  // X-Forwarded-For directly or an untrusted client can spoof its bucket.
  return request.ip || 'unknown';
}
