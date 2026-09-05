import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { aquariumFish, warehouseFish } from '../db/schema.js';
import { createCatalogService } from '../catalog/service.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgEconomyService } from '../economy/pgRepository.js';
import { createPgInventoryService } from './pgRepository.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let economy: ReturnType<typeof createPgEconomyService>;
let inventory: ReturnType<typeof createPgInventoryService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  economy = createPgEconomyService(harness.db);
  inventory = createPgInventoryService(harness.db, createCatalogService(), economy);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `warehouse-${crypto.randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `wh_${crypto.randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  return user.id;
}

const tilapia = () => ({ fishId: 'tilapia', locationId: 'amazon', weight: 1.5, xp: 10 });

describe('pg inventory service (integration)', () => {
  it('adds catches and lists them per user', async () => {
    const userId = await seedUser();
    expect(await inventory.list(userId)).toEqual({ items: [] });

    await inventory.addCatch({ userId, ...tilapia() });
    const listed = await inventory.list(userId);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0].fishId).toBe('tilapia');
  });

  it('sells the whole warehouse in one transaction and credits the wallet', async () => {
    const userId = await seedUser();
    await inventory.addCatch({ userId, ...tilapia() });
    await inventory.addCatch({ userId, ...tilapia() });

    const result = await inventory.sell(userId, `sell-${crypto.randomUUID()}`);
    expect(result.sold).toBe(2);
    expect(result.value).toBe(10); // max(1, floor(10/2)) per tilapia

    expect(await inventory.list(userId)).toEqual({ items: [] });
    expect(await economy.getBalance(userId)).toEqual({ balance: 10 });
  });

  it('rejects selling an empty warehouse', async () => {
    const userId = await seedUser();
    await expect(inventory.sell(userId, `sell-${crypto.randomUUID()}`)).rejects.toThrow('WAREHOUSE_EMPTY');
  });

  it('replays a settled sale on the same idempotency key instead of failing', async () => {
    const userId = await seedUser();
    await inventory.addCatch({ userId, ...tilapia() });
    await inventory.addCatch({ userId, ...tilapia() });
    const k = `sell-${crypto.randomUUID()}`;

    const first = await inventory.sell(userId, k);
    const replay = await inventory.sell(userId, k);

    expect(replay.replayed).toBe(true);
    expect(replay.transaction.id).toBe(first.transaction.id);
    expect(replay.value).toBe(first.value);
    expect(await economy.getBalance(userId)).toEqual({ balance: first.value });
  });

  it('moves a fish from the warehouse to an aquarium sector in one transaction', async () => {
    const userId = await seedUser();
    const item = await inventory.addCatch({ userId, ...tilapia() });

    const placed = await inventory.placeInAquarium(userId, item.id, 2);
    expect(placed.sector).toBe(2);

    expect(await inventory.list(userId)).toEqual({ items: [] });
    const inSector2 = await inventory.aquarium(userId, 2);
    expect(inSector2.items).toHaveLength(1);
    expect(await inventory.aquarium(userId, 1)).toEqual({ items: [] });

    const rows = await harness.db
      .select()
      .from(aquariumFish)
      .where(and(eq(aquariumFish.userId, userId), eq(aquariumFish.sector, 2)));
    expect(rows).toHaveLength(1);
  });

  it('rejects placing an unknown warehouse item', async () => {
    const userId = await seedUser();
    await expect(
      inventory.placeInAquarium(userId, crypto.randomUUID(), 1),
    ).rejects.toThrow('WAREHOUSE_FISH_NOT_FOUND');
  });

  it('rejects an out-of-range aquarium sector', async () => {
    const userId = await seedUser();
    await expect(inventory.aquarium(userId, 6)).rejects.toThrow('INVALID_AQUARIUM_SECTOR');
    await expect(inventory.aquarium(userId, 0)).rejects.toThrow('INVALID_AQUARIUM_SECTOR');
  });

  it('does not leak another player\'s warehouse item into a placement', async () => {
    const owner = await seedUser();
    const intruder = await seedUser();
    const item = await inventory.addCatch({ userId: owner, ...tilapia() });
    await expect(inventory.placeInAquarium(intruder, item.id, 1)).rejects.toThrow('WAREHOUSE_FISH_NOT_FOUND');
    // the owner still has it
    const stillThere = await harness.db.select().from(warehouseFish).where(eq(warehouseFish.userId, owner));
    expect(stillThere).toHaveLength(1);
  });
});
