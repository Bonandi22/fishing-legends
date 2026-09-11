import { useCallback, useEffect, useRef } from 'react';
import type { PlayerState } from '@/game/types';
import { SAVE_SCHEMA_VERSION, saveSchema } from '@/game/persistence';
import { getGameState, bootstrapGameState } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { hydrateFromServer, type HydrateResult } from './hydrate';

const POLL_MS = 45_000;

interface GameStateEnvelope {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  player: PlayerState;
}

/**
 * Keeps the client's optimistic-concurrency version in sync with the server
 * and adopts cross-device changes:
 * - `start()` (called by `afterAuth`) loads the server blob, replaces local
 *   state, and seeds the base version; on an empty server it bootstraps the
 *   account with the local save (a one-time, create-only write — see
 *   `POST /me/state/bootstrap`).
 * - a background `GET /me/state` every 45s (only while the tab is visible):
 *   if the server version is ahead of ours, another device saved — pull and
 *   replace. Still last-write-wins by blob; no field merge.
 *
 * There is no generic push any more: every mutation for an authenticated
 * user goes through its own validated server op (see `Index.tsx`'s
 * `runEconomyOp`/`runRewardOp`), which already returns the fresh
 * `{ state, version }` for `applyServerResult` to adopt. Nothing is ever
 * "local-only and unpushed," so there is nothing left to debounce, flush on
 * logout, or flush on tab hide.
 */
export function useGameStateSync({
  player,
  enabled,
  replace,
}: {
  player: PlayerState;
  enabled: boolean;
  replace: (updater: (prev: PlayerState) => Partial<PlayerState>) => void;
}): {
  start: () => Promise<HydrateResult['kind']>;
  applyServerResult: (result: { state: unknown; version: number | null }) => void;
} {
  const playerRef = useRef(player);
  playerRef.current = player;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const replaceRef = useRef(replace);
  replaceRef.current = replace;

  const baseVersion = useRef<number | null>(null);
  const busy = useRef(false);

  const envelope = useCallback(
    (): GameStateEnvelope => ({ schemaVersion: SAVE_SCHEMA_VERSION, player: playerRef.current }),
    [],
  );

  /**
   * Adopt a full server player blob as the new local truth: replace local
   * state and seed the optimistic-concurrency base version.
   */
  const adoptServerState = useCallback((player: PlayerState, version: number | null) => {
    replaceRef.current(() => player);
    baseVersion.current = version;
  }, []);

  const resync = useCallback(async () => {
    const res = await hydrateFromServer();
    if (res.kind === 'loaded') {
      // A slower fetch can land behind a concurrent op's applyServerResult
      // (which already advanced baseVersion) — never let it roll state back.
      const stale = res.version != null && baseVersion.current != null && res.version <= baseVersion.current;
      if (!stale) {
        if (res.player) adoptServerState(res.player, res.version);
        else baseVersion.current = res.version;
      }
    }
    return res;
  }, [adoptServerState]);

  const applyServerResult = useCallback(
    (result: { state: unknown; version: number | null }) => {
      const parsed = saveSchema.safeParse(result.state);
      if (!parsed.success) {
        console.warn('server economy result failed validation; ignoring');
        return;
      }
      adoptServerState(parsed.data.player, result.version);
    },
    [adoptServerState],
  );

  /** Background check: if the server version is ahead of ours, another device saved. */
  const poll = useCallback(async () => {
    if (!enabledRef.current || busy.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    busy.current = true;
    try {
      const { version } = await getGameState();
      if (version != null && baseVersion.current != null && version > baseVersion.current) {
        console.warn('game state changed on another device; pulling the server state');
        await resync();
      }
    } catch {
      /* transient; the next tick retries */
    } finally {
      busy.current = false;
    }
  }, [resync]);

  const start = useCallback(async (): Promise<HydrateResult['kind']> => {
    const res = await resync();
    if (res.kind === 'empty') {
      try {
        const { version } = await bootstrapGameState(envelope());
        baseVersion.current = version;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'STATE_VERSION_CONFLICT') {
          // Another device bootstrapped first; adopt what it wrote instead of
          // leaving baseVersion unset for the rest of the session.
          await resync();
        }
      }
    }
    return res.kind;
  }, [envelope, resync]);

  // Background pull: every 45s while enabled and visible, plus one on becoming visible.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => { void poll(); }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, poll]);

  return { start, applyServerResult };
}
