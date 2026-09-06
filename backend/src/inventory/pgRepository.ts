import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { aquariumFish, walletTransactions, wallets, warehouseFish } from '../db/schema.js';
import type { EconomyService } from '../economy/service.js';
import { fishSaleValue } from '../economy/pricing.js';
import type { createCatalogService } from '../catalog/service.js';
import { addWarehouseFish } from './warehouse.js';
import type { WarehouseFish } from './service.js';

export function createPgInventoryService(
  db: Database,
  catalog: ReturnType<typeof createCatalogService>,
  economy: EconomyService,
) {
  return {
    async addCatch(input: Omit<WarehouseFish, 'id'>) {
      return addWarehouseFish(db, input);
    },
    async list(userId: string) {
      const items = await db.select().from(warehouseFish).where(eq(warehouseFish.userId, userId));
      return { items };
    },
    async sell(userId: string, idempotencyKey: string) {
      return db.transaction(async tx => {
        const existing = await tx.select().from(walletTransactions)
          .where(and(eq(walletTransactions.userId, userId), eq(walletTransactions.idempotencyKey, idempotencyKey))).limit(1);
        if (existing[0]) {
          // Replay of an already-settled sale: the warehouse is empty by now, so
          // `sold` is not recoverable here — report the recorded value instead.
          return { sold: 0, value: existing[0].amount, transaction: existing[0], replayed: true };
        }

        const items = await tx.select().from(warehouseFish).where(eq(warehouseFish.userId, userId));
        if (items.length === 0) throw new Error('WAREHOUSE_EMPTY');
        const value = items.reduce((total, item) => {
          const fish = catalog.findFish(item.fishId);
          return total + (fish ? fishSaleValue(fish.rarity) : 0);
        }, 0);
        await tx.insert(wallets).values({ userId, balance: 0 }).onConflictDoNothing();
        const current = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
        const balanceAfter = (current[0]?.balance ?? 0) + value;
        const [transaction] = await tx.insert(walletTransactions).values({
          id: randomUUID(),
          userId,
          amount: value,
          balanceAfter,
          reason: 'warehouse_sale',
          idempotencyKey,
        }).returning();
        await tx.update(wallets).set({ balance: balanceAfter, updatedAt: new Date() }).where(eq(wallets.userId, userId));
        await tx.delete(warehouseFish).where(eq(warehouseFish.userId, userId));
        return { sold: items.length, value, transaction, replayed: false };
      });
    },
    async aquarium(userId: string, sector: number) {
      if (!Number.isInteger(sector) || sector < 1 || sector > 5) throw new Error('INVALID_AQUARIUM_SECTOR');
      const items = await db.select().from(aquariumFish).where(and(eq(aquariumFish.userId, userId), eq(aquariumFish.sector, sector)));
      return { items };
    },
    async placeInAquarium(userId: string, warehouseItemId: string, sector: number) {
      if (!Number.isInteger(sector) || sector < 1 || sector > 5) throw new Error('INVALID_AQUARIUM_SECTOR');
      return db.transaction(async tx => {
        const [item] = await tx.delete(warehouseFish)
          .where(and(eq(warehouseFish.id, warehouseItemId), eq(warehouseFish.userId, userId)))
          .returning();
        if (!item) throw new Error('WAREHOUSE_FISH_NOT_FOUND');
        const [aquariumItem] = await tx.insert(aquariumFish).values({
          id: randomUUID(),
          userId,
          fishId: item.fishId,
          locationId: item.locationId,
          weight: item.weight,
          sector,
        }).returning();
        return aquariumItem;
      });
    },
  };
}
