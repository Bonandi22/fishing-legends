import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { dailyRewardClaims, walletTransactions, wallets } from '../db/schema.js';
import { resolveRewardDay, rewardForDay, todayUtc } from './service.js';

export function createPgRewardsService(db: Database) {
  return {
    async claim(userId: string) {
      const claimDate = todayUtc();
      return db.transaction(async tx => {
        const existing = await tx.select().from(dailyRewardClaims)
          .where(and(eq(dailyRewardClaims.userId, userId), eq(dailyRewardClaims.claimDate, claimDate))).limit(1);
        if (existing[0]) {
          const balance = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
          return { claimed: false, day: existing[0].rewardDay, amount: existing[0].amount, transactionId: existing[0].id, balance: balance[0]?.balance ?? 0 };
        }

        const [last] = await tx.select().from(dailyRewardClaims)
          .where(eq(dailyRewardClaims.userId, userId))
          .orderBy(desc(dailyRewardClaims.claimDate))
          .limit(1);
        const day = resolveRewardDay(
          last ? { claimDate: last.claimDate, rewardDay: last.rewardDay } : null,
          claimDate,
        );
        const amount = rewardForDay(day);

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
