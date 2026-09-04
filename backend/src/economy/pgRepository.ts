import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { walletTransactions, wallets } from '../db/schema.js';

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
          .where(eq(walletTransactions.idempotencyKey, idempotencyKey)).limit(1);
        if (existing[0] && existing[0].userId === userId) return existing[0];

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
  };
}
