import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SubmarineFishing from '@/components/game/SubmarineFishing';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState } from '@/game/types';

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

beforeEach(() => cleanup());

describe('SubmarineFishing HUD', () => {
  it('renders the screen title', () => {
    render(
      <I18nProvider>
        <SubmarineFishing player={makePlayer()} onCatch={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText(/submarina/i)).toBeInTheDocument();
  });

  it('goes back from the HUD control', () => {
    const onBack = vi.fn();
    render(
      <I18nProvider>
        <SubmarineFishing player={makePlayer()} onCatch={vi.fn()} onBack={onBack} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /voltar|back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
