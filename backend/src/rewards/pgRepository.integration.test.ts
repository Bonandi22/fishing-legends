import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { walletTransactions } from '../db/schema.js';
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
    email: `rewards-${crypto.randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `rw_${crypto.randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  return user.id;
}

describe('pg rewards service (integration)', () => {
  it('claims once per UTC day and credits the wallet in one transaction', async () => {
    const userId = await seedUser();

    const first = await rewards.claim(userId, 1);
    expect(first.claimed).toBe(true);
    expect(first.day).toBe(1);
    expect(first.amount).toBe(150); // DAILY_COIN_REWARDS[0]
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
    await rewards.claim(userId, 1);

    const repeat = await rewards.claim(userId, 1);
    expect(repeat.claimed).toBe(false);
    expect(repeat.amount).toBe(150);
    expect(repeat.balance).toBe(150);

    // a different requested day on the same date still returns the first claim
    const higher = await rewards.claim(userId, 7);
    expect(higher.claimed).toBe(false);
    expect(higher.amount).toBe(150);
    expect(higher.balance).toBe(150);
  });

  it('KNOWN GAP (A1): the client-supplied day sets the amount', async () => {
    const userId = await seedUser();
    // Nothing forces `day` to follow a server-computed streak, so day 7 pays 1500 on day one.
    const claim = await rewards.claim(userId, 7);
    expect(claim.claimed).toBe(true);
    expect(claim.day).toBe(7);
    expect(claim.amount).toBe(1500);
    expect(claim.balance).toBe(1500);
  });

  it('isolates claims per user', async () => {
    const a = await seedUser();
    const b = await seedUser();
    await rewards.claim(a, 1);
    const claimB = await rewards.claim(b, 2);
    expect(claimB.claimed).toBe(true);
    expect(claimB.amount).toBe(300);
  });
});
