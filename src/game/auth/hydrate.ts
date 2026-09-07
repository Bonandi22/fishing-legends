import type { PlayerState } from '@/game/types';
import { saveSchema } from '@/game/persistence';
import { getGameState } from '@/api/endpoints';

export type HydrateResult = {
  kind: 'loaded' | 'empty' | 'error';
  version: number | null;
  /** The player state that was applied — only on `loaded`. Lets callers avoid re-pushing it. */
  player?: PlayerState;
};

/**
 * Loads the account's saved game state from the server and REPLACES local state.
 * The server blob is authoritative (this pulls Task 10.2 forward). `onAuthenticated`
 * calls this on every authenticated app start; `useGameStateSync` calls it again to
 * recover from a version conflict.
 *
 * On `loaded`, `version` is the server's current version — the caller seeds its
 * optimistic-concurrency base with it. `empty` / `error` carry `version: null`.
 */
export async function hydrateFromServer(
  replace: (updater: (prev: PlayerState) => Partial<PlayerState>) => void,
): Promise<HydrateResult> {
  let envelope: unknown;
  let version: number | null;
  try {
    ({ state: envelope, version } = await getGameState());
  } catch {
    return { kind: 'error', version: null };
  }
  if (envelope == null) return { kind: 'empty', version: null };
  const parsed = saveSchema.safeParse(envelope);
  if (!parsed.success) {
    console.warn('game state blob failed validation; treating as empty');
    return { kind: 'empty', version: null };
  }
  replace(() => parsed.data.player);
  return { kind: 'loaded', version, player: parsed.data.player };
}
