import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { playerProgress, walletTransactions, wallets } from '../db/schema.js';

export function createPgEconomyService(db: Database) {
  return {
    async getBalance(userId: string) {
      const rows = await db.select({ balance: wallets.balance })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1);
      return { balance: rows[0]?.balance ?? 0 };
    },
    async credit(userId: string, amount: number, reason: string, idempotencyKey: string) {
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INVALID_WALLET_AMOUNT');
      return db.transaction(async tx => {
        const existing = await tx.select().from(walletTransactions)
          .where(and(eq(walletTransactions.userId, userId), eq(walletTransactions.idempotencyKey, idempotencyKey))).limit(1);
        if (existing[0]) return existing[0];

        await tx.insert(wallets).values({ userId, balance: 0 }).onConflictDoNothing();
        const current = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
        const balanceAfter = (current[0]?.balance ?? 0) + amount;
        const [transaction] = await tx.insert(walletTransactions).values({
          id: randomUUID(),
          userId,
          amount,
          balanceAfter,
          reason,
          idempotencyKey,
        }).returning();
        await tx.update(wallets).set({ balance: balanceAfter, updatedAt: new Date() }).where(eq(wallets.userId, userId));
        return transaction;
      });
    },
    async purchaseNets(userId: string, quantity: number, idempotencyKey: string) {
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('INVALID_NET_QUANTITY');
      return db.transaction(async tx => {
        const existing = await tx.select().from(walletTransactions)
          .where(and(eq(walletTransactions.userId, userId), eq(walletTransactions.idempotencyKey, idempotencyKey))).limit(1);
        const progress = await tx.select().from(playerProgress).where(eq(playerProgress.userId, userId)).limit(1);
        const currentNets = progress[0]?.nets ?? 10;
        if (existing[0]) return { nets: currentNets, transaction: existing[0] };
        if (currentNets + quantity > 10) throw new Error('NET_LIMIT_REACHED');
        const amount = quantity * 5000;
        await tx.insert(wallets).values({ userId, balance: 0 }).onConflictDoNothing();
        const currentWallet = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
        const balance = currentWallet[0]?.balance ?? 0;
        if (balance < amount) throw new Error('INSUFFICIENT_FUNDS');
        const [transaction] = await tx.insert(walletTransactions).values({
          id: randomUUID(), userId, amount: -amount, balanceAfter: balance - amount,
          reason: 'net_purchase', idempotencyKey,
        }).returning();
        await tx.update(wallets).set({ balance: balance - amount, updatedAt: new Date() }).where(eq(wallets.userId, userId));
        await tx.update(playerProgress).set({ nets: currentNets + quantity, updatedAt: new Date() }).where(eq(playerProgress.userId, userId));
        return { nets: currentNets + quantity, transaction };
      });
    },
  };
}
