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

export interface MigrationPreview {
  sourceVersion: number;
  summary: { accepted: number; rejected: number };
  rejected: unknown[];
}

export interface MigrationResult {
  imported: boolean;
  sourceVersion: number;
  summary: { accepted: number; rejected: number };
}
