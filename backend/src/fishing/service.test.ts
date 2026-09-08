import { describe, expect, it } from 'vitest';
import { createMemoryGameStateStore } from '../gamestate/memoryService.js';
import { createMemoryFishingService } from './service.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';

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
    const land = await svc.land('u1', 'land-key-eeeeeeeeeeee', cast.sessionId);
    expect(land.version).toBe(3);
    expect(land.caught.fishId).toBe(cast.fishId);
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
