import { describe, expect, it, vi } from 'vitest';
import * as client from './client';
import { register, login, logout, getMe, previewMigration, importMigration, getGameState, putGameState } from './endpoints';

describe('endpoints', () => {
  it('register POSTs /auth/register with the body', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ user: { id: '1' } } as never);
    await register({ email: 'a@b.c', password: 'p', username: 'u', country: 'br' });
    expect(spy).toHaveBeenCalledWith('/auth/register', { method: 'POST', body: { email: 'a@b.c', password: 'p', username: 'u', country: 'br' } });
    spy.mockRestore();
  });

  it('getMe GETs /me', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ user: {} } as never);
    await getMe();
    expect(spy).toHaveBeenCalledWith('/me');
    spy.mockRestore();
  });

  it('importMigration passes the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ imported: true } as never);
    await importMigration({ any: 'save' }, 'idem-key-1234567890');
    expect(spy).toHaveBeenCalledWith('/migration/local/import', { method: 'POST', body: { any: 'save' }, idempotencyKey: 'idem-key-1234567890' });
    spy.mockRestore();
  });

  it('logout POSTs /auth/logout', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue(undefined as never);
    await logout();
    expect(spy).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
    spy.mockRestore();
  });

  it('getGameState GETs /me/state', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ state: null, updatedAt: null } as never);
    await getGameState();
    expect(spy).toHaveBeenCalledWith('/me/state');
    spy.mockRestore();
  });

  it('putGameState PUTs /me/state with { state }', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue(undefined as never);
    await putGameState({ schemaVersion: 1, player: { level: 3 } });
    expect(spy).toHaveBeenCalledWith('/me/state', { method: 'PUT', body: { state: { schemaVersion: 1, player: { level: 3 } } } });
    spy.mockRestore();
  });
});
