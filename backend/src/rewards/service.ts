export const DAILY_COIN_REWARDS = [150, 300, 600, 700, 1000, 1200, 1500] as const;

export function rewardForDay(day: number): number {
  return DAILY_COIN_REWARDS[Math.min(7, Math.max(1, day)) - 1];
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
