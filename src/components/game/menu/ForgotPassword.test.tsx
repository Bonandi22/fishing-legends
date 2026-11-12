import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/game/i18n';
import ForgotPassword from './ForgotPassword';

vi.mock('@/game/auth/AuthProvider', () => ({
  useAuth: () => ({ forgotPassword: vi.fn() }),
}));

describe('ForgotPassword', () => {
  it('shows the message it was opened with (e.g. after a dead reset code)', () => {
    render(
      <I18nProvider>
        <ForgotPassword initialEmail="ana@example.com" initialError="Esta verificação já não existe." onSent={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Esta verificação já não existe.');
  });
});
