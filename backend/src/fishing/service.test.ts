import { describe, expect, it } from 'vitest';
import { createMemoryGameStateStore } from '../gamestate/memoryService.js';
import { createMemoryAntiCheatStore, createMemoryFishingService } from './service.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';
import { SUBMARINE_ROSTER_SIZE } from '../../../src/game/fishingLogic.js';

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

const T0 = new Date('2026-01-01T00:00:00.000Z').getTime();

/** Memory service on a manual clock starting at T0; `clock.advance(ms)` moves time forward. */
function setup(store = createMemoryGameStateStore()) {
  const anticheat = createMemoryAntiCheatStore();
  let t = T0;
  const clock = { advance: (ms: number) => { t += ms; } };
  const svc = createMemoryFishingService(store, anticheat, { now: () => new Date(t) });
  return { svc, anticheat, clock, store };
}

describe('memory fishing service', () => {
  it('cast rolls a fish, writes the lucky window, bumps version, creates a session', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);

    const res = await svc.cast('u1', 'cast-key-aaaaaaaaaaaa', 'atlantic');
    if (res.mode !== 'rod') throw new Error('expected a rod cast');
    expect(res.version).toBe(2);
    expect(typeof res.fishId).toBe('string');
    expect(res.weight).toBeGreaterThan(0);
    expect(typeof res.lucky).toBe('boolean');
    expect('luckyCooldownUntil' in (store.get('u1')!.state as { player: Record<string, unknown> }).player).toBe(true);
  });

  it('cast on a locked location -> LOCATION_LOCKED', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ level: 1 }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    await expect(svc.cast('u1', 'cast-key-bbbbbbbbbbbb', 'abyss-trench')).rejects.toThrow('LOCATION_LOCKED');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('cast on an unknown location -> INVALID_FISHING_REQUEST', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    await expect(svc.cast('u1', 'cast-key-cccccccccccc', 'nonesuch')).rejects.toThrow('INVALID_FISHING_REQUEST');
  });

  it('cast dedupes on the idempotency key', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    const a = await svc.cast('u1', 'cast-key-dddddddddddd', 'atlantic');
    const b = await svc.cast('u1', 'cast-key-dddddddddddd', 'atlantic');
    expect(b.sessionId).toBe(a.sessionId);
    expect(store.get('u1')!.version).toBe(2);
  });

  it('land applies the catch, bumps version, completes the session', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const { svc, clock } = setup(store);
    const cast = await svc.cast('u1', 'cast-key-eeeeeeeeeeee', 'atlantic');
    if (cast.mode !== 'rod') throw new Error('expected a rod cast');
    clock.advance(1_000);
    const land = await svc.land('u1', 'land-key-eeeeeeeeeeee', cast.sessionId);
    expect(land.version).toBe(3);
    expect(land.caught).toHaveLength(1);
    expect(land.caught[0].fishId).toBe(cast.fishId);
    expect(land.state.player.warehouse).toHaveLength(1);
    expect(land.state.player.totalFishCaught).toBe(1);
  });

  it('land replays the same key: identical body, warehouse still +1', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const { svc, clock } = setup(store);
    const cast = await svc.cast('u1', 'cast-key-ffffffffffff', 'atlantic');
    clock.advance(1_000);
    const first = await svc.land('u1', 'land-key-ffffffffffff', cast.sessionId);
    const replay = await svc.land('u1', 'land-key-ffffffffffff', cast.sessionId);
    expect(replay).toEqual(first);
    expect(store.get('u1')!.version).toBe(3);
  });

  it('land on a completed session with a NEW key does not double-apply', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const { svc, clock } = setup(store);
    const cast = await svc.cast('u1', 'cast-key-gggggggggggg', 'atlantic');
    clock.advance(1_000);
    await svc.land('u1', 'land-key-gggggggggggg-1', cast.sessionId);
    const again = await svc.land('u1', 'land-key-gggggggggggg-2', cast.sessionId);
    expect(again.state.player.warehouse).toHaveLength(1);
    expect(store.get('u1')!.version).toBe(3);
  });

  it('land on an unknown session -> INVALID_FISHING_SESSION', async () => {
    const { svc } = setup();
    await expect(svc.land('u1', 'land-key-hhhhhhhhhhhh', '00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow('INVALID_FISHING_SESSION');
  });
});

