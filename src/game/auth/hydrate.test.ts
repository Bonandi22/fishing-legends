import { describe, expect, it, vi } from 'vitest';
import * as endpoints from '@/api/endpoints';
import { hydrateFromServer } from './hydrate';

describe('hydrateFromServer', () => {
  it('maps /me to a PlayerState partial and calls replace', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({
      user: {
        userId: 'u1', email: 'e', username: 'A', country: 'BR',
        level: 5, xp: 40, totalFishCaught: 12, coins: 999, unlockedLocations: ['atlantic'],
      },
    });
    const replace = vi.fn();
    await hydrateFromServer(replace);
    expect(replace).toHaveBeenCalledWith(expect.objectContaining({
      level: 5, xp: 40, totalFishCaught: 12, coins: 999, unlockedLocations: ['atlantic'],
    }));
    // xpToNextLevel is derived
    const arg = replace.mock.calls[0][0];
    expect(typeof arg.xpToNextLevel).toBe('number');
  });
});
