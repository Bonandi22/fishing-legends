import { expect, it } from 'vitest';
import type { EmailOutbox } from './types.js';

const base = { kind: 'login_code', to: 'Ana@Example.com', locale: 'pt', payload: { code: '123456' } } as const;

export type OutboxHarness = {
  outbox: EmailOutbox;
  /** Backdate a row's created_at so the since-window can be exercised. */
  setCreatedAt(id: string, at: Date): Promise<void>;
};

/** Behavioural cases shared by the memory and PostgreSQL outboxes. */
export function outboxContract(make: () => OutboxHarness) {
  it('enqueue then claimPending returns it once', async () => {
    const { outbox } = make();
    const id = await outbox.enqueue({ ...base });
    expect(await outbox.status(id)).toBe('pending');
    const claimed = await outbox.claimPending(10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ id, kind: 'login_code', to: 'ana@example.com', locale: 'pt', payload: { code: '123456' } });
    await outbox.markPublished([id]);
    expect(await outbox.status(id)).toBe('published');
    expect(await outbox.claimPending(10)).toEqual([]);
  });

  it('markSent / markFailed set status', async () => {
    const { outbox } = make();
    const a = await outbox.enqueue({ ...base });
    const b = await outbox.enqueue({ ...base });
    await outbox.markSent(a);
    await outbox.markFailed(b, 'smtp down');
    expect(await outbox.status(a)).toBe('sent');
    expect(await outbox.status(b)).toBe('failed');
    expect(await outbox.status('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('claimPending respects the limit', async () => {
    const { outbox } = make();
    await outbox.enqueue({ ...base });
    await outbox.enqueue({ ...base });
    expect(await outbox.claimPending(1)).toHaveLength(1);
  });

  it('countRecipientSince counts only that recipient (case-insensitive) at or after since', async () => {
    const { outbox, setCreatedAt } = make();
    const old = await outbox.enqueue({ ...base });
    await setCreatedAt(old, new Date(Date.now() - 2 * 3600_000));
    await outbox.enqueue({ ...base, kind: 'verify_email_code', to: 'ANA@example.com' });
    await outbox.enqueue({ ...base });
    await outbox.enqueue({ ...base, to: 'bob@example.com' });
    const since = new Date(Date.now() - 3600_000);
    expect(await outbox.countRecipientSince('ana@EXAMPLE.com', since)).toBe(2);
    expect(await outbox.countRecipientSince('ana@example.com', new Date(Date.now() - 3 * 3600_000))).toBe(3);
    expect(await outbox.countRecipientSince('nobody@example.com', since)).toBe(0);
  });
}
