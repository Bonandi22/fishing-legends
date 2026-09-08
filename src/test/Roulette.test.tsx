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

beforeEach(() => cleanup());

describe('Roulette', () => {
  function renderRoulette(
    over: Partial<PlayerState> = {},
    onSpin: () => Promise<unknown> = vi.fn().mockResolvedValue({ type: 'coins', amount: 250 }),
  ) {
    const onBack = vi.fn();
    render(
      <I18nProvider>
        <Roulette player={makePlayer(over)} onSpin={onSpin as () => Promise<never>} onBack={onBack} />
      </I18nProvider>,
    );
    return { onBack, onSpin };
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

  it('calls onSpin and reveals the returned reward', async () => {
    const onSpin = vi.fn().mockResolvedValue({ type: 'coins', amount: 250 });
    renderRoulette({ lastRouletteDate: null }, onSpin);
    fireEvent.click(screen.getByRole('button', { name: /girar/i }));
    expect(onSpin).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/250/)).toBeInTheDocument();
  });

  it('disables the control while busy', () => {
    render(
      <I18nProvider>
        <Roulette player={makePlayer()} onSpin={vi.fn()} busy onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: /girar/i })).toBeDisabled();
  });

  it('goes back', () => {
    const { onBack } = renderRoulette();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('SkinRoulette', () => {
  function renderSkinRoulette(
    over: Partial<PlayerState> = {},
    onSpin: () => Promise<unknown> = vi.fn().mockResolvedValue({ type: 'rodSkin', skinId: 'shark' }),
  ) {
    const onBack = vi.fn();
    render(
      <I18nProvider>
        <SkinRoulette player={makePlayer(over)} onSpin={onSpin as () => Promise<never>} onBack={onBack} />
      </I18nProvider>,
    );
    return { onBack, onSpin };
  }

  it('shows the spin cost on the control', () => {
    renderSkinRoulette({ coins: 5000 });
    expect(screen.getByRole('button', { name: /1500/ })).toBeEnabled();
  });

  it('blocks the spin when the player cannot afford it', () => {
    const { onSpin } = renderSkinRoulette({ coins: 1000 });
    expect(screen.getByRole('button', { name: /1500/ })).toBeDisabled();
    expect(screen.getByText(/moedas insuficientes/i)).toBeInTheDocument();
    expect(onSpin).not.toHaveBeenCalled();
  });

  it('calls onSpin and reveals the returned skin', async () => {
    const onSpin = vi.fn().mockResolvedValue({ type: 'rodSkin', skinId: 'shark' });
    renderSkinRoulette({ coins: 5000 }, onSpin);
    fireEvent.click(screen.getByRole('button', { name: /1500/ }));
    expect(onSpin).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/tubarão/i)).toBeInTheDocument();
  });

  it('disables the control while busy', () => {
    render(
      <I18nProvider>
        <SkinRoulette player={makePlayer({ coins: 5000 })} onSpin={vi.fn()} busy onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: /1500/ })).toBeDisabled();
  });

  it('goes back', () => {
    const { onBack } = renderSkinRoulette();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
