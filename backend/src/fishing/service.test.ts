// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createFishingService } from './service.js';
import { createCatalogService } from '../catalog/service.js';
import { FISHING_SESSION_TTL_MS } from './session.js';

const players = {
  async getProfile() {
    return { userId: 'u1', email: 'u1@x', username: 'u1', country: 'BR', level: 1, xp: 0, totalFishCaught: 0, coins: 0, unlockedLocations: [] };
  },
};

describe('in-memory fishing service — expiry', () => {
  it('completes within the TTL and expires afterwards', async () => {
    let now = new Date('2026-09-06T12:00:00.000Z');
    const fishing = createFishingService(createCatalogService(), players, undefined, () => now);

    const session = await fishing.start('u1', 'amazon', 'idem-key-abcdef123456');

    now = new Date(now.getTime() + FISHING_SESSION_TTL_MS - 1);
    const inTime = await fishing.complete('u1', session.id);
    expect(inTime.result.fishId).toEqual(expect.any(String));
  });

  it('rejects a completion after the TTL and marks the session expired', async () => {
    let now = new Date('2026-09-06T12:00:00.000Z');
    const fishing = createFishingService(createCatalogService(), players, undefined, () => now);

    const session = await fishing.start('u1', 'amazon', 'idem-key-abcdef654321');
    now = new Date(now.getTime() + FISHING_SESSION_TTL_MS + 1);

    await expect(fishing.complete('u1', session.id)).rejects.toThrow('FISHING_SESSION_EXPIRED');
    await expect(fishing.complete('u1', session.id)).rejects.toThrow('FISHING_SESSION_EXPIRED');
  });
});
