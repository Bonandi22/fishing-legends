import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import SubmarineFishing from '@/components/game/SubmarineFishing';
import { I18nProvider } from '@/game/i18n';
import { FISH } from '@/game/data';
import { getXpForLevel, PlayerState } from '@/game/types';
import type { SubmarineHooked } from '@/game/fishing';

// Canvas + rAF are not available in jsdom; stub them.
beforeEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 6, xp: 20, xpToNextLevel: getXpForLevel(6), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 5,
    ...over,
  };
}

const roster = (n = 6): SubmarineHooked => ({
  kind: 'submarine',
  sessionId: 's1',
  catches: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, fish: FISH[0], weight: 1 + i })),
});

describe('SubmarineFishing', () => {
  it('casts a submarine roster on mount', async () => {
    const onCast = vi.fn().mockResolvedValue(roster());
    render(<I18nProvider><SubmarineFishing player={makePlayer()} onCast={onCast} onLand={vi.fn()} onBack={vi.fn()} /></I18nProvider>);
    await waitFor(() => expect(onCast).toHaveBeenCalledWith('submarine', 'submarine'));
  });

  it('goes back from the HUD control', async () => {
    const onBack = vi.fn();
    render(<I18nProvider><SubmarineFishing player={makePlayer()} onCast={vi.fn().mockResolvedValue(roster())} onLand={vi.fn()} onBack={onBack} /></I18nProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /voltar|back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when the cast returns null', async () => {
    render(<I18nProvider><SubmarineFishing player={makePlayer()} onCast={vi.fn().mockResolvedValue(null)} onLand={vi.fn()} onBack={vi.fn()} /></I18nProvider>);
    expect(await screen.findByText(/indispon|unavailable|no disponible/i)).toBeInTheDocument();
  });
});
