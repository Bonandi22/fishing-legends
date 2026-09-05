import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { fishingSessions, playerProgress, warehouseFish } from '../db/schema.js';
import type { createCatalogService } from '../catalog/service.js';
import type { PlayerRepository } from '../players/types.js';
import { applyCatchProgress } from '../players/progress.js';
import { rollCatch } from './roll.js';

export function createPgFishingService(
  db: Database,
  catalog: ReturnType<typeof createCatalogService>,
  players: PlayerRepository,
) {
  const toSession = (row: typeof fishingSessions.$inferSelect) => ({
    ...row,
    status: (row.status === 'completed' ? 'completed' : 'open') as 'open' | 'completed',
    ...(row.resultFishId && row.resultWeight !== null && row.resultXp !== null
      ? { result: { fishId: row.resultFishId, weight: Number(row.resultWeight), xp: row.resultXp } }
      : {}),
  });

  return {
    async start(userId: string, locationId: string, idempotencyKey: string) {
      const profile = await players.getProfile(userId);
      const location = catalog.findLocation(locationId);
      if (!profile || !location) throw new Error('INVALID_FISHING_REQUEST');
      if (profile.level < location.requiredLevel) throw new Error('LOCATION_LOCKED');
      const existing = await db.select().from(fishingSessions)
        .where(and(eq(fishingSessions.userId, userId), eq(fishingSessions.idempotencyKey, idempotencyKey))).limit(1);
      if (existing[0]) return toSession(existing[0]);
      const [session] = await db.insert(fishingSessions).values({
        id: randomUUID(), userId, locationId,
        rulesetVersion: catalog.getPublicCatalog().version,
        idempotencyKey,
      }).returning();
      return toSession(session);
    },

    async complete(userId: string, sessionId: string) {
      const session = await db.select().from(fishingSessions)
        .where(and(eq(fishingSessions.id, sessionId), eq(fishingSessions.userId, userId))).limit(1);
      const current = session[0];
      if (!current) throw new Error('INVALID_FISHING_SESSION');
      if (current.status === 'completed' && current.resultFishId && current.resultWeight !== null && current.resultXp !== null) {
        return {
          session: toSession(current),
          result: { fishId: current.resultFishId, weight: Number(current.resultWeight), xp: current.resultXp },
        };
      }
      const location = catalog.findLocation(current.locationId);
      if (!location) throw new Error('INVALID_FISHING_SESSION');
      const available = location.fishIds.map(id => catalog.findFish(id))
        .filter((fish): fish is NonNullable<typeof fish> => Boolean(fish));
      if (available.length === 0) throw new Error('INVALID_FISHING_SESSION');
      const profile = await players.getProfile(userId);
      const { fish, weight } = rollCatch(available, profile?.level ?? 1);
      const result = { fishId: fish.id, weight, xp: fish.xp };

      return db.transaction(async tx => {
        const [claimed] = await tx.update(fishingSessions).set({
          status: 'completed',
          completedAt: new Date(),
          resultFishId: result.fishId,
          resultWeight: result.weight.toFixed(2),
          resultXp: result.xp,
        }).where(and(eq(fishingSessions.id, sessionId), eq(fishingSessions.userId, userId), eq(fishingSessions.status, 'open'))).returning();
        if (!claimed) {
          const [completed] = await tx.select().from(fishingSessions).where(eq(fishingSessions.id, sessionId)).limit(1);
          if (!completed?.resultFishId || completed.resultWeight === null || completed.resultXp === null) throw new Error('INVALID_FISHING_SESSION');
          return { session: toSession(completed), result: { fishId: completed.resultFishId, weight: Number(completed.resultWeight), xp: completed.resultXp } };
        }
        const progress = await tx.select().from(playerProgress).where(eq(playerProgress.userId, userId)).limit(1);
        if (!progress[0]) throw new Error('INVALID_PLAYER_PROGRESS');
        const updated = applyCatchProgress({ level: progress[0].level, xp: progress[0].xp }, result.xp);
        await tx.insert(warehouseFish).values({
          id: randomUUID(), userId, fishId: result.fishId, locationId: current.locationId,
          weight: result.weight.toFixed(2), xp: result.xp,
        });
        await tx.update(playerProgress).set({
          level: updated.level, xp: updated.xp,
          totalFishCaught: progress[0].totalFishCaught + 1,
          updatedAt: new Date(),
        }).where(eq(playerProgress.userId, userId));
        return { session: toSession(claimed), result };
      });
    },
  };
}
