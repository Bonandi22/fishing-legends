import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerProgress, userProfiles, users } from '../db/schema.js';
import type { PlayerProfile, PlayerRepository } from './types.js';

export function createPgPlayerRepository(db: Database): PlayerRepository {
  return {
    async getProfile(userId): Promise<PlayerProfile | null> {
      const rows = await db
        .select({ user: users, profile: userProfiles, progress: playerProgress })
        .from(users)
        .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
        .leftJoin(playerProgress, eq(playerProgress.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        userId: row.user.id,
        email: row.user.email,
        username: row.profile.username,
        country: row.profile.country,
        level: row.progress?.level ?? 1,
        xp: row.progress?.xp ?? 0,
        totalFishCaught: row.progress?.totalFishCaught ?? 0,
        coins: row.progress?.coins ?? 0,
        unlockedLocations: row.progress?.unlockedLocations ?? [],
      };
    },
  };
}
