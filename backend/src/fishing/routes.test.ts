// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { registerAndAuth } from '../testing/authClient.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, authRateLimitMax: 1000, authRateLimitWindowMs: 300_000, trustProxy: false, cookieSecure: false,
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });
async function app() { const a = await createApp({ config }); apps.add(a); return a; }

const blob = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 6, xp: 0, xpToNextLevel: 600, totalFishCaught: 0, collection: [],
    unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [], coins: 100,
    activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
    ...over,
  },
});
async function seed(client: Awaited<ReturnType<typeof registerAndAuth>>, state: unknown) {
  const put = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state, baseVersion: null } });
  expect(put.statusCode).toBe(200);
}

describe('POST /api/v1/me/fishing/cast + land', () => {
  it('cast -> 200 { sessionId, fishId, weight, xp, lucky, state, version }', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'atlantic' } });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(typeof b.fishId).toBe('string');
    expect(b.version).toBe(2);
  });

  it('cast + land -> catch applied, version 1 -> 3', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'atlantic' } })).json();
    const land = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land', payload: { sessionId: cast.sessionId } });
    expect(land.statusCode).toBe(200);
    const b = land.json();
    expect(b.version).toBe(3);
    expect(b.caught[0].fishId).toBe(cast.fishId);
    expect(b.state.player.warehouse).toHaveLength(1);
  });

  it('land replay -> identical body', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'atlantic' } })).json();
    const first = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land', payload: { sessionId: cast.sessionId }, idempotencyKey: 'land-key-replayreplay1' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land', payload: { sessionId: cast.sessionId }, idempotencyKey: 'land-key-replayreplay1' });
    expect(replay.json()).toEqual(first.json());
    expect((await client.request({ method: 'GET', url: '/api/v1/me/state' })).json().version).toBe(3);
  });

  it('cast on a locked location -> 403 LOCATION_LOCKED', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob({ level: 1 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'abyss-trench' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('LOCATION_LOCKED');
  });

  it('land on an unknown session -> 422 INVALID_FISHING_SESSION', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land', payload: { sessionId: '00000000-0000-0000-0000-000000000000' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_FISHING_SESSION');
  });

  it('no session -> 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'atlantic' } });
    expect(res.statusCode).toBe(401);
  });

  it('cast { mode: net } -> 200 with net + catches; land -> caught array', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }));
    const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'titicaca', mode: 'net' } })).json();
    expect(cast.net.fishCount).toBeGreaterThan(0);
    expect(cast.catches).toHaveLength(cast.net.fishCount);
    const land = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land', payload: { sessionId: cast.sessionId } });
    expect(land.statusCode).toBe(200);
    expect(Array.isArray(land.json().caught)).toBe(true);
    expect(land.json().caught).toHaveLength(cast.catches.length);
  });

  it('cast net with no nets -> 409 NO_NETS', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob({ nets: 0, level: 8, unlockedLocations: ['titicaca'] }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'titicaca', mode: 'net' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NO_NETS');
  });
});
