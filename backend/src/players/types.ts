export type PlayerProfile = {
  userId: string;
  email: string;
  username: string;
  country: string;
  level: number;
  xp: number;
  totalFishCaught: number;
  coins: number;
  unlockedLocations: string[];
};

export type PlayerRepository = {
  getProfile(userId: string): Promise<PlayerProfile | null>;
};
