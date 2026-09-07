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

  it('protects a normal authenticated mutation without X-CSRF-Token (Ruling F)', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/migration/local/preview',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      payload: { schemaVersion: 1, player: {} },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });

  it('lets the same mutation through with a matching X-CSRF-Token', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/migration/local/preview',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
      payload: { schemaVersion: 1, player: {} },
    });
    expect(res.statusCode).not.toBe(403);
  });

  it('a stale dbl_csrf at the legacy path does not permanently break mutations', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    expect(reg.statusCode).toBe(201);
    const setCookies = ([] as string[]).concat(reg.headers['set-cookie'] as string[]);

    // The register/login response must clear the pre-fix dbl_csrf at Path=/api so a
    // browser that authenticated before commit 6f754f5 self-heals on its next auth.
    expect(setCookies.some(c => /^dbl_csrf=;/.test(c) && /Path=\/api/i.test(c))).toBe(true);
    // ...while still setting the current dbl_csrf at Path=/.
    expect(setCookies.some(c => /^dbl_csrf=[^;]+;/.test(c) && /Path=\/(;|\s|$)/i.test(c))).toBe(true);

    // Once the legacy cookie is gone, a request carrying only the new cookie logs out cleanly.
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      headers: { cookie: `dbl_at=${jar.dbl_at}; dbl_csrf=${jar.dbl_csrf}`, 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(204);
  });

  it('skips CSRF when there is no dbl_csrf cookie (route auth still runs)', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_REFRESH_TOKEN');
  });
});
