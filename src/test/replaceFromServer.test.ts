import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from '@/game/useGameState';

beforeEach(() => localStorage.clear());

describe('replaceFromServer', () => {
  it('merges the updater result over local state and persists', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.replaceFromServer(() => ({ level: 7, coins: 1234, unlockedLocations: ['atlantic', 'caribbean'] }));
    });
    expect(result.current.player.level).toBe(7);
    expect(result.current.player.coins).toBe(1234);
    expect(result.current.player.unlockedLocations).toEqual(['atlantic', 'caribbean']);
    // untouched fields keep their defaults
    expect(result.current.player.ownedSkins).toEqual(['default']);

    const saved = JSON.parse(localStorage.getItem('fishing-game-state')!);
    expect(saved.player.coins).toBe(1234);
  });

  it('gives the updater the current state so it can merge non-destructively', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.addCoins(500); });
    act(() => {
      result.current.replaceFromServer(prev => ({ level: Math.max(prev.level, 3), coins: prev.coins }));
    });
    expect(result.current.player.level).toBe(3);
    expect(result.current.player.coins).toBe(500);
  });
});
