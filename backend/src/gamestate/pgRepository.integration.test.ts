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

  it('first put (baseVersion null) creates version 1 and round-trips the envelope', async () => {
    const userId = await seedUser();
    const blob = envelope();

    const put = await svc.put(userId, blob, null);
    expect(put).toEqual({ version: 1 });
    const got = await svc.get(userId);

    expect(got).not.toBeNull();
    expect(got!.state).toEqual(blob);
    expect(got!.version).toBe(1);
    expect(Number.isNaN(Date.parse(got!.updatedAt))).toBe(false);
  });

  it('upserts on a matching baseVersion: new state, bumped version, later updatedAt, no duplicate row', async () => {
    const userId = await seedUser();

    await svc.put(userId, envelope(), null);
    const first = await svc.get(userId);
    expect(first!.version).toBe(1);

    await new Promise(r => setTimeout(r, 5));
    const changed = envelope({ level: 9, coins: 1234 });
    const put = await svc.put(userId, changed, 1);
    expect(put).toEqual({ version: 2 });
    const second = await svc.get(userId);

    expect(second!.state).toEqual(changed);
    expect(second!.version).toBe(2);
    expect(Date.parse(second!.updatedAt)).toBeGreaterThan(Date.parse(first!.updatedAt));

    const rows = await harness.db
      .select()
      .from(playerGameState)
      .where(eq(playerGameState.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it('rejects a stale baseVersion and leaves the stored state untouched', async () => {
    const userId = await seedUser();
    await svc.put(userId, envelope({ coins: 1 }), null);
    await svc.put(userId, envelope({ coins: 2 }), 1);

    await expect(svc.put(userId, envelope({ coins: 3 }), 1)).rejects.toThrow('STATE_VERSION_CONFLICT');

    const got = await svc.get(userId);
    expect((got!.state as { player: { coins: number } }).player.coins).toBe(2);
    expect(got!.version).toBe(2);
  });

  it('rejects baseVersion null when a row already exists', async () => {
    const userId = await seedUser();
    await svc.put(userId, envelope(), null);

    await expect(svc.put(userId, envelope({ coins: 7 }), null)).rejects.toThrow('STATE_VERSION_CONFLICT');
  });

  it('cascades on user deletion: get returns null with no error', async () => {
    const userId = await seedUser();
    await svc.put(userId, envelope(), null);

    await harness.db.delete(users).where(eq(users.id, userId));

    expect(await svc.get(userId)).toBeNull();
  });
});
