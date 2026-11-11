import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import * as endpoints from '@/api/endpoints';
import * as client from '@/api/client';
import { ApiError } from '@/api/client';
import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const a = useAuth();
  return (
    <div>
      <span data-testid="status">{a.status}</span>
      <span data-testid="user">{a.user?.username ?? '-'}</span>
      <button onClick={() => a.login('e@x.com', 'pw', 'pt').then(r => { document.title = r.challengeId; }).catch(() => {})}>login</button>
      <button onClick={() => a.register({ email: 'e@x.com', password: 'pw', username: 'Angler', country: 'BR', locale: 'pt' }).then(r => { document.title = r.challengeId; })}>register</button>
      <button onClick={() => a.completeChallenge('register', 'c1', '123456')}>complete-register</button>
      <button onClick={() => a.completeChallenge('login', 'c1', '123456')}>complete-login</button>
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

  it('login resolves a challengeId and stays anonymous', async () => {
    vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', ''));
    const login = vi.spyOn(endpoints, 'login').mockResolvedValue({ challengeId: 'ch-1' });
    const onAuth = vi.fn();
    render(<AuthProvider onAuthenticated={onAuth}><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(document.title).toBe('ch-1'));
    expect(login).toHaveBeenCalledWith({ email: 'e@x.com', password: 'pw', locale: 'pt' });
    expect(screen.getByTestId('status').textContent).toBe('anonymous');
    expect(onAuth).not.toHaveBeenCalled();
  });

  it('register resolves a challengeId and stays anonymous', async () => {
    vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', ''));
    vi.spyOn(endpoints, 'register').mockResolvedValue({ challengeId: 'ch-2' });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    fireEvent.click(screen.getByText('register'));
    await waitFor(() => expect(document.title).toBe('ch-2'));
    expect(screen.getByTestId('status').textContent).toBe('anonymous');
  });

  it('completeChallenge(register) authenticates and fires onAuthenticated', async () => {
    vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', ''));
    const v = vi.spyOn(endpoints, 'verifyEmail').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    const onAuth = vi.fn();
    render(<AuthProvider onAuthenticated={onAuth}><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    fireEvent.click(screen.getByText('complete-register'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(v).toHaveBeenCalledWith({ challengeId: 'c1', code: '123456' });
    expect(screen.getByTestId('user').textContent).toBe('Angler');
    expect(onAuth).toHaveBeenCalled();
  });

  it('completeChallenge(login) uses verifyLogin', async () => {
    vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', ''));
    const v = vi.spyOn(endpoints, 'verifyLogin').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    fireEvent.click(screen.getByText('complete-login'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(v).toHaveBeenCalledWith({ challengeId: 'c1', code: '123456' });
  });

  it('logout returns to anonymous', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'A', email: 'e', country: 'BR' } } as never);
    vi.spyOn(endpoints, 'logout').mockResolvedValue();
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
  });

  it('explicit logout fires onLoggedOut exactly once', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'A', email: 'e', country: 'BR' } } as never);
    vi.spyOn(endpoints, 'logout').mockResolvedValue();
    const onLoggedOut = vi.fn();
    render(<AuthProvider onLoggedOut={onLoggedOut}><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
  });

  it('logout awaits onBeforeLogout BEFORE endpoints.logout', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'A', email: 'e', country: 'BR' } } as never);
    const order: string[] = [];
    vi.spyOn(endpoints, 'logout').mockImplementation(async () => { order.push('logout'); });
    const onBeforeLogout = vi.fn(async () => { order.push('before'); });
    render(<AuthProvider onBeforeLogout={onBeforeLogout}><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(order).toEqual(['before', 'logout']);
  });

  it('session-expiry does NOT call onBeforeLogout', async () => {
    let sessionExpired: (() => void) | null = null;
    vi.spyOn(client, 'setLoggedOutHandler').mockImplementation((fn) => { sessionExpired = fn; });
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'A', email: 'e', country: 'BR' } } as never);
    const onBeforeLogout = vi.fn();
    render(<AuthProvider onBeforeLogout={onBeforeLogout}><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    act(() => { sessionExpired!(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(onBeforeLogout).not.toHaveBeenCalled();
  });

  it('session-expiry (setLoggedOutHandler callback) goes anonymous WITHOUT firing onLoggedOut', async () => {
    let sessionExpired: (() => void) | null = null;
    vi.spyOn(client, 'setLoggedOutHandler').mockImplementation((fn) => { sessionExpired = fn; });
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'A', email: 'e', country: 'BR' } } as never);
    const onLoggedOut = vi.fn();
    render(<AuthProvider onLoggedOut={onLoggedOut}><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(sessionExpired).toBeTypeOf('function');
    act(() => { sessionExpired!(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(onLoggedOut).not.toHaveBeenCalled();
  });
});
