import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import Ranking from '@/components/game/Ranking';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState } from '@/game/types';

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 3, xp: 0, xpToNextLevel: getXpForLevel(3), totalFishCaught: 12,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...over,
  };
}

function seedLeaderboard(entries: Array<{ email: string; username: string; fish: number }>) {
  const map: Record<string, unknown> = {};
  for (const e of entries) {
    map[e.email] = {
      email: e.email, username: e.username, country: '🇧🇷', level: 10,
      totalFishCaught: e.fish, coins: 500, skins: [], boatSkins: [],
      multipliers: { luck: 1, strength: 2 }, updatedAt: Date.now(),
    };
  }
  localStorage.setItem('fishing-game-leaderboard', JSON.stringify(map));
}

function renderRanking(over: Partial<PlayerState> = {}) {
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <Ranking player={makePlayer(over)} onBack={onBack} />
    </I18nProvider>,
  );
  return { onBack };
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('Ranking', () => {
  it('lists the leaderboard in fish-caught order', () => {
    seedLeaderboard([
      { email: 'a@x.com', username: 'AnglerA', fish: 500 },
      { email: 'b@x.com', username: 'AnglerB', fish: 900 },
    ]);
    renderRanking();

    const rows = screen.getAllByRole('button').map(b => b.textContent);
    const a = rows.findIndex(r => r?.includes('AnglerA'));
    const b = rows.findIndex(r => r?.includes('AnglerB'));
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(a); // AnglerB (900) ranks above AnglerA (500)
  });

  it('opens a player profile from their row', () => {
    seedLeaderboard([{ email: 'a@x.com', username: 'DeepDiver', fish: 40 }]);
    renderRanking();

    fireEvent.click(screen.getByRole('button', { name: /deepdiver/i }));
    fireEvent.click(screen.getByRole('button', { name: /perfil/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('40')).toBeInTheDocument();
  });

  it('shows the player\'s own position when they are outside the board', () => {
    seedLeaderboard([{ email: 'top@x.com', username: 'Champ', fish: 9999 }]);
    localStorage.setItem('fishing-game-account', JSON.stringify({ email: 'me@x.com', username: 'Me' }));
    renderRanking({ totalFishCaught: 5 });

    expect(screen.getByText(/sua posição/i)).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('goes back', () => {
    const { onBack } = renderRanking();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
