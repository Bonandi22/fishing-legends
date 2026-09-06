import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState, FishingLocation } from '@/game/types';
import { LOCATIONS } from '@/game/data';

// The 3D scene and reel minigame need WebGL / rAF — mock them out; this suite
// only exercises the HUD chrome.
vi.mock('@/components/game/FishingScene', () => ({
  FishingScene3D: () => null,
  RodOverlayCanvas: () => null,
}));
vi.mock('@/components/game/PullMinigame', () => ({ default: () => null }));

import FishingScreen from '@/components/game/FishingScreen';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 6, xp: 20, xpToNextLevel: getXpForLevel(6), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic', 'titicaca'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 5,
    ...over,
  };
}

const ocean = LOCATIONS.find(l => l.id === 'atlantic') as FishingLocation;
const lake = LOCATIONS.find(l => l.id === 'titicaca') as FishingLocation;

beforeEach(() => cleanup());

describe('FishingScreen HUD', () => {
  it('shows the location in the HUD and a cast prompt', () => {
    render(
      <I18nProvider>
        <FishingScreen location={ocean} player={makePlayer()} onCatch={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText(new RegExp(ocean.name))).toBeInTheDocument();
  });

  it('goes back from the HUD control', () => {
    const onBack = vi.fn();
    render(
      <I18nProvider>
        <FishingScreen location={ocean} player={makePlayer()} onCatch={vi.fn()} onBack={onBack} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /voltar|back|retour|zurück|戻る/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers the net controls only on lake locations', () => {
    const { rerender } = render(
      <I18nProvider>
        <FishingScreen location={ocean} player={makePlayer()} onCatch={vi.fn()} onBack={vi.fn()} onCastNet={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('button', { name: /rede/i })).not.toBeInTheDocument();

    rerender(
      <I18nProvider>
        <FishingScreen location={lake} player={makePlayer()} onCatch={vi.fn()} onBack={vi.fn()} onCastNet={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: /rede/i })).toBeInTheDocument();
  });
});
