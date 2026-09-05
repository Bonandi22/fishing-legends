import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { schema } from '../db/schema.js';
import type { Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Integration tests require TEST_DATABASE_URL or DATABASE_URL pointing at a throwaway PostgreSQL',
    );
  }
  return url;
}

// Tables cleared between tests. `users` cascades to every user-owned table;
// `seasons` and `schema_migrations` are handled explicitly.
const CASCADING_ROOT = 'users';
const STANDALONE_TABLES = ['seasons'];

export type TestDatabase = {
  db: Database;
  pool: Pool;
  reset(): Promise<void>;
  close(): Promise<void>;
};

let migrated = false;

export async function createTestDatabase(): Promise<TestDatabase> {
  const url = testDatabaseUrl();

  if (!migrated) {
    await runMigrations(url);
    migrated = true;
  }

  const pool = new Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    async reset() {
      await pool.query(
        `TRUNCATE TABLE ${[CASCADING_ROOT, ...STANDALONE_TABLES].join(', ')} RESTART IDENTITY CASCADE`,
      );
    },
    async close() {
      await pool.end();
    },
  };
}
