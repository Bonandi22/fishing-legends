import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Collection from '@/components/game/Collection';
import { I18nProvider } from '@/game/i18n';
import { FISH } from '@/game/data';
import { getXpForLevel, PlayerState, CaughtFish } from '@/game/types';

function caught(id: string, weight: number): CaughtFish {
  const fish = FISH.find(f => f.id === id)!;
  return { fish, weight, location: 'atlantic', timestamp: 1 };
}

function makePlayer(collection: CaughtFish[]): PlayerState {
  return {
    level: 4, xp: 0, xpToNextLevel: getXpForLevel(4), totalFishCaught: collection.length,
    collection, unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
  };
}

function renderCollection(collection: CaughtFish[] = []) {
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <Collection player={makePlayer(collection)} onBack={onBack} />
    </I18nProvider>,
  );
  return { onBack };
}

beforeEach(() => cleanup());

describe('Collection', () => {
  it('reports how many species have been recorded', () => {
    renderCollection([caught('sardinha', 0.1)]);
    expect(screen.getByText(new RegExp(`1/${FISH.length} esp`))).toBeInTheDocument();
  });

  it('names a caught species and hides the name of an uncaught one', () => {
    renderCollection([caught('sardinha', 0.12)]);
    expect(screen.getByText('Sardinha')).toBeInTheDocument();
    // atum is not in the collection
    expect(screen.queryByText('Atum')).not.toBeInTheDocument();
  });

  it('shows the personal record for a caught species', () => {
    renderCollection([caught('sardinha', 0.09), caught('sardinha', 0.18)]);
    expect(screen.getByText(/0\.18/)).toBeInTheDocument();
  });

  it('filters the grid to a single rarity', () => {
    renderCollection([caught('sardinha', 0.1), caught('atum', 40)]);

    expect(screen.getByText('Sardinha')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /lendário/i }));

    expect(screen.getByText('Atum')).toBeInTheDocument();
    expect(screen.queryByText('Sardinha')).not.toBeInTheDocument();
  });

  it('goes back', () => {
    const { onBack } = renderCollection();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
