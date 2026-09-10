import { describe, expect, it } from 'vitest';
import { buildLeaderboard, type LeaderboardSource } from './rank.js';

const stats = (over: Partial<LeaderboardSource['stats']> = {}): LeaderboardSource['stats'] => ({
  level: 1, xp: 0, totalFishCaught: 0, coins: 0,
  unlockedLocations: ['atlantic'], ownedSkins: ['default'], ownedBoatSkins: ['classic'],
  luckMultiplierPower: 0, strengthMultiplierPower: 0,
  ...over,
});

const player = (userId: string, over: Partial<LeaderboardSource['stats']> = {}): LeaderboardSource => ({
  userId, username: `user-${userId}`, country: 'BR', stats: stats(over),
});

describe('buildLeaderboard', () => {
  it('ranks by level, then catches, then xp', () => {
    const page = buildLeaderboard([
      player('a', { level: 3, totalFishCaught: 10 }),
      player('b', { level: 9, totalFishCaught: 2 }),
      player('c', { level: 9, totalFishCaught: 40 }),
    ], 10, 0);

    expect(page.entries.map(e => e.userId)).toEqual(['c', 'b', 'a']);
    expect(page.entries.map(e => e.rank)).toEqual([1, 2, 3]);
    expect(page.total).toBe(3);
  });

  it('breaks a full tie by userId for a stable order', () => {
    const page = buildLeaderboard([player('b'), player('a')], 10, 0);
    expect(page.entries.map(e => e.userId)).toEqual(['a', 'b']);
  });

  it('paginates with limit/offset while total reflects the whole set', () => {
    const players = ['a', 'b', 'c'].map(id => player(id, { level: id.charCodeAt(0) }));
    const page = buildLeaderboard(players, 2, 2);
    expect(page.total).toBe(3);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].rank).toBe(3);
  });

  it('carries coins/skins/boatSkins/multipliers through for the profile view', () => {
    const page = buildLeaderboard([player('a', {
      coins: 500, ownedSkins: ['default', 'gold'], ownedBoatSkins: ['classic', 'red'],
      luckMultiplierPower: 2, strengthMultiplierPower: 4,
    })], 10, 0);
    expect(page.entries[0]).toMatchObject({
      coins: 500, skins: ['default', 'gold'], boatSkins: ['classic', 'red'],
      multipliers: { luck: 2, strength: 4 },
    });
  });
});
