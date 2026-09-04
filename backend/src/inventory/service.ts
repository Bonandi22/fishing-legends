import { randomUUID } from 'node:crypto';
import type { createCatalogService } from '../catalog/service.js';
import type { EconomyService } from '../economy/service.js';

export type WarehouseFish = {
  id: string;
  userId: string;
  fishId: string;
  locationId: string;
  weight: number;
  xp: number;
};

export function createMemoryInventoryService(
  catalog: ReturnType<typeof createCatalogService>,
  economy: EconomyService,
) {
  const warehouse = new Map<string, WarehouseFish[]>();
  return {
    addCatch(input: Omit<WarehouseFish, 'id'>) {
      const item = { ...input, id: randomUUID() };
      const items = warehouse.get(input.userId) ?? [];
      items.push(item);
      warehouse.set(input.userId, items);
      return item;
    },
    list(userId: string) {
      return { items: warehouse.get(userId) ?? [] };
    },
    async sell(userId: string, idempotencyKey: string) {
      const items = warehouse.get(userId) ?? [];
      if (items.length === 0) throw new Error('WAREHOUSE_EMPTY');
      const value = items.reduce((total, item) => {
        const fish = catalog.findFish(item.fishId);
        return total + (fish ? Math.max(1, Math.floor(fish.xp / 2)) : 0);
      }, 0);
      const transaction = await economy.credit(userId, value, 'warehouse_sale', idempotencyKey);
      warehouse.set(userId, []);
      return { sold: items.length, value, transaction };
    },
    aquarium(_userId: string, sector: number) {
      if (!Number.isInteger(sector) || sector < 1 || sector > 5) throw new Error('INVALID_AQUARIUM_SECTOR');
      return { items: [] };
    },
    placeInAquarium(userId: string, warehouseItemId: string, sector: number) {
      if (!Number.isInteger(sector) || sector < 1 || sector > 5) throw new Error('INVALID_AQUARIUM_SECTOR');
      const items = warehouse.get(userId) ?? [];
      const index = items.findIndex(item => item.id === warehouseItemId);
      if (index === -1) throw new Error('WAREHOUSE_FISH_NOT_FOUND');
      const [item] = items.splice(index, 1);
      warehouse.set(userId, items);
      return { ...item, sector };
    },
  };
}
