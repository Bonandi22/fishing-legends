import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version varchar(64) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

export function toMigrationVersion(fileName: string): string {
  return fileName.replace(/\.sql$/, '');
}

/**
 * Pure selector: given every entry in the migrations directory and the set of
 * versions already recorded in `schema_migrations`, return the `.sql` files that
 * still need to run, in lexicographic (== chronological) order.
 */
export function selectPendingMigrations(entries: string[], applied: Set<string>): string[] {
  return entries
    .filter(entry => entry.endsWith('.sql'))
    .filter(entry => !applied.has(toMigrationVersion(entry)))
    .sort();
}

export function readMigrationDir(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir);
}

async function loadAppliedVersions(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ version: string }>('SELECT version FROM schema_migrations');
  return new Set(rows.map(row => row.version));
}

export async function runMigrations(databaseUrl: string, dir = MIGRATIONS_DIR): Promise<string[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const applied: string[] = [];
  try {
    await pool.query(BOOTSTRAP_SQL);
    const pending = selectPendingMigrations(readdirSync(dir), await loadAppliedVersions(pool));

    for (const fileName of pending) {
      const version = toMigrationVersion(fileName);
      const sql = readFileSync(join(dir, fileName), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        applied.push(version);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${version} failed: ${(error as Error).message}`, { cause: error });
      } finally {
        client.release();
      }
    }
    return applied;
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to run migrations');
    process.exitCode = 1;
    return;
  }

  const applied = await runMigrations(databaseUrl);
  if (applied.length === 0) {
    console.log('No pending migrations.');
    return;
  }
  console.log(`Applied ${applied.length} migration(s):`);
  for (const version of applied) console.log(`  - ${version}`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
