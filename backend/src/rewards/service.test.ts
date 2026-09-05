// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveRewardDay } from './service.js';

describe('resolveRewardDay', () => {
  it('starts a new streak at day 1 when there is no prior claim', () => {
    expect(resolveRewardDay(null, '2026-09-05')).toBe(1);
  });

  it('advances the streak when the last claim was the previous UTC day', () => {
    expect(resolveRewardDay({ claimDate: '2026-09-04', rewardDay: 3 }, '2026-09-05')).toBe(4);
  });

  it('wraps day 7 back to day 1 on a consecutive claim', () => {
    expect(resolveRewardDay({ claimDate: '2026-09-04', rewardDay: 7 }, '2026-09-05')).toBe(1);
  });

  it('resets to day 1 when a day was missed', () => {
    expect(resolveRewardDay({ claimDate: '2026-09-02', rewardDay: 5 }, '2026-09-05')).toBe(1);
  });

  it('crosses month boundaries when checking consecutiveness', () => {
    expect(resolveRewardDay({ claimDate: '2026-08-31', rewardDay: 2 }, '2026-09-01')).toBe(3);
  });

  it('ignores any client-supplied day: the streak alone decides', () => {
    // there is no parameter for a requested day — the signature does not allow it
    expect(resolveRewardDay.length).toBe(2);
  });
});
