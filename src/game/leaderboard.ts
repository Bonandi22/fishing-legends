import { PlayerState, ROD_SKINS } from './types';

export interface LeaderboardPlayer {
  rank: number;
  name: string;
  level: number;
  totalFishCaught: number;
  coins: number;
  skins: string[];
  multipliers: { luck: number; strength: number };
  country: string;
  isCurrentPlayer?: boolean;
}

const LB_KEY = 'fishing-game-leaderboard';
const ACCOUNT_KEY = 'fishing-game-account';

export interface StoredEntry {
  email: string;
  username: string;
  country: string;
  level: number;
  totalFishCaught: number;
  coins: number;
  skins: string[];
  multipliers: { luck: number; strength: number };
  updatedAt: number;
}

function readAll(): Record<string, StoredEntry> {
  try {
    const raw = localStorage.getItem(LB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function writeAll(map: Record<string, StoredEntry>) {
  localStorage.setItem(LB_KEY, JSON.stringify(map));
}

function getAccount(): { email: string; username?: string; country?: string } | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

/** Register/update the current logged-in player in the leaderboard. */
export function syncCurrentPlayer(player: PlayerState) {
  const acc = getAccount();
  if (!acc || !acc.email || !acc.username) return; // must be registered with username
  const all = readAll();
  all[acc.email] = {
    email: acc.email,
    username: acc.username,
    country: acc.country || '🌍',
    level: player.level,
    totalFishCaught: player.totalFishCaught,
    coins: player.coins,
    skins: player.ownedSkins,
    multipliers: { luck: 0, strength: 0 }, // not tracked yet
    updatedAt: Date.now(),
  };
  writeAll(all);
}

export function getLeaderboard(): LeaderboardPlayer[] {
  const all = readAll();
  const acc = getAccount();
  const entries = Object.values(all)
    .sort((a, b) => b.totalFishCaught - a.totalFishCaught || b.level - a.level)
    .slice(0, 100);

  return entries.map((e, i) => ({
    rank: i + 1,
    name: e.username,
    level: e.level,
    totalFishCaught: e.totalFishCaught,
    coins: e.coins,
    skins: e.skins.filter(id => ROD_SKINS.find(s => s.id === id)),
    multipliers: e.multipliers,
    country: e.country,
    isCurrentPlayer: !!acc && acc.email === e.email,
  }));
}

export function getPlayerRank(playerFishCaught: number): number {
  const acc = getAccount();
  const all = readAll();
  if (!acc) return 0;
  const sorted = Object.values(all).sort((a, b) => b.totalFishCaught - a.totalFishCaught);
  const idx = sorted.findIndex(e => e.email === acc.email);
  if (idx >= 0) return idx + 1;
  // Not yet synced — estimate
  const better = sorted.filter(e => e.totalFishCaught > playerFishCaught).length;
  return better + 1;
}

/** Find a saved account by username (case-insensitive). Returns the stored entry or null. */
export function findAccountByUsername(username: string): StoredEntry | null {
  const all = readAll();
  const target = username.trim().toLowerCase();
  if (!target) return null;
  const found = Object.values(all).find(e => e.username.toLowerCase() === target);
  return found || null;
}

/** List all saved usernames for autocomplete. */
export function listSavedUsernames(): string[] {
  const all = readAll();
  return Object.values(all).map(e => e.username).filter(Boolean);
}

export function isRegistered(): boolean {
  const acc = getAccount();
  return !!(acc && acc.email && acc.username);
}
