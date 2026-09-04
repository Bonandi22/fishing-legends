import { randomUUID } from 'node:crypto';

export type WalletTransaction = {
  id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  reason: string;
};

export type EconomyService = {
  getBalance(userId: string): { balance: number } | Promise<{ balance: number }>;
  credit(userId: string, amount: number, reason: string, key: string): WalletTransaction | Promise<WalletTransaction>;
  purchaseNets(userId: string, quantity: number, key: string): { nets: number; transaction: WalletTransaction } | Promise<{ nets: number; transaction: WalletTransaction }>;
};

export function createMemoryEconomyService() {
  const balances = new Map<string, number>();
  const transactions = new Map<string, WalletTransaction>();
  const idempotency = new Map<string, WalletTransaction>();
  const nets = new Map<string, number>();

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
    purchaseNets(userId: string, quantity: number, key: string) {
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('INVALID_NET_QUANTITY');
      const existing = idempotency.get(`${userId}:${key}`);
      if (existing) return { nets: nets.get(userId) ?? 10, transaction: existing };
      const currentNets = nets.get(userId) ?? 10;
      if (currentNets + quantity > 10) throw new Error('NET_LIMIT_REACHED');
      const amount = quantity * 5000;
      const balance = balances.get(userId) ?? 0;
      if (balance < amount) throw new Error('INSUFFICIENT_FUNDS');
      const transaction = { id: randomUUID(), userId, amount: -amount, balanceAfter: balance - amount, reason: 'net_purchase' };
      balances.set(userId, transaction.balanceAfter);
      nets.set(userId, currentNets + quantity);
      transactions.set(transaction.id, transaction);
      idempotency.set(`${userId}:${key}`, transaction);
      return { nets: currentNets + quantity, transaction };
    },
  };
}
