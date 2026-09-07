import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NetShop from '@/components/game/NetShop';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState, NET_LIMIT, NET_PRICE } from '@/game/types';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 5, xp: 0, xpToNextLevel: getXpForLevel(5), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: NET_PRICE * 2, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 3,
    ...over,
  };
}

function renderShop(over: Partial<PlayerState> = {}) {
  const onBuy = vi.fn();
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <NetShop player={makePlayer(over)} onBuy={onBuy} onBack={onBack} />
    </I18nProvider>,
  );
  return { onBuy, onBack };
}

beforeEach(() => cleanup());

describe('NetShop', () => {
  it('shows the current net stock and buys one', () => {
    const { onBuy } = renderShop({ nets: 3 });
    expect(
      screen.getByText((_, el) => el?.textContent?.replace(/\s/g, '') === `3/${NET_LIMIT}`),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /comprar 1 rede/i }));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it('blocks buying when the locker is full', () => {
    const { onBuy } = renderShop({ nets: NET_LIMIT });
    const control = screen.getByRole('button', { name: /limite máximo/i });
    fireEvent.click(control);
    expect(onBuy).not.toHaveBeenCalled();
  });

  it('blocks buying when the player cannot afford a net', () => {
    const { onBuy } = renderShop({ coins: NET_PRICE - 1 });
    fireEvent.click(screen.getByRole('button', { name: /moedas insuficientes/i }));
    expect(onBuy).not.toHaveBeenCalled();
  });

  it('goes back', () => {
    const { onBack } = renderShop();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disables the buy control while a purchase is in flight', () => {
    render(
      <I18nProvider>
        <NetShop player={makePlayer({ nets: 3 })} buying onBuy={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: /comprar 1 rede/i })).toBeDisabled();
  });
});
