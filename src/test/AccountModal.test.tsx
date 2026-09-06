import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import AccountModal from '@/components/game/menu/AccountModal';
import { ACCOUNT_KEY } from '@/components/game/menu/account';
import { I18nProvider } from '@/game/i18n';

function seedLeaderboardAccount() {
  localStorage.setItem(
    'fishing-game-leaderboard',
    JSON.stringify({
      'me@example.com': {
        email: 'me@example.com', username: 'DeepDiver', country: '🇧🇷',
        level: 8, totalFishCaught: 40, coins: 900, skins: [], boatSkins: [],
        multipliers: { luck: 0, strength: 0 }, updatedAt: Date.now(),
      },
    }),
  );
}

function renderModal(account: Parameters<typeof AccountModal>[0]['account'] = null) {
  const onClose = vi.fn();
  const onAccountChange = vi.fn();
  render(
    <I18nProvider>
      <AccountModal open account={account} onClose={onClose} onAccountChange={onAccountChange} />
    </I18nProvider>,
  );
  return { onClose, onAccountChange };
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('AccountModal login', () => {
  it('logs in with a saved username and persists the account', async () => {
    seedLeaderboardAccount();
    const { onAccountChange } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /já tem conta/i }));
    fireEvent.change(screen.getByPlaceholderText('MyAngler'), { target: { value: 'deepdiver' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));

    await waitFor(() => {
      expect(onAccountChange).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'me@example.com', username: 'DeepDiver', country: '🇧🇷' }),
      );
    });
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!)).toMatchObject({ username: 'DeepDiver' });
  });

  it('shows an error when the username is not registered', () => {
    const { onAccountChange } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /já tem conta/i }));
    fireEvent.change(screen.getByPlaceholderText('MyAngler'), { target: { value: 'ghost' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));

    expect(screen.getByText(/conta não encontrada/i)).toBeInTheDocument();
    expect(onAccountChange).not.toHaveBeenCalled();
  });
});
