import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerGameState, userProfiles } from '../db/schema.js';
import { extractPlayerStats } from '../gamestate/playerStats.js';
import { buildLeaderboard, type LeaderboardSource } from './rank.js';

export function createPgLeaderboardService(db: Database) {
  return {
    async list(_userId: string, limit: number, offset: number) {
      const rows = await db
        .select({ userId: userProfiles.userId, username: userProfiles.username, country: userProfiles.country, state: playerGameState.state })
        .from(userProfiles)
        // Only players with game state rank. Accounts awaiting email confirmation
        // never get a session, so they never have state and never appear.
        .innerJoin(playerGameState, eq(playerGameState.userId, userProfiles.userId));

      const sources: LeaderboardSource[] = rows.map(row => ({
        userId: row.userId,
        username: row.username,
        country: row.country,
        stats: extractPlayerStats(row.state),
      }));
      return buildLeaderboard(sources, limit, offset);
    },
  };
}
