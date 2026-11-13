import { describe, expect, it } from 'vitest';
import { checkCastAllowed, checkLandAllowed, type LastCast } from './hardRules.js';

const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const last = (over: Partial<NonNullable<LastCast>> = {}): LastCast => ({
  clientId: 'A',
  createdAt: T0,
  mode: 'rod',
  ...over,
});

describe('checkCastAllowed', () => {
  it('H0: FISHING_ELSEWHERE a 59 999 ms de outro clientId, ok a 60 000 ms', () => {
    expect(checkCastAllowed(last(), 'B', 'rod', at(59_999))).toEqual({ ok: false, code: 'FISHING_ELSEWHERE' });
    expect(checkCastAllowed(last(), 'B', 'rod', at(60_000))).toEqual({ ok: true });
  });

  it('H2: CAST_TOO_FAST a 3 499 ms (rod->rod, mesmo client), ok a 3 500', () => {
    expect(checkCastAllowed(last(), 'A', 'rod', at(3_499))).toEqual({
      ok: false,
      code: 'CAST_TOO_FAST',
      intervalMs: 3_499,
    });
    expect(checkCastAllowed(last(), 'A', 'rod', at(3_500))).toEqual({ ok: true });
  });

  it('net/submarine nunca dão CAST_TOO_FAST', () => {
    expect(checkCastAllowed(last(), 'A', 'net', at(1))).toEqual({ ok: true });
    expect(checkCastAllowed(last(), 'A', 'submarine', at(1))).toEqual({ ok: true });
    expect(checkCastAllowed(last({ mode: 'net' }), 'A', 'rod', at(1))).toEqual({ ok: true });
  });

  it('last = null -> ok', () => {
    expect(checkCastAllowed(null, 'A', 'rod', T0)).toEqual({ ok: true });
  });

  it('clientId undefined -> H0 e H2 não se aplicam', () => {
    expect(checkCastAllowed(last(), undefined, 'rod', at(1))).toEqual({ ok: true });
  });

  it('last.clientId nulo -> H0 não se aplica', () => {
    expect(checkCastAllowed(last({ clientId: null }), 'B', 'rod', at(1))).toEqual({ ok: true });
  });
});

describe('checkLandAllowed', () => {
  it('H3: LAND_TOO_FAST a 299 ms, ok a 300', () => {
    expect(checkLandAllowed('rod', T0, at(299))).toEqual({ ok: false, code: 'LAND_TOO_FAST', elapsedMs: 299 });
    expect(checkLandAllowed('rod', T0, at(300))).toEqual({ ok: true });
  });

  it('só se aplica a rod', () => {
    expect(checkLandAllowed('net', T0, at(1))).toEqual({ ok: true });
    expect(checkLandAllowed('submarine', T0, at(1))).toEqual({ ok: true });
  });
});
