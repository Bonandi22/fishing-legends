import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '@/game/i18n';
import { ApiError } from '@/api/client';
import CodeStep from './CodeStep';

const completeChallenge = vi.fn();
const resendCode = vi.fn();
const resetPassword = vi.fn();
vi.mock('@/game/auth/AuthProvider', () => ({
  useAuth: () => ({ completeChallenge, resendCode, resetPassword }),
}));

// Stateful owner, like AccountModal: keeps the current id and cooldown across remounts.
function Owner({ kind, onDone, onBack, show }: { kind: 'register' | 'login'; onDone(): void; onBack(): void; show: boolean }) {
  const [c, setC] = useState(() => ({ id: 'ch-1', at: Date.now() + 60_000 }));
  return show ? (
    <CodeStep challengeId={c.id} kind={kind} resendAvailableAt={c.at}
      onResent={(id, at) => setC({ id, at })} onDone={onDone} onBack={onBack} />
  ) : null;
}
function setup(kind: 'register' | 'login' = 'login') {
  const onDone = vi.fn();
  const onBack = vi.fn();
  const ui = (show: boolean) => <I18nProvider><Owner kind={kind} onDone={onDone} onBack={onBack} show={show} /></I18nProvider>;
  const r = render(ui(true));
  return { onDone, onBack, hide: () => r.rerender(ui(false)), reshow: () => r.rerender(ui(true)) };
}
const input = () => screen.getByLabelText(/código/i) as HTMLInputElement;
const submitBtn = () => screen.getByRole('button', { name: /confirmar/i });
const resendBtn = () => screen.getByRole('button', { name: /enviar novo código/i });

