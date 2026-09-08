import { describe, expect, it, vi } from 'vitest';
import * as client from './client';
import { register, login, logout, getMe, getGameState, putGameState, sellWarehouse, purchaseNet, purchaseMultiplier, purchaseSkin, spinRoulette, spinSkinRoulette, claimDailyGift, castLine, landCatch } from './endpoints';

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

  it('putGameState PUTs /me/state with { state, baseVersion } and returns the new version', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ version: 4 } as never);
    const out = await putGameState({ schemaVersion: 1, player: { level: 3 } }, 3);
    expect(spy).toHaveBeenCalledWith('/me/state', { method: 'PUT', body: { state: { schemaVersion: 1, player: { level: 3 } }, baseVersion: 3 } });
    expect(out).toEqual({ version: 4 });
    spy.mockRestore();
  });

  it('putGameState sends baseVersion null for a first write', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ version: 1 } as never);
    await putGameState({ schemaVersion: 1, player: { level: 1 } }, null);
    expect(spy).toHaveBeenCalledWith('/me/state', { method: 'PUT', body: { state: { schemaVersion: 1, player: { level: 1 } }, baseVersion: null } });
    spy.mockRestore();
  });

  it('sellWarehouse POSTs /me/economy/warehouse/sell with the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ state: {}, updatedAt: null, version: 2 } as never);
    await sellWarehouse('idem-key-0123456789');
    expect(spy).toHaveBeenCalledWith('/me/economy/warehouse/sell', { method: 'POST', idempotencyKey: 'idem-key-0123456789' });
    spy.mockRestore();
  });

  it('purchaseNet POSTs /me/economy/nets/purchase with the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ state: {}, updatedAt: null, version: 3 } as never);
    await purchaseNet('idem-key-9876543210');
    expect(spy).toHaveBeenCalledWith('/me/economy/nets/purchase', { method: 'POST', idempotencyKey: 'idem-key-9876543210' });
    spy.mockRestore();
  });

  it('castLine POSTs /me/fishing/cast with the locationId + key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await castLine('idem-key-castcast0001', 'atlantic');
    expect(spy).toHaveBeenCalledWith('/me/fishing/cast', { method: 'POST', body: { locationId: 'atlantic' }, idempotencyKey: 'idem-key-castcast0001' });
  });

  it('landCatch POSTs /me/fishing/land with the sessionId + key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await landCatch('idem-key-landland0001', 'sess-1');
    expect(spy).toHaveBeenCalledWith('/me/fishing/land', { method: 'POST', body: { sessionId: 'sess-1' }, idempotencyKey: 'idem-key-landland0001' });
  });

  it('spinRoulette POSTs /me/economy/roulette/spin with the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await spinRoulette('idem-key-roulette0001');
    expect(spy).toHaveBeenCalledWith('/me/economy/roulette/spin', { method: 'POST', idempotencyKey: 'idem-key-roulette0001' });
  });

  it('spinSkinRoulette POSTs /me/economy/skin-roulette/spin with the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await spinSkinRoulette('idem-key-skinroul0001');
    expect(spy).toHaveBeenCalledWith('/me/economy/skin-roulette/spin', { method: 'POST', idempotencyKey: 'idem-key-skinroul0001' });
  });

  it('claimDailyGift POSTs /me/economy/daily-gift/claim with the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await claimDailyGift('idem-key-dailygift001');
    expect(spy).toHaveBeenCalledWith('/me/economy/daily-gift/claim', { method: 'POST', idempotencyKey: 'idem-key-dailygift001' });
  });

  it('purchaseSkin POSTs /me/economy/skins/purchase with the kind, skinId and idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await purchaseSkin('idem-key-skinskinski', 'boat', 'yacht');
    expect(spy).toHaveBeenCalledWith('/me/economy/skins/purchase', { method: 'POST', body: { kind: 'boat', skinId: 'yacht' }, idempotencyKey: 'idem-key-skinskinski' });
  });

  it('purchaseMultiplier POSTs /me/economy/multipliers/purchase with the body and idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ state: {}, updatedAt: null, version: 4 } as never);
    await purchaseMultiplier('idem-key-multmultmult', 'luck', 4);
    expect(spy).toHaveBeenCalledWith('/me/economy/multipliers/purchase', { method: 'POST', body: { type: 'luck', power: 4 }, idempotencyKey: 'idem-key-multmultmult' });
    spy.mockRestore();
  });
});
