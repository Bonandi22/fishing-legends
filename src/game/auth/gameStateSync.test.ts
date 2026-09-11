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
  vi.spyOn(endpoints, 'bootstrapGameState').mockResolvedValue({ version: 1 });
  vi.spyOn(endpoints, 'getGameState').mockResolvedValue({ state: null, updatedAt: null, version: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useGameStateSync — start', () => {
  it('seeds the base version from a loaded hydrate', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'loaded', version: 7 });
    const { result } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    const kind = await result.current.start();
    expect(kind).toBe('loaded');
    // The seeded version is exercised by the "periodic pull" tests below,
    // which observe it through poll()'s version comparison — there is no
    // more push to observe it through directly.
  });

  it('bootstraps the account with the local save when the server is empty', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'empty', version: null });
    vi.mocked(endpoints.bootstrapGameState).mockResolvedValue({ version: 1 });
    const { result } = mount({ player: mkPlayer({ level: 4, coins: 90 }), enabled: true });
    const kind = await result.current.start();
    expect(kind).toBe('empty');
    expect(endpoints.bootstrapGameState).toHaveBeenCalledWith(
      { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 4, coins: 90 }) },
    );
  });

  it('returns error and does not write when the hydrate fails', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'error', version: null });
    const { result } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    expect(await result.current.start()).toBe('error');
    expect(endpoints.bootstrapGameState).not.toHaveBeenCalled();
  });
});

describe('useGameStateSync — periodic pull', () => {
  const seedVersion = async (v: number) => {
    const player = mkPlayer({ level: 1 });
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'loaded', version: v, player });
    const h = mount({ player, enabled: true });
    await h.result.current.start();
    await vi.advanceTimersByTimeAsync(4_000); // let the post-start debounce settle (dirty-check skips it)
    vi.mocked(hydrateModule.hydrateFromServer).mockClear();
    return h;
  };

  it('polls GET /me/state on a 45s interval while enabled', async () => {
    mount({ player: mkPlayer({ level: 1 }), enabled: true });
    expect(endpoints.getGameState).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(endpoints.getGameState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(endpoints.getGameState).toHaveBeenCalledTimes(2);
  });

  it('does not poll when disabled', async () => {
    mount({ player: mkPlayer({ level: 1 }), enabled: false });
    await vi.advanceTimersByTimeAsync(200_000);
    expect(endpoints.getGameState).not.toHaveBeenCalled();
  });

  it('replaces local state when the poll sees a newer server version', async () => {
    await seedVersion(3);
    vi.mocked(endpoints.getGameState).mockResolvedValue({ state: {}, updatedAt: 'x', version: 5 });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(hydrateModule.hydrateFromServer).toHaveBeenCalledWith(noopReplace);
  });

  it('does not replace when the poll sees the same version', async () => {
    await seedVersion(3);
    vi.mocked(endpoints.getGameState).mockResolvedValue({ state: {}, updatedAt: 'x', version: 3 });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(hydrateModule.hydrateFromServer).not.toHaveBeenCalled();
  });

  it('skips the poll tick while the tab is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    mount({ player: mkPlayer({ level: 1 }), enabled: true });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(endpoints.getGameState).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('polls immediately when the tab becomes visible', async () => {
    mount({ player: mkPlayer({ level: 1 }), enabled: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(endpoints.getGameState).toHaveBeenCalledTimes(1);
  });
});

describe('useGameStateSync — applyServerResult', () => {
  const validEnvelope = (over: Record<string, unknown> = {}) => ({
    schemaVersion: SAVE_SCHEMA_VERSION,
    player: {
      level: 7, xp: 60, xpToNextLevel: 700, totalFishCaught: 20,
      collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
      coins: 900, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
      luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
      aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
      dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
      ...over,
    },
  });

  it('replaces local state, seeds the base version, and does not trigger a PUT', async () => {
    const replace = vi.fn();
    const { result, rerender } = renderHook(
      ({ player, enabled }) => useGameStateSync({ player, enabled, replace }),
      { initialProps: { player: mkPlayer({ level: 1 }) as never, enabled: true } },
    );
    result.current.applyServerResult({ state: validEnvelope({ coins: 1234 }), version: 9 });
    expect(replace).toHaveBeenCalledTimes(1);
    const applied = replace.mock.calls[0][0]({ level: 1 });
    expect(applied).toMatchObject({ coins: 1234, level: 7 });

    rerender({ player: applied as never, enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoints.bootstrapGameState).not.toHaveBeenCalled();
  });

  it('ignores an invalid envelope', () => {
    const replace = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(
      ({ player, enabled }) => useGameStateSync({ player, enabled, replace }),
      { initialProps: { player: mkPlayer({ level: 1 }) as never, enabled: true } },
    );
    result.current.applyServerResult({ state: { schemaVersion: 1, player: { level: 0 } }, version: 3 });
    expect(replace).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
