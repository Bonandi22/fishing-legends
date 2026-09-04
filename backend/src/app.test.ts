// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { AppConfig } from './config/env.js';

const testConfig: AppConfig = {
  environment: 'test',
  host: '127.0.0.1',
  port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};

const apps = new Set<Awaited<ReturnType<typeof createApp>>>();

afterEach(async () => {
  await Promise.all([...apps].map(app => app.close()));
  apps.clear();
});

describe('backend foundation', () => {
  it('reports liveness without requiring a database', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'deep-blue-lure-api',
    });
  });

  it('reports readiness failure when the database is not configured', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe('not_ready');
  });

  it('registers and refreshes an account without exposing the password hash', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'angler@example.com',
        password: 'a-strong-password-123',
        username: 'angler_one',
        country: 'br',
      },
    });
    expect(registerResponse.statusCode).toBe(201);
    const registered = registerResponse.json();
    expect(registered.accessToken).toEqual(expect.any(String));
    expect(registered.refreshToken).toEqual(expect.any(String));
    expect(registered.user).not.toHaveProperty('passwordHash');

    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: registered.refreshToken },
    });

    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshResponse.json().refreshToken).not.toBe(registered.refreshToken);
  });

  it('rejects invalid registration input with a safe error', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'invalid', password: 'short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
    });
  });
});
