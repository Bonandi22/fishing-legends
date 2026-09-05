import { randomUUID } from 'node:crypto';
import { multiplierPrice, netUnitPrice } from './pricing.js';

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
  purchaseMultiplier(userId: string, type: 'luck' | 'strength', power: 2 | 4, key: string): {
    type: 'luck' | 'strength';
    power: 2 | 4;
    expiresAt: Date;
    transaction: WalletTransaction;
  } | Promise<{
    type: 'luck' | 'strength';
    power: 2 | 4;
    expiresAt: Date;
    transaction: WalletTransaction;
  }>;
};

export function createMemoryEconomyService() {
  const balances = new Map<string, number>();
  const transactions = new Map<string, WalletTransaction>();
  const idempotency = new Map<string, WalletTransaction>();
  const nets = new Map<string, number>();
  const multipliers = new Map<string, { type: 'luck' | 'strength'; power: 2 | 4; expiresAt: Date }>();

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
      const amount = quantity * netUnitPrice;
      const balance = balances.get(userId) ?? 0;
      if (balance < amount) throw new Error('INSUFFICIENT_FUNDS');
      const transaction = { id: randomUUID(), userId, amount: -amount, balanceAfter: balance - amount, reason: 'net_purchase' };
      balances.set(userId, transaction.balanceAfter);
      nets.set(userId, currentNets + quantity);
      transactions.set(transaction.id, transaction);
      idempotency.set(`${userId}:${key}`, transaction);
      return { nets: currentNets + quantity, transaction };
    },
    purchaseMultiplier(userId: string, type: 'luck' | 'strength', power: 2 | 4, key: string) {
      const existing = idempotency.get(`${userId}:${key}`);
      const current = multipliers.get(`${userId}:${type}`);
      if (existing && current) return { ...current, transaction: existing };
      const amount = multiplierPrice(power);
      const balance = balances.get(userId) ?? 0;
      if (balance < amount) throw new Error('INSUFFICIENT_FUNDS');
      const expiresAt = new Date(Date.now() + 60_000);
      const transaction = { id: randomUUID(), userId, amount: -amount, balanceAfter: balance - amount, reason: 'multiplier_purchase' };
      balances.set(userId, transaction.balanceAfter);
      const multiplier = { type, power, expiresAt };
      multipliers.set(`${userId}:${type}`, multiplier);
      transactions.set(transaction.id, transaction);
      idempotency.set(`${userId}:${key}`, transaction);
      return { ...multiplier, transaction };
    },
  };
}
