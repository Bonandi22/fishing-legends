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
    const login = vi.spyOn(endpoints, 'login').mockResolvedValue({ challengeId: 'ch-1' });
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'e@x.com', password: 'a-strong-password', locale: 'pt' }));
    expect(await screen.findByLabelText(/código de 6 dígitos/i)).toBeInTheDocument();
  });

  it('login: entering the emailed code authenticates and closes the modal', async () => {
    vi.spyOn(endpoints, 'login').mockResolvedValue({ challengeId: 'ch-1' });
    const verify = vi.spyOn(endpoints, 'verifyLogin').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    const { onClose } = renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    fireEvent.change(await screen.findByLabelText(/código de 6 dígitos/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(verify).toHaveBeenCalledWith({ challengeId: 'ch-1', code: '123456' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('registers with email, password, username, country (ISO-2)', async () => {
    const register = vi.spyOn(endpoints, 'register').mockResolvedValue({ challengeId: 'ch-1' });
    renderModal();
    fireEvent.change(await screen.findByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.change(screen.getByLabelText(/nome de utilizador/i), { target: { value: 'Angler' } });
    // default country is 🌍 -> ZZ; pick Brazil
    fireEvent.click(screen.getByRole('button', { name: '🇧🇷' }));
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    await waitFor(() => expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'e@x.com', password: 'a-strong-password', username: 'Angler', country: 'BR', locale: 'pt' }),
    ));
  });

  it('signup: submit disabled with an 11-char password, enabled at 12', async () => {
    renderModal();
    fireEvent.change(await screen.findByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/nome de utilizador/i), { target: { value: 'Angler' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a'.repeat(11) } });
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a'.repeat(12) } });
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeEnabled();
  });

  it('signup: a common password blocks submit and shows the reason', async () => {
    renderModal();
    fireEvent.change(await screen.findByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/nome de utilizador/i), { target: { value: 'Angler' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'password1234' } });
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeDisabled();
    expect(screen.getByText(/demasiado comum|comum demais/i)).toBeInTheDocument();
  });

  it('signup: maps a server WEAK_PASSWORD reason', async () => {
    vi.spyOn(endpoints, 'register').mockRejectedValue(new ApiError(400, 'WEAK_PASSWORD', 'x', 'TOO_COMMON'));
    renderModal();
    fireEvent.change(await screen.findByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.change(screen.getByLabelText(/nome de utilizador/i), { target: { value: 'Angler' } });
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    expect(await screen.findByText(/comum demais/i)).toBeInTheDocument();
  });

  it('signup: submit disabled with a spaced username, enabled with "my_angler"', async () => {
    renderModal();
    fireEvent.change(await screen.findByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.change(screen.getByLabelText(/nome de utilizador/i), { target: { value: 'my angler' } });
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/nome de utilizador/i), { target: { value: 'my_angler' } });
    expect(screen.getByRole('button', { name: /criar conta/i })).toBeEnabled();
  });

  it('login: submit is not gated by signup rules (short password ok to attempt)', async () => {
    const login = vi.spyOn(endpoints, 'login').mockResolvedValue({ challengeId: 'ch-1' });
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'e@x.com', password: 'short', locale: 'pt' }));
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

  it('login: submitting the form (Enter) sends the login request', async () => {
    const login = vi.spyOn(endpoints, 'login').mockResolvedValue({ challengeId: 'ch-1' });
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    const pw = screen.getByLabelText(/palavra-passe/i);
    fireEvent.change(pw, { target: { value: 'a-strong-password' } });
    fireEvent.submit(pw.closest('form')!);
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'e@x.com', password: 'a-strong-password', locale: 'pt' }));
  });

  it('login: submitting an incomplete form does nothing', async () => {
    const login = vi.spyOn(endpoints, 'login').mockResolvedValue({ challengeId: 'ch-1' });
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.submit(screen.getByLabelText(/palavra-passe/i).closest('form')!);
    await new Promise(r => setTimeout(r, 0));
    expect(login).not.toHaveBeenCalled();
  });

  it('after log-out the form no longer holds the previous credentials', async () => {
    vi.spyOn(endpoints, 'login').mockResolvedValue({ challengeId: 'ch-1' });
    vi.spyOn(endpoints, 'verifyLogin').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    vi.spyOn(endpoints, 'logout').mockResolvedValue();
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    fireEvent.change(await screen.findByLabelText(/código de 6 dígitos/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /sair/i }));
    const email = await screen.findByLabelText(/e-mail/i);
    expect(email).toHaveValue('');
    expect(screen.getByLabelText(/palavra-passe/i)).toHaveValue('');
  });
});
