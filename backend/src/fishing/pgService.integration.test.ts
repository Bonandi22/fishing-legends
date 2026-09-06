import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { fishingSessions, playerProgress, warehouseFish } from '../db/schema.js';
import { FISHING_SESSION_TTL_MS } from './session.js';
import { createCatalogService } from '../catalog/service.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgPlayerRepository } from '../players/pgRepository.js';
import { createPgFishingService } from './pgService.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let fishing: ReturnType<typeof createPgFishingService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  const catalog = createCatalogService();
  auth = createPgAuthRepository(harness.db);
  fishing = createPgFishingService(harness.db, catalog, createPgPlayerRepository(harness.db));
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `fisher-${crypto.randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `fisher_${crypto.randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  return user.id;
}

const key = () => `idem-${crypto.randomUUID()}`;

describe('pg fishing service (integration)', () => {
  it('rejects an unknown location', async () => {
    const userId = await seedUser();
    await expect(fishing.start(userId, 'no-such-place', key())).rejects.toThrow('INVALID_FISHING_REQUEST');
  });

  it('rejects a location above the player level', async () => {
    const userId = await seedUser();
    // caribbean requires level 3; a fresh player is level 1
    await expect(fishing.start(userId, 'caribbean', key())).rejects.toThrow('LOCATION_LOCKED');
  });

  it('creates an idempotent session for the same key', async () => {
    const userId = await seedUser();
    const k = key();
    const first = await fishing.start(userId, 'amazon', k);
    const second = await fishing.start(userId, 'amazon', k);
    expect(second.id).toBe(first.id);
  });

  it('completes a session transactionally: warehouse + progress in one write', async () => {
    const userId = await seedUser();
    const session = await fishing.start(userId, 'amazon', key());

    const { result } = await fishing.complete(userId, session.id);
    expect(result.fishId).toEqual(expect.any(String));
    expect(result.weight).toBeGreaterThan(0);
    expect(result.xp).toBeGreaterThanOrEqual(0);

    const stored = await harness.db.select().from(warehouseFish).where(eq(warehouseFish.userId, userId));
    expect(stored).toHaveLength(1);
    expect(stored[0].fishId).toBe(result.fishId);

    const [progress] = await harness.db.select().from(playerProgress).where(eq(playerProgress.userId, userId));
    expect(progress.totalFishCaught).toBe(1);
    // XP was granted: either it accumulated or it rolled into a level-up
    expect(progress.xp > 0 || progress.level > 1).toBe(true);
  });

  it('is idempotent on repeated completion: no duplicate catch', async () => {
    const userId = await seedUser();
    const session = await fishing.start(userId, 'amazon', key());

    const first = await fishing.complete(userId, session.id);
    const second = await fishing.complete(userId, session.id);

    expect(second.result).toEqual(first.result);
    const stored = await harness.db.select().from(warehouseFish).where(eq(warehouseFish.userId, userId));
    expect(stored).toHaveLength(1);
    const [progress] = await harness.db.select().from(playerProgress).where(eq(playerProgress.userId, userId));
    expect(progress.totalFishCaught).toBe(1);
  });

  it('rejects completing another player\'s session', async () => {
    const owner = await seedUser();
    const intruder = await seedUser();
    const session = await fishing.start(owner, 'amazon', key());
    await expect(fishing.complete(intruder, session.id)).rejects.toThrow('INVALID_FISHING_SESSION');
  });

  it('expires a session that is completed too late and marks it in the database', async () => {
    const userId = await seedUser();
    const session = await fishing.start(userId, 'amazon', key());

    await harness.db.update(fishingSessions)
      .set({ createdAt: new Date(Date.now() - FISHING_SESSION_TTL_MS - 1000) })
      .where(eq(fishingSessions.id, session.id));

    await expect(fishing.complete(userId, session.id)).rejects.toThrow('FISHING_SESSION_EXPIRED');

    const [row] = await harness.db.select().from(fishingSessions).where(eq(fishingSessions.id, session.id));
    expect(row.status).toBe('expired');

    // no catch was recorded
    const stored = await harness.db.select().from(warehouseFish).where(eq(warehouseFish.userId, userId));
    expect(stored).toHaveLength(0);
  });
});
