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
  corsOrigins: [],
  rateLimitMax: 120,
  rateLimitWindowMs: 60_000,
  trustProxy: false,
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
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
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

  it('detects a reused refresh token and revokes the session family', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);

    const registered = (await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'reuse@example.com', password: 'a-strong-password-123', username: 'reuse_user', country: 'br' },
    })).json();

    const rotated = (await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: registered.refreshToken },
    })).json();

    // Replaying the original token is a reuse.
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: registered.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().error.code).toBe('REFRESH_TOKEN_REUSED');

    // The token issued by the legitimate rotation is now dead too.
    const afterReuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: rotated.refreshToken },
    });
    expect(afterReuse.statusCode).toBe(401);
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

    // The catch is reflected in the player's progress (same as the PostgreSQL path)
    const profile = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(profile.json().user.totalFishCaught).toBe(1);
    expect(profile.json().user.xp > 0 || profile.json().user.level > 1).toBe(true);
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

  it('rejects a net purchase when the net limit is already reached', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'nets@example.com',
        password: 'a-strong-password-123',
        username: 'nets_user',
        country: 'br',
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/economy/nets/purchase',
      headers: {
        authorization: `Bearer ${registration.json().accessToken}`,
        'idempotency-key': 'nets-purchase-123456',
      },
      payload: { quantity: 1 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NET_LIMIT_REACHED');
  });

  it('rejects a multiplier purchase without wallet funds', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'multiplier@example.com',
        password: 'a-strong-password-123',
        username: 'multiplier_user',
        country: 'br',
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/economy/multipliers/purchase',
      headers: {
        authorization: `Bearer ${registration.json().accessToken}`,
        'idempotency-key': 'multiplier-purchase-123',
      },
      payload: { type: 'luck', power: 2 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('returns an authenticated paginated leaderboard', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'ranking@example.com',
        password: 'a-strong-password-123',
        username: 'ranking_user',
        country: 'br',
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/leaderboard?limit=10&offset=0',
      headers: { authorization: `Bearer ${registration.json().accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().season).toBe('all-time');
    expect(response.json().entries[0].username).toBe('ranking_user');
  });

  it('claims a daily reward only once', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'rewards@example.com',
        password: 'a-strong-password-123',
        username: 'rewards_user',
        country: 'br',
      },
    });
    const headers = { authorization: `Bearer ${registration.json().accessToken}` };
    const first = await app.inject({ method: 'POST', url: '/api/v1/rewards/daily/claim', headers });
    const second = await app.inject({ method: 'POST', url: '/api/v1/rewards/daily/claim', headers });
    expect(first.statusCode).toBe(200);
    expect(first.json().claimed).toBe(true);
    expect(first.json().day).toBe(1);
    expect(second.json().claimed).toBe(false);
    expect(second.json().balance).toBe(first.json().balance);
  });

  it('returns the active authenticated season', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'season@example.com',
        password: 'a-strong-password-123',
        username: 'season_user',
        country: 'br',
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/seasons/current',
      headers: { authorization: `Bearer ${registration.json().accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().season.status).toBe('active');
  });

  it('rejects the season endpoint without a valid access token', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);

    const missing = await app.inject({ method: 'GET', url: '/api/v1/seasons/current' });
    expect(missing.statusCode).toBe(401);

    const bogus = await app.inject({
      method: 'GET',
      url: '/api/v1/seasons/current',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(bogus.statusCode).toBe(401);
  });
});
