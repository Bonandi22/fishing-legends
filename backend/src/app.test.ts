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

  it('returns the authenticated player profile and rejects missing credentials', async () => {
      const app = createApp({ config: testConfig });
      apps.add(app);
      const registration = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'profile@example.com',
          password: 'a-strong-password-123',
          username: 'profile_user',
          country: 'pt',
        },
      });
      const token = registration.json().accessToken;
      const profile = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(profile.statusCode).toBe(200);
      expect(profile.json().user.level).toBe(1);

      const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/me' });
      expect(unauthorized.statusCode).toBe(401);
  });

  it('serves a validated public catalog', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe('local-v1');
    expect(response.json().fish.length).toBeGreaterThan(0);
    expect(response.json().locations.length).toBeGreaterThan(0);
  });

  it('creates an idempotent fishing session and completes it server-side', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'fisher@example.com',
        password: 'a-strong-password-123',
        username: 'fisher_user',
        country: 'br',
      },
    });
    const token = registration.json().accessToken;
    const headers = { authorization: `Bearer ${token}`, 'idempotency-key': 'fishing-key-123456' };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/fishing/sessions',
      headers,
      payload: { locationId: 'amazon' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/fishing/sessions',
      headers,
      payload: { locationId: 'amazon' },
    });
    expect(first.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);

    const completed = await app.inject({
      method: 'POST',
      url: `/api/v1/fishing/sessions/${first.json().id}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().result.fishId).toEqual(expect.any(String));
    expect(completed.json().result.weight).toBeGreaterThan(0);
  });

  it('exposes a server-owned wallet balance', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'wallet@example.com',
        password: 'a-strong-password-123',
        username: 'wallet_user',
        country: 'br',
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
      headers: { authorization: `Bearer ${registration.json().accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ balance: 0 });
  });

  it('exposes an authenticated warehouse and rejects an empty sale', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'warehouse@example.com',
        password: 'a-strong-password-123',
        username: 'warehouse_user',
        country: 'br',
      },
    });
    const headers = { authorization: `Bearer ${registration.json().accessToken}` };
    const list = await app.inject({ method: 'GET', url: '/api/v1/inventory/warehouse', headers });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ items: [] });
    const sale = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/warehouse/sell',
      headers: { ...headers, 'idempotency-key': 'warehouse-sale-123456' },
    });
    expect(sale.statusCode).toBe(422);
    const aquarium = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory/aquarium/1',
      headers,
    });
    expect(aquarium.statusCode).toBe(200);
    expect(aquarium.json()).toEqual({ items: [] });
    const placement = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory/aquarium',
      headers,
      payload: { warehouseItemId: '00000000-0000-0000-0000-000000000000', sector: 1 },
    });
    expect(placement.statusCode).toBe(404);
    expect(placement.json().error.code).toBe('WAREHOUSE_FISH_NOT_FOUND');
  });
});
