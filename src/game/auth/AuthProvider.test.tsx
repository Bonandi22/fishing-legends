import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import * as endpoints from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const a = useAuth();
  return (
    <div>
      <span data-testid="status">{a.status}</span>
      <span data-testid="user">{a.user?.username ?? '-'}</span>
      <button onClick={() => a.login('e@x.com', 'pw').catch(() => {})}>login</button>
      <button onClick={() => a.logout()}>logout</button>
    </div>
  );
}

beforeEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AuthProvider', () => {
  it('starts loading, then anonymous when /me is 401', async () => {
    vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'INVALID_ACCESS_TOKEN', ''));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('status').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
  });

  it('goes anonymous when /me rejects with a non-ApiError (offline start)', async () => {
    vi.spyOn(endpoints, 'getMe').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('status').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
  });

  it('is authenticated when /me returns a user', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('Angler');
  });

  it('login updates status and user; fires onAuthenticated', async () => {
    vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', ''));
    vi.spyOn(endpoints, 'login').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    const onAuth = vi.fn();
    render(<AuthProvider onAuthenticated={onAuth}><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(onAuth).toHaveBeenCalled();
  });

  it('logout returns to anonymous', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'A', email: 'e', country: 'BR' } } as never);
    vi.spyOn(endpoints, 'logout').mockResolvedValue();
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
  });
});
