import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { dailyRewardClaims, playerProgress, walletTransactions, wallets } from '../db/schema.js';
import { rewardForDay, todayUtc } from './service.js';

export function createPgRewardsService(db: Database) {
  return {
    async claim(userId: string, requestedDay: number) {
      const claimDate = todayUtc();
      const day = Math.min(7, Math.max(1, requestedDay));
      const amount = rewardForDay(day);
      return db.transaction(async tx => {
        const existing = await tx.select().from(dailyRewardClaims)
          .where(and(eq(dailyRewardClaims.userId, userId), eq(dailyRewardClaims.claimDate, claimDate))).limit(1);
        if (existing[0]) {
          const balance = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
          return { claimed: false, day: existing[0].rewardDay, amount: existing[0].amount, transactionId: existing[0].id, balance: balance[0]?.balance ?? 0 };
        }
        await tx.insert(wallets).values({ userId, balance: 0 }).onConflictDoNothing();
        const wallet = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
        const balance = (wallet[0]?.balance ?? 0) + amount;
        const [claim] = await tx.insert(dailyRewardClaims).values({
          id: randomUUID(), userId, claimDate, rewardDay: day, amount,
        }).returning();
        await tx.insert(walletTransactions).values({
          id: randomUUID(), userId, amount, balanceAfter: balance,
          reason: 'daily_reward', idempotencyKey: `daily-reward:${claimDate}`,
        });
        await tx.update(wallets).set({ balance, updatedAt: new Date() }).where(eq(wallets.userId, userId));
        return { claimed: true, day, amount, transactionId: claim.id, balance };
      });
    },
  };
}
