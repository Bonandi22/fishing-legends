import type { PlayerStats } from '../gamestate/playerStats.js';

export type LeaderboardSource = {
  userId: string;
  username: string;
  country: string;
  stats: PlayerStats;
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  country: string;
  level: number;
  xp: number;
  totalFishCaught: number;
  score: number;
  coins: number;
  skins: string[];
  boatSkins: string[];
  multipliers: { luck: number; strength: number };
};

export type LeaderboardPage = { season: string; entries: LeaderboardEntry[]; total: number };

const scoreOf = (stats: PlayerStats) => stats.level * 1000 + stats.totalFishCaught * 100 + stats.xp;

/**
 * Ranks every player by score (level, then catches, then xp — ties broken by
 * `userId` for a stable order) and paginates. Runs over the full player set in
 * application code rather than in SQL, matching the rest of the codebase's
 * rule of never manipulating the game-state blob with raw jsonb queries.
 */
export function buildLeaderboard(players: LeaderboardSource[], limit: number, offset: number): LeaderboardPage {
  const ranked = players
    .map(p => ({
      userId: p.userId,
      username: p.username,
      country: p.country,
      level: p.stats.level,
      xp: p.stats.xp,
      totalFishCaught: p.stats.totalFishCaught,
      score: scoreOf(p.stats),
      coins: p.stats.coins,
      skins: p.stats.ownedSkins,
      boatSkins: p.stats.ownedBoatSkins,
      multipliers: { luck: p.stats.luckMultiplierPower, strength: p.stats.strengthMultiplierPower },
    }))
    .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return { season: 'all-time', entries: ranked.slice(offset, offset + limit), total: ranked.length };
}