describe('memory fishing service — net mode', () => {
  it('cast net: decrements nets, rolls a full batch, writes lucky window, version +1', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);

    const res = await svc.cast('u1', 'cast-net-aaaaaaaaaaaa', 'titicaca', 'net');
    if (res.mode !== 'net') throw new Error('expected a net cast');
    expect(res.version).toBe(2);
    expect(res.catches).toHaveLength(res.net.fishCount);
    expect((store.get('u1')!.state as { player: { nets: number } }).player.nets).toBe(2);
  });

  it('cast net with no nets -> NO_NETS, nothing written', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 0, level: 8, unlockedLocations: ['titicaca'] }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    await expect(svc.cast('u1', 'cast-net-bbbbbbbbbbbb', 'titicaca', 'net')).rejects.toThrow('NO_NETS');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('cast net still honours the location level gate', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 3, level: 1 }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    await expect(svc.cast('u1', 'cast-net-cccccccccccc', 'abyss-trench', 'net')).rejects.toThrow('LOCATION_LOCKED');
  });

  it('land a net session applies the whole batch with fromNet xp, caught[] length = batch', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'], xp: 0, xpToNextLevel: 100000 }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    const cast = await svc.cast('u1', 'cast-net-dddddddddddd', 'titicaca', 'net');
    if (cast.mode !== 'net') throw new Error('expected a net cast');
    const land = await svc.land('u1', 'land-net-dddddddddddd', cast.sessionId);
    expect(land.caught).toHaveLength(cast.catches.length);
    expect(land.state.player.warehouse.length + land.state.player.aquariumWarehouse.length).toBe(cast.catches.length);
    expect(land.state.player.totalFishCaught).toBe(cast.catches.length);
  });

  it('net land replays: identical body, batch not doubled', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    const cast = await svc.cast('u1', 'cast-net-eeeeeeeeeeee', 'titicaca', 'net');
    const a = await svc.land('u1', 'land-net-eeeeeeeeeeee', cast.sessionId);
    const b = await svc.land('u1', 'land-net-eeeeeeeeeeee', cast.sessionId);
    expect(b).toEqual(a);
  });
});

describe('memory fishing service — submarine mode', () => {
  it('cast submarine: 24 roster entries with ids, blob + version untouched, session mode submarine', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ level: 6 }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);

    const res = await svc.cast('u1', 'cast-sub-aaaaaaaaaaaa', 'submarine', 'submarine');
    if (res.mode !== 'submarine') throw new Error('expected a submarine cast');
    expect(res.catches).toHaveLength(SUBMARINE_ROSTER_SIZE);
    expect(res.catches.every(c => typeof c.id === 'string' && c.id.length > 0)).toBe(true);
    expect(res.catches.every(c => typeof c.fishId === 'string' && c.weight > 0)).toBe(true);
    expect(res.version).toBe(1);
    expect(res.lucky).toBe(false);
    const p = (store.get('u1')!.state as { player: Record<string, unknown> }).player;
    expect(p.luckyUntil).toBeUndefined();
    expect(store.get('u1')!.version).toBe(1);
  });

  it('cast submarine dedupes on the idempotency key', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    const a = await svc.cast('u1', 'cast-sub-bbbbbbbbbbbb', 'submarine', 'submarine');
    const b = await svc.cast('u1', 'cast-sub-bbbbbbbbbbbb', 'submarine', 'submarine');
    if (a.mode !== 'submarine' || b.mode !== 'submarine') throw new Error('expected submarine casts');
    expect(b.sessionId).toBe(a.sessionId);
    expect(b.catches).toEqual(a.catches);
  });

  it('cast submarine with no blob -> GAME_STATE_NOT_FOUND', async () => {
    const { svc } = setup();
    await expect(svc.cast('u1', 'cast-sub-cccccccccccc', 'submarine', 'submarine'))
      .rejects.toThrow('GAME_STATE_NOT_FOUND');
  });

  it('land a submarine harvest: applies one, roster shrinks, session stays open, version +1', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ level: 6, xp: 0, xpToNextLevel: 100000 }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    const cast = await svc.cast('u1', 'cast-sub-dddddddddddd', 'submarine', 'submarine');
    if (cast.mode !== 'submarine') throw new Error('expected a submarine cast');

    const first = cast.catches[0];
    const land = await svc.land('u1', 'land-sub-dddddddddddd-1', cast.sessionId, first.id);
    expect(land.version).toBe(2);
    expect(land.caught).toEqual([{ fishId: first.fishId, weight: first.weight, location: 'submarine' }]);
    expect(land.state.player.warehouse).toHaveLength(1);
    expect(land.state.player.totalFishCaught).toBe(1);
  });

  it('harvest every roster entry -> session completes on the last one', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ level: 6, xp: 0, xpToNextLevel: 999999 }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    const cast = await svc.cast('u1', 'cast-sub-eeeeeeeeeeee', 'submarine', 'submarine');
    if (cast.mode !== 'submarine') throw new Error('expected a submarine cast');
    for (let i = 0; i < cast.catches.length; i++) {
      await svc.land('u1', `land-sub-eeeeeeeeeeee-${i}`, cast.sessionId, cast.catches[i].id);
    }
    await expect(svc.land('u1', 'land-sub-eeeeeeeeeeee-after', cast.sessionId, cast.catches[0].id))
      .rejects.toThrow('INVALID_FISHING_SESSION');
  });

  it('land a submarine session with no catchId -> INVALID_FISHING_SESSION', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ level: 6 }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    const cast = await svc.cast('u1', 'cast-sub-ffffffffffff', 'submarine', 'submarine');
    await expect(svc.land('u1', 'land-sub-ffffffffffff', cast.sessionId))
      .rejects.toThrow('INVALID_FISHING_SESSION');
  });

  it('land a submarine harvest with an unknown catchId -> INVALID_FISHING_SESSION', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ level: 6 }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    const cast = await svc.cast('u1', 'cast-sub-gggggggggggg', 'submarine', 'submarine');
    await expect(svc.land('u1', 'land-sub-gggggggggggg', cast.sessionId, '00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow('INVALID_FISHING_SESSION');
  });

  it('submarine harvest replays on the same key: identical body, roster shrank by one', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ level: 6 }), updatedAt: 'now', version: 1 });
    const { svc } = setup(store);
    const cast = await svc.cast('u1', 'cast-sub-hhhhhhhhhhhh', 'submarine', 'submarine');
    if (cast.mode !== 'submarine') throw new Error('expected a submarine cast');
    const a = await svc.land('u1', 'land-sub-hhhhhhhhhhhh', cast.sessionId, cast.catches[0].id);
    const b = await svc.land('u1', 'land-sub-hhhhhhhhhhhh', cast.sessionId, cast.catches[0].id);
    expect(b).toEqual(a);
    expect(store.get('u1')!.version).toBe(2);
  });
});

