import type { MigrationPreview } from '@/api/types';
import { ApiError } from '@/api/client';
import { previewMigration, importMigration } from '@/api/endpoints';

export const IMPORT_DONE_KEY = 'dbl-import-done';
const SAVE_KEY = 'fishing-game-state';

function readLocalSave(): unknown | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export type ImportPreview = MigrationPreview & {
  raw: unknown;
  localLevel: number;
  localCoins: number;
};

/**
 * Reads `level`/`coins` off the raw save envelope (`{ schemaVersion, player: {...} }`,
 * see persistence.ts). The dialog must describe the LOCAL save, not whatever the
 * live in-memory state happens to be by the time it renders.
 */
function localStats(raw: unknown): { localLevel: number; localCoins: number } {
  const player = (raw as { player?: unknown } | null)?.player as
    { level?: unknown; coins?: unknown } | undefined;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { localLevel: num(player?.level), localCoins: num(player?.coins) };
}

export async function maybeOfferImport(deps: {
  onPreview: (p: ImportPreview) => void;
}): Promise<void> {
  if (localStorage.getItem(IMPORT_DONE_KEY) === '1') return;
  const raw = readLocalSave();
  if (!raw) return;
  try {
    const preview = await previewMigration(raw);
    deps.onPreview({ ...preview, raw, ...localStats(raw) });
  } catch {
    // preview failed (invalid save / offline) — skip silently, offer again next login
  }
}

export async function runImport(raw: unknown): Promise<void> {
  try {
    await importMigration(raw, crypto.randomUUID());
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'LOCAL_SAVE_ALREADY_IMPORTED')) throw e;
  }
  localStorage.setItem(IMPORT_DONE_KEY, '1');
}
