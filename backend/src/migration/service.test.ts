// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { validateLocalSave } from './service.js';

const caught = (id: string, weight: number, location: string) => ({
  fish: { id },
  weight,
  location,
  timestamp: 1_700_000_000_000,
});

const baseSave = () => ({
  schemaVersion: 3,
  player: {
    level: 5,
    xp: 120,
    totalFishCaught: 8,
    coins: 500,
    unlockedLocations: ['amazon'],
    warehouse: [] as ReturnType<typeof caught>[],
    aquariumWarehouse: [] as ReturnType<typeof caught>[],
    aquariumSectors: {} as Record<string, ReturnType<typeof caught>[]>,
  },
});

describe('validateLocalSave', () => {
  it('rejects a payload that does not match the envelope shape', () => {
    expect(() => validateLocalSave({ schemaVersion: 0 })).toThrow();
    expect(() => validateLocalSave({ player: {} })).toThrow();
  });

  it('accepts a known fish at a known location within its weight range', () => {
    const save = baseSave();
    save.player.warehouse.push(caught('tilapia', 1.5, 'amazon')); // range 0.3–2.5
    const result = validateLocalSave(save);
    expect(result.summary).toEqual({ accepted: 1, rejected: 0 });
    expect(result.accepted[0]).toMatchObject({ fishId: 'tilapia', locationId: 'amazon' });
  });

  it('rejects an unknown fish, an unknown location, and an impossible weight', () => {
    const save = baseSave();
    save.player.warehouse.push(
      caught('not-a-fish', 1, 'amazon'),
      caught('tilapia', 1.5, 'atlantis'),
      caught('tilapia', 999, 'amazon'),
    );
    const result = validateLocalSave(save);
    expect(result.summary.accepted).toBe(0);
    expect(result.rejected).toEqual([
      expect.stringContaining('unknown-fish'),
      expect.stringContaining('unknown-location'),
      expect.stringContaining('invalid-weight'),
    ]);
  });

  it('rejects an aquarium sector outside 1–5', () => {
    const save = baseSave();
    save.player.aquariumSectors = { '9': [caught('tilapia', 1.5, 'amazon')] };
    const result = validateLocalSave(save);
    expect(result.rejected[0]).toContain('invalid-sector');
  });

  it('tags accepted aquarium fish with their sector', () => {
    const save = baseSave();
    save.player.aquariumSectors = { '3': [caught('tilapia', 1.5, 'amazon')] };
    const result = validateLocalSave(save);
    expect(result.accepted[0]).toMatchObject({ fishId: 'tilapia', sector: 3 });
  });
});