describe('memory fishing service — hard rules (H0–H3)', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const seeded = (over: Record<string, unknown> = {}) => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(over), updatedAt: 'now', version: 1 });
    return setup(store);
  };

  it('H0: a second window within the lock -> FISHING_ELSEWHERE, no event, no session', async () => {
    const { svc, anticheat, clock } = seeded();
    await svc.cast('u1', 'cast-h0-aaaaaaaaaaaa', 'atlantic', 'rod', A);
    clock.advance(10_000);
    await expect(svc.cast('u1', 'cast-h0-bbbbbbbbbbbb', 'atlantic', 'rod', B)).rejects.toThrow('FISHING_ELSEWHERE');
    expect(anticheat.events.length).toBe(0);
    expect(anticheat.sessions.size).toBe(1);
  });

  it('replaying the same cast key 1 s later returns the same session, no error, no event', async () => {
    const { svc, anticheat, clock } = seeded();
    const a = await svc.cast('u1', 'cast-rp-aaaaaaaaaaaa', 'atlantic', 'rod', A);
    clock.advance(1_000);
    const b = await svc.cast('u1', 'cast-rp-aaaaaaaaaaaa', 'atlantic', 'rod', A);
    expect(b.sessionId).toBe(a.sessionId);
    expect(anticheat.events.length).toBe(0);
  });

  it('H2: a rod cast 1 s after the previous (new key, same client) -> CAST_TOO_FAST + 1 event', async () => {
    const { svc, anticheat, clock, store } = seeded();
    await svc.cast('u1', 'cast-h2-aaaaaaaaaaaa', 'atlantic', 'rod', A);
    clock.advance(1_000);
    await expect(svc.cast('u1', 'cast-h2-bbbbbbbbbbbb', 'atlantic', 'rod', A)).rejects.toThrow('CAST_TOO_FAST');
    expect(anticheat.events).toHaveLength(1);
    expect(anticheat.events[0]).toMatchObject({ userId: 'u1', type: 'cast_too_fast', sessionId: null, detail: { intervalMs: 1_000 } });
    expect(anticheat.sessions.size).toBe(1);
    expect(store.get('u1')!.version).toBe(2);
  });

  it('H1: a new rod cast expires the open rod session', async () => {
    const { svc, anticheat, clock } = seeded();
    const first = await svc.cast('u1', 'cast-h1-aaaaaaaaaaaa', 'atlantic', 'rod', A);
    clock.advance(4_000);
    const second = await svc.cast('u1', 'cast-h1-bbbbbbbbbbbb', 'atlantic', 'rod', A);
    expect(anticheat.sessions.get(first.sessionId)!.status).toBe('expired');
    expect(anticheat.sessions.get(second.sessionId)!.status).toBe('open');
    clock.advance(1_000);
    await expect(svc.land('u1', 'land-h1-aaaaaaaaaaaa', first.sessionId)).rejects.toThrow('FISHING_SESSION_EXPIRED');
  });

  it('H1 leaves an open session of another mode alone', async () => {
    const { svc, anticheat, clock } = seeded({ nets: 3, level: 8, unlockedLocations: ['titicaca'] });
    const net = await svc.cast('u1', 'cast-h1-net-aaaaaaaa', 'titicaca', 'net', A);
    clock.advance(1_000);
    await svc.cast('u1', 'cast-h1-rod-aaaaaaaa', 'titicaca', 'rod', A);
    expect(anticheat.sessions.get(net.sessionId)!.status).toBe('open');
  });

  it('H3: land 100 ms after the cast -> LAND_TOO_FAST, session expired, 1 event, blob untouched', async () => {
    const { svc, anticheat, clock, store } = seeded();
    const cast = await svc.cast('u1', 'cast-h3-aaaaaaaaaaaa', 'atlantic', 'rod', A);
    clock.advance(100);
    await expect(svc.land('u1', 'land-h3-aaaaaaaaaaaa', cast.sessionId)).rejects.toThrow('LAND_TOO_FAST');
    expect(anticheat.sessions.get(cast.sessionId)!.status).toBe('expired');
    expect(anticheat.events).toHaveLength(1);
    expect(anticheat.events[0]).toMatchObject({ type: 'land_too_fast', sessionId: cast.sessionId, detail: { elapsedMs: 100 } });
    expect(anticheat.lands).toHaveLength(0);
    expect(store.get('u1')!.version).toBe(2);
  });

  it('a successful rod land writes one fishing_lands row and completes the session; its replay writes none', async () => {
    const { svc, anticheat, clock } = seeded();
    const cast = await svc.cast('u1', 'cast-ld-aaaaaaaaaaaa', 'atlantic', 'rod', A);
    if (cast.mode !== 'rod') throw new Error('expected a rod cast');
    clock.advance(1_000);
    await svc.land('u1', 'land-ld-aaaaaaaaaaaa', cast.sessionId);
    clock.advance(1_000);
    await svc.land('u1', 'land-ld-aaaaaaaaaaaa', cast.sessionId);
    expect(anticheat.lands).toHaveLength(1);
    expect(anticheat.lands[0]).toMatchObject({
      userId: 'u1', sessionId: cast.sessionId, mode: 'rod', fishId: cast.fishId, landedAt: new Date(T0 + 1_000),
    });
    const session = anticheat.sessions.get(cast.sessionId)!;
    expect(session.status).toBe('completed');
    expect(session.completedAt).toEqual(new Date(T0 + 1_000));
  });

  it('a net land writes one fishing_lands row per fish', async () => {
    const { svc, anticheat, clock } = seeded({ nets: 3, level: 8, unlockedLocations: ['titicaca'], xpToNextLevel: 999999 });
    const cast = await svc.cast('u1', 'cast-ln-aaaaaaaaaaaa', 'titicaca', 'net', A);
    if (cast.mode !== 'net') throw new Error('expected a net cast');
    clock.advance(100);
    await svc.land('u1', 'land-ln-aaaaaaaaaaaa', cast.sessionId);
    expect(anticheat.lands).toHaveLength(cast.catches.length);
    expect(anticheat.lands.map(l => l.fishId)).toEqual(cast.catches.map(c => c.fishId));
    expect(anticheat.lands.every(l => l.mode === 'net' && l.sessionId === cast.sessionId)).toBe(true);
  });

  it('records client_id and strength_active from the blob', async () => {
    const active = seeded({ strengthMultiplierEnd: T0 + 60_000 });
    const a = await active.svc.cast('u1', 'cast-st-aaaaaaaaaaaa', 'atlantic', 'rod', A);
    expect(active.anticheat.sessions.get(a.sessionId)).toMatchObject({ clientId: A, strengthActive: true, completedAt: null });

    const expired = seeded({ strengthMultiplierEnd: T0 - 1 });
    const b = await expired.svc.cast('u1', 'cast-st-bbbbbbbbbbbb', 'atlantic');
    expect(expired.anticheat.sessions.get(b.sessionId)).toMatchObject({ clientId: null, strengthActive: false });
  });
});
