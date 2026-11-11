import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { memoryHandlesOf } from '../app.js';
import type { EmailMessage } from '../email/types.js';

type Creds = { email: string; password: string; username: string; country: string };

const DEFAULT: Creds = {
  email: `angler-${randomUUID()}@example.com`,
  password: 'a-very-strong-password-123',
  username: `a${randomUUID().replace(/-/g, '').slice(0, 12)}`,
  country: 'br',
};

/** The newest message enqueued to `email` on a memory-backed app. */
export function latestEmailTo(app: FastifyInstance, email: string): EmailMessage | undefined {
  const handles = memoryHandlesOf(app);
  if (!handles) throw new Error('latestEmailTo needs a memory-backed app');
  const to = email.trim().toLowerCase();
  return handles.outbox.messages().filter(m => m.to === to).at(-1);
}

/** The code from the newest code email enqueued to `email`. */
export function latestCodeFor(app: FastifyInstance, email: string): string {
  const code = latestEmailTo(app, email)?.payload.code;
  if (!code) throw new Error(`no code emailed to ${email}`);
  return code;
}

/** register -> verify-email; returns the verify-email response (which carries the session cookies). */
export async function registerSession(app: FastifyInstance, creds: Creds & { locale?: string }): Promise<InjectResponse> {
  const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
  if (reg.statusCode !== 202) throw new Error(`register failed: ${reg.statusCode} ${reg.body}`);
  return app.inject({
    method: 'POST', url: '/api/v1/auth/verify-email',
    payload: { challengeId: reg.json().challengeId, code: latestCodeFor(app, creds.email) },
  });
}

/** login -> login/verify; returns the login/verify response (which carries the session cookies). */
export async function loginSession(app: FastifyInstance, creds: { email: string; password: string }): Promise<InjectResponse> {
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: creds });
  if (login.statusCode !== 202) throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  return app.inject({
    method: 'POST', url: '/api/v1/auth/login/verify',
    payload: { challengeId: login.json().challengeId, code: latestCodeFor(app, creds.email) },
  });
}

export function jarFrom(setCookie: string | string[] | undefined): Record<string, string> {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const jar: Record<string, string> = {};
  for (const c of arr) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

export type AuthedClient = {
  userId: string;
  /** Raw access-token JWT lifted from the `dbl_at` cookie — for exercising the Bearer branch. */
  accessToken: string;
  request(opts: {
    method: string;
    url: string;
    payload?: unknown;
    idempotencyKey?: string;
    headers?: Record<string, string>;
  }): Promise<InjectResponse>;
  raw: FastifyInstance;
};

export async function registerAndAuth(
  app: FastifyInstance,
  overrides: Partial<Creds> = {},
): Promise<AuthedClient> {
  const creds: Creds = {
    ...DEFAULT,
    email: `angler-${randomUUID()}@example.com`,
    username: `a${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    ...overrides,
  };
  const reg = await registerSession(app, creds);
  if (reg.statusCode !== 200) throw new Error(`registerAndAuth failed: ${reg.statusCode} ${reg.body}`);

  let jar = jarFrom(reg.headers['set-cookie']);
  const me = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: jar });
  if (me.statusCode !== 200) throw new Error(`registerAndAuth /me failed: ${me.statusCode} ${me.body}`);
  const userId: string = me.json().user.userId;

  return {
    userId,
    raw: app,
    get accessToken(): string {
      return jar.dbl_at;
    },
    async request(opts) {
      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(opts.method.toUpperCase());
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (isMutation) {
        if (jar.dbl_csrf) headers['x-csrf-token'] = jar.dbl_csrf;
        if (opts.idempotencyKey ?? true) {
          headers['idempotency-key'] = opts.idempotencyKey ?? randomUUID();
        }
      }
      const res = await app.inject({
        method: opts.method as never,
        url: opts.url,
        payload: opts.payload as never,
        cookies: jar,
        headers,
      });
      jar = { ...jar, ...jarFrom(res.headers['set-cookie']) };
      return res;
    },
  };
}
