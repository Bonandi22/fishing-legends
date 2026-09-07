import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

type Creds = { email: string; password: string; username: string; country: string };

const DEFAULT: Creds = {
  email: `angler-${randomUUID()}@example.com`,
  password: 'a-very-strong-password-123',
  username: `a${randomUUID().replace(/-/g, '').slice(0, 12)}`,
  country: 'br',
};

function jarFrom(setCookie: string | string[] | undefined): Record<string, string> {
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
  const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
  if (reg.statusCode !== 201) throw new Error(`registerAndAuth failed: ${reg.statusCode} ${reg.body}`);

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
