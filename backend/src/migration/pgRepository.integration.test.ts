import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { aquariumFish, playerProgress, warehouseFish } from '../db/schema.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgMigrationService } from './pgRepository.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let migration: ReturnType<typeof createPgMigrationService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  migration = createPgMigrationService(harness.db);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `migrate-${crypto.randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `mg_${crypto.randomUUID().slice(0, 8)}`,
    country: 'BR',
    locale: 'en',
  });
  return user.id;
}

const caught = (id: string, weight: number, location: string) => ({
  fish: { id },
  weight,
  location,
  timestamp: 1_700_000_000_000,
});

const validSave = () => ({
  schemaVersion: 3,
  player: {
    level: 5,
    xp: 120,
    totalFishCaught: 8,
    coins: 500,
    unlockedLocations: ['amazon', 'titicaca'],
    warehouse: [caught('tilapia', 1.5, 'amazon')],
    aquariumWarehouse: [],
    aquariumSectors: { '2': [caught('carpa', 3, 'titicaca')] },
  },
});

describe('pg migration service (integration)', () => {
  it('previews accepted and rejected entries without touching the database', async () => {
    const userId = await seedUser();
    const save = validSave();
    save.player.warehouse.push(caught('not-a-real-fish', 1, 'amazon'));

    const preview = await migration.preview(userId, save);
    expect(preview.summary.accepted).toBe(2);
    expect(preview.summary.rejected).toBe(1);
    expect(preview.rejected.some(entry => entry.includes('unknown-fish'))).toBe(true);

    const warehouse = await harness.db.select().from(warehouseFish).where(eq(warehouseFish.userId, userId));
    expect(warehouse).toHaveLength(0);
  });

  it('imports accepted catches and merges progress transactionally', async () => {
    const userId = await seedUser();

    const result = await migration.import(userId, validSave(), `import-${crypto.randomUUID()}`);
    expect(result).toMatchObject({ imported: true, summary: { accepted: 2, rejected: 0 } });

    const warehouse = await harness.db.select().from(warehouseFish).where(eq(warehouseFish.userId, userId));
    expect(warehouse).toHaveLength(1);
    expect(warehouse[0].fishId).toBe('tilapia');

    const aquarium = await harness.db.select().from(aquariumFish).where(eq(aquariumFish.userId, userId));
    expect(aquarium).toHaveLength(1);
    expect(aquarium[0].sector).toBe(2);

    const [progress] = await harness.db.select().from(playerProgress).where(eq(playerProgress.userId, userId));
    expect(progress.level).toBe(5);
    expect(progress.xp).toBe(120);
    expect(progress.totalFishCaught).toBe(8);
    expect(progress.unlockedLocations).toEqual(expect.arrayContaining(['amazon', 'titicaca']));
  });

  it('never lowers existing progress on import', async () => {
    const userId = await seedUser();
    await harness.db
      .update(playerProgress)
      .set({ level: 9, xp: 999, totalFishCaught: 40 })
      .where(eq(playerProgress.userId, userId));

    await migration.import(userId, validSave(), `import-${crypto.randomUUID()}`);

    const [progress] = await harness.db.select().from(playerProgress).where(eq(playerProgress.userId, userId));
    expect(progress.level).toBe(9);
    expect(progress.xp).toBe(999);
    expect(progress.totalFishCaught).toBe(40);
  });

  it('allows import only once per user', async () => {
    const userId = await seedUser();
    await migration.import(userId, validSave(), `import-${crypto.randomUUID()}`);
    await expect(
      migration.import(userId, validSave(), `import-${crypto.randomUUID()}`),
    ).rejects.toThrow('LOCAL_SAVE_ALREADY_IMPORTED');
  });
});
