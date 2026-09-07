import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as endpoints from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { SAVE_SCHEMA_VERSION } from '@/game/persistence';
import * as hydrateModule from './hydrate';
import { useGameStateSync } from './gameStateSync';

const mkPlayer = (over: Record<string, unknown> = {}) =>
  ({ level: 1, coins: 0, ...over }) as never;

const noopReplace = vi.fn();

function mount(props: { player: unknown; enabled: boolean }) {
  return renderHook(
    ({ player, enabled }) => useGameStateSync({ player, enabled, replace: noopReplace }),
    { initialProps: props as { player: never; enabled: boolean } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(endpoints, 'putGameState').mockResolvedValue({ version: 1 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useGameStateSync — debounced push', () => {
  it('debounces a PUT ~4s after the last player change', () => {
    const { rerender } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    rerender({ player: mkPlayer({ level: 2 }), enabled: true });
    vi.advanceTimersByTime(3000);
    rerender({ player: mkPlayer({ level: 3 }), enabled: true }); // resets the timer
    vi.advanceTimersByTime(3999);
    expect(endpoints.putGameState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
    expect(endpoints.putGameState).toHaveBeenLastCalledWith(
      { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 3 }) },
      null,
    );
  });

  it('collapses consecutive changes into a single PUT', () => {
    const { rerender } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    rerender({ player: mkPlayer({ level: 2 }), enabled: true });
    rerender({ player: mkPlayer({ level: 3 }), enabled: true });
    rerender({ player: mkPlayer({ level: 4 }), enabled: true });
    vi.advanceTimersByTime(4000);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
  });

  it('does not PUT when the player serializes identically to the last sent', async () => {
    const { rerender } = mount({ player: mkPlayer({ level: 2 }), enabled: true });
    rerender({ player: mkPlayer({ level: 3 }), enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
    rerender({ player: mkPlayer({ level: 3 }), enabled: true }); // new object, same content
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const { rerender } = mount({ player: mkPlayer({ level: 1 }), enabled: false });
    rerender({ player: mkPlayer({ level: 2 }), enabled: false });
    vi.advanceTimersByTime(10000);
    expect(endpoints.putGameState).not.toHaveBeenCalled();
  });

  it('advances its base version after a successful PUT', async () => {
    vi.mocked(endpoints.putGameState).mockResolvedValueOnce({ version: 8 });
    const { rerender } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    rerender({ player: mkPlayer({ level: 2 }), enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    rerender({ player: mkPlayer({ level: 3 }), enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoints.putGameState).toHaveBeenLastCalledWith(
      { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 3 }) },
      8,
    );
  });

  it('re-hydrates (pull + replace) on a STATE_VERSION_CONFLICT', async () => {
    vi.mocked(endpoints.putGameState).mockRejectedValueOnce(
      new ApiError(409, 'STATE_VERSION_CONFLICT', 'conflict'),
    );
    const hydrateSpy = vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'loaded', version: 12 });
    const { rerender } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    rerender({ player: mkPlayer({ level: 2 }), enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(hydrateSpy).toHaveBeenCalledWith(noopReplace);
  });
});

describe('useGameStateSync — flushNow', () => {
  it('sends immediately and clears the pending timer', async () => {
    const { result, rerender } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    rerender({ player: mkPlayer({ level: 5 }), enabled: true });
    await result.current.flushNow();
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
    expect(endpoints.putGameState).toHaveBeenLastCalledWith(
      { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 5 }) },
      null,
    );
    vi.advanceTimersByTime(10000);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
  });

  it('resolves even when the PUT fails', async () => {
    vi.mocked(endpoints.putGameState).mockRejectedValue(new Error('network'));
    const { result } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    await expect(result.current.flushNow()).resolves.toBeUndefined();
  });

  it('is a no-op when disabled', async () => {
    const { result } = mount({ player: mkPlayer({ level: 1 }), enabled: false });
    await result.current.flushNow();
    expect(endpoints.putGameState).not.toHaveBeenCalled();
  });
});

describe('useGameStateSync — start', () => {
  it('seeds the base version from a loaded hydrate', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'loaded', version: 7 });
    const { result, rerender } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    const kind = await result.current.start();
    expect(kind).toBe('loaded');
    rerender({ player: mkPlayer({ level: 2 }), enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoints.putGameState).toHaveBeenLastCalledWith(
      { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 2 }) },
      7,
    );
  });

  it('adopts the local save with baseVersion null when the server is empty', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'empty', version: null });
    vi.mocked(endpoints.putGameState).mockResolvedValue({ version: 1 });
    const { result } = mount({ player: mkPlayer({ level: 4, coins: 90 }), enabled: true });
    const kind = await result.current.start();
    expect(kind).toBe('empty');
    expect(endpoints.putGameState).toHaveBeenCalledWith(
      { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 4, coins: 90 }) },
      null,
    );
  });

  it('returns error and does not write when the hydrate fails', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'error', version: null });
    const { result } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    expect(await result.current.start()).toBe('error');
    expect(endpoints.putGameState).not.toHaveBeenCalled();
  });
});

describe('useGameStateSync — pagehide keepalive', () => {
  it('sends a keepalive fetch with the CSRF header and baseVersion', () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal('fetch', fetchSpy);
    document.cookie = 'dbl_csrf=tok%20en';

    mount({ player: mkPlayer({ level: 9 }), enabled: true });
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
      baseVersion: null,
    });
  });

  it('does not send on pagehide when disabled', () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal('fetch', fetchSpy);
    mount({ player: mkPlayer({ level: 9 }), enabled: false });
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
