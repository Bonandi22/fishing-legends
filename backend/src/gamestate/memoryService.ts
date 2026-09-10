export type MemoryGameStateEntry = { state: unknown; updatedAt: string; version: number };
export type MemoryGameStateStore = Map<string, MemoryGameStateEntry>;

export function createMemoryGameStateStore(): MemoryGameStateStore {
  return new Map();
}

/**
 * In-memory game-state store (dev/test without DATABASE_URL). `bootstrap` is
 * create-only: it succeeds exactly once per account and throws
 * `STATE_VERSION_CONFLICT` if a row already exists. There is no update path —
 * every subsequent mutation goes through a dedicated, validated op instead of
 * a free-form overwrite.
 */
export function createMemoryGameStateService(store: MemoryGameStateStore = createMemoryGameStateStore()) {
  return {
    async get(userId: string): Promise<MemoryGameStateEntry | null> {
      return store.get(userId) ?? null;
    },
    async bootstrap(userId: string, state: unknown): Promise<{ version: number }> {
      if (store.has(userId)) throw new Error('STATE_VERSION_CONFLICT');
      store.set(userId, { state, updatedAt: new Date().toISOString(), version: 1 });
      return { version: 1 };
    },
  };
}
