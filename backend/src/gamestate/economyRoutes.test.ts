// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { registerAndAuth } from '../testing/authClient.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';
import { FISH } from '../../../src/game/data.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, authRateLimitMax: 1000, authRateLimitWindowMs: 300_000, trustProxy: false, cookieSecure: false,
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });
async function app() { const a = await createApp({ config }); apps.add(a); return a; }

const blob = (warehouse: unknown[]) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 3, xp: 0, xpToNextLevel: 300, totalFishCaught: warehouse.length,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse,
    coins: 100, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
  },
});
const oneFish = [{ fish: FISH[0], weight: 2, location: 'atlantic', timestamp: 1 }];

async function seed(client: Awaited<ReturnType<typeof registerAndAuth>>, warehouse: unknown[]) {
  const put = await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state: blob(warehouse) } });
  expect(put.statusCode).toBe(200);
}

const netBlob = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: { ...blob([]).player, coins: 10_000, nets: 0, ...over },
});
async function seedBlob(client: Awaited<ReturnType<typeof registerAndAuth>>, state: unknown) {
  const put = await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state } });
  expect(put.statusCode).toBe(200);
}

describe('POST /api/v1/me/economy/warehouse/sell', () => {
  it('sells: warehouse cleared, coins up, version 1 -> 2', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seed(client, oneFish);
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.state.player.warehouse).toEqual([]);
    expect(body.state.player.coins).toBeGreaterThan(100);
  });

  it('replay with the same Idempotency-Key returns the same body, no double credit', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seed(client, oneFish);
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell', idempotencyKey: 'idem-key-replayreplay01' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell', idempotencyKey: 'idem-key-replayreplay01' });
    expect(replay.json()).toEqual(first.json());
    const get = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(get.json().version).toBe(2);
  });

  it('empty warehouse -> 422 WAREHOUSE_EMPTY', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seed(client, []);
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('WAREHOUSE_EMPTY');
  });

  it('no session -> 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell' });
    expect(res.statusCode).toBe(401);
  });

  it('no X-CSRF-Token -> 403 CSRF_FAILED', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'e@example.com', password: 'a-very-strong-password', username: 'econ_user', country: 'br' } });
    const jar: Record<string, string> = {};
    for (const c of ([] as string[]).concat(reg.headers['set-cookie'] as string[])) {
      const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1);
    }
    const res = await a.inject({
      method: 'POST', url: '/api/v1/me/economy/warehouse/sell',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'idempotency-key': 'idem-key-eeeeeeeeeeee' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });

  it('no Idempotency-Key -> 400 INVALID_IDEMPOTENCY_KEY', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'e2@example.com', password: 'a-very-strong-password', username: 'econ_user2', country: 'br' } });
    const jar: Record<string, string> = {};
    for (const c of ([] as string[]).concat(reg.headers['set-cookie'] as string[])) {
      const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1);
    }
    const res = await a.inject({
      method: 'POST', url: '/api/v1/me/economy/warehouse/sell',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });
});

