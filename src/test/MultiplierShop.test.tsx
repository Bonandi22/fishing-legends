import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import MultiplierShop from '@/components/game/MultiplierShop';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState, MULTIPLIER_COST } from '@/game/types';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 5, xp: 0, xpToNextLevel: getXpForLevel(5), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 20000, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...over,
  };
}

function renderShop(over: Partial<PlayerState> = {}) {
  const onBuy = vi.fn();
  render(
    <I18nProvider>
      <MultiplierShop player={makePlayer(over)} onBuy={onBuy} onBack={vi.fn()} />
    </I18nProvider>,
  );
  return { onBuy };
}

beforeEach(() => cleanup());

describe('MultiplierShop', () => {
  it('buys the 2x luck multiplier with its type and power', () => {
    const { onBuy } = renderShop();
    const card = screen.getByText(/2x sorte/i).closest('div')!;
    fireEvent.click(screen.getAllByRole('button', { name: /comprar/i })[0]);
    expect(onBuy).toHaveBeenCalledWith('luck', 2);
    expect(card).toBeInTheDocument();
  });

  it('marks a multiplier active while its timer runs', () => {
    renderShop({ luckMultiplierEnd: Date.now() + 60_000, luckMultiplierPower: 2 });
    expect(screen.getAllByText(/ativo/i).length).toBeGreaterThan(0);
  });

  it('blocks a purchase the player cannot afford', () => {
    const { onBuy } = renderShop({ coins: MULTIPLIER_COST - 1 });
    screen.getAllByRole('button', { name: /moedas insuficientes/i }).forEach(b => fireEvent.click(b));
    expect(onBuy).not.toHaveBeenCalled();
  });
});
