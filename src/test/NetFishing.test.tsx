import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NetFishing from '@/components/game/NetFishing';
import { I18nProvider } from '@/game/i18n';
import { LOCATIONS } from '@/game/data';
import { getXpForLevel, PlayerState, FishingLocation } from '@/game/types';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 8, xp: 0, xpToNextLevel: getXpForLevel(8), totalFishCaught: 0,
    collection: [], unlockedLocations: ['titicaca'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 3,
    ...over,
  };
}

const lake = LOCATIONS.find(l => l.id === 'titicaca') as FishingLocation;

function renderNet(over: Partial<PlayerState> = {}) {
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <NetFishing
        location={lake}
        player={makePlayer(over)}
        onCatch={vi.fn()}
        onCatchBatch={vi.fn()}
        onBack={onBack}
        onUseNet={vi.fn()}
        onOpenShop={vi.fn()}
      />
    </I18nProvider>,
  );
  return { onBack };
}

beforeEach(() => cleanup());

describe('NetFishing', () => {
  it('opens on the pull phase with the location and a pull control', () => {
    renderNet();
    expect(screen.getByText(lake.name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /puxar/i })).toBeInTheDocument();
  });

  it('names the drawn net after a rarity', () => {
    renderNet();
    expect(screen.getByText((txt) => /^Rede\s*[—–-]\s*\S/.test(txt))).toBeInTheDocument();
  });

  it('goes back', () => {
    const { onBack } = renderNet();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
