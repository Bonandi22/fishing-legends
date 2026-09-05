// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { applyCatchProgress } from './progress.js';
import { getXpForLevel } from '../../../src/game/types.js';

describe('applyCatchProgress', () => {
  it('accumulates xp without a level-up while below the threshold', () => {
    expect(applyCatchProgress({ level: 1, xp: 0 }, 40)).toEqual({ level: 1, xp: 40 });
  });

  it('carries the remainder into the next level on a level-up', () => {
    const threshold = getXpForLevel(1);
    expect(applyCatchProgress({ level: 1, xp: 0 }, threshold + 10)).toEqual({ level: 2, xp: 10 });
  });

  it('advances multiple levels for a large gain', () => {
    const result = applyCatchProgress({ level: 1, xp: 0 }, getXpForLevel(1) + getXpForLevel(2) + 5);
    expect(result).toEqual({ level: 3, xp: 5 });
  });

  it('never exceeds the max level', () => {
    const result = applyCatchProgress({ level: 30, xp: 0 }, 10_000_000);
    expect(result.level).toBe(30);
  });

  it('clamps negative inputs', () => {
    expect(applyCatchProgress({ level: 0, xp: -50 }, -10)).toEqual({ level: 1, xp: 0 });
  });
});
