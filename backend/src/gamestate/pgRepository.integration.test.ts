import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { playerGameState, users } from '../db/schema.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgGameStateService } from './pgRepository.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let svc: ReturnType<typeof createPgGameStateService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  svc = createPgGameStateService(harness.db);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `gs-${randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `gs_${randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  return user.id;
}

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

describe('pg game-state service (integration)', () => {
  it('returns null for an unknown user', async () => {
    expect(await svc.get(randomUUID())).toBeNull();
  });

  it('round-trips the exact envelope and an ISO updatedAt', async () => {
    const userId = await seedUser();
    const blob = envelope();

    await svc.put(userId, blob);
    const got = await svc.get(userId);

    expect(got).not.toBeNull();
    expect(got!.state).toEqual(blob);
    expect(typeof got!.updatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(got!.updatedAt))).toBe(false);
  });

  it('upserts on the second put: new state, later updatedAt, no duplicate row', async () => {
    const userId = await seedUser();

    await svc.put(userId, envelope());
    const first = await svc.get(userId);
    expect(first).not.toBeNull();

    await new Promise(r => setTimeout(r, 5));
    const changed = envelope({ level: 9, coins: 1234 });
    await svc.put(userId, changed);
    const second = await svc.get(userId);

    expect(second).not.toBeNull();
    expect(second!.state).toEqual(changed);
    expect(Date.parse(second!.updatedAt)).toBeGreaterThan(Date.parse(first!.updatedAt));

    const rows = await harness.db
      .select()
      .from(playerGameState)
      .where(eq(playerGameState.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it('cascades on user deletion: get returns null with no error', async () => {
    const userId = await seedUser();
    await svc.put(userId, envelope());

    await harness.db.delete(users).where(eq(users.id, userId));

    expect(await svc.get(userId)).toBeNull();
  });
});
