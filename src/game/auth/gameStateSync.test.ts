import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as endpoints from '@/api/endpoints';
import { SAVE_SCHEMA_VERSION } from '@/game/persistence';
import { useGameStateSync } from './gameStateSync';

const mkPlayer = (over: Record<string, unknown> = {}) =>
  ({ level: 1, coins: 0, ...over }) as never;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(endpoints, 'putGameState').mockResolvedValue();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useGameStateSync', () => {
  it('debounces a PUT ~4s after the last player change', () => {
    const { rerender } = renderHook(
      ({ player }) => useGameStateSync({ player, enabled: true }),
      { initialProps: { player: mkPlayer({ level: 1 }) } },
    );
    rerender({ player: mkPlayer({ level: 2 }) });
    vi.advanceTimersByTime(3000);
    rerender({ player: mkPlayer({ level: 3 }) }); // resets the timer
    vi.advanceTimersByTime(3999);
    expect(endpoints.putGameState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
    expect(endpoints.putGameState).toHaveBeenLastCalledWith({
      schemaVersion: SAVE_SCHEMA_VERSION,
      player: mkPlayer({ level: 3 }),
    });
  });

  it('collapses consecutive changes into a single PUT', () => {
    const { rerender } = renderHook(
      ({ player }) => useGameStateSync({ player, enabled: true }),
      { initialProps: { player: mkPlayer({ level: 1 }) } },
    );
    rerender({ player: mkPlayer({ level: 2 }) });
    rerender({ player: mkPlayer({ level: 3 }) });
    rerender({ player: mkPlayer({ level: 4 }) });
    vi.advanceTimersByTime(4000);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const { rerender } = renderHook(
      ({ player }) => useGameStateSync({ player, enabled: false }),
      { initialProps: { player: mkPlayer({ level: 1 }) } },
    );
    rerender({ player: mkPlayer({ level: 2 }) });
    vi.advanceTimersByTime(10000);
    expect(endpoints.putGameState).not.toHaveBeenCalled();
  });

  it('flushNow sends immediately and clears the pending timer', async () => {
    const { result, rerender } = renderHook(
      ({ player }) => useGameStateSync({ player, enabled: true }),
      { initialProps: { player: mkPlayer({ level: 1 }) } },
    );
    rerender({ player: mkPlayer({ level: 5 }) });
    await result.current.flushNow();
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
    expect(endpoints.putGameState).toHaveBeenLastCalledWith({
      schemaVersion: SAVE_SCHEMA_VERSION,
      player: mkPlayer({ level: 5 }),
    });
    vi.advanceTimersByTime(10000);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1); // timer was cleared
  });

  it('flushNow resolves even when the PUT fails', async () => {
    vi.spyOn(endpoints, 'putGameState').mockRejectedValue(new Error('network'));
    const { result } = renderHook(
      ({ player }) => useGameStateSync({ player, enabled: true }),
      { initialProps: { player: mkPlayer({ level: 1 }) } },
    );
    await expect(result.current.flushNow()).resolves.toBeUndefined();
  });

  it('flushNow is a no-op when disabled', async () => {
    const { result } = renderHook(
      ({ player }) => useGameStateSync({ player, enabled: false }),
      { initialProps: { player: mkPlayer({ level: 1 }) } },
    );
    await result.current.flushNow();
    expect(endpoints.putGameState).not.toHaveBeenCalled();
  });

  it('sends a keepalive fetch with the CSRF header on pagehide', () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchSpy);
    document.cookie = 'dbl_csrf=tok%20en';

    renderHook(() => useGameStateSync({ player: mkPlayer({ level: 9 }), enabled: true }));
    window.dispatchEvent(new Event('pagehide'));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/me/state');
    expect(init.method).toBe('PUT');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok en');
    expect(JSON.parse(init.body as string)).toEqual({
      state: { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 9 }) },
    });
  });

  it('does not send on pagehide when disabled', () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchSpy);
    renderHook(() => useGameStateSync({ player: mkPlayer({ level: 9 }), enabled: false }));
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
