import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as endpoints from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { maybeOfferImport, runImport, IMPORT_DONE_KEY } from './importFlow';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

const save = JSON.stringify({ schemaVersion: 1, player: { level: 3, coins: 50 } });

describe('importFlow', () => {
  it('offers a preview when a local save exists and import not done', async () => {
    localStorage.setItem('fishing-game-state', save);
    vi.spyOn(endpoints, 'previewMigration').mockResolvedValue({ sourceVersion: 1, summary: { accepted: 2, rejected: 0 }, rejected: [] });
    const onPreview = vi.fn();
    await maybeOfferImport({ onPreview });
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ summary: { accepted: 2, rejected: 0 } }));
  });

  it('does nothing when there is no local save', async () => {
    const onPreview = vi.fn();
    await maybeOfferImport({ onPreview });
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('does nothing when already imported', async () => {
    localStorage.setItem('fishing-game-state', save);
    localStorage.setItem(IMPORT_DONE_KEY, '1');
    const onPreview = vi.fn();
    await maybeOfferImport({ onPreview });
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('runImport calls importMigration with an idempotency key and marks done', async () => {
    const spy = vi.spyOn(endpoints, 'importMigration').mockResolvedValue({ imported: true, sourceVersion: 1, summary: { accepted: 2, rejected: 0 } });
    await runImport({ any: 'thing' });
    expect(spy).toHaveBeenCalledTimes(1);
    const [, key] = spy.mock.calls[0];
    expect(typeof key).toBe('string');
    expect(localStorage.getItem(IMPORT_DONE_KEY)).toBe('1');
  });

  it('runImport treats LOCAL_SAVE_ALREADY_IMPORTED as success', async () => {
    vi.spyOn(endpoints, 'importMigration').mockRejectedValue(new ApiError(409, 'LOCAL_SAVE_ALREADY_IMPORTED', 'x'));
    await expect(runImport({})).resolves.toBeUndefined();
    expect(localStorage.getItem(IMPORT_DONE_KEY)).toBe('1');
  });
});
