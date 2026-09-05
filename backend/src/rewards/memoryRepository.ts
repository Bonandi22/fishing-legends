import { randomUUID } from 'node:crypto';
import { resolveRewardDay, rewardForDay, todayUtc } from './service.js';

export function createMemoryRewardsService() {
  const latest = new Map<string, { claimDate: string; rewardDay: number; amount: number; transactionId: string }>();
  const balances = new Map<string, number>();
  return {
    claim(userId: string) {
      const today = todayUtc();
      const last = latest.get(userId) ?? null;
      if (last && last.claimDate === today) {
        return { claimed: false, day: last.rewardDay, amount: last.amount, transactionId: last.transactionId, balance: balances.get(userId) ?? 0 };
      }
      const day = resolveRewardDay(last, today);
      const amount = rewardForDay(day);
      const balance = (balances.get(userId) ?? 0) + amount;
      const record = { claimDate: today, rewardDay: day, amount, transactionId: randomUUID() };
      latest.set(userId, record);
      balances.set(userId, balance);
      return { claimed: true, day, amount, transactionId: record.transactionId, balance };
    },
  };
}
