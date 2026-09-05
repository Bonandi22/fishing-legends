import { count, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerProgress, userProfiles } from '../db/schema.js';

export function createPgLeaderboardService(db: Database) {
  return {
    async list(_userId: string, limit: number, offset: number) {
      const [{ total }] = await db.select({ total: count() }).from(playerProgress);
      const rows = await db
        .select({
          userId: playerProgress.userId,
          username: userProfiles.username,
          country: userProfiles.country,
          level: playerProgress.level,
          xp: playerProgress.xp,
          totalFishCaught: playerProgress.totalFishCaught,
        })
        .from(playerProgress)
        .innerJoin(userProfiles, eq(userProfiles.userId, playerProgress.userId))
        .orderBy(desc(playerProgress.level), desc(playerProgress.totalFishCaught), desc(playerProgress.xp), desc(playerProgress.userId))
        .limit(limit)
        .offset(offset);
      const entries = rows.map((row, index) => ({
        rank: offset + index + 1,
        userId: row.userId,
        username: row.username,
        country: row.country,
        score: row.level * 1000 + row.totalFishCaught * 100 + row.xp,
        level: row.level,
        totalFishCaught: row.totalFishCaught,
      }));
      return { season: 'all-time', entries, total };
    },
  };
}
