import { describe, expect, it } from 'vitest';
import { NET_TYPES, rollNet } from '@/game/netTypes';

describe('netTypes', () => {
  it('has 9 grades, one per rarity, fishCount 20..1', () => {
    expect(NET_TYPES).toHaveLength(9);
    expect(NET_TYPES[0]).toMatchObject({ rarity: 'common', fishCount: 20 });
    expect(NET_TYPES.at(-1)!.fishCount).toBe(1);
  });

  it('rollNet is deterministic with an injected random', () => {
    expect(rollNet(() => 0).id).toBe(NET_TYPES[0].id);
    expect(rollNet(() => 0.999).id).toBe(NET_TYPES[8].id);
  });
});
