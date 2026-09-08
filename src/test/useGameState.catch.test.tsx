import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from '@/game/useGameState';
import { FISH } from '@/game/data';

beforeEach(() => localStorage.clear());

describe('useGameState catch', () => {
  it('catchFish adds to warehouse + collection and applies xp', () => {
    const { result } = renderHook(() => useGameState());
    const xpBefore = result.current.player.xp;
    act(() => { result.current.catchFish(FISH[0], 2, 'atlantic', false); });
    expect(result.current.player.warehouse).toHaveLength(1);
    expect(result.current.player.collection).toHaveLength(1);
    expect(result.current.player.totalFishCaught).toBe(1);
    expect(result.current.player.xp).not.toBe(xpBefore);
  });

  it('catchFishBatch with fromNet applies the reduced xp', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.catchFishBatch(
        [{ fish: FISH[0], weight: 1, location: 'atlantic' }, { fish: FISH[0], weight: 2, location: 'atlantic' }],
        true,
      );
    });
    expect(result.current.player.warehouse).toHaveLength(2);
    expect(result.current.player.totalFishCaught).toBe(2);
    expect(result.current.player.heaviestFish!.weight).toBe(2);
  });
});
