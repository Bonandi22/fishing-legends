export interface ApiUser {
  id: string;
  email: string;
  username: string;
  country: string;
}

export interface PlayerProfile {
  userId: string;
  email: string;
  username: string;
  country: string;
  level: number;
  xp: number;
  totalFishCaught: number;
  coins: number;
  unlockedLocations: string[];
}

export interface GameStateEnvelope {
  state: unknown;
  updatedAt: string | null;
  version: number | null;
}

export interface ApiLeaderboardEntry {
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
}

export interface LeaderboardPage {
  season: string;
  entries: ApiLeaderboardEntry[];
  total: number;
}

export interface Season {
  id: string;
  seasonKey: string;
  name: string;
  status: 'scheduled' | 'active' | 'closed';
  startsAt: string;
  endsAt: string;
  rulesetVersion: string;
  minimumLevel: number;
}
