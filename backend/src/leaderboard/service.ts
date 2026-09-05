export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  country: string;
  score: number;
  level: number;
  totalFishCaught: number;
};

export function createMemoryLeaderboardService(
  players: { getProfile(userId: string): Promise<{
    userId: string;
    username: string;
    country: string;
    level: number;
    xp: number;
    totalFishCaught: number;
  } | null> },
) {
  return {
    async list(userId: string, limit: number, offset: number) {
      const profile = await players.getProfile(userId);
      const entries: LeaderboardEntry[] = profile ? [{
        rank: 1,
        userId: profile.userId,
        username: profile.username,
        country: profile.country,
        score: profile.level * 1000 + profile.totalFishCaught * 100 + profile.xp,
        level: profile.level,
        totalFishCaught: profile.totalFishCaught,
      }] : [];
      return { season: 'all-time', entries: entries.slice(offset, offset + limit), total: entries.length };
    },
  };
}
