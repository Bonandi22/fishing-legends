import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { I18nProvider } from '@/game/i18n';
import PasswordStrength from './PasswordStrength';

beforeEach(() => { cleanup(); localStorage.clear(); });
const r = (props: { password: string; email: string; username?: string }) =>
  render(<I18nProvider><PasswordStrength {...props} /></I18nProvider>);

describe('PasswordStrength', () => {
  it('shows nothing for an empty password', () => {
    const { container } = r({ password: '', email: '' });
    expect(container.textContent).toBe('');
  });
  it('shows the TOO_SHORT issue', () => {
    r({ password: 'abc', email: 'e@x.com' });
    expect(screen.getByRole('status').textContent).toMatch(/curta/i);
  });
  it('shows the personal-info issue', () => {
    r({ password: 'angler-is-me-123', email: 'e@x.com', username: 'angler' });
    expect(screen.getByRole('status').textContent).toMatch(/e-mail ou nome/i);
  });
  it('shows a score bar and no issue text for a good password', async () => {
    r({ password: 'correct-horse-battery-staple', email: 'e@x.com' });
    expect(await screen.findByRole('meter')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
