// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { registerAndAuth } from '../testing/authClient.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, trustProxy: false, cookieSecure: false,
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });
async function app() { const a = await createApp({ config }); apps.add(a); return a; }

const envelope = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  player: {
    level: 5, xp: 40, xpToNextLevel: 500, totalFishCaught: 12,
    collection: [], unlockedLocations: ['atlantic', 'amazon'], heaviestFish: null, warehouse: [],
    coins: 300, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...over,
  },
});

describe('me/state', () => {
  it('GET returns { state: null, version: null } when nothing is saved', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    const res = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ state: null, updatedAt: null, version: null });
  });

  it('first PUT (baseVersion null) creates the row at version 1 and GET round-trips it', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    const body = envelope({ level: 9, coins: 1234 });
    const put = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: body, baseVersion: null } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ version: 1 });
    const get = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(get.json().state).toEqual(body);
    expect(get.json().version).toBe(1);
    expect(typeof get.json().updatedAt).toBe('string');
  });

  it('PUT with the current baseVersion succeeds and bumps the version', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: envelope(), baseVersion: null } });
    const put = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: envelope({ coins: 999 }), baseVersion: 1 } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ version: 2 });
    const get = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(get.json().state.player.coins).toBe(999);
    expect(get.json().version).toBe(2);
  });

  it('PUT with a stale baseVersion is 409 STATE_VERSION_CONFLICT and does not write', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: envelope(), baseVersion: null } });
    await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: envelope({ coins: 111 }), baseVersion: 1 } });
    const stale = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: envelope({ coins: 222 }), baseVersion: 1 } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('STATE_VERSION_CONFLICT');
    const get = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(get.json().state.player.coins).toBe(111);
    expect(get.json().version).toBe(2);
  });

  it('PUT with baseVersion null when a row already exists is 409 STATE_VERSION_CONFLICT', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: envelope(), baseVersion: null } });
    const res = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: envelope({ coins: 5 }), baseVersion: null } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('STATE_VERSION_CONFLICT');
  });

  it('PUT with an invalid player shape is 400 VALIDATION_ERROR', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    const res = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: { schemaVersion: 1, player: { level: 0 } }, baseVersion: null } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('GET without a session is 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/v1/me/state' });
    expect(res.statusCode).toBe(401);
  });

  it('PUT without X-CSRF-Token is 403', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'g@example.com', password: 'a-very-strong-password', username: 'gs_user', country: 'br' } });
    const setCookie = ([] as string[]).concat(reg.headers['set-cookie'] as string[]);
    const jar: Record<string, string> = {};
    for (const c of setCookie) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); }
    const res = await a.inject({ method: 'PUT', url: '/api/v1/me/state', cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf }, payload: { state: envelope() } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });
});
