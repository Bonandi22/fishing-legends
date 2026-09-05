import { randomUUID } from 'node:crypto';
import { rewardForDay, todayUtc } from './service.js';

export function createMemoryRewardsService() {
  const claims = new Map<string, { day: number; amount: number; transactionId: string }>();
  const balances = new Map<string, number>();
  return {
    claim(userId: string, requestedDay: number) {
      const key = `${userId}:${todayUtc()}`;
      const existing = claims.get(key);
      if (existing) return { claimed: false, ...existing, balance: balances.get(userId) ?? 0 };
      const day = Math.min(7, Math.max(1, requestedDay));
      const amount = rewardForDay(day);
      const balance = (balances.get(userId) ?? 0) + amount;
      const result = { day, amount, transactionId: randomUUID() };
      claims.set(key, result);
      balances.set(userId, balance);
      return { claimed: true, ...result, balance };
    },
  };
}
