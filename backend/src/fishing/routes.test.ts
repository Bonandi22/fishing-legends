// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { registerAndAuth } from '../testing/authClient.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, authRateLimitMax: 1000, authRateLimitWindowMs: 300_000, trustProxy: false, cookieSecure: false, email: { smtp: { host: 'localhost', port: 1025, secure: false }, from: 'test@localhost' }, authCodes: { secret: new Uint8Array(32), ttlSeconds: 1800, maxAttempts: 5, resendCooldownSeconds: 60 },
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
// Only Date is faked: the fishing hard rules read the wall clock, tests move it with `advance`.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z')); });
afterEach(async () => { vi.useRealTimers(); await Promise.all([...apps].map(a => a.close())); apps.clear(); });
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
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
  const put = await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state } });
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
    advance(1_000);
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
    advance(1_000);
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

  it('cast submarine -> 200 { mode: "submarine", catches: [{id,fishId,weight}] }', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast',
      payload: { locationId: 'submarine', mode: 'submarine' } });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.mode).toBe('submarine');
    expect(b.catches).toHaveLength(24);
    expect(typeof b.catches[0].id).toBe('string');
    expect(b.version).toBe(1);
  });

  it('land a submarine harvest -> 200 caught[] of length 1', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast',
      payload: { locationId: 'submarine', mode: 'submarine' } })).json();
    const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land',
      payload: { sessionId: cast.sessionId, catchId: cast.catches[0].id },
      idempotencyKey: 'land-sub-route-aaaaaaaa' });
    expect(res.statusCode).toBe(200);
    expect(res.json().caught).toHaveLength(1);
  });

  it('land a submarine session with no catchId -> 422', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast',
      payload: { locationId: 'submarine', mode: 'submarine' } })).json();
    const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land',
      payload: { sessionId: cast.sessionId },
      idempotencyKey: 'land-sub-route-bbbbbbbb' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INVALID_FISHING_SESSION');
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

describe('fishing hard rules over HTTP', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const cast = (client: Awaited<ReturnType<typeof registerAndAuth>>, payload: Record<string, unknown>) =>
    client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload });

  it('clientId that is not a uuid -> 400 VALIDATION_ERROR', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    const res = await cast(client, { locationId: 'atlantic', clientId: 'not-a-uuid' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('another window within the lock -> 409 FISHING_ELSEWHERE', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    expect((await cast(client, { locationId: 'atlantic', clientId: A })).statusCode).toBe(200);
    advance(5_000);
    const res = await cast(client, { locationId: 'atlantic', clientId: B });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'FISHING_ELSEWHERE', message: 'You are already fishing in another window' });
  });

  it('rod cast too soon after the previous -> 429 CAST_TOO_FAST', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    expect((await cast(client, { locationId: 'atlantic', clientId: A })).statusCode).toBe(200);
    advance(1_000);
    const res = await cast(client, { locationId: 'atlantic', clientId: A });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toMatchObject({ code: 'CAST_TOO_FAST', message: 'Casting too fast' });
  });

  it('land right after the cast -> 409 LAND_TOO_FAST', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seed(client, blob());
    const c = (await cast(client, { locationId: 'atlantic', clientId: A })).json();
    advance(100);
    const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land', payload: { sessionId: c.sessionId } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'LAND_TOO_FAST', message: 'The fish got away' });
  });
});
