import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { gameStateOperations, users } from '../db/schema.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgGameStateService } from './pgRepository.js';
import { createPgGameStateEconomyService } from './economyService.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';
import { FISH } from '../../../src/game/data.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let gameState: ReturnType<typeof createPgGameStateService>;
let economy: ReturnType<typeof createPgGameStateEconomyService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  gameState = createPgGameStateService(harness.db);
  economy = createPgGameStateEconomyService(harness.db);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `econ-${randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `econ_${randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  return user.id;
}

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

describe('pg game-state economy service (integration)', () => {
  it('sells transactionally: warehouse cleared, coins up, version +1, one operation row', async () => {
    const userId = await seedUser();
    await gameState.put(userId, blob(oneFish), null);

    const res = await economy.sellWarehouse(userId, 'idem-key-int-aaaaaaaa');
    expect(res.version).toBe(2);
    expect(res.state.player.warehouse).toEqual([]);
    expect(res.state.player.coins).toBeGreaterThan(100);

    const got = await gameState.get(userId);
    expect(got!.version).toBe(2);
    expect((got!.state as { player: { warehouse: unknown[] } }).player.warehouse).toEqual([]);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('replays the same key: identical result, still one row, blob untouched by the replay', async () => {
    const userId = await seedUser();
    await gameState.put(userId, blob(oneFish), null);

    const first = await economy.sellWarehouse(userId, 'idem-key-int-bbbbbbbb');
    const replay = await economy.sellWarehouse(userId, 'idem-key-int-bbbbbbbb');
    expect(replay).toEqual(first);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect((await gameState.get(userId))!.version).toBe(2);
  });

  it('empty warehouse -> WAREHOUSE_EMPTY, nothing written', async () => {
    const userId = await seedUser();
    await gameState.put(userId, blob([]), null);

    await expect(economy.sellWarehouse(userId, 'idem-key-int-cccccccc')).rejects.toThrow('WAREHOUSE_EMPTY');

    expect((await gameState.get(userId))!.version).toBe(1);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(0);
  });

  it('deleting the user cascades game_state_operations', async () => {
    const userId = await seedUser();
    await gameState.put(userId, blob(oneFish), null);
    await economy.sellWarehouse(userId, 'idem-key-int-dddddddd');

    await harness.db.delete(users).where(eq(users.id, userId));

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(0);
  });
});
