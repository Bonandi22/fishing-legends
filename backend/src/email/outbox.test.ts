import { describe } from 'vitest';
import { createMemoryOutbox } from './outbox.js';
import { outboxContract } from './outboxContract.js';

describe('memory email outbox', () => {
  outboxContract(() => {
    const outbox = createMemoryOutbox();
    return { outbox, setCreatedAt: async (id, at) => outbox.setCreatedAt(id, at) };
  });
});
