import { describe } from 'vitest';
import { createMemoryOutbox } from './outbox.js';
import { outboxContract } from './outboxContract.js';
import { OUTBOX_CLAIM_LEASE_SECONDS } from './types.js';

describe('memory email outbox', () => {
  outboxContract(() => {
    let offsetMs = 0;
    const outbox = createMemoryOutbox({ now: () => new Date(Date.now() + offsetMs) });
    return {
      outbox,
      setCreatedAt: async (id, at) => outbox.setCreatedAt(id, at),
      expireLeases: async () => {
        offsetMs += (OUTBOX_CLAIM_LEASE_SECONDS + 1) * 1000;
      },
    };
  });
});