describe('POST /api/v1/me/economy/nets/purchase', () => {
  it('buys a net: -5000 coins, +1 net, version 1 -> 2', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000, nets: 1 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/nets/purchase' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.state.player.coins).toBe(3_000);
    expect(body.state.player.nets).toBe(2);
  });

  it('replay with the same Idempotency-Key returns the same body, no double charge', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/nets/purchase', idempotencyKey: 'net-key-replayreplay01' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/economy/nets/purchase', idempotencyKey: 'net-key-replayreplay01' });
    expect(replay.json()).toEqual(first.json());
    const get = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(get.json().version).toBe(2);
    expect(get.json().state.player.coins).toBe(3_000);
  });

  it('insufficient coins -> 409 INSUFFICIENT_FUNDS', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 4_999 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/nets/purchase' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('at the net limit -> 409 NET_LIMIT_REACHED', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 1_000_000, nets: 10 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/nets/purchase' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NET_LIMIT_REACHED');
  });

  it('no session -> 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/economy/nets/purchase' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/me/economy/multipliers/purchase', () => {
  it('buys a 2x luck multiplier: -3000 coins, luck power set, version 1 -> 2', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/multipliers/purchase', payload: { type: 'luck', power: 2 } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.state.player.coins).toBe(5_000);
    expect(body.state.player.luckMultiplierPower).toBe(2);
    expect(typeof body.state.player.luckMultiplierEnd).toBe('number');
  });

  it('buys a 4x strength multiplier for 6000 coins', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/multipliers/purchase', payload: { type: 'strength', power: 4 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().state.player.coins).toBe(2_000);
    expect(res.json().state.player.strengthMultiplierPower).toBe(4);
  });

  it('replay with the same Idempotency-Key returns the same body, no double charge', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/multipliers/purchase', payload: { type: 'luck', power: 2 }, idempotencyKey: 'mult-key-replayreplay01' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/economy/multipliers/purchase', payload: { type: 'luck', power: 2 }, idempotencyKey: 'mult-key-replayreplay01' });
    expect(replay.json()).toEqual(first.json());
    expect((await client.request({ method: 'GET', url: '/api/v1/me/state' })).json().version).toBe(2);
  });

  it('insufficient coins -> 409 INSUFFICIENT_FUNDS', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 2_999 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/multipliers/purchase', payload: { type: 'luck', power: 2 } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('invalid body (power 3) -> 400 VALIDATION_ERROR', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/multipliers/purchase', payload: { type: 'luck', power: 3 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid body (unknown type) -> 400 VALIDATION_ERROR', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/multipliers/purchase', payload: { type: 'speed', power: 2 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('no session -> 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/economy/multipliers/purchase', payload: { type: 'luck', power: 2 } });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/me/economy/skins/purchase', () => {
  it('buys a rod skin at the server price: -1000 coins, id owned, version 1 -> 2', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'rod', skinId: 'shark' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.state.player.coins).toBe(7_000);
    expect(body.state.player.ownedSkins).toContain('shark');
  });

  it('buys a boat skin at the server price: -2500 coins, id owned', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'boat', skinId: 'yacht' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().state.player.coins).toBe(5_500);
    expect(res.json().state.player.ownedBoatSkins).toContain('yacht');
  });

  it('replay with the same Idempotency-Key returns the same body, no double charge', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'rod', skinId: 'shark' }, idempotencyKey: 'skin-key-replayreplay1' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'rod', skinId: 'shark' }, idempotencyKey: 'skin-key-replayreplay1' });
    expect(replay.json()).toEqual(first.json());
    expect((await client.request({ method: 'GET', url: '/api/v1/me/state' })).json().version).toBe(2);
  });

  it('already owned -> 409 SKIN_ALREADY_OWNED', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000, ownedSkins: ['default', 'shark'] }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'rod', skinId: 'shark' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('SKIN_ALREADY_OWNED');
  });

  it('unknown id -> 404 SKIN_NOT_FOUND', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'rod', skinId: 'nonesuch' } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('SKIN_NOT_FOUND');
  });

  it('exclusive (roulette-only) id -> 404 SKIN_NOT_FOUND', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 200_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'rod', skinId: 'celestial' } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('SKIN_NOT_FOUND');
  });

  it('insufficient coins -> 409 INSUFFICIENT_FUNDS', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 999 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'rod', skinId: 'shark' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('invalid body (unknown kind) -> 400 VALIDATION_ERROR', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'sail', skinId: 'shark' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid body (missing skinId) -> 400 VALIDATION_ERROR', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 8_000 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'rod' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('no session -> 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/economy/skins/purchase', payload: { kind: 'rod', skinId: 'shark' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/me/economy reward ops', () => {
  it('daily-gift/claim -> 200 with a reward, version 1 -> 2', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 0 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.reward).toEqual({ type: 'coins', amount: 150 });
    expect(body.state.player.coins).toBe(150);
  });

  it('daily-gift/claim replay -> identical body', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 0 }));
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim', idempotencyKey: 'gift-key-replayreplay1' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim', idempotencyKey: 'gift-key-replayreplay1' });
    expect(replay.json()).toEqual(first.json());
  });

  it('second distinct daily claim same day -> 409 DAILY_GIFT_ALREADY_CLAIMED', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 0 }));
    await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim' });
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DAILY_GIFT_ALREADY_CLAIMED');
  });

  it('roulette/spin -> 200 with a reward; second distinct spin same day -> 409 ROULETTE_ALREADY_USED', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 0 }));
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/roulette/spin' });
    expect(first.statusCode).toBe(200);
    expect(first.json().reward).toBeDefined();
    const second = await client.request({ method: 'POST', url: '/api/v1/me/economy/roulette/spin' });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('ROULETTE_ALREADY_USED');
  });

  it('skin-roulette/spin -> 200; below the cost -> 409 INSUFFICIENT_FUNDS', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 5_000 }));
    const ok = await client.request({ method: 'POST', url: '/api/v1/me/economy/skin-roulette/spin' });
    expect(ok.statusCode).toBe(200);

    const poor = await registerAndAuth(a);
    await seedBlob(poor, netBlob({ coins: 100 }));
    const res = await poor.request({ method: 'POST', url: '/api/v1/me/economy/skin-roulette/spin' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('no session -> 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/economy/roulette/spin' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/me/economy/aquarium/place', () => {
  const withAq = (over: Record<string, unknown> = {}) => ({
    schemaVersion: SAVE_SCHEMA_VERSION,
    player: {
      ...blob([]).player, xpToNextLevel: 999999,
      aquariumWarehouse: [{ fish: FISH[0], weight: 1.5, location: 'atlantic', timestamp: 55 }],
      ...over,
    },
  });

  it('places the fish: moved to sector, coins+xp up, version 1 -> 2', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, withAq());
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/aquarium/place', payload: { timestamp: 55, sector: 3 } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.state.player.aquariumWarehouse).toEqual([]);
    expect(body.state.player.aquariumSectors['3']).toHaveLength(1);
    expect(body.state.player.coins).toBeGreaterThan(100);
    expect(body.reward).toBeUndefined();
  });

  it('replay with the same Idempotency-Key returns the same body', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, withAq());
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/aquarium/place', payload: { timestamp: 55, sector: 2 }, idempotencyKey: 'aqua-key-replayreplay1' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/economy/aquarium/place', payload: { timestamp: 55, sector: 2 }, idempotencyKey: 'aqua-key-replayreplay1' });
    expect(replay.json()).toEqual(first.json());
    expect((await client.request({ method: 'GET', url: '/api/v1/me/state' })).json().version).toBe(2);
  });

  it('unknown timestamp -> 404 AQUARIUM_FISH_NOT_FOUND', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, withAq());
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/aquarium/place', payload: { timestamp: 999, sector: 1 } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('AQUARIUM_FISH_NOT_FOUND');
  });

  it('sector out of range -> 400 VALIDATION_ERROR', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, withAq());
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/aquarium/place', payload: { timestamp: 55, sector: 6 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('no session -> 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/economy/aquarium/place', payload: { timestamp: 55, sector: 1 } });
    expect(res.statusCode).toBe(401);
  });
});
