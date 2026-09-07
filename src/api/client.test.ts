import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError, setLoggedOutHandler } from './client';

const g = globalThis as unknown as { fetch: ReturnType<typeof vi.fn> };

beforeEach(() => {
  g.fetch = vi.fn();
  document.cookie = 'dbl_csrf=csrf-token-value; path=/';
});
afterEach(() => { document.cookie = 'dbl_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('apiFetch', () => {
  it('GETs /api/v1<path> with credentials and no CSRF header', async () => {
    g.fetch.mockResolvedValueOnce(jsonResponse(200, { user: { id: '1' } }));
    const out = await apiFetch<{ user: { id: string } }>('/me');
    expect(out).toEqual({ user: { id: '1' } });
    const [url, init] = g.fetch.mock.calls[0];
    expect(url).toBe('/api/v1/me');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('adds X-CSRF-Token and Idempotency-Key on a mutation', async () => {
    g.fetch.mockResolvedValueOnce(jsonResponse(204, undefined));
    await apiFetch('/economy/nets/purchase', { method: 'POST', body: { quantity: 1 }, idempotencyKey: 'k-123456789012345' });
    const [, init] = g.fetch.mock.calls[0];
    expect(init.headers['X-CSRF-Token']).toBe('csrf-token-value');
    expect(init.headers['Idempotency-Key']).toBe('k-123456789012345');
    expect(init.body).toBe(JSON.stringify({ quantity: 1 }));
  });

  it('throws a typed ApiError from { error: { code, message } }', async () => {
    g.fetch
      .mockResolvedValueOnce(jsonResponse(409, { error: { code: 'ACCOUNT_ALREADY_EXISTS', message: 'taken' } }))
      .mockResolvedValueOnce(jsonResponse(409, { error: { code: 'ACCOUNT_ALREADY_EXISTS', message: 'taken' } }));
    await expect(apiFetch('/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409, code: 'ACCOUNT_ALREADY_EXISTS',
    });
    await expect(apiFetch('/auth/register', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
  });

  it('on 401 for a normal route: refreshes once and retries', async () => {
    g.fetch
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_ACCESS_TOKEN', message: '' } })) // /me
      .mockResolvedValueOnce(jsonResponse(204, undefined))                                                // /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: '1' } }));                                   // retry /me
    const out = await apiFetch<{ user: { id: string } }>('/me');
    expect(out).toEqual({ user: { id: '1' } });
    expect(g.fetch.mock.calls.map(c => c[0])).toEqual(['/api/v1/me', '/api/v1/auth/refresh', '/api/v1/me']);
  });

  it('on 401 where refresh also fails: calls the logged-out handler and throws', async () => {
    const onOut = vi.fn();
    setLoggedOutHandler(onOut);
    g.fetch
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_ACCESS_TOKEN', message: '' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: '' } }));
    await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
    expect(onOut).toHaveBeenCalledTimes(1);
    setLoggedOutHandler(() => {});
  });

  it('does not refresh-retry a 401 from an /auth/ route', async () => {
    g.fetch.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: '' } }));
    await expect(apiFetch('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(g.fetch).toHaveBeenCalledTimes(1);
  });
});
