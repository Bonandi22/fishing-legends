type Entry = { state: unknown; updatedAt: string };

export function createMemoryGameStateService() {
  const store = new Map<string, Entry>();
  return {
    async get(userId: string): Promise<Entry | null> {
      return store.get(userId) ?? null;
    },
    async put(userId: string, state: unknown): Promise<void> {
      store.set(userId, { state, updatedAt: new Date().toISOString() });
    },
  };
}
