import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerGameState, userProfiles, users } from '../db/schema.js';
import { extractPlayerStats } from '../gamestate/playerStats.js';
import type { PlayerProfile, PlayerRepository } from './types.js';

export function createPgPlayerRepository(db: Database): PlayerRepository {
  return {
    async getProfile(userId): Promise<PlayerProfile | null> {
      const rows = await db
        .select({ user: users, profile: userProfiles, state: playerGameState.state })
        .from(users)
        .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
        .leftJoin(playerGameState, eq(playerGameState.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const stats = extractPlayerStats(row.state ?? null);
      return {
        userId: row.user.id,
        email: row.user.email,
        username: row.profile.username,
        country: row.profile.country,
        level: stats.level,
        xp: stats.xp,
        totalFishCaught: stats.totalFishCaught,
        coins: stats.coins,
        unlockedLocations: stats.unlockedLocations,
      };
    },
  };
}
