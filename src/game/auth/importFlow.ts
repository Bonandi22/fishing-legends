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

export async function maybeOfferImport(deps: {
  onPreview: (p: MigrationPreview & { raw: unknown }) => void;
}): Promise<void> {
  if (localStorage.getItem(IMPORT_DONE_KEY) === '1') return;
  const raw = readLocalSave();
  if (!raw) return;
  try {
    const preview = await previewMigration(raw);
    deps.onPreview({ ...preview, raw });
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
