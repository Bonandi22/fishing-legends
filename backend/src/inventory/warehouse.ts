import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { warehouseFish } from '../db/schema.js';

// Either the pool-backed db or an open transaction — lets callers (e.g. the
// fishing service completing a catch) write to the warehouse inside their own
// transaction without reaching into this module's table themselves.
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type WarehouseExecutor = Database | Transaction;

export type NewWarehouseFish = {
  userId: string;
  fishId: string;
  locationId: string;
  weight: number;
  xp: number;
};

export async function addWarehouseFish(executor: WarehouseExecutor, input: NewWarehouseFish) {
  const [item] = await executor.insert(warehouseFish).values({
    id: randomUUID(),
    userId: input.userId,
    fishId: input.fishId,
    locationId: input.locationId,
    weight: input.weight.toFixed(2),
    xp: input.xp,
  }).returning();
  return item;
}
