import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { fishingSessions, gameStateOperations, playerGameState, users } from '../db/schema.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgGameStateService } from '../gamestate/pgRepository.js';
import { createPgFishingService } from './pgRepository.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let gameState: ReturnType<typeof createPgGameStateService>;
let fishing: ReturnType<typeof createPgFishingService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  gameState = createPgGameStateService(harness.db);
  fishing = createPgFishingService(harness.db);
});
afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `fish-${randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `fish_${randomUUID().slice(0, 8)}`,
    country: 'BR',
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
    await gameState.put(userId, blob(), null);

    const cast = await fishing.cast(userId, 'cast-int-aaaaaaaa', 'atlantic');
    if (cast.mode !== 'rod') throw new Error('expected a rod cast');
    expect(cast.version).toBe(2);
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
    await gameState.put(userId, blob(), null);
    const a = await fishing.cast(userId, 'cast-int-bbbbbbbb', 'atlantic');
    const b = await fishing.cast(userId, 'cast-int-bbbbbbbb', 'atlantic');
    expect(b.sessionId).toBe(a.sessionId);
    expect((await gameState.get(userId))!.version).toBe(2);
    const sessions = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId));
    expect(sessions).toHaveLength(1);
  });

  it('land replays the same key: identical result, one op row, warehouse still +1', async () => {
    const userId = await seedUser();
    await gameState.put(userId, blob(), null);
    const cast = await fishing.cast(userId, 'cast-int-cccccccc', 'atlantic');
    const first = await fishing.land(userId, 'land-int-cccccccc', cast.sessionId);
    const replay = await fishing.land(userId, 'land-int-cccccccc', cast.sessionId);
    expect(replay).toEqual(first);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(3);
  });

  it('concurrent same-key land: both resolve identically, one op row', async () => {
    const userId = await seedUser();
    await gameState.put(userId, blob(), null);
    const cast = await fishing.cast(userId, 'cast-int-dddddddd', 'atlantic');
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
    await gameState.put(userId, blob(), null);
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
    await gameState.put(userId, blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'], xp: 0, xpToNextLevel: 999999 }), null);
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
    await gameState.put(userId, blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }), null);
    const cast = await fishing.cast(userId, 'cast-net-int-bb', 'titicaca', 'net');
    const first = await fishing.land(userId, 'land-net-int-bb', cast.sessionId);
    const replay = await fishing.land(userId, 'land-net-int-bb', cast.sessionId);
    expect(replay).toEqual(first);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('submarine: cast writes no blob/op, harvests bump version and shrink the roster, drain completes', async () => {
    const userId = await seedUser();
    await gameState.put(userId, blob({ level: 6, xp: 0, xpToNextLevel: 999999 }), null);

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
    await gameState.put(userId, blob({ level: 6 }), null);
    const cast = await fishing.cast(userId, 'cast-sub-int-bb', 'submarine', 'submarine');
    await expect(fishing.land(userId, 'land-sub-int-bb', cast.sessionId)).rejects.toThrow('INVALID_FISHING_SESSION');
  });

  it('deleting the user cascades fishing_sessions', async () => {
    const userId = await seedUser();
    await gameState.put(userId, blob(), null);
    await fishing.cast(userId, 'cast-int-ffffffff', 'atlantic');
    await harness.db.delete(users).where(eq(users.id, userId));
    const sessions = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId));
    expect(sessions).toHaveLength(0);
  });
});
