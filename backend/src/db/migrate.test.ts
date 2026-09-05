// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { selectPendingMigrations, toMigrationVersion } from './migrate.js';

describe('migration runner helpers', () => {
  it('derives a stable version identifier from a file name', () => {
    expect(toMigrationVersion('0000_foundation.sql')).toBe('0000_foundation');
    expect(toMigrationVersion('0012_seasons.sql')).toBe('0012_seasons');
  });

  it('returns pending migrations in lexicographic order', () => {
    const files = ['0002_player_progress.sql', '0000_foundation.sql', '0001_identity.sql'];
    const applied = new Set(['0000_foundation']);

    expect(selectPendingMigrations(files, applied)).toEqual([
      '0001_identity.sql',
      '0002_player_progress.sql',
    ]);
  });

  it('ignores non-sql files and already applied migrations', () => {
    const files = ['0000_foundation.sql', 'README.md', '0001_identity.sql', 'generated'];
    const applied = new Set(['0000_foundation', '0001_identity']);

    expect(selectPendingMigrations(files, applied)).toEqual([]);
  });

  it('treats an empty applied set as "everything pending"', () => {
    const files = ['0001_identity.sql', '0000_foundation.sql'];

    expect(selectPendingMigrations(files, new Set())).toEqual([
      '0000_foundation.sql',
      '0001_identity.sql',
    ]);
  });
});
