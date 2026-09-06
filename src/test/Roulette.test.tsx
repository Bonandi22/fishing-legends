import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import Roulette from '@/components/game/Roulette';
import SkinRoulette from '@/components/game/SkinRoulette';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState } from '@/game/types';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 5, xp: 0, xpToNextLevel: getXpForLevel(5), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 5000, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...over,
  };
}

const today = new Date().toISOString().slice(0, 10);
const noop = () => {};

beforeEach(() => cleanup());

describe('Roulette', () => {
  function renderRoulette(over: Partial<PlayerState> = {}) {
    const onBack = vi.fn();
    render(
      <I18nProvider>
        <Roulette
          player={makePlayer(over)}
          onAddCoins={noop} onAddSkin={noop} onAddBoatSkin={noop} onAddMultiplier={noop}
          onSetLastRouletteDate={noop} onBack={onBack}
        />
      </I18nProvider>,
    );
    return { onBack };
  }

  it('offers a spin when the daily roulette is available', () => {
    renderRoulette({ lastRouletteDate: null });
    expect(screen.getByRole('button', { name: /girar/i })).toBeEnabled();
  });

  it('reports that the daily spin is used up', () => {
    renderRoulette({ lastRouletteDate: today });
    expect(screen.getByText(/já girou/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /girar/i })).not.toBeInTheDocument();
  });

  it('goes back', () => {
    const { onBack } = renderRoulette();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('SkinRoulette', () => {
  function renderSkinRoulette(over: Partial<PlayerState> = {}) {
    const onBack = vi.fn();
    const onSpend = vi.fn();
    render(
      <I18nProvider>
        <SkinRoulette
          player={makePlayer(over)}
          onAddSkin={noop} onAddBoatSkin={noop} onSpend={onSpend} onBack={onBack}
        />
      </I18nProvider>,
    );
    return { onBack, onSpend };
  }

  it('shows the spin cost on the control', () => {
    renderSkinRoulette({ coins: 5000 });
    expect(screen.getByRole('button', { name: /1500/ })).toBeEnabled();
  });

  it('blocks the spin when the player cannot afford it', () => {
    const { onSpend } = renderSkinRoulette({ coins: 1000 });
    expect(screen.getByRole('button', { name: /1500/ })).toBeDisabled();
    expect(screen.getByText(/moedas insuficientes/i)).toBeInTheDocument();
    expect(onSpend).not.toHaveBeenCalled();
  });

  it('goes back', () => {
    const { onBack } = renderSkinRoulette();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
