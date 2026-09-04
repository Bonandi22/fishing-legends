import { z } from 'zod';
import { FISH, LOCATIONS } from '../../../src/game/data.js';

const fishSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rarity: z.string().min(1),
  waterType: z.enum(['saltwater', 'freshwater']),
  minWeight: z.number().positive(),
  maxWeight: z.number().positive(),
  xp: z.number().int().nonnegative(),
  description: z.string(),
  emoji: z.string().min(1),
  world: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

const locationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['ocean', 'river', 'lake']),
  waterType: z.enum(['saltwater', 'freshwater']),
  description: z.string(),
  requiredLevel: z.number().int().nonnegative(),
  fishIds: z.array(z.string().min(1)).min(1),
  emoji: z.string().min(1),
  world: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

export type PublicCatalog = {
  version: string;
  fish: ReturnType<typeof fishSchema.parse>[];
  locations: ReturnType<typeof locationSchema.parse>[];
};

export function createCatalogService(version = 'local-v1') {
  const fish = FISH.map(item => fishSchema.parse(item));
  const locations = LOCATIONS.map(item => locationSchema.parse(item));
  const fishIds = new Set(fish.map(item => item.id));
  const duplicateFishIds = fish.length !== fishIds.size;
  const invalidReferences = locations.some(location => location.fishIds.some(id => !fishIds.has(id)));
  if (duplicateFishIds || invalidReferences) {
    throw new Error('INVALID_CATALOG');
  }

  const catalog: PublicCatalog = { version, fish, locations };
  return {
    getPublicCatalog(): PublicCatalog {
      return catalog;
    },
    findFish(id: string) {
      return catalog.fish.find(item => item.id === id) ?? null;
    },
    findLocation(id: string) {
      return catalog.locations.find(item => item.id === id) ?? null;
    },
  };
}
