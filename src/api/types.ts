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
