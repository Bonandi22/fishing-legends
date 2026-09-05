import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { playerProgress } from '../db/schema.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgLeaderboardService } from './pgRepository.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let leaderboard: ReturnType<typeof createPgLeaderboardService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  leaderboard = createPgLeaderboardService(harness.db);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedPlayer(level: number, fish: number) {
  const user = await auth.createUser({
    email: `lb-${randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `lb_${randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  await harness.db.update(playerProgress)
    .set({ level, totalFishCaught: fish })
    .where(eq(playerProgress.userId, user.id));
  return user.id;
}

describe('pg leaderboard service (integration)', () => {
  it('ranks players by level, then catches, then xp, and reports the real total', async () => {
    await seedPlayer(3, 10);
    await seedPlayer(9, 2);
    await seedPlayer(9, 40);

    const page = await leaderboard.list('anyone', 2, 0);
    expect(page.total).toBe(3);
    expect(page.entries).toHaveLength(2);
    expect(page.entries[0].level).toBe(9);
    expect(page.entries[0].totalFishCaught).toBe(40); // higher catches breaks the level tie
    expect(page.entries[0].rank).toBe(1);

    const nextPage = await leaderboard.list('anyone', 2, 2);
    expect(nextPage.total).toBe(3);
    expect(nextPage.entries).toHaveLength(1);
    expect(nextPage.entries[0].rank).toBe(3);
  });
});
