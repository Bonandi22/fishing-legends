export const DAILY_COIN_REWARDS = [150, 300, 600, 700, 1000, 1200, 1500] as const;
export const REWARD_CYCLE_LENGTH = DAILY_COIN_REWARDS.length;

export function rewardForDay(day: number): number {
  return DAILY_COIN_REWARDS[Math.min(REWARD_CYCLE_LENGTH, Math.max(1, day)) - 1];
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcDaysBetween(from: string, to: string): number {
  const diff = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(diff / 86_400_000);
}

/**
 * The reward day a claim on `today` should grant, derived only from the streak
 * history. The client never chooses the day.
 *
 * - no prior claim, or a day was missed -> day 1
 * - the previous claim was yesterday -> next day, wrapping 7 -> 1
 * - a same-day (or future) prior claim -> its own day (caller handles the
 *   "already claimed" case before reaching here)
 */
export function resolveRewardDay(
  lastClaim: { claimDate: string; rewardDay: number } | null,
  today: string,
): number {
  if (!lastClaim) return 1;
  const gap = utcDaysBetween(lastClaim.claimDate, today);
  if (gap <= 0) return lastClaim.rewardDay;
  if (gap === 1) return lastClaim.rewardDay >= REWARD_CYCLE_LENGTH ? 1 : lastClaim.rewardDay + 1;
  return 1;
}
