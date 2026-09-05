import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { playerProgress } from '../db/schema.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgEconomyService } from './pgRepository.js';

let harness: TestDatabase;
let economy: ReturnType<typeof createPgEconomyService>;
let auth: ReturnType<typeof createPgAuthRepository>;

beforeAll(async () => {
  harness = await createTestDatabase();
  economy = createPgEconomyService(harness.db);
  auth = createPgAuthRepository(harness.db);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `wallet-${crypto.randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `wallet_${crypto.randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  return user.id;
}

describe('pg economy service (integration)', () => {
  it('credits the wallet and is idempotent on the same key', async () => {
    const userId = await seedUser();

    const first = await economy.credit(userId, 500, 'test_credit', 'key-1');
    const second = await economy.credit(userId, 500, 'test_credit', 'key-1');

    expect(second.id).toBe(first.id);
    expect(await economy.getBalance(userId)).toEqual({ balance: 500 });
  });

  it('rejects a non-positive credit amount', async () => {
    const userId = await seedUser();
    await expect(economy.credit(userId, 0, 'bad', 'key-zero')).rejects.toThrow('INVALID_WALLET_AMOUNT');
    await expect(economy.credit(userId, -10, 'bad', 'key-neg')).rejects.toThrow('INVALID_WALLET_AMOUNT');
  });

  it('buys nets: blocks without funds, then debits atomically and raises the stock', async () => {
    const userId = await seedUser();
    await harness.db.update(playerProgress).set({ nets: 4 }).where(eq(playerProgress.userId, userId));

    await expect(economy.purchaseNets(userId, 2, 'nets-no-funds')).rejects.toThrow('INSUFFICIENT_FUNDS');

    await economy.credit(userId, 10_000, 'seed', 'nets-seed');
    const result = await economy.purchaseNets(userId, 2, 'nets-buy');

    expect(result.nets).toBe(6);
    expect(await economy.getBalance(userId)).toEqual({ balance: 0 });

    const again = await economy.purchaseNets(userId, 2, 'nets-buy');
    expect(again.transaction.id).toBe(result.transaction.id);
    expect(await economy.getBalance(userId)).toEqual({ balance: 0 });
  });

  it('never lets the wallet balance go negative', async () => {
    const userId = await seedUser();
    await economy.credit(userId, 100, 'seed', 'neg-seed');
    await expect(
      harness.pool.query('UPDATE wallets SET balance = -1 WHERE user_id = $1', [userId]),
    ).rejects.toThrow(/wallets_balance_check/);
  });
});
