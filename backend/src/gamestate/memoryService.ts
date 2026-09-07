type Entry = { state: unknown; updatedAt: string; version: number };

/**
 * In-memory game-state store (dev/test without DATABASE_URL). Mirrors the
 * PostgreSQL optimistic-concurrency contract: `put` only writes when
 * `baseVersion` matches the stored version (or is `null` and no row exists),
 * otherwise it throws `STATE_VERSION_CONFLICT`.
 */
export function createMemoryGameStateService() {
  const store = new Map<string, Entry>();
  return {
    async get(userId: string): Promise<Entry | null> {
      return store.get(userId) ?? null;
    },
    async put(userId: string, state: unknown, baseVersion: number | null): Promise<{ version: number }> {
      const current = store.get(userId);
      const expected = current ? current.version : null;
      if (baseVersion !== expected) throw new Error('STATE_VERSION_CONFLICT');
      const version = (current?.version ?? 0) + 1;
      store.set(userId, { state, updatedAt: new Date().toISOString(), version });
      return { version };
    },
  };
}
