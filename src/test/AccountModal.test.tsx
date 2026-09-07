import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/game/i18n';
import * as endpoints from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { AuthProvider } from '@/game/auth/AuthProvider';
import AccountModal from '@/components/game/menu/AccountModal';

function renderModal() {
  const onClose = vi.fn();
  render(
    <I18nProvider>
      <AuthProvider><AccountModal open onClose={onClose} /></AuthProvider>
    </I18nProvider>,
  );
  return { onClose };
}

beforeEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear();
  vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', '')); });

describe('AccountModal', () => {
  it('logs in with email + password', async () => {
    const login = vi.spyOn(endpoints, 'login').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'e@x.com', password: 'a-strong-password' }));
  });

  it('registers with email, password, username, country (ISO-2)', async () => {
    const register = vi.spyOn(endpoints, 'register').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    renderModal();
    fireEvent.change(await screen.findByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.change(screen.getByLabelText(/nome de utilizador/i), { target: { value: 'Angler' } });
    // default country is 🌍 -> ZZ; pick Brazil
    fireEvent.click(screen.getByRole('button', { name: '🇧🇷' }));
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    await waitFor(() => expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'e@x.com', password: 'a-strong-password', username: 'Angler', country: 'BR' }),
    ));
  });

  it('shows a mapped error message on invalid credentials', async () => {
    vi.spyOn(endpoints, 'login').mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'x'));
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    expect(await screen.findByText(/inválidos/i)).toBeInTheDocument();
  });

  it('when authenticated: shows the username and a log-out button', async () => {
    vi.restoreAllMocks();
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'Angler', email: 'e', country: 'BR', level: 1, xp: 0, totalFishCaught: 0, coins: 0, unlockedLocations: [] } } as never);
    vi.spyOn(endpoints, 'logout').mockResolvedValue();
    renderModal();
    expect(await screen.findByText('Angler')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    await waitFor(() => expect(endpoints.logout).toHaveBeenCalled());
  });
});
