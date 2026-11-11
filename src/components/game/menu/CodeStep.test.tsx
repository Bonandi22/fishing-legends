import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '@/game/i18n';
import { ApiError } from '@/api/client';
import CodeStep from './CodeStep';

const completeChallenge = vi.fn();
const resendCode = vi.fn();
vi.mock('@/game/auth/AuthProvider', () => ({
  useAuth: () => ({ completeChallenge, resendCode }),
}));

function setup(kind: 'register' | 'login' = 'login') {
  const onDone = vi.fn();
  const onBack = vi.fn();
  render(<I18nProvider><CodeStep challengeId="ch-1" kind={kind} onDone={onDone} onBack={onBack} /></I18nProvider>);
  return { onDone, onBack };
}
const input = () => screen.getByLabelText(/código/i) as HTMLInputElement;
const submitBtn = () => screen.getByRole('button', { name: /confirmar/i });
const resendBtn = () => screen.getByRole('button', { name: /enviar novo código/i });

beforeEach(() => {
  cleanup(); localStorage.clear(); completeChallenge.mockReset(); resendCode.mockReset();
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
});
