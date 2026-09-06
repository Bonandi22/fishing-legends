import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Aquarium from '@/components/game/Aquarium';
import { I18nProvider } from '@/game/i18n';
import { FISH } from '@/game/data';
import { getXpForLevel, PlayerState, CaughtFish } from '@/game/types';

function fish(id: string): CaughtFish {
  return { fish: FISH.find(f => f.id === id)!, weight: 10, location: 'atlantic', timestamp: Math.random() };
}

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 8, xp: 0, xpToNextLevel: getXpForLevel(8), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...over,
  };
}

function renderAquarium(over: Partial<PlayerState> = {}) {
  const onMoveToSector = vi.fn();
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <Aquarium player={makePlayer(over)} onMoveToSector={onMoveToSector} onBack={onBack} />
    </I18nProvider>,
  );
  return { onMoveToSector, onBack };
}

beforeEach(() => cleanup());

describe('Aquarium', () => {
  it('switches between the tank and the storage view', () => {
    renderAquarium({ aquariumWarehouse: [fish('atum')] });

    fireEvent.click(screen.getByRole('button', { name: /armazém do aquário/i }));
    expect(screen.getByText('Atum')).toBeInTheDocument();
  });

  it('requires a target sector before a fish can be moved', () => {
    const spare = fish('atum');
    const { onMoveToSector } = renderAquarium({ aquariumWarehouse: [spare] });

    fireEvent.click(screen.getByRole('button', { name: /armazém do aquário/i }));
    // clicking the fish before picking a sector does nothing
    fireEvent.click(screen.getByRole('button', { name: /atum/i }));
    expect(onMoveToSector).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /setor 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /atum/i }));
    expect(onMoveToSector).toHaveBeenCalledWith(spare.timestamp, 2);
  });

  it('shows the empty-sector message in the tank view', () => {
    renderAquarium();
    expect(screen.getByText(/setor vazio/i)).toBeInTheDocument();
  });

  it('goes back', () => {
    const { onBack } = renderAquarium();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
