import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import SkinsShop from '@/components/game/SkinsShop';
import BoatSkinsShop from '@/components/game/BoatSkinsShop';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState, ROD_SKINS, BOAT_SKINS } from '@/game/types';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 5, xp: 0, xpToNextLevel: getXpForLevel(5), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 50000, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...over,
  };
}

beforeEach(() => cleanup());

describe('SkinsShop', () => {
  function renderShop(over: Partial<PlayerState> = {}) {
    const onBuy = vi.fn();
    const onEquip = vi.fn();
    const onOpenBoatVisuals = vi.fn();
    render(
      <I18nProvider>
        <SkinsShop
          player={makePlayer(over)}
          onBuy={onBuy}
          onEquip={onEquip}
          onBack={vi.fn()}
          onOpenBoatVisuals={onOpenBoatVisuals}
        />
      </I18nProvider>,
    );
    return { onBuy, onEquip, onOpenBoatVisuals };
  }

  const paidSkin = ROD_SKINS.find(s => !s.exclusive && s.price > 0)!;

  it('lists the buyable rod skins', () => {
    renderShop();
    expect(screen.getByText(paidSkin.name)).toBeInTheDocument();
  });

  it('buys a skin with its id and price', () => {
    const { onBuy } = renderShop();
    const card = screen.getByText(paidSkin.name).closest('div')!;
    fireEvent.click(within(card).getByRole('button', { name: /comprar/i }));
    expect(onBuy).toHaveBeenCalledWith(paidSkin.id, paidSkin.price);
  });

  it('shows the active skin as equipped', () => {
    renderShop({ ownedSkins: ['default'], activeSkin: 'default' });
    const card = screen.getByText(ROD_SKINS[0].name).closest('div')!;
    expect(within(card).getByText(/equipado/i)).toBeInTheDocument();
  });

  it('opens the boat visuals screen', () => {
    const { onOpenBoatVisuals } = renderShop();
    fireEvent.click(screen.getByRole('button', { name: /visuais do barco/i }));
    expect(onOpenBoatVisuals).toHaveBeenCalledTimes(1);
  });
});

describe('BoatSkinsShop', () => {
  const paidBoat = BOAT_SKINS.find(s => !s.exclusive && s.price > 0)!;

  it('buys a boat skin with its id and price', () => {
    const onBuy = vi.fn();
    render(
      <I18nProvider>
        <BoatSkinsShop player={makePlayer()} onBuy={onBuy} onEquip={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );
    const card = screen.getByText(paidBoat.name).closest('div')!;
    fireEvent.click(within(card).getByRole('button', { name: /comprar/i }));
    expect(onBuy).toHaveBeenCalledWith(paidBoat.id, paidBoat.price);
  });
});
