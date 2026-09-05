import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { dailyRewardClaims, walletTransactions } from '../db/schema.js';
import { rewardForDay, todayUtc } from './service.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgRewardsService } from './pgRepository.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let rewards: ReturnType<typeof createPgRewardsService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  rewards = createPgRewardsService(harness.db);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `rewards-${randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `rw_${randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  return user.id;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

async function seedClaim(userId: string, claimDate: string, rewardDay: number) {
  await harness.db.insert(dailyRewardClaims).values({
    id: randomUUID(),
    userId,
    claimDate,
    rewardDay,
    amount: rewardForDay(rewardDay),
  });
}

describe('pg rewards service (integration)', () => {
  it('grants day 1 on the first ever claim and credits the wallet transactionally', async () => {
    const userId = await seedUser();

    const first = await rewards.claim(userId);
    expect(first.claimed).toBe(true);
    expect(first.day).toBe(1);
    expect(first.amount).toBe(150);
    expect(first.balance).toBe(150);

    const ledger = await harness.db
      .select()
      .from(walletTransactions)
      .where(and(eq(walletTransactions.userId, userId), eq(walletTransactions.reason, 'daily_reward')));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(150);
  });

  it('returns the existing claim without re-crediting on the same day', async () => {
    const userId = await seedUser();
    await rewards.claim(userId);

    const repeat = await rewards.claim(userId);
    expect(repeat.claimed).toBe(false);
    expect(repeat.amount).toBe(150);
    expect(repeat.balance).toBe(150);
  });

  it('advances the streak when yesterday was claimed', async () => {
    const userId = await seedUser();
    await seedClaim(userId, daysAgo(1), 3);

    const claim = await rewards.claim(userId);
    expect(claim.day).toBe(4);
    expect(claim.amount).toBe(rewardForDay(4)); // 700
    expect(claim.balance).toBe(700);
  });

  it('wraps day 7 back to day 1 on a consecutive claim', async () => {
    const userId = await seedUser();
    await seedClaim(userId, daysAgo(1), 7);

    const claim = await rewards.claim(userId);
    expect(claim.day).toBe(1);
    expect(claim.amount).toBe(150);
  });

  it('resets to day 1 after a missed day', async () => {
    const userId = await seedUser();
    await seedClaim(userId, daysAgo(3), 5);

    const claim = await rewards.claim(userId);
    expect(claim.day).toBe(1);
    expect(claim.amount).toBe(150);
  });

  it('does not accept a client-chosen day: the streak decides the amount', async () => {
    const userId = await seedUser();
    // A caller passing extra arguments cannot inflate the reward.
    const claim = await (rewards.claim as (userId: string, ...rest: unknown[]) => ReturnType<typeof rewards.claim>)(userId, 7);
    expect(claim.day).toBe(1);
    expect(claim.amount).toBe(150);
  });

  it('isolates streaks per user', async () => {
    const a = await seedUser();
    const b = await seedUser();
    await seedClaim(a, daysAgo(1), 4);

    const claimA = await rewards.claim(a);
    const claimB = await rewards.claim(b);
    expect(claimA.day).toBe(5);
    expect(claimB.day).toBe(1);
  });

  it('records the granted day on the claim row', async () => {
    const userId = await seedUser();
    await seedClaim(userId, daysAgo(1), 2);
    await rewards.claim(userId);

    const [row] = await harness.db
      .select()
      .from(dailyRewardClaims)
      .where(and(eq(dailyRewardClaims.userId, userId), eq(dailyRewardClaims.claimDate, todayUtc())));
    expect(row.rewardDay).toBe(3);
  });
});
