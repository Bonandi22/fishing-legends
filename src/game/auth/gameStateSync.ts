import { useCallback, useEffect, useRef } from 'react';
import type { PlayerState } from '@/game/types';
import { SAVE_SCHEMA_VERSION } from '@/game/persistence';
import { putGameState } from '@/api/endpoints';

const DEBOUNCE_MS = 4000;

/** Read the `dbl_csrf` cookie the same way `src/api/client.ts` `csrfToken()` does. */
function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)dbl_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

interface GameStateEnvelope {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  player: PlayerState;
}

/**
 * Pushes the player's game state to the server while they play:
 * - a debounced `PUT /me/state` ~4s after the last `player` change,
 * - an immediate keepalive `fetch` on `pagehide` / tab hide (survives unload;
 *   `navigator.sendBeacon` can't set the CSRF header, so we use `fetch`),
 * - `flushNow()` for logout (Task 8): clears the timer and awaits a PUT now.
 *
 * `enabled === false` makes the hook inert: no timer, listeners are no-ops.
 */
export function useGameStateSync({
  player,
  enabled,
}: {
  player: PlayerState;
  enabled: boolean;
}): { flushNow: () => Promise<void> } {
  const playerRef = useRef(player);
  playerRef.current = player;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const flushNow = useCallback(async () => {
    clearTimer();
    if (!enabledRef.current) return;
    try {
      await putGameState(envelope());
    } catch {
      /* best-effort: resolve even on failure */
    }
  }, [clearTimer, envelope]);

  // Debounce on player change.
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      putGameState(envelope()).catch(() => {
        /* retried on the next change */
      });
    }, DEBOUNCE_MS);
    return clearTimer;
  }, [player, enabled, clearTimer, envelope]);

  // Flush on tab close / hide. keepalive lets the request outlive the document.
  useEffect(() => {
    const send = () => {
      if (!enabledRef.current) return;
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
          body: JSON.stringify({ state: envelope() }),
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

  return { flushNow };
}
