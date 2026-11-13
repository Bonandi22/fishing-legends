import type { CastMode } from '../fishing/service.js';
import { FISHING_CLIENT_LOCK_MS, MIN_ROD_CAST_INTERVAL_MS, MIN_ROD_LAND_MS } from './config.js';

export type LastCast = { clientId: string | null; createdAt: Date; mode: CastMode } | null;

export type CastCheck =
  | { ok: true }
  | { ok: false; code: 'FISHING_ELSEWHERE' }
  | { ok: false; code: 'CAST_TOO_FAST'; intervalMs: number };

export type LandCheck = { ok: true } | { ok: false; code: 'LAND_TOO_FAST'; elapsedMs: number };

/** H0 (outra janela/cliente pescando) e H2 (cadência de cast de vara). `last` = cast mais recente em qualquer modo. */
export function checkCastAllowed(
  last: LastCast,
  clientId: string | undefined,
  mode: CastMode,
  now: Date,
): CastCheck {
  if (last === null || clientId === undefined) return { ok: true };
  const intervalMs = now.getTime() - last.createdAt.getTime();
  if (last.clientId !== null && last.clientId !== clientId) {
    return intervalMs < FISHING_CLIENT_LOCK_MS ? { ok: false, code: 'FISHING_ELSEWHERE' } : { ok: true };
  }
  if (mode === 'rod' && last.mode === 'rod' && last.clientId === clientId && intervalMs < MIN_ROD_CAST_INTERVAL_MS) {
    return { ok: false, code: 'CAST_TOO_FAST', intervalMs };
  }
  return { ok: true };
}

/** H3: tempo mínimo entre cast e land da vara. */
export function checkLandAllowed(mode: CastMode, castAt: Date, now: Date): LandCheck {
  if (mode !== 'rod') return { ok: true };
  const elapsedMs = now.getTime() - castAt.getTime();
  return elapsedMs < MIN_ROD_LAND_MS ? { ok: false, code: 'LAND_TOO_FAST', elapsedMs } : { ok: true };
}
