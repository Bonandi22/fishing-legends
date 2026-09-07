import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Warehouse from '@/components/game/Warehouse';
import { I18nProvider } from '@/game/i18n';
import { FISH } from '@/game/data';
import { getXpForLevel, PlayerState, CaughtFish, FISH_COIN_VALUE } from '@/game/types';

function stored(id: string, weight: number): CaughtFish {
  const fish = FISH.find(f => f.id === id)!;
  return { fish, weight, location: 'atlantic', timestamp: Math.random() };
}

function makePlayer(warehouse: CaughtFish[]): PlayerState {
  return {
    level: 5, xp: 0, xpToNextLevel: getXpForLevel(5), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse,
    coins: 100, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
  };
}

function renderWarehouse(warehouse: CaughtFish[] = []) {
  const onSell = vi.fn();
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <Warehouse player={makePlayer(warehouse)} onSell={onSell} onBack={onBack} />
    </I18nProvider>,
  );
  return { onSell, onBack };
}

beforeEach(() => cleanup());

describe('Warehouse', () => {
  it('shows the empty state when nothing is stored', () => {
    renderWarehouse([]);
    expect(screen.getByText(/armazém vazio/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /vender/i })).not.toBeInTheDocument();
  });

  it('lists a stored fish with its weight', () => {
    renderWarehouse([stored('atum', 42)]);
    expect(screen.getByText('Atum')).toBeInTheDocument();
    expect(screen.getByText('42 kg')).toBeInTheDocument();
  });

  it('sells the whole haul and shows the coin total on the control', () => {
    const { onSell } = renderWarehouse([stored('atum', 40), stored('sardinha', 0.1)]);
    const coins = FISH_COIN_VALUE.legendary + FISH_COIN_VALUE.common; // 100 + 10

    const sell = screen.getByRole('button', { name: new RegExp(`\\+\\s*${coins}`) });
    fireEvent.click(sell);

    expect(onSell).toHaveBeenCalledTimes(1);
  });

  it('goes back', () => {
    const { onBack } = renderWarehouse([]);
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disables the sell-all control while a sale is in flight', () => {
    render(
      <I18nProvider>
        <Warehouse player={makePlayer([stored('atum', 40)])} selling onSell={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: /XP/ })).toBeDisabled();
  });

  it('keeps the sell-all control enabled when not selling and the warehouse has fish', () => {
    render(
      <I18nProvider>
        <Warehouse player={makePlayer([stored('atum', 40)])} onSell={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: /XP/ })).toBeEnabled();
  });
});
