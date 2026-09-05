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
  /**
   * Apply a completed catch to the player's progress. Implemented by the
   * in-memory repository; the PostgreSQL fishing path updates player_progress
   * inside its own transaction and does not use this.
   */
  recordCatch?(userId: string, xpGained: number): Promise<void>;
};
