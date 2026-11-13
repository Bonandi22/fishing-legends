import type { Rarity } from '../../../src/game/types.js';

export const FISHING_CLIENT_LOCK_MS = 60_000;        // H0
export const MIN_ROD_CAST_INTERVAL_MS = 3_500;       // H2
export const MIN_ROD_LAND_MS = 300;                  // H3
export const SCAN_INTERVAL_MS = 600_000;             // análise a cada 10 min
export const ANALYSIS_WINDOW_MS = 24 * 3_600_000;
export const S1_FLAG = { p: 1e-3, minAttempts: 15 };
export const S1_SUSPEND = { p: 1e-6, minAttempts: 30 };
// Teto de vitória de um honesto no melhor caso — generoso, a calibrar na Task 12.
export const P0: Record<Rarity, { plain: number; strength: number }> = {
  common: { plain: 0.99, strength: 0.99 }, uncommon: { plain: 0.97, strength: 0.99 },
  mythic: { plain: 0.92, strength: 0.97 }, legendary: { plain: 0.88, strength: 0.95 },
  abyssal: { plain: 0.82, strength: 0.93 }, volcanic: { plain: 0.78, strength: 0.92 },
  platinum: { plain: 0.72, strength: 0.9 }, legends: { plain: 0.65, strength: 0.88 },
  cosmic: { plain: 0.55, strength: 0.85 },
};
export const S2_MAX_LANDS_PER_HOUR = { rod: 600, net: 600, submarine: 1_500 };
export const S2_MAX_CONTINUOUS_MS = 10 * 3_600_000; // atividade sem pausa ≥ S2_PAUSE_MS
export const S2_PAUSE_MS = 30 * 60_000;
export const S3_RARE = ['abyssal', 'volcanic', 'platinum', 'legends', 'cosmic'] as const;
export const S3_SHARE_CEILING_FACTOR = 4;            // × soma das chances base (cobre multiplicadores de sorte)
export const S3_FLAG = { p: 1e-6, minCasts: 50 };
export const S4_FLAG = 5;
export const S4_SUSPEND = 50;
