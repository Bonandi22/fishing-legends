import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase, testDatabaseUrl } from '../testing/pgHarness.js';
import { runMigrations } from './migrate.js';

let harness: TestDatabase;

beforeAll(async () => {
  harness = await createTestDatabase();
});

afterAll(async () => {
  await harness?.close();
});

describe('migration runner (integration)', () => {
  it('records every migration file in schema_migrations', async () => {
    const { rows } = await harness.pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    const versions = rows.map(row => row.version);

    expect(versions).toContain('0000_foundation');
    expect(versions).toContain('0012_seasons');
    expect(versions.length).toBeGreaterThanOrEqual(13);
  });

  it('is a no-op on a database that is already migrated', async () => {
    const applied = await runMigrations(testDatabaseUrl());
    expect(applied).toEqual([]);
  });

  it('creates the expected tables', async () => {
    const { rows } = await harness.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = new Set(rows.map(row => row.table_name));

    for (const expected of ['users', 'user_profiles', 'sessions', 'player_progress', 'seasons']) {
      expect(tables.has(expected)).toBe(true);
    }
  });

  it('enforces the check constraints from the SQL migrations', async () => {
    await expect(
      harness.pool.query(
        `INSERT INTO seasons (id, season_key, name, status, starts_at, ends_at, ruleset_version)
         VALUES (gen_random_uuid(), 'bad', 'bad', 'active', now(), now() - interval '1 day', 'v1')`,
      ),
    ).rejects.toThrow(/seasons_dates_check/);
  });
});
