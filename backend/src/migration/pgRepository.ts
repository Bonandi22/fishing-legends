import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { aquariumFish, localSaveMigrations, playerProgress, warehouseFish } from '../db/schema.js';
import { validateLocalSave } from './service.js';

export function createPgMigrationService(db: Database) {
  return {
    async preview(_userId: string, input: unknown) {
      const result = validateLocalSave(input);
      return { sourceVersion: result.sourceVersion, summary: result.summary, rejected: result.rejected };
    },
    async import(userId: string, input: unknown, _key: string) {
      const result = validateLocalSave(input);
      return db.transaction(async tx => {
        const existing = await tx.select().from(localSaveMigrations).where(eq(localSaveMigrations.userId, userId)).limit(1);
        if (existing[0]) throw new Error('LOCAL_SAVE_ALREADY_IMPORTED');
        await tx.insert(localSaveMigrations).values({ id: randomUUID(), userId, sourceVersion: result.sourceVersion });
        for (const item of result.accepted) {
          if (item.sector) {
            await tx.insert(aquariumFish).values({
              id: randomUUID(), userId, fishId: item.fishId, locationId: item.locationId,
              weight: item.weight.toFixed(2), sector: item.sector,
            });
          } else {
            await tx.insert(warehouseFish).values({
              id: randomUUID(), userId, fishId: item.fishId, locationId: item.locationId,
              weight: item.weight.toFixed(2), xp: 0,
            });
          }
        }
        const progress = await tx.select().from(playerProgress).where(eq(playerProgress.userId, userId)).limit(1);
        if (progress[0]) {
          await tx.update(playerProgress).set({
            level: Math.max(progress[0].level, result.player.level),
            xp: Math.max(progress[0].xp, Math.floor(result.player.xp)),
            totalFishCaught: Math.max(progress[0].totalFishCaught, result.player.totalFishCaught),
            unlockedLocations: [...new Set([...progress[0].unlockedLocations, ...result.player.unlockedLocations])],
            updatedAt: new Date(),
          }).where(eq(playerProgress.userId, userId));
        }
        return { imported: true, sourceVersion: result.sourceVersion, summary: result.summary };
      });
    },
  };
}
