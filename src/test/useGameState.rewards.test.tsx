import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from '@/game/useGameState';
import type { RewardGrant } from '@/game/rewards';

beforeEach(() => localStorage.clear());

describe('useGameState reward helpers', () => {
  it('claimDailyGiftLocal applies day 1 and returns the reward', () => {
    const { result } = renderHook(() => useGameState());
    let reward: RewardGrant | undefined;
    act(() => { reward = result.current.claimDailyGiftLocal(); });
    expect(reward).toEqual({ type: 'coins', amount: 150 });
    expect(result.current.player.dailyGiftsDay).toBe(2);
  });

  it('claimDailyGiftLocal throws on a second call the same day', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.claimDailyGiftLocal(); });
    expect(() => result.current.claimDailyGiftLocal()).toThrow('DAILY_GIFT_ALREADY_CLAIMED');
  });

  it('spinDailyRouletteLocal returns a reward and blocks a second spin the same day', () => {
    const { result } = renderHook(() => useGameState());
    let reward: RewardGrant | undefined;
    act(() => { reward = result.current.spinDailyRouletteLocal(); });
    expect(reward).toBeDefined();
    expect(() => result.current.spinDailyRouletteLocal()).toThrow('ROULETTE_ALREADY_USED');
  });

  it('spinSkinRouletteLocal throws INSUFFICIENT_FUNDS at the default (0 coins) state', () => {
    const { result } = renderHook(() => useGameState());
    expect(() => result.current.spinSkinRouletteLocal()).toThrow('INSUFFICIENT_FUNDS');
  });
});
