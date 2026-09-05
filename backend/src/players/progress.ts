import { MAX_LEVEL, getXpForLevel } from '../../../src/game/types.js';

/**
 * Apply an XP gain to a player's level/xp, rolling over into new levels and
 * capping at MAX_LEVEL. Shared by the in-memory and PostgreSQL fishing paths so
 * they progress identically.
 */
export function applyCatchProgress(
  current: { level: number; xp: number },
  xpGained: number,
): { level: number; xp: number } {
  let level = Math.min(Math.max(1, current.level), MAX_LEVEL);
  let xp = Math.max(0, current.xp) + Math.max(0, xpGained);
  while (level < MAX_LEVEL && xp >= getXpForLevel(level)) {
    xp -= getXpForLevel(level);
    level += 1;
  }
  return { level, xp };
}
