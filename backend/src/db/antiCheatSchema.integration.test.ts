import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';

let harness: TestDatabase;

beforeAll(async () => {
  harness = await createTestDatabase();
});

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness?.close();
});

async function insertUser(status = 'active'): Promise<string> {
  const id = randomUUID();
  await harness.pool.query(
    `INSERT INTO users (id, email, password_hash, status) VALUES ($1, $2, 'x', $3)`,
    [id, `${id}@example.test`, status],
  );
  return id;
}

function insertCase(userId: string, status: string) {
  return harness.pool.query(
    `INSERT INTO fraud_cases (id, user_id, status, evidence) VALUES ($1, $2, $3, '{}'::jsonb)`,
    [randomUUID(), userId, status],
  );
}

describe('anti-cheat schema (0026)', () => {
  it('allows only one open fraud case per user', async () => {
    const userId = await insertUser();
    await insertCase(userId, 'flagged');
    await expect(insertCase(userId, 'flagged')).rejects.toThrow(/fraud_cases_one_open/);
    await expect(insertCase(userId, 'suspended')).rejects.toThrow(/fraud_cases_one_open/);
  });

  it('allows a closed case next to an open one', async () => {
    const userId = await insertUser();
    await insertCase(userId, 'flagged');
    await expect(insertCase(userId, 'dismissed')).resolves.toBeTruthy();
  });

  it('accepts banned users and rejects unknown statuses', async () => {
    await expect(insertUser('banned')).resolves.toBeTruthy();
    await expect(insertUser('frozen')).rejects.toThrow(/users_status_check/);
  });

  it('has the new columns with defaults', async () => {
    const userId = await insertUser();
    const { rows } = await harness.pool.query(`SELECT is_admin FROM users WHERE id = $1`, [userId]);
    expect(rows[0].is_admin).toBe(false);
    const sessionId = randomUUID();
    await harness.pool.query(
      `INSERT INTO fishing_sessions (id, user_id, location_id, ruleset_version, idempotency_key) VALUES ($1, $2, 'l', 'v', 'k')`,
      [sessionId, userId],
    );
    const s = await harness.pool.query(
      `SELECT client_id, strength_active FROM fishing_sessions WHERE id = $1`,
      [sessionId],
    );
    expect(s.rows[0]).toEqual({ client_id: null, strength_active: false });
    await harness.pool.query(
      `INSERT INTO fishing_lands (id, user_id, session_id, mode, fish_id) VALUES ($1, $2, $3, 'rod', 'f')`,
      [randomUUID(), userId, sessionId],
    );
    await expect(
      harness.pool.query(`INSERT INTO anti_cheat_events (id, user_id, type) VALUES ($1, $2, 'nope')`, [randomUUID(), userId]),
    ).rejects.toThrow();
    await harness.pool.query(
      `INSERT INTO anti_cheat_events (id, user_id, type) VALUES ($1, $2, 'cast_too_fast')`,
      [randomUUID(), userId],
    );
  });
});
