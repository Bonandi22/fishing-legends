import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import MainMenu from '@/components/game/MainMenu';
import { I18nProvider } from '@/game/i18n';
import { getXpForLevel, PlayerState } from '@/game/types';

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 1, xp: 0, xpToNextLevel: getXpForLevel(1), totalFishCaught: 0,
    collection: [], unlockedLocations: ['amazon'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...overrides,
  };
}

function renderMenu(overrides: Partial<PlayerState> = {}) {
  const handlers = {
    onPlay: vi.fn(), onCollection: vi.fn(), onWarehouse: vi.fn(), onSubmarine: vi.fn(),
    onMultiplier: vi.fn(), onSkins: vi.fn(), onRoulette: vi.fn(), onSkinRoulette: vi.fn(),
    onRanking: vi.fn(), onAquarium: vi.fn(), onDailyGifts: vi.fn(), onReset: vi.fn(),
    onToggleMusic: vi.fn(), onSetMusicTrack: vi.fn(), onSetWorld: vi.fn(),
  };
  render(
    <I18nProvider>
      <MainMenu
        player={makePlayer(overrides)}
        musicPlaying={false}
        musicTrack="calm"
        world={1}
        {...handlers}
      />
    </I18nProvider>,
  );
  return handlers;
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('MainMenu navigation', () => {
  it('starts a fishing trip when the play button is pressed', () => {
    const { onPlay } = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: /pescar/i }));

    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('routes to every hub destination from its button', () => {
    const h = renderMenu();

    const cases: Array<[RegExp, ReturnType<typeof vi.fn>]> = [
      [/submarina/i, h.onSubmarine],
      [/coleção/i, h.onCollection],
      [/armazém/i, h.onWarehouse],
      [/multiplicador/i, h.onMultiplier],
      [/roleta de skins/i, h.onSkinRoulette],
      [/^(🎰\s*)?roleta$/i, h.onRoulette],
      [/ranking/i, h.onRanking],
      [/aquário/i, h.onAquarium],
      [/^(🎨\s*)?skins$/i, h.onSkins],
    ];

    for (const [name, handler] of cases) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(handler, `handler for ${name}`).toHaveBeenCalledTimes(1);
    }
  });

  it('opens daily gifts from the surface bar', () => {
    const { onDailyGifts } = renderMenu({ dailyGiftsLastClaim: null });

    fireEvent.click(screen.getByRole('button', { name: /presentes/i }));

    expect(onDailyGifts).toHaveBeenCalledTimes(1);
  });
});

describe('MainMenu world switching', () => {
  it('keeps world 2 locked until level 12', () => {
    renderMenu({ level: 11 });
    expect(screen.getByRole('button', { name: /mundo 2/i })).toBeDisabled();
  });

  it('unlocks world 2 at level 12 and reports the choice', () => {
    const { onSetWorld } = renderMenu({ level: 12 });

    const world2 = screen.getByRole('button', { name: /mundo 2/i });
    expect(world2).toBeEnabled();
    fireEvent.click(world2);

    expect(onSetWorld).toHaveBeenCalledWith(2);
  });

  it('keeps world 3 locked until level 20', () => {
    renderMenu({ level: 19 });
    expect(screen.getByRole('button', { name: /mundo 3/i })).toBeDisabled();
  });

  it('marks the current world as the active dial segment', () => {
    renderMenu({ level: 25 });
    expect(screen.getByRole('button', { name: /mundo 1/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /mundo 2/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects world 3 directly from the dial once unlocked', () => {
    const { onSetWorld } = renderMenu({ level: 25 });

    fireEvent.click(screen.getByRole('button', { name: /mundo 3/i }));

    expect(onSetWorld).toHaveBeenCalledWith(3);
  });
});

describe('MainMenu progress reset', () => {
  it('hides the reset control for a fresh player', () => {
    renderMenu({ level: 1 });
    expect(screen.queryByRole('button', { name: /resetar/i })).not.toBeInTheDocument();
  });

  it('shows and fires the reset control past level 1', () => {
    const { onReset } = renderMenu({ level: 3 });

    fireEvent.click(screen.getByRole('button', { name: /resetar/i }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe('MainMenu account modal', () => {
  it('advances from credentials to username after saving a new account', async () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: /cadastro/i }));

    fireEvent.change(screen.getByPlaceholderText(/email@/i), { target: { value: 'angler@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/•+/), { target: { value: 'hunter2secret' } });
    const birthdate = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(birthdate, { target: { value: '1990-01-01' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar conta/i }));

    expect(await screen.findByText(/escolha um nome de usuário/i)).toBeInTheDocument();
  });
});
