import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { antiCheatEvents, fishingLands, fishingSessions, gameStateOperations, playerGameState, users } from '../db/schema.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgGameStateService } from '../gamestate/pgRepository.js';
import { createPgFishingService } from './pgRepository.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let gameState: ReturnType<typeof createPgGameStateService>;
let fishing: ReturnType<typeof createPgFishingService>;
// Manual clock, reset to the wall clock before each test; `advance` moves it forward.
let t = Date.now();
const advance = (ms: number) => { t += ms; };

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  gameState = createPgGameStateService(harness.db);
  fishing = createPgFishingService(harness.db, { now: () => new Date(t) });
});
beforeEach(() => { t = Date.now(); });
afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `fish-${randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `fish_${randomUUID().slice(0, 8)}`,
    country: 'BR',
    locale: 'en',
  });
  return user.id;
}

const blob = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 6, xp: 0, xpToNextLevel: 600, totalFishCaught: 0, collection: [],
    unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [], coins: 0,
    activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
    ...over,
  },
});

describe('pg fishing service (integration)', () => {
  it('cast + land transactionally: one session, one fishing_land op row, blob updated, version +2', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());

    const cast = await fishing.cast(userId, 'cast-int-aaaaaaaa', 'atlantic');
    if (cast.mode !== 'rod') throw new Error('expected a rod cast');
    expect(cast.version).toBe(2);
    advance(1_000);
    const land = await fishing.land(userId, 'land-int-aaaaaaaa', cast.sessionId);
    expect(land.version).toBe(3);
    expect(land.caught[0].fishId).toBe(cast.fishId);
    expect(land.state.player.warehouse).toHaveLength(1);

    const sessions = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('completed');
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('fishing_land');
  });

  it('cast dedupes on the idempotency key: one session, version +1', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    const a = await fishing.cast(userId, 'cast-int-bbbbbbbb', 'atlantic');
    const b = await fishing.cast(userId, 'cast-int-bbbbbbbb', 'atlantic');
    expect(b.sessionId).toBe(a.sessionId);
    expect((await gameState.get(userId))!.version).toBe(2);
    const sessions = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId));
    expect(sessions).toHaveLength(1);
  });

  it('land replays the same key: identical result, one op row, warehouse still +1', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    const cast = await fishing.cast(userId, 'cast-int-cccccccc', 'atlantic');
    advance(1_000);
    const first = await fishing.land(userId, 'land-int-cccccccc', cast.sessionId);
    const replay = await fishing.land(userId, 'land-int-cccccccc', cast.sessionId);
    expect(replay).toEqual(first);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(3);
  });

  it('concurrent same-key land: both resolve identically, one op row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    const cast = await fishing.cast(userId, 'cast-int-dddddddd', 'atlantic');
    advance(1_000);
    const [a, b] = await Promise.all([
      fishing.land(userId, 'land-int-dddddddd', cast.sessionId),
      fishing.land(userId, 'land-int-dddddddd', cast.sessionId),
    ]);
    expect(a).toEqual(b);
    expect(a.version).toBe(3);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('land on an expired session -> FISHING_SESSION_EXPIRED', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    const cast = await fishing.cast(userId, 'cast-int-eeeeeeee', 'atlantic');
    // backdate the session past the 5-min TTL
    await harness.db.update(fishingSessions)
      .set({ createdAt: sql`now() - interval '10 minutes'` })
      .where(eq(fishingSessions.id, cast.sessionId));
    await expect(fishing.land(userId, 'land-int-eeeeeeee', cast.sessionId)).rejects.toThrow('FISHING_SESSION_EXPIRED');
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('net cast + land transactionally: nets decremented, warehouse += batch, one op row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'], xp: 0, xpToNextLevel: 999999 }));
    const cast = await fishing.cast(userId, 'cast-net-int-aa', 'titicaca', 'net');
    if (cast.mode !== 'net') throw new Error('expected a net cast');
    expect(cast.version).toBe(2);
    const land = await fishing.land(userId, 'land-net-int-aa', cast.sessionId);
    const blobRow = await gameState.get(userId);
    expect((blobRow!.state as { player: { nets: number } }).player.nets).toBe(2);
    const total = land.state.player.warehouse.length + land.state.player.aquariumWarehouse.length;
    expect(total).toBe(cast.catches.length);
    expect(land.caught).toHaveLength(cast.catches.length);
    const sessions = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].resultCatches).toHaveLength(cast.catches.length);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('fishing_land');
  });

  it('net land replays the same key: one op row, batch not doubled', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }));
    const cast = await fishing.cast(userId, 'cast-net-int-bb', 'titicaca', 'net');
    const first = await fishing.land(userId, 'land-net-int-bb', cast.sessionId);
    const replay = await fishing.land(userId, 'land-net-int-bb', cast.sessionId);
    expect(replay).toEqual(first);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('submarine: cast writes no blob/op, harvests bump version and shrink the roster, drain completes', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob({ level: 6, xp: 0, xpToNextLevel: 999999 }));

    const cast = await fishing.cast(userId, 'cast-sub-int-aa', 'submarine', 'submarine');
    if (cast.mode !== 'submarine') throw new Error('expected a submarine cast');
    expect(cast.catches).toHaveLength(24);
    expect(cast.version).toBe(1);

    const [sessionRow] = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId));
    expect(sessionRow.mode).toBe('submarine');
    expect(sessionRow.resultCatches).toHaveLength(24);
    const opsAfterCast = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(opsAfterCast).toHaveLength(0);

    for (let i = 0; i < 3; i++) {
      await fishing.land(userId, `land-sub-int-aa-${i}`, cast.sessionId, cast.catches[i].id);
    }
    const [blobRow] = await harness.db.select().from(playerGameState).where(eq(playerGameState.userId, userId));
    expect(blobRow.version).toBe(4);
    const [sessionAfter] = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.id, cast.sessionId));
    expect(sessionAfter.resultCatches).toHaveLength(21);
    expect(sessionAfter.status).toBe('open');

    for (let i = 3; i < 24; i++) {
      await fishing.land(userId, `land-sub-int-aa-${i}`, cast.sessionId, cast.catches[i].id);
    }
    const [drained] = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.id, cast.sessionId));
    expect(drained.status).toBe('completed');
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(24);
  });

  it('submarine land without catchId -> INVALID_FISHING_SESSION', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob({ level: 6 }));
    const cast = await fishing.cast(userId, 'cast-sub-int-bb', 'submarine', 'submarine');
    await expect(fishing.land(userId, 'land-sub-int-bb', cast.sessionId)).rejects.toThrow('INVALID_FISHING_SESSION');
  });

  it('deleting the user cascades fishing_sessions', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    await fishing.cast(userId, 'cast-int-ffffffff', 'atlantic');
    await harness.db.delete(users).where(eq(users.id, userId));
    const sessions = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId));
    expect(sessions).toHaveLength(0);
  });
});

describe('pg fishing service — hard rules (H0–H3, integration)', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const eventsOf = (userId: string) => harness.db.select().from(antiCheatEvents).where(eq(antiCheatEvents.userId, userId));
  const landsOf = (userId: string) => harness.db.select().from(fishingLands).where(eq(fishingLands.userId, userId));
  const sessionOf = async (id: string) =>
    (await harness.db.select().from(fishingSessions).where(eq(fishingSessions.id, id)))[0];

  it('H0: a second window within the lock -> FISHING_ELSEWHERE, no event, no session', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    await fishing.cast(userId, 'cast-h0-int-aaaaaa', 'atlantic', 'rod', A);
    advance(10_000);
    await expect(fishing.cast(userId, 'cast-h0-int-bbbbbb', 'atlantic', 'rod', B)).rejects.toThrow('FISHING_ELSEWHERE');
    expect(await eventsOf(userId)).toHaveLength(0);
    expect(await harness.db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId))).toHaveLength(1);
  });

  it('replaying the same cast key 1 s later returns the same session, no error, no event', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    const a = await fishing.cast(userId, 'cast-rp-int-aaaaaa', 'atlantic', 'rod', A);
    advance(1_000);
    const b = await fishing.cast(userId, 'cast-rp-int-aaaaaa', 'atlantic', 'rod', A);
    expect(b.sessionId).toBe(a.sessionId);
    expect(await eventsOf(userId)).toHaveLength(0);
  });

  it('H2: a rod cast 1 s after the previous (new key, same client) -> CAST_TOO_FAST + 1 committed event', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    await fishing.cast(userId, 'cast-h2-int-aaaaaa', 'atlantic', 'rod', A);
    advance(1_000);
    await expect(fishing.cast(userId, 'cast-h2-int-bbbbbb', 'atlantic', 'rod', A)).rejects.toThrow('CAST_TOO_FAST');
    const events = await eventsOf(userId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'cast_too_fast', sessionId: null, detail: { intervalMs: 1_000 } });
    expect(await harness.db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId))).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('H1: a new rod cast expires the open rod session but not an open net session', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }));
    const net = await fishing.cast(userId, 'cast-h1-int-net-aa', 'titicaca', 'net', A);
    advance(1_000);
    const first = await fishing.cast(userId, 'cast-h1-int-aaaaaa', 'titicaca', 'rod', A);
    advance(4_000);
    const second = await fishing.cast(userId, 'cast-h1-int-bbbbbb', 'titicaca', 'rod', A);
    expect((await sessionOf(first.sessionId)).status).toBe('expired');
    expect((await sessionOf(second.sessionId)).status).toBe('open');
    expect((await sessionOf(net.sessionId)).status).toBe('open');
  });

  it('H3: land 100 ms after the cast -> LAND_TOO_FAST, session expired + 1 event committed, blob untouched', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    const cast = await fishing.cast(userId, 'cast-h3-int-aaaaaa', 'atlantic', 'rod', A);
    advance(100);
    await expect(fishing.land(userId, 'land-h3-int-aaaaaa', cast.sessionId)).rejects.toThrow('LAND_TOO_FAST');
    expect((await sessionOf(cast.sessionId)).status).toBe('expired');
    const events = await eventsOf(userId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'land_too_fast', sessionId: cast.sessionId, detail: { elapsedMs: 100 } });
    expect(await landsOf(userId)).toHaveLength(0);
    expect((await gameState.get(userId))!.version).toBe(2);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(0);
  });

  it('a successful rod land writes one fishing_lands row + completed_at; its replay writes none', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob());
    const cast = await fishing.cast(userId, 'cast-ld-int-aaaaaa', 'atlantic', 'rod', A);
    if (cast.mode !== 'rod') throw new Error('expected a rod cast');
    advance(1_000);
    const landedAt = new Date(t);
    await fishing.land(userId, 'land-ld-int-aaaaaa', cast.sessionId);
    advance(1_000);
    await fishing.land(userId, 'land-ld-int-aaaaaa', cast.sessionId);
    const lands = await landsOf(userId);
    expect(lands).toHaveLength(1);
    expect(lands[0]).toMatchObject({ sessionId: cast.sessionId, mode: 'rod', fishId: cast.fishId, landedAt });
    const session = await sessionOf(cast.sessionId);
    expect(session.status).toBe('completed');
    expect(session.completedAt).toEqual(landedAt);
  });

  it('a net land writes one fishing_lands row per fish', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'], xpToNextLevel: 999999 }));
    const cast = await fishing.cast(userId, 'cast-ln-int-aaaaaa', 'titicaca', 'net', A);
    if (cast.mode !== 'net') throw new Error('expected a net cast');
    advance(100);
    await fishing.land(userId, 'land-ln-int-aaaaaa', cast.sessionId);
    const lands = await landsOf(userId);
    expect(lands).toHaveLength(cast.catches.length);
    expect(lands.map(l => l.fishId).sort()).toEqual(cast.catches.map(c => c.fishId).sort());
    expect(lands.every(l => l.mode === 'net' && l.sessionId === cast.sessionId)).toBe(true);
  });

  it('records client_id and strength_active from the blob', async () => {
    const active = await seedUser();
    await gameState.bootstrap(active, blob({ strengthMultiplierEnd: t + 60_000 }));
    const a = await fishing.cast(active, 'cast-st-int-aaaaaa', 'atlantic', 'rod', A);
    expect(await sessionOf(a.sessionId)).toMatchObject({ clientId: A, strengthActive: true, completedAt: null });

    const lapsed = await seedUser();
    await gameState.bootstrap(lapsed, blob({ strengthMultiplierEnd: t - 1 }));
    const b = await fishing.cast(lapsed, 'cast-st-int-bbbbbb', 'atlantic');
    expect(await sessionOf(b.sessionId)).toMatchObject({ clientId: null, strengthActive: false });
  });
});
