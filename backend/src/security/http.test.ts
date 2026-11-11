// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';

const baseConfig: AppConfig = {
  environment: 'test',
  host: '127.0.0.1',
  port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [],
  rateLimitMax: 2,
  rateLimitWindowMs: 60_000,
  authRateLimitMax: 50,
  authRateLimitWindowMs: 300_000,
  trustProxy: false,
  cookieSecure: false, email: { smtp: { host: 'localhost', port: 1025, secure: false }, from: 'test@localhost' }, authCodes: { secret: new Uint8Array(32), ttlSeconds: 1800, maxAttempts: 5, resendCooldownSeconds: 60 },
};

const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => {
  await Promise.all([...apps].map(app => app.close()));
  apps.clear();
});

describe('CORS', () => {
  it('does not reflect an arbitrary Origin when no allowlist is configured', async () => {
    const app = await createApp({ config: baseConfig });
    apps.add(app);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('echoes an allowed Origin and rejects a disallowed one', async () => {
    const app = await createApp({ config: { ...baseConfig, corsOrigins: ['https://app.example'] } });
    apps.add(app);

    const allowed = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://app.example' } });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example');

    const denied = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.example' } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('honours a wildcard allowlist', async () => {
    const app = await createApp({ config: { ...baseConfig, corsOrigins: ['*'] } });
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://anything.example' } });
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('rate limiting', () => {
  it('cannot be bypassed by spoofing X-Forwarded-For when no proxy is trusted', async () => {
    const app = await createApp({ config: baseConfig });
    apps.add(app);

    const first = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '1.1.1.1' } });
    const second = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '2.2.2.2' } });
    const third = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '3.3.3.3' } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe('RATE_LIMITED');
  });

  it('applies a tighter dedicated bucket to auth POSTs, separate from the general one', async () => {
    const app = await createApp({
      config: { ...baseConfig, rateLimitMax: 100, authRateLimitMax: 3, authRateLimitWindowMs: 300_000 },
    });
    apps.add(app);

    const login = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nobody@example.test', password: 'wrong-password' },
      });

    expect((await login()).statusCode).toBe(401);
    expect((await login()).statusCode).toBe(401);
    expect((await login()).statusCode).toBe(401);

    const limited = await login();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');

    // A different route is still served — the auth bucket is its own.
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });

  it('separates buckets by forwarded client IP when a proxy is trusted', async () => {
    const app = await createApp({ config: { ...baseConfig, trustProxy: true } });
    apps.add(app);

    const a1 = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '1.1.1.1' } });
    const a2 = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '1.1.1.1' } });
    const a3 = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '1.1.1.1' } });
    const b1 = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '9.9.9.9' } });

    expect(a1.statusCode).toBe(200);
    expect(a2.statusCode).toBe(200);
    expect(a3.statusCode).toBe(429);
    expect(b1.statusCode).toBe(200);
  });
});

describe('auth rate-limit bucket matches the routed path, not the raw URL', () => {
  const authApp = async () => {
    const app = await createApp({ config: { ...baseConfig, rateLimitMax: 1000, authRateLimitMax: 2 } });
    apps.add(app);
    return app;
  };

  it('percent-encoded login (/api/v1/auth/l%6Fgin) is still in the auth bucket', async () => {
    const app = await authApp();
    const hit = () => app.inject({ method: 'POST', url: '/api/v1/auth/l%6Fgin', payload: { email: 'nobody@example.test', password: 'wrong-password' } });
    expect((await hit()).statusCode).toBe(401); // reaches the login handler
    expect((await hit()).statusCode).toBe(401);
    const third = await hit();
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe('RATE_LIMITED');
  });

  it('percent-encoded verify-email (/api/v1/auth/verify%2Demail) is still in the auth bucket', async () => {
    const app = await authApp();
    const hit = () => app.inject({ method: 'POST', url: '/api/v1/auth/verify%2Demail', payload: { challengeId: crypto.randomUUID(), code: '123456' } });
    expect((await hit()).statusCode).toBe(404); // CHALLENGE_NOT_FOUND from the handler
    expect((await hit()).statusCode).toBe(404);
    expect((await hit()).statusCode).toBe(429);
  });

  it('a query-string variant stays covered, and variants share one bucket', async () => {
    const app = await authApp();
    const body = { email: 'nobody@example.test', password: 'wrong-password' };
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login?a=1', payload: body })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/l%6Fgin', payload: body })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: body })).statusCode).toBe(429);
  });

  it('CSRF still applies to an encoded /api path when a dbl_csrf cookie is present', async () => {
    const app = await authApp();
    const res = await app.inject({ method: 'POST', url: '/%61pi/v1/auth/logout', cookies: { dbl_csrf: 'abc' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });

  it('an encoded login is not CSRF-exempt (exemption is never widened)', async () => {
    const app = await authApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/l%6Fgin', cookies: { dbl_csrf: 'abc' },
      payload: { email: 'nobody@example.test', password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(403);
  });
});
