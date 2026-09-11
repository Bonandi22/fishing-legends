import type { PlayerState } from '@/game/types';
import { saveSchema } from '@/game/persistence';
import { getGameState } from '@/api/endpoints';

export type HydrateResult = {
  kind: 'loaded' | 'empty' | 'error';
  version: number | null;
  /** The fetched player state — only on `loaded`. The caller decides whether to apply it. */
  player?: PlayerState;
};

/**
 * Loads the account's saved game state from the server. Does NOT apply it —
 * the caller decides whether the fetched snapshot is still current before
 * replacing local state (a slow fetch can land behind a concurrent write).
 *
 * On `loaded`, `version` is the server's current version as of the fetch —
 * the caller seeds its optimistic-concurrency base with it. `empty` / `error`
 * carry `version: null`.
 */
export async function hydrateFromServer(): Promise<HydrateResult> {
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
  return { kind: 'loaded', version, player: parsed.data.player };
}
