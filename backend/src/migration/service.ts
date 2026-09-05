import { z } from 'zod';
import { FISH, LOCATIONS } from '../../../src/game/data.js';
import { MAX_LEVEL } from '../../../src/game/types.js';

const caughtFishSchema = z.object({
  fish: z.object({ id: z.string().min(1) }),
  weight: z.number().finite().nonnegative(),
  location: z.string().min(1),
  timestamp: z.number().finite().nonnegative(),
});

export const localSaveSchema = z.object({
  schemaVersion: z.number().int().positive(),
  player: z.object({
    level: z.number().int().min(1).max(MAX_LEVEL),
    xp: z.number().finite().nonnegative(),
    totalFishCaught: z.number().int().nonnegative(),
    coins: z.number().finite().nonnegative(),
    unlockedLocations: z.array(z.string()),
    warehouse: z.array(caughtFishSchema),
    aquariumWarehouse: z.array(caughtFishSchema),
    aquariumSectors: z.record(z.string(), z.array(caughtFishSchema)),
  }),
});

export type LocalSave = z.infer<typeof localSaveSchema>;
export type AcceptedCatch = {
  fishId: string;
  locationId: string;
  weight: number;
  sector?: number;
};

export function validateLocalSave(input: unknown) {
  const parsed = localSaveSchema.parse(input);
  const accepted: AcceptedCatch[] = [];
  const rejected: string[] = [];
  const inspect = (caught: LocalSave['player']['warehouse'][number], source: string, sector?: number) => {
    const fish = FISH.find(item => item.id === caught.fish.id);
    const location = LOCATIONS.find(item => item.id === caught.location);
    if (!fish) {
      rejected.push(`${source}:unknown-fish:${caught.fish.id}`);
      return;
    }
    if (!location) {
      rejected.push(`${source}:unknown-location:${caught.location}`);
      return;
    }
    if (caught.weight < fish.minWeight || caught.weight > fish.maxWeight) {
      rejected.push(`${source}:invalid-weight:${caught.fish.id}`);
      return;
    }
    accepted.push({ fishId: fish.id, locationId: location.id, weight: caught.weight, ...(sector ? { sector } : {}) });
  };
  parsed.player.warehouse.forEach((item, index) => inspect(item, `warehouse:${index}`));
  parsed.player.aquariumWarehouse.forEach((item, index) => inspect(item, `aquarium-warehouse:${index}`));
  Object.entries(parsed.player.aquariumSectors).forEach(([sector, items]) => {
    const sectorNumber = Number(sector);
    items.forEach((item, index) => {
      if (!Number.isInteger(sectorNumber) || sectorNumber < 1 || sectorNumber > 5) {
        rejected.push(`aquarium-sector:${sector}:${index}:invalid-sector`);
      } else {
        inspect(item, `aquarium:${sector}:${index}`, sectorNumber);
      }
    });
  });
  return {
    sourceVersion: parsed.schemaVersion,
    accepted,
    rejected,
    summary: { accepted: accepted.length, rejected: rejected.length },
    player: parsed.player,
  };
}
