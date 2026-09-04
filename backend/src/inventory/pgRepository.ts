import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { warehouseFish } from '../db/schema.js';
import type { EconomyService } from '../economy/service.js';
import type { createCatalogService } from '../catalog/service.js';
import type { WarehouseFish } from './service.js';

export function createPgInventoryService(
  db: Database,
  catalog: ReturnType<typeof createCatalogService>,
  economy: EconomyService,
) {
  return {
    async addCatch(input: Omit<WarehouseFish, 'id'>) {
      const [item] = await db.insert(warehouseFish).values({
        id: randomUUID(),
        userId: input.userId,
        fishId: input.fishId,
        locationId: input.locationId,
        weight: input.weight.toFixed(2),
        xp: input.xp,
      }).returning();
      return item;
    },
    async list(userId: string) {
      const items = await db.select().from(warehouseFish).where(eq(warehouseFish.userId, userId));
      return { items };
    },
    async sell(userId: string, idempotencyKey: string) {
      return db.transaction(async tx => {
        const items = await tx.select().from(warehouseFish).where(eq(warehouseFish.userId, userId));
        if (items.length === 0) throw new Error('WAREHOUSE_EMPTY');
        const value = items.reduce((total, item) => {
          const fish = catalog.findFish(item.fishId);
          return total + (fish ? Math.max(1, Math.floor(fish.xp / 2)) : 0);
        }, 0);
        const transaction = await economy.credit(userId, value, 'warehouse_sale', idempotencyKey);
        await tx.delete(warehouseFish).where(eq(warehouseFish.userId, userId));
        return { sold: items.length, value, transaction };
      });
    },
  };
}
