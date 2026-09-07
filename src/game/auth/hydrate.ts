import type { PlayerState } from '@/game/types';
import { saveSchema } from '@/game/persistence';
import { getGameState } from '@/api/endpoints';

export type HydrateResult = { kind: 'loaded' | 'empty' | 'error' };

/**
 * Loads the account's saved game state from the server and REPLACES local state.
 * The server blob is authoritative (this pulls Task 10.2 forward). `onAuthenticated`
 * calls this on every authenticated app start.
 */
export async function hydrateFromServer(
  replace: (updater: (prev: PlayerState) => Partial<PlayerState>) => void,
): Promise<HydrateResult> {
  let envelope: unknown;
  try {
    ({ state: envelope } = await getGameState());
  } catch {
    return { kind: 'error' };
  }
  if (envelope == null) return { kind: 'empty' };
  const parsed = saveSchema.safeParse(envelope);
  if (!parsed.success) {
    console.warn('game state blob failed validation; treating as empty');
    return { kind: 'empty' };
  }
  replace(() => parsed.data.player);
  return { kind: 'loaded' };
}
