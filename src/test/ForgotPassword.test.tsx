import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/game/i18n';
import * as client from '@/api/client';
import * as endpoints from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { AuthProvider, useAuth } from '@/game/auth/AuthProvider';
import AccountModal from '@/components/game/menu/AccountModal';

const NEW_PW = 'a-brand-new-password-987';

beforeEach(() => {
  cleanup(); vi.restoreAllMocks(); localStorage.clear();
  vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', ''));
});

describe('password recovery endpoints', () => {
  it('forgotPassword and resetPassword POST the right paths and bodies', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ challengeId: 'c1' } as never);
    expect(await endpoints.forgotPassword({ email: 'a@b.c', locale: 'pt' })).toEqual({ challengeId: 'c1' });
    expect(spy).toHaveBeenCalledWith('/auth/password/forgot', { method: 'POST', body: { email: 'a@b.c', locale: 'pt' } });
    await endpoints.resetPassword({ challengeId: 'c1', code: '123456', newPassword: NEW_PW });
    expect(spy).toHaveBeenCalledWith('/auth/password/reset', { method: 'POST', body: { challengeId: 'c1', code: '123456', newPassword: NEW_PW } });
  });

  it('both send the CSRF header when the cookie exists', async () => {
    document.cookie = 'dbl_csrf=tok123';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ challengeId: 'c' }), { status: 202 }));
    await endpoints.forgotPassword({ email: 'a@b.c' });
    await endpoints.resetPassword({ challengeId: 'c', code: '123456', newPassword: NEW_PW });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const c of fetchSpy.mock.calls) expect((c[1]!.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok123');
    document.cookie = 'dbl_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });
});

describe('AuthProvider password recovery', () => {
  function Probe() {
    const a = useAuth();
    return (
      <div>
        <span data-testid="status">{a.status}</span>
        <button onClick={() => { void a.forgotPassword('e@x.com', 'pt').then(r => { document.title = r.challengeId; }); }}>forgot</button>
        <button onClick={() => { void a.resetPassword('c1', '123456', NEW_PW); }}>reset</button>
      </div>
    );
  }

  it('forgotPassword returns the challenge id; resetPassword does not authenticate', async () => {
    const forgot = vi.spyOn(endpoints, 'forgotPassword').mockResolvedValue({ challengeId: 'c9' });
    const reset = vi.spyOn(endpoints, 'resetPassword').mockResolvedValue(undefined);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    fireEvent.click(screen.getByText('forgot'));
    await waitFor(() => expect(document.title).toBe('c9'));
    expect(forgot).toHaveBeenCalledWith({ email: 'e@x.com', locale: 'pt' });
    fireEvent.click(screen.getByText('reset'));
    await waitFor(() => expect(reset).toHaveBeenCalledWith({ challengeId: 'c1', code: '123456', newPassword: NEW_PW }));
    expect(screen.getByTestId('status').textContent).toBe('anonymous');
  });
});

describe('forgot password flow in the account modal', () => {
  function renderModal() {
    render(<I18nProvider><AuthProvider><AccountModal open onClose={vi.fn()} /></AuthProvider></I18nProvider>);
  }
  async function openForgot(email = 'e@x.com') {
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: email } });
    fireEvent.click(screen.getByRole('button', { name: /esqueci-me da palavra-passe/i }));
    fireEvent.click(await screen.findByRole('button', { name: /enviar código/i }));
  }
  const fillReset = async (code: string, password: string) => {
    fireEvent.change(await screen.findByLabelText(/código de 6 dígitos/i), { target: { value: code } });
    fireEvent.change(screen.getByLabelText(/^nova palavra-passe$/i), { target: { value: password } });
  };

  it('happy path: email, code + new password, success notice, back to login with the email prefilled', async () => {
    const forgot = vi.spyOn(endpoints, 'forgotPassword').mockResolvedValue({ challengeId: 'ch-1' });
    const reset = vi.spyOn(endpoints, 'resetPassword').mockResolvedValue(undefined);
    const verifyLogin = vi.spyOn(endpoints, 'verifyLogin');
    renderModal();
    await openForgot();
    await waitFor(() => expect(forgot).toHaveBeenCalledWith({ email: 'e@x.com', locale: 'pt' }));
    await fillReset('123456', NEW_PW);
    fireEvent.click(screen.getByRole('button', { name: /guardar nova palavra-passe/i }));
    await waitFor(() => expect(reset).toHaveBeenCalledWith({ challengeId: 'ch-1', code: '123456', newPassword: NEW_PW }));
    expect(await screen.findByText(/palavra-passe alterada/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/e-mail/i) as HTMLInputElement).value).toBe('e@x.com');
    expect(verifyLogin).not.toHaveBeenCalled();
  });

  it('a weak new password is rejected client-side without spending the code', async () => {
    vi.spyOn(endpoints, 'forgotPassword').mockResolvedValue({ challengeId: 'ch-1' });
    const reset = vi.spyOn(endpoints, 'resetPassword').mockResolvedValue(undefined);
    renderModal();
    await openForgot();
    await fillReset('123456', 'short');
    expect(screen.getByRole('button', { name: /guardar nova palavra-passe/i })).toBeDisabled();
    expect(reset).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_CODE', undefined, /código incorreto/i],
    ['CHALLENGE_EXPIRED', undefined, /expirou/i],
    ['TOO_MANY_ATTEMPTS', undefined, /demasiadas tentativas com este código/i],
    ['WEAK_PASSWORD', 'SAME_AS_CURRENT', /diferente da atual/i],
    ['WEAK_PASSWORD', 'TOO_COMMON', /comum demais/i],
  ])('maps %s (%s) to a message and stays on the code step', async (code, reason, message) => {
    vi.spyOn(endpoints, 'forgotPassword').mockResolvedValue({ challengeId: 'ch-1' });
    vi.spyOn(endpoints, 'resetPassword').mockRejectedValue(new ApiError(400, code, '', reason));
    renderModal();
    await openForgot();
    await fillReset('123456', NEW_PW);
    fireEvent.click(screen.getByRole('button', { name: /guardar nova palavra-passe/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText(/código de 6 dígitos/i)).toBeInTheDocument();
  });

  it('CHALLENGE_NOT_FOUND returns to the email step', async () => {
    vi.spyOn(endpoints, 'forgotPassword').mockResolvedValue({ challengeId: 'ch-1' });
    vi.spyOn(endpoints, 'resetPassword').mockRejectedValue(new ApiError(404, 'CHALLENGE_NOT_FOUND', ''));
    renderModal();
    await openForgot();
    await fillReset('123456', NEW_PW);
    fireEvent.click(screen.getByRole('button', { name: /guardar nova palavra-passe/i }));
    expect(await screen.findByRole('button', { name: /enviar código/i })).toBeInTheDocument();
  });

  it('RESEND_TOO_SOON on the first step is shown', async () => {
    vi.spyOn(endpoints, 'forgotPassword').mockRejectedValue(new ApiError(429, 'RESEND_TOO_SOON', ''));
    renderModal();
    await openForgot();
    expect(await screen.findByRole('alert')).toHaveTextContent(/aguarda um pouco/i);
  });
});
