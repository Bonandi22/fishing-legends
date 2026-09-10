// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { AppConfig } from './config/env.js';
import { registerAndAuth } from './testing/authClient.js';

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
  authRateLimitMax: 1000,
  authRateLimitWindowMs: 300_000,
  trustProxy: false,
  cookieSecure: false,
};

const apps = new Set<Awaited<ReturnType<typeof createApp>>>();

afterEach(async () => {
  await Promise.all([...apps].map(app => app.close()));
  apps.clear();
});

/** Parse a `Set-Cookie` response header into a name -> value jar. */
function cookieJar(res: { headers: Record<string, unknown> }): Record<string, string> {
  const raw = res.headers['set-cookie'];
  const arr = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const jar: Record<string, string> = {};
  for (const entry of arr) {
    const [pair] = entry.split(';');
    const eq = pair.indexOf('=');
    if (eq >= 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

describe('backend foundation', () => {
  it('reports liveness without requiring a database', async () => {
    const app = await createApp({ config: testConfig });
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
    const app = await createApp({ config: testConfig });
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe('not_ready');
  });

  it('registers and refreshes an account without exposing the password hash', async () => {
    const app = await createApp({ config: testConfig });
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
    expect(registered).not.toHaveProperty('accessToken');
    expect(registered).not.toHaveProperty('refreshToken');
    expect(registered.user).not.toHaveProperty('passwordHash');

    const jar = cookieJar(registerResponse);
    expect(jar.dbl_at).toEqual(expect.any(String));
    expect(jar.dbl_rt).toEqual(expect.any(String));
    expect(jar.dbl_csrf).toEqual(expect.any(String));

    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: jar,
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(refreshResponse.statusCode).toBe(204);
    const rotated = cookieJar(refreshResponse);
    expect(rotated.dbl_rt).toEqual(expect.any(String));
    expect(rotated.dbl_rt).not.toBe(jar.dbl_rt);

    const profile = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      cookies: { ...jar, ...rotated },
    });
    expect(profile.statusCode).toBe(200);
    expect(JSON.stringify(profile.json())).not.toContain('passwordHash');
  });

  it('logs out, revoking the session so its refresh token stops working', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);

    const registered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'logout@example.com', password: 'a-strong-password-123', username: 'logout_user', country: 'br' },
    });
    const jar = cookieJar(registered);

    const loggedOut = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: jar,
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(loggedOut.statusCode).toBe(204);

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: jar,
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('detects a reused refresh token and revokes the session family', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);

    const registered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'reuse@example.com', password: 'a-strong-password-123', username: 'reuse_user', country: 'br' },
    });
    const jar = cookieJar(registered);
    const originalRt = jar.dbl_rt;

    const rotatedResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: jar,
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(rotatedResponse.statusCode).toBe(204);
    const rotated = cookieJar(rotatedResponse);

    // Replaying the original refresh token is a reuse.
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { ...jar, dbl_rt: originalRt },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().error.code).toBe('REFRESH_TOKEN_REUSED');

    // The token issued by the legitimate rotation is now dead too.
    const afterReuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { ...jar, dbl_rt: rotated.dbl_rt },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(afterReuse.statusCode).toBe(401);
  });

  it('rejects a username that differs only in case from an existing one', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'a@example.com', password: 'a-strong-password-123', username: 'CaseAngler', country: 'br' },
    });
    expect(first.statusCode).toBe(201);

    const clash = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'b@example.com', password: 'a-strong-password-123', username: 'caseangler', country: 'br' },
    });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().error.code).toBe('USERNAME_TAKEN');
  });

  it('rejects invalid registration input with a safe error', async () => {
    const app = await createApp({ config: testConfig });
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
    const app = await createApp({ config: testConfig });
    apps.add(app);
    const client = await registerAndAuth(app, { country: 'pt' });

    const profile = await client.request({ method: 'GET', url: '/api/v1/me' });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.level).toBe(1);

    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(unauthorized.statusCode).toBe(401);
  });

  it('accepts a Bearer access token on protected routes when no cookie is present', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);
    const client = await registerAndAuth(app);

    const profile = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${client.accessToken}` },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.userId).toBe(client.userId);
  });

  it('serves a validated public catalog', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/catalog' });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe('local-v1');
    expect(response.json().fish.length).toBeGreaterThan(0);
    expect(response.json().locations.length).toBeGreaterThan(0);
  });

  it('casts and lands a fish server-side, applying the catch to the game-state blob', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);
    const client = await registerAndAuth(app);

    const seedState = {
      schemaVersion: 1,
      player: {
        level: 6, xp: 0, xpToNextLevel: 600, totalFishCaught: 0, collection: [],
        unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [], coins: 0,
        activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
        luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
        aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
        dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
      },
    };
    expect((await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: seedState, baseVersion: null } })).statusCode).toBe(200);

    const first = await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'atlantic' }, idempotencyKey: 'fishing-key-123456' });
    const second = await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'atlantic' }, idempotencyKey: 'fishing-key-123456' });
    expect(first.statusCode).toBe(200);
    expect(second.json().sessionId).toBe(first.json().sessionId);

    const landed = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land', payload: { sessionId: first.json().sessionId } });
    expect(landed.statusCode).toBe(200);
    expect(landed.json().caught[0].fishId).toEqual(expect.any(String));
    expect(landed.json().state.player.warehouse).toHaveLength(1);
    expect(landed.json().state.player.totalFishCaught).toBe(1);
  });

  it('submarine: casts a roster then harvests two fish into the blob', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);
    const client = await registerAndAuth(app);

    const seedState = {
      schemaVersion: 1,
      player: {
        level: 6, xp: 0, xpToNextLevel: 999999, totalFishCaught: 0, collection: [],
        unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [], coins: 0,
        activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
        luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
        aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
        dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
      },
    };
    expect((await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: seedState, baseVersion: null } })).statusCode).toBe(200);

    const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast',
      payload: { locationId: 'submarine', mode: 'submarine' } })).json();
    expect(cast.mode).toBe('submarine');
    expect(cast.catches).toHaveLength(24);

    for (let i = 0; i < 2; i++) {
      const r = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land',
        payload: { sessionId: cast.sessionId, catchId: cast.catches[i].id },
        idempotencyKey: `sub-app-${i}-aaaaaaaaaaaa` });
      expect(r.statusCode).toBe(200);
      expect(r.json().caught).toHaveLength(1);
    }

    const me = (await client.request({ method: 'GET', url: '/api/v1/me/state' })).json();
    expect(me.state.player.totalFishCaught).toBe(2);
  });

  it('places an aquarium-warehouse fish into a sector, crediting the reward to the blob', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);
    const client = await registerAndAuth(app);

    const seedState = {
      schemaVersion: 1,
      player: {
        level: 6, xp: 0, xpToNextLevel: 999999, totalFishCaught: 1, collection: [],
        unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [], coins: 0,
        activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
        luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
        aquariumWarehouse: [{ fish: { id: 'tilapia', name: 'Tilápia', rarity: 'common', waterType: 'freshwater', minWeight: 0.3, maxWeight: 2.5, xp: 10, description: '', emoji: '🐟' }, weight: 1.2, location: 'atlantic', timestamp: 123 }],
        aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
        dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
      },
    };
    expect((await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: seedState, baseVersion: null } })).statusCode).toBe(200);

    const placed = await client.request({ method: 'POST', url: '/api/v1/me/economy/aquarium/place',
      payload: { timestamp: 123, sector: 2 }, idempotencyKey: 'aqua-app-aaaaaaaaaaaa' });
    expect(placed.statusCode).toBe(200);
    expect(placed.json().version).toBe(2);

    const me = (await client.request({ method: 'GET', url: '/api/v1/me/state' })).json();
    expect(me.state.player.aquariumWarehouse).toEqual([]);
    expect(me.state.player.aquariumSectors['2']).toHaveLength(1);
    expect(me.state.player.coins).toBe(5);
    expect(me.state.player.xp).toBe(5);
  });

  it('returns an authenticated paginated leaderboard', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);
    const client = await registerAndAuth(app, { username: 'ranking_user' });

    const response = await client.request({ method: 'GET', url: '/api/v1/leaderboard?limit=10&offset=0' });
    expect(response.statusCode).toBe(200);
    expect(response.json().season).toBe('all-time');
    expect(response.json().entries[0].username).toBe('ranking_user');
  });

  it('returns the active authenticated season', async () => {
    const app = await createApp({ config: testConfig });
    apps.add(app);
    const client = await registerAndAuth(app);

    const response = await client.request({ method: 'GET', url: '/api/v1/seasons/current' });
    expect(response.statusCode).toBe(200);
    expect(response.json().season.status).toBe('active');
  });

  it('rejects the season endpoint without a valid access token', async () => {
    const app = await createApp({ config: testConfig });
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
