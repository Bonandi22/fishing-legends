import { describe, expect, it } from 'vitest';
import { FISH, LOCATIONS, validateCatalog } from '@/game/data';

describe('game catalog', () => {
  it('contains unique ids and only valid fish references', () => {
    expect(validateCatalog()).toEqual([]);
  });

  it('reports broken references and invalid weight ranges', () => {
    const issues = validateCatalog(
      [{ ...FISH[0], minWeight: 3, maxWeight: 1 }],
      [{ ...LOCATIONS[0], fishIds: ['missing'] }],
    );

    expect(issues).toEqual([
      { type: 'invalid-weight-range', id: FISH[0].id },
      { type: 'unknown-fish-reference', id: 'missing', locationId: LOCATIONS[0].id },
    ]);
  });
});
