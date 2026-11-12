import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { emailOutbox } from '../db/schema.js';
import { createPgOutbox } from './pgOutbox.js';
import { outboxContract } from './outboxContract.js';

let harness: TestDatabase;

beforeAll(async () => {
  harness = await createTestDatabase();
});
afterEach(() => harness?.reset());
afterAll(() => harness?.close());

describe('pg email outbox', () => {
  outboxContract(() => ({
    outbox: createPgOutbox(harness.db),
    expireLeases: async () => {
      await harness.db.update(emailOutbox).set({ claimedUntil: sql`now() - interval '1 second'` });
    },
    setCreatedAt: async (id, at) => {
      await harness.db.update(emailOutbox).set({ createdAt: at }).where(eq(emailOutbox.id, id));
    },
    payloadOf: async id => {
      const [row] = await harness.db.select({ payload: emailOutbox.payload }).from(emailOutbox).where(eq(emailOutbox.id, id));
      return row?.payload as Record<string, string> | undefined;
    },
  }));

  it('concurrent claimPending calls return disjoint sets covering all pending rows', async () => {
    const a = createPgOutbox(harness.db);
    const b = createPgOutbox(harness.db);
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      ids.push(await a.enqueue({ kind: 'login_code', to: `u${i}@example.com`, locale: 'en', payload: {} }));
    }
    const [x, y] = await Promise.all([a.claimPending(20), b.claimPending(20)]);
    const xi = x.map(m => m.id);
    const yi = y.map(m => m.id);
    expect(xi.filter(i => yi.includes(i))).toEqual([]);
    expect([...xi, ...yi].sort()).toEqual([...ids].sort());
  });

  it('enqueue inside a rolled-back transaction leaves no row', async () => {
    const outbox = createPgOutbox(harness.db);
    let id = '';
    await expect(
      harness.db.transaction(async tx => {
        id = await outbox.enqueue(
          { kind: 'login_code', to: 'a@example.com', locale: 'en', payload: { code: '1' } },
          tx,
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await outbox.status(id)).toBeNull();
    expect(await outbox.claimPending(10)).toEqual([]);
  });

  it('enqueue inside a committed transaction persists the row', async () => {
    const outbox = createPgOutbox(harness.db);
    const id = await harness.db.transaction(tx =>
      outbox.enqueue({ kind: 'verify_email_code', to: 'a@example.com', locale: 'en', payload: {} }, tx),
    );
    expect(await outbox.status(id)).toBe('pending');
  });
});
