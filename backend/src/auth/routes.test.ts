// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000,
  authRateLimitMax: 1000, authRateLimitWindowMs: 300_000, trustProxy: false,
  cookieSecure: false,
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });

async function app() { const a = await createApp({ config }); apps.add(a); return a; }

const creds = { email: 'a@example.com', password: 'a-very-strong-password', username: 'angler_one', country: 'br' };

function cookieJar(setCookie: string | string[] | undefined): Record<string, string> {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const jar: Record<string, string> = {};
  for (const c of arr) { const [pair] = c.split(';'); const [k, v] = pair.split('='); jar[k] = v; }
  return jar;
}

/** Asserts the response clears dbl_at, dbl_rt and dbl_csrf. */
function expectCleared(setCookie: string | string[] | undefined): void {
  const joined = (Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []).join(';');
  expect(joined).toMatch(/dbl_at=;/);
  expect(joined).toMatch(/dbl_rt=;/);
  expect(joined).toMatch(/dbl_csrf=;/);
}

describe('auth routes with cookies', () => {
  it('register sets dbl_at, dbl_rt, dbl_csrf and returns only { user }', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ user: expect.objectContaining({ email: 'a@example.com', username: 'angler_one' }) });
    expect(res.json()).not.toHaveProperty('accessToken');
    const jar = cookieJar(res.headers['set-cookie']);
    expect(jar.dbl_at).toEqual(expect.any(String));
    expect(jar.dbl_rt).toEqual(expect.any(String));
    expect(jar.dbl_csrf).toEqual(expect.any(String));
  });

  it('refresh reads the dbl_rt cookie and re-emits cookies (204)', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/refresh',
      cookies: { dbl_rt: jar.dbl_rt, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(204);
    const next = cookieJar(res.headers['set-cookie']);
    expect(next.dbl_rt).toEqual(expect.any(String));
    expect(next.dbl_rt).not.toBe(jar.dbl_rt);
  });

  it('refresh without a cookie is 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('a failed refresh clears all three cookies (I3)', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    // Rotate once, then replay the now-stale token to force REFRESH_TOKEN_REUSED.
    await a.inject({
      method: 'POST', url: '/api/v1/auth/refresh',
      cookies: { dbl_rt: jar.dbl_rt, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/refresh',
      cookies: { dbl_rt: jar.dbl_rt, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expectCleared(res.headers['set-cookie']);
  });

  it('a refresh with no cookie at all still clears the cookies (I3)', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expectCleared(res.headers['set-cookie']);
  });

  it('logout clears the cookies', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(204);
    expectCleared(res.headers['set-cookie']);
  });

  it('logout succeeds without an access token (expired/absent dbl_at) (C3)', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_rt: jar.dbl_rt, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(204);
    expectCleared(res.headers['set-cookie']);
  });

  it('logout with a garbage access token still 204s and clears (C3)', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_at: 'not.a.jwt', dbl_rt: jar.dbl_rt, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(204);
    expectCleared(res.headers['set-cookie']);
  });

  it('requireAuth accepts a Bearer token with no cookies at all (I5)', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    // The dbl_at cookie value IS the raw access-token JWT.
    const me = await a.inject({
      method: 'GET', url: '/api/v1/me',
      headers: { authorization: `Bearer ${jar.dbl_at}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: 'a@example.com' });
  });
});
