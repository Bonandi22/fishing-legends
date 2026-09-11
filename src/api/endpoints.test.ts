import { describe, expect, it, vi } from 'vitest';
import * as client from './client';
import { register, login, logout, getMe, getGameState, bootstrapGameState, sellWarehouse, purchaseNet, purchaseMultiplier, purchaseSkin, equipSkin, spinRoulette, spinSkinRoulette, claimDailyGift, placeAquariumFish, castLine, landCatch, getLeaderboard, getCurrentSeason } from './endpoints';

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

  it('bootstrapGameState POSTs /me/state/bootstrap with { state } and returns the version', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ version: 1 } as never);
    const out = await bootstrapGameState({ schemaVersion: 1, player: { level: 1 } });
    expect(spy).toHaveBeenCalledWith('/me/state/bootstrap', { method: 'POST', body: { state: { schemaVersion: 1, player: { level: 1 } } } });
    expect(out).toEqual({ version: 1 });
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

  it('castLine POSTs /me/fishing/cast with the locationId, mode + key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await castLine('idem-key-castcast0001', 'atlantic');
    expect(spy).toHaveBeenCalledWith('/me/fishing/cast', { method: 'POST', body: { locationId: 'atlantic', mode: 'rod' }, idempotencyKey: 'idem-key-castcast0001' });
    await castLine('idem-key-castnet00001', 'titicaca', 'net');
    expect(spy).toHaveBeenLastCalledWith('/me/fishing/cast', { method: 'POST', body: { locationId: 'titicaca', mode: 'net' }, idempotencyKey: 'idem-key-castnet00001' });
    await castLine('idem-key-castsub00001', 'submarine', 'submarine');
    expect(spy).toHaveBeenLastCalledWith('/me/fishing/cast', { method: 'POST', body: { locationId: 'submarine', mode: 'submarine' }, idempotencyKey: 'idem-key-castsub00001' });
  });

  it('landCatch omits catchId when not given, includes it when given', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await landCatch('idem-key-landland0001', 'sess-1');
    expect(spy).toHaveBeenCalledWith('/me/fishing/land', { method: 'POST', body: { sessionId: 'sess-1' }, idempotencyKey: 'idem-key-landland0001' });
    await landCatch('idem-key-landland0002', 'sess-1', 'c-42');
    expect(spy).toHaveBeenLastCalledWith('/me/fishing/land', { method: 'POST', body: { sessionId: 'sess-1', catchId: 'c-42' }, idempotencyKey: 'idem-key-landland0002' });
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

  it('equipSkin POSTs /me/economy/skins/equip with the kind, skinId and idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await equipSkin('idem-key-equipequipe', 'rod', 'shark');
    expect(spy).toHaveBeenCalledWith('/me/economy/skins/equip', { method: 'POST', body: { kind: 'rod', skinId: 'shark' }, idempotencyKey: 'idem-key-equipequipe' });
  });

  it('placeAquariumFish POSTs /me/economy/aquarium/place with { timestamp, sector } + key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await placeAquariumFish('idem-key-aquaaquaaqu', 42, 3);
    expect(spy).toHaveBeenCalledWith('/me/economy/aquarium/place', { method: 'POST', body: { timestamp: 42, sector: 3 }, idempotencyKey: 'idem-key-aquaaquaaqu' });
  });

  it('purchaseMultiplier POSTs /me/economy/multipliers/purchase with the body and idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ state: {}, updatedAt: null, version: 4 } as never);
    await purchaseMultiplier('idem-key-multmultmult', 'luck', 4);
    expect(spy).toHaveBeenCalledWith('/me/economy/multipliers/purchase', { method: 'POST', body: { type: 'luck', power: 4 }, idempotencyKey: 'idem-key-multmultmult' });
    spy.mockRestore();
  });

  it('getLeaderboard GETs /leaderboard with limit/offset, defaulting to 100/0', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ season: 'all-time', entries: [], total: 0 } as never);
    await getLeaderboard();
    expect(spy).toHaveBeenCalledWith('/leaderboard?limit=100&offset=0');
    await getLeaderboard(20, 40);
    expect(spy).toHaveBeenLastCalledWith('/leaderboard?limit=20&offset=40');
    spy.mockRestore();
  });

  it('getCurrentSeason GETs /seasons/current', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ season: null } as never);
    await getCurrentSeason();
    expect(spy).toHaveBeenCalledWith('/seasons/current');
    spy.mockRestore();
  });
});
