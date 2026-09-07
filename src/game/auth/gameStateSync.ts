import { useCallback, useEffect, useRef } from 'react';
import type { PlayerState } from '@/game/types';
import { SAVE_SCHEMA_VERSION } from '@/game/persistence';
import { ApiError } from '@/api/client';
import { getGameState, putGameState } from '@/api/endpoints';
import { hydrateFromServer, type HydrateResult } from './hydrate';

const DEBOUNCE_MS = 4000;
const POLL_MS = 45_000;

/** Read the `dbl_csrf` cookie the same way `src/api/client.ts` `csrfToken()` does. */
function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)dbl_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

interface GameStateEnvelope {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  player: PlayerState;
}

function isVersionConflict(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'STATE_VERSION_CONFLICT';
}

/**
 * Pushes the player's game state to the server while they play, with optimistic
 * concurrency:
 * - `start()` (called by `afterAuth`) loads the server blob, replaces local state,
 *   and seeds the base version; on an empty server it adopts the local save.
 * - a debounced `PUT /me/state` ~4s after the last `player` change, carrying the
 *   base version; a successful PUT advances it. A `STATE_VERSION_CONFLICT` means
 *   another device wrote — the hook re-runs `hydrateFromServer` (pull + replace +
 *   reseed) and the next change pushes again.
 * - a background `GET /me/state` every 45s (only while the tab is visible, and not
 *   while a PUT is in flight): if the server version is ahead of ours, another
 *   device saved — pull + replace. Still last-write-wins by blob; no field merge.
 * - an immediate keepalive `fetch` on `pagehide` / tab hide (survives unload;
 *   `navigator.sendBeacon` can't set the CSRF header, so we use `fetch`).
 * - `flushNow()` for logout: clears the timer and awaits a PUT now.
 *
 * A `player` that serializes identically to the last sent envelope is skipped.
 * `enabled === false` makes the hook inert.
 */
export function useGameStateSync({
  player,
  enabled,
  replace,
}: {
  player: PlayerState;
  enabled: boolean;
  replace: (updater: (prev: PlayerState) => Partial<PlayerState>) => void;
}): { flushNow: () => Promise<void>; start: () => Promise<HydrateResult['kind']> } {
  const playerRef = useRef(player);
  playerRef.current = player;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const replaceRef = useRef(replace);
  replaceRef.current = replace;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseVersion = useRef<number | null>(null);
  const lastSent = useRef<string | null>(null);
  const busy = useRef(false);

  const envelope = useCallback(
    (): GameStateEnvelope => ({ schemaVersion: SAVE_SCHEMA_VERSION, player: playerRef.current }),
    [],
  );

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const resync = useCallback(async () => {
    const res = await hydrateFromServer(replaceRef.current);
    if (res.kind === 'loaded') {
      baseVersion.current = res.version;
      // Mark the just-applied server state as already sent, so the debounce that
      // fires after `replace()` re-renders does not push it straight back.
      lastSent.current = res.player
        ? JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, player: res.player })
        : null;
    }
    return res;
  }, []);

  /** Send the current envelope once. Best-effort: resolves on any failure. */
  const push = useCallback(async () => {
    if (!enabledRef.current) return;
    const body = JSON.stringify(envelope());
    if (body === lastSent.current) return;
    busy.current = true;
    try {
      const { version } = await putGameState(envelope(), baseVersion.current);
      baseVersion.current = version;
      lastSent.current = body;
    } catch (err) {
      if (isVersionConflict(err)) {
        console.warn('game state version conflict; pulling the server state');
        await resync();
      }
      // other failures: retried on the next change
    } finally {
      busy.current = false;
    }
  }, [envelope, resync]);

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
        const { version } = await putGameState(envelope(), null);
        baseVersion.current = version;
        lastSent.current = JSON.stringify(envelope());
      } catch {
        /* best-effort adopt */
      }
    }
    return res.kind;
  }, [envelope, resync]);

  const flushNow = useCallback(async () => {
    clearTimer();
    await push();
  }, [clearTimer, push]);

  // Debounce on player change.
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      void push();
    }, DEBOUNCE_MS);
    return clearTimer;
  }, [player, enabled, clearTimer, push]);

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

  // Flush on tab close / hide. keepalive lets the request outlive the document.
  useEffect(() => {
    const send = () => {
      if (!enabledRef.current) return;
      const body = JSON.stringify({ state: envelope(), baseVersion: baseVersion.current });
      const t = csrfToken();
      try {
        void fetch('/api/v1/me/state', {
          method: 'PUT',
          credentials: 'same-origin',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            ...(t ? { 'X-CSRF-Token': t } : {}),
          },
          body,
        });
      } catch {
        /* best-effort */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send();
    };
    window.addEventListener('pagehide', send);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', send);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [envelope]);

  return { flushNow, start };
}
