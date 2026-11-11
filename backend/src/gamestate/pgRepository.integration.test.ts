import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { users } from '../db/schema.js';
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
    locale: 'en',
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

  it('bootstrap creates version 1 and round-trips the envelope', async () => {
    const userId = await seedUser();
    const blob = envelope();

    const put = await svc.bootstrap(userId, blob);
    expect(put).toEqual({ version: 1 });
    const got = await svc.get(userId);

    expect(got).not.toBeNull();
    expect(got!.state).toEqual(blob);
    expect(got!.version).toBe(1);
    expect(Number.isNaN(Date.parse(got!.updatedAt))).toBe(false);
  });

  it('rejects bootstrap when a row already exists', async () => {
    const userId = await seedUser();
    await svc.bootstrap(userId, envelope());

    await expect(svc.bootstrap(userId, envelope({ coins: 7 }))).rejects.toThrow('STATE_VERSION_CONFLICT');
  });

  it('cascades on user deletion: get returns null with no error', async () => {
    const userId = await seedUser();
    await svc.bootstrap(userId, envelope());

    await harness.db.delete(users).where(eq(users.id, userId));

    expect(await svc.get(userId)).toBeNull();
  });
});
