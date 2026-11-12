import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import Ranking from '@/components/game/Ranking';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState } from '@/game/types';
import * as endpoints from '@/api/endpoints';

const authState = vi.hoisted(() => ({
  status: 'anonymous' as 'anonymous' | 'authenticated' | 'loading',
  user: null as { id: string; email: string; username: string; country: string } | null,
}));

vi.mock('@/game/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ ...authState, login: vi.fn(), register: vi.fn(), logout: vi.fn() }),
}));

vi.mock('@/api/endpoints', () => ({
  getLeaderboard: vi.fn(),
  getCurrentSeason: vi.fn(),
}));

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
  authState.status = 'anonymous';
  authState.user = null;
  vi.mocked(endpoints.getLeaderboard).mockReset();
  vi.mocked(endpoints.getCurrentSeason).mockReset().mockResolvedValue({ season: null });
});

describe('Ranking (anonymous, local leaderboard)', () => {
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

  it('never calls the server endpoints', () => {
    renderRanking();
    expect(endpoints.getLeaderboard).not.toHaveBeenCalled();
    expect(endpoints.getCurrentSeason).not.toHaveBeenCalled();
  });
});

describe('Ranking (authenticated, server leaderboard)', () => {
  beforeEach(() => {
    authState.status = 'authenticated';
    authState.user = { id: 'u-me', email: 'me@x.com', username: 'Me', country: 'BR' };
  });

  it('shows a loading state, then the server-ranked rows', async () => {
    vi.mocked(endpoints.getLeaderboard).mockResolvedValue({
      season: 'all-time',
      total: 2,
      entries: [
        { rank: 1, userId: 'u-1', username: 'TopAngler', country: 'BR', level: 9, xp: 0, totalFishCaught: 900, score: 0, coins: 0, skins: [], boatSkins: [], multipliers: { luck: 0, strength: 0 } },
        { rank: 2, userId: 'u-me', username: 'Me', country: 'BR', level: 5, xp: 0, totalFishCaught: 12, score: 0, coins: 300, skins: ['default'], boatSkins: ['classic'], multipliers: { luck: 2, strength: 0 } },
      ],
    });

    renderRanking();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: /topangler/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^🥇.*topangler/i })).toBeInTheDocument();
  });

  it('marks the current user by userId and hides the floating position panel while they are in view', async () => {
    vi.mocked(endpoints.getLeaderboard).mockResolvedValue({
      season: 'all-time',
      total: 1,
      entries: [
        { rank: 1, userId: 'u-me', username: 'Me', country: 'BR', level: 5, xp: 0, totalFishCaught: 12, score: 0, coins: 0, skins: [], boatSkins: [], multipliers: { luck: 0, strength: 0 } },
      ],
    });

    renderRanking();
    await waitFor(() => expect(screen.getByRole('button', { name: /me/i })).toBeInTheDocument());
    expect(screen.queryByText(/sua posição/i)).not.toBeInTheDocument();
  });

  it('opens the profile modal with coins/skins/multipliers pulled from the server entry', async () => {
    vi.mocked(endpoints.getLeaderboard).mockResolvedValue({
      season: 'all-time',
      total: 1,
      entries: [
        { rank: 1, userId: 'u-1', username: 'Rich', country: 'BR', level: 9, xp: 0, totalFishCaught: 40, score: 0, coins: 777, skins: ['default'], boatSkins: ['classic'], multipliers: { luck: 4, strength: 2 } },
      ],
    });

    renderRanking();
    await waitFor(() => expect(screen.getByRole('button', { name: /rich/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /rich/i }));
    fireEvent.click(screen.getByRole('button', { name: /perfil/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('777')).toBeInTheDocument();
  });

  it('shows the active season name when one is returned', async () => {
    vi.mocked(endpoints.getLeaderboard).mockResolvedValue({ season: 'all-time', total: 0, entries: [] });
    vi.mocked(endpoints.getCurrentSeason).mockResolvedValue({
      season: { id: 's1', seasonKey: 'season-1', name: 'Fishing Legends Season 1', status: 'active', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2099-01-01T00:00:00.000Z', rulesetVersion: 'v1', minimumLevel: 1 },
    });

    renderRanking();
    await waitFor(() => expect(screen.getByText((_, el) => el?.textContent === 'Fishing Legends Season 1 · Temporada ativa')).toBeInTheDocument());
  });
});
