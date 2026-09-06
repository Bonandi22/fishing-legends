import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import DailyGifts from '@/components/game/DailyGifts';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState } from '@/game/types';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 5, xp: 0, xpToNextLevel: getXpForLevel(5), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...over,
  };
}

function renderGifts(over: Partial<PlayerState> = {}) {
  const onClaim = vi.fn();
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <DailyGifts player={makePlayer(over)} onClaim={onClaim} onBack={onBack} />
    </I18nProvider>,
  );
  return { onClaim, onBack };
}

const today = new Date().toISOString().slice(0, 10);

beforeEach(() => cleanup());

describe('DailyGifts', () => {
  it('claims the current day and shows the reward popup', () => {
    const { onClaim } = renderGifts({ dailyGiftsLastClaim: null, dailyGiftsDay: 1 });

    fireEvent.click(screen.getByRole('button', { name: /resgatar dia 1/i }));

    expect(onClaim).toHaveBeenCalledTimes(1);
    // day 1 of week 1 is 150 coins
    expect(within(screen.getByRole('dialog')).getByText(/150/)).toBeInTheDocument();
  });

  it('disables claiming once today\'s gift is taken', () => {
    const { onClaim } = renderGifts({ dailyGiftsLastClaim: today, dailyGiftsDay: 2 });

    const control = screen.getByRole('button', { name: /volte amanh/i });
    fireEvent.click(control);

    expect(onClaim).not.toHaveBeenCalled();
  });

  it('marks exclusive skin days', () => {
    renderGifts({ dailyGiftsDay: 6, dailyGiftsWeek: 1 });
    expect(screen.getAllByText(/exclusivo/i).length).toBeGreaterThan(0);
  });

  it('goes back', () => {
    const { onBack } = renderGifts();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
