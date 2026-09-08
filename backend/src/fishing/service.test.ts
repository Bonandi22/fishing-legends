import { describe, expect, it } from 'vitest';
import { createMemoryGameStateStore } from '../gamestate/memoryService.js';
import { createMemoryFishingService } from './service.js';
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

describe('memory fishing service', () => {
  it('cast rolls a fish, writes the lucky window, bumps version, creates a session', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);

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
    const svc = createMemoryFishingService(store);
    await expect(svc.cast('u1', 'cast-key-bbbbbbbbbbbb', 'abyss-trench')).rejects.toThrow('LOCATION_LOCKED');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('cast on an unknown location -> INVALID_FISHING_REQUEST', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    await expect(svc.cast('u1', 'cast-key-cccccccccccc', 'nonesuch')).rejects.toThrow('INVALID_FISHING_REQUEST');
  });

  it('cast dedupes on the idempotency key', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    const a = await svc.cast('u1', 'cast-key-dddddddddddd', 'atlantic');
    const b = await svc.cast('u1', 'cast-key-dddddddddddd', 'atlantic');
    expect(b.sessionId).toBe(a.sessionId);
    expect(store.get('u1')!.version).toBe(2);
  });

  it('land applies the catch, bumps version, completes the session', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    const cast = await svc.cast('u1', 'cast-key-eeeeeeeeeeee', 'atlantic');
    if (cast.mode !== 'rod') throw new Error('expected a rod cast');
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
    const svc = createMemoryFishingService(store);
    const cast = await svc.cast('u1', 'cast-key-ffffffffffff', 'atlantic');
    const first = await svc.land('u1', 'land-key-ffffffffffff', cast.sessionId);
    const replay = await svc.land('u1', 'land-key-ffffffffffff', cast.sessionId);
    expect(replay).toEqual(first);
    expect(store.get('u1')!.version).toBe(3);
  });

  it('land on a completed session with a NEW key does not double-apply', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    const cast = await svc.cast('u1', 'cast-key-gggggggggggg', 'atlantic');
    await svc.land('u1', 'land-key-gggggggggggg-1', cast.sessionId);
    const again = await svc.land('u1', 'land-key-gggggggggggg-2', cast.sessionId);
    expect(again.state.player.warehouse).toHaveLength(1);
    expect(store.get('u1')!.version).toBe(3);
  });

  it('land on an unknown session -> INVALID_FISHING_SESSION', async () => {
    const svc = createMemoryFishingService(createMemoryGameStateStore());
    await expect(svc.land('u1', 'land-key-hhhhhhhhhhhh', '00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow('INVALID_FISHING_SESSION');
  });
});

describe('memory fishing service — net mode', () => {
  it('cast net: decrements nets, rolls a full batch, writes lucky window, version +1', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);

    const res = await svc.cast('u1', 'cast-net-aaaaaaaaaaaa', 'titicaca', 'net');
    if (res.mode !== 'net') throw new Error('expected a net cast');
    expect(res.version).toBe(2);
    expect(res.catches).toHaveLength(res.net.fishCount);
    expect((store.get('u1')!.state as { player: { nets: number } }).player.nets).toBe(2);
  });

  it('cast net with no nets -> NO_NETS, nothing written', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 0, level: 8, unlockedLocations: ['titicaca'] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    await expect(svc.cast('u1', 'cast-net-bbbbbbbbbbbb', 'titicaca', 'net')).rejects.toThrow('NO_NETS');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('cast net still honours the location level gate', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 3, level: 1 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    await expect(svc.cast('u1', 'cast-net-cccccccccccc', 'abyss-trench', 'net')).rejects.toThrow('LOCATION_LOCKED');
  });

  it('land a net session applies the whole batch with fromNet xp, caught[] length = batch', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'], xp: 0, xpToNextLevel: 100000 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
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
    const svc = createMemoryFishingService(store);
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
    const svc = createMemoryFishingService(store);

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
    const svc = createMemoryFishingService(store);
    const a = await svc.cast('u1', 'cast-sub-bbbbbbbbbbbb', 'submarine', 'submarine');
    const b = await svc.cast('u1', 'cast-sub-bbbbbbbbbbbb', 'submarine', 'submarine');
    if (a.mode !== 'submarine' || b.mode !== 'submarine') throw new Error('expected submarine casts');
    expect(b.sessionId).toBe(a.sessionId);
    expect(b.catches).toEqual(a.catches);
  });

  it('cast submarine with no blob -> GAME_STATE_NOT_FOUND', async () => {
    const svc = createMemoryFishingService(createMemoryGameStateStore());
    await expect(svc.cast('u1', 'cast-sub-cccccccccccc', 'submarine', 'submarine'))
      .rejects.toThrow('GAME_STATE_NOT_FOUND');
  });
});