beforeEach(() => {
  cleanup(); localStorage.clear(); completeChallenge.mockReset(); resendCode.mockReset(); resetPassword.mockReset();
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe('CodeStep', () => {
  it('uses a numeric one-time-code input and gates submit on 6 digits', () => {
    setup();
    expect(input().inputMode).toBe('numeric');
    expect(input().autocomplete).toBe('one-time-code');
    expect(submitBtn()).toBeDisabled();
    fireEvent.change(input(), { target: { value: '12345' } });
    expect(submitBtn()).toBeDisabled();
    fireEvent.change(input(), { target: { value: '123456' } });
    expect(submitBtn()).toBeEnabled();
  });

  it('strips non-digits and caps at 6 (pasted code works)', () => {
    setup();
    fireEvent.change(input(), { target: { value: '12 34-56' } });
    expect(input().value).toBe('123456');
    fireEvent.change(input(), { target: { value: '1234567890' } });
    expect(input().value).toBe('123456');
  });

  it('submits via completeChallenge and calls onDone', async () => {
    completeChallenge.mockResolvedValue(undefined);
    const { onDone } = setup('register');
    fireEvent.change(input(), { target: { value: '123456' } });
    await act(async () => { fireEvent.click(submitBtn()); });
    expect(completeChallenge).toHaveBeenCalledWith('register', 'ch-1', '123456');
    expect(onDone).toHaveBeenCalled();
  });

  it('maps INVALID_CODE to a message and keeps the step', async () => {
    completeChallenge.mockRejectedValue(new ApiError(400, 'INVALID_CODE', 'x'));
    const { onDone } = setup();
    fireEvent.change(input(), { target: { value: '000000' } });
    await act(async () => { fireEvent.click(submitBtn()); });
    expect(screen.getByRole('alert').textContent).toMatch(/incorreto/i);
    expect(onDone).not.toHaveBeenCalled();
  });

  it.each([['CHALLENGE_EXPIRED', 410], ['TOO_MANY_ATTEMPTS', 429]])('%s shows a message and offers a new code', async (code, status) => {
    completeChallenge.mockRejectedValue(new ApiError(status as number, code as string, 'x'));
    setup();
    fireEvent.change(input(), { target: { value: '000000' } });
    await act(async () => { fireEvent.click(submitBtn()); });
    expect(screen.getByRole('alert').textContent).not.toBe('');
    expect(resendBtn()).toBeInTheDocument();
  });

  it('resend is disabled for 60s then enabled; resend restarts the countdown and uses the new id', async () => {
    resendCode.mockResolvedValue('ch-2');
    setup();
    expect(resendBtn()).toBeDisabled();
    act(() => { vi.advanceTimersByTime(59_000); });
    expect(resendBtn()).toBeDisabled();
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(resendBtn()).toBeEnabled();
    await act(async () => { fireEvent.click(resendBtn()); });
    expect(resendCode).toHaveBeenCalledWith('ch-1');
    expect(resendBtn()).toBeDisabled();
    completeChallenge.mockResolvedValue(undefined);
    fireEvent.change(input(), { target: { value: '123456' } });
    await act(async () => { fireEvent.click(submitBtn()); });
    expect(completeChallenge).toHaveBeenCalledWith('login', 'ch-2', '123456');
  });

  it('RESEND_TOO_SOON shows the message and keeps the button disabled', async () => {
    resendCode.mockRejectedValue(new ApiError(429, 'RESEND_TOO_SOON', 'x'));
    setup();
    act(() => { vi.advanceTimersByTime(60_000); });
    await act(async () => { fireEvent.click(resendBtn()); });
    expect(screen.getByRole('alert').textContent).toMatch(/aguarda/i);
    expect(resendBtn()).toBeDisabled();
  });

  it('resend CHALLENGE_NOT_FOUND sends the user back', async () => {
    resendCode.mockRejectedValue(new ApiError(404, 'CHALLENGE_NOT_FOUND', 'x'));
    const { onBack } = setup();
    act(() => { vi.advanceTimersByTime(60_000); });
    await act(async () => { fireEvent.click(resendBtn()); });
    expect(onBack).toHaveBeenCalled();
  });

  it('resend then close/reopen: submitting uses the NEW challenge id', async () => {
    resendCode.mockResolvedValue('ch-2');
    completeChallenge.mockResolvedValue(undefined);
    const { hide, reshow } = setup();
    act(() => { vi.advanceTimersByTime(60_000); });
    await act(async () => { fireEvent.click(resendBtn()); });
    hide(); reshow();
    fireEvent.change(input(), { target: { value: '123456' } });
    await act(async () => { fireEvent.click(submitBtn()); });
    expect(completeChallenge).toHaveBeenCalledWith('login', 'ch-2', '123456');
  });

  it('remount mid-countdown shows the remaining seconds, not 60', () => {
    const { hide, reshow } = setup();
    act(() => { vi.advanceTimersByTime(25_000); });
    hide();
    act(() => { vi.advanceTimersByTime(10_000); });
    reshow();
    expect(resendBtn().textContent).toMatch(/\(25s\)/);
  });
  describe('reset', () => {
    function renderReset(onBack = vi.fn()) {
      render(
        <I18nProvider>
          <CodeStep challengeId="ch-r" kind="reset" email="skipper@example.com" username="CaptainAna"
            resendAvailableAt={Date.now() + 60_000} onResent={vi.fn()} onDone={vi.fn()} onBack={onBack} />
        </I18nProvider>,
      );
      return onBack;
    }
    const newPw = () => screen.getByLabelText(/nova palavra-passe/i) as HTMLInputElement;
    const saveBtn = () => screen.getByRole('button', { name: /guardar nova palavra-passe/i });

    it('checks the new password against the username, so it never reaches the server', () => {
      renderReset();
      fireEvent.change(input(), { target: { value: '123456' } });
      fireEvent.change(newPw(), { target: { value: 'my-captainana-boat-77' } });
      expect(saveBtn()).toBeDisabled();
      fireEvent.change(newPw(), { target: { value: 'a-brand-new-password-987' } });
      expect(saveBtn()).toBeEnabled();
    });

    it('CHALLENGE_NOT_FOUND on submit goes back with the localized message', async () => {
      resetPassword.mockRejectedValue(new ApiError(404, 'CHALLENGE_NOT_FOUND', 'x'));
      const onBack = renderReset();
      fireEvent.change(input(), { target: { value: '123456' } });
      fireEvent.change(newPw(), { target: { value: 'a-brand-new-password-987' } });
      await act(async () => { fireEvent.click(saveBtn()); });
      expect(onBack).toHaveBeenCalledWith(expect.stringMatching(/já não existe/i));
    });
  });
});
