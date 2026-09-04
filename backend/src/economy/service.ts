import { randomUUID } from 'node:crypto';

export type WalletTransaction = {
  id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  reason: string;
};

export function createMemoryEconomyService() {
  const balances = new Map<string, number>();
  const transactions = new Map<string, WalletTransaction>();
  const idempotency = new Map<string, WalletTransaction>();

  return {
    getBalance(userId: string) {
      return { balance: balances.get(userId) ?? 0 };
    },
    credit(userId: string, amount: number, reason: string, key: string) {
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_WALLET_AMOUNT');
      const existing = idempotency.get(`${userId}:${key}`);
      if (existing) return existing;
      const balanceAfter = (balances.get(userId) ?? 0) + amount;
      const transaction = { id: randomUUID(), userId, amount, balanceAfter, reason };
      balances.set(userId, balanceAfter);
      transactions.set(transaction.id, transaction);
      idempotency.set(`${userId}:${key}`, transaction);
      return transaction;
    },
    debit(userId: string, amount: number, reason: string, key: string) {
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_WALLET_AMOUNT');
      const existing = idempotency.get(`${userId}:${key}`);
      if (existing) return existing;
      const balance = balances.get(userId) ?? 0;
      if (balance < amount) throw new Error('INSUFFICIENT_FUNDS');
      const transaction = { id: randomUUID(), userId, amount: -amount, balanceAfter: balance - amount, reason };
      balances.set(userId, transaction.balanceAfter);
      transactions.set(transaction.id, transaction);
      idempotency.set(`${userId}:${key}`, transaction);
      return transaction;
    },
  };
}
