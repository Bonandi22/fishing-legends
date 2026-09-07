// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, trustProxy: false, cookieSecure: false,
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });
async function app() { const a = await createApp({ config }); apps.add(a); return a; }
function cookieJar(sc: string | string[] | undefined): Record<string, string> {
  const arr = Array.isArray(sc) ? sc : sc ? [sc] : [];
  const jar: Record<string, string> = {};
  for (const c of arr) { const [p] = c.split(';'); const [k, v] = p.split('='); jar[k] = v; }
  return jar;
}
const creds = { email: 'c@example.com', password: 'a-very-strong-password', username: 'csrf_user', country: 'br' };

describe('CSRF double-submit', () => {
  it('rejects a mutating request without X-CSRF-Token', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });

  it('rejects a mismatched X-CSRF-Token', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': 'wrong' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepts a matching X-CSRF-Token', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(204);
  });

  it('does not require CSRF for login or register', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    expect(res.statusCode).toBe(201);
  });

  it('does not require CSRF for GET', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/v1/catalog' });
    expect(res.statusCode).toBe(200);
  });

  it('skips CSRF when there is no dbl_csrf cookie (route auth still runs)', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_REFRESH_TOKEN');
  });
});
