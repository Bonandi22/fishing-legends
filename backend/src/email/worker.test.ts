import { describe, expect, it, vi } from 'vitest';
import { createEmailWorker, type EmailSender } from './worker.js';
import type { EmailMessage, EmailOutbox, OutboxStatus } from './types.js';

const msg: EmailMessage = {
  id: 'm1',
  kind: 'login_code',
  to: 'a@example.com',
  locale: 'en',
  payload: { code: '654321' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function setup(opts: { status?: OutboxStatus | null; valid?: boolean; sendError?: Error; maxDeliveries?: number } = {}) {
  const send = vi.fn<EmailSender['send']>(async () => {
    if (opts.sendError) throw opts.sendError;
  });
  const outbox = {
    status: vi.fn(async () => (opts.status === undefined ? 'published' : opts.status)),
    markSent: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  } as unknown as EmailOutbox;
  const worker = createEmailWorker({
    sender: { send },
    outbox,
    isCodeStillValid: async () => opts.valid ?? true,
    ttlMinutes: 30,
    maxDeliveries: opts.maxDeliveries,
  });
  return { send, outbox, worker };
}

describe('email worker', () => {
  it('sends the rendered email and marks the row sent', async () => {
    const { send, outbox, worker } = setup();
    expect(await worker.handle(msg, 1)).toBe('sent');
    expect(send).toHaveBeenCalledOnce();
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe('a@example.com');
    expect(mail.text).toContain('654321');
    expect(outbox.markSent).toHaveBeenCalledWith('m1');
  });

  it('an already-sent row is not sent twice', async () => {
    const { send, outbox, worker } = setup({ status: 'sent' });
    expect(await worker.handle(msg, 1)).toBe('sent');
    expect(send).not.toHaveBeenCalled();
    expect(outbox.markSent).not.toHaveBeenCalled();
  });

  it("sender failure returns 'retry' until maxDeliveries, then 'dead' and markFailed without credentials", async () => {
    const err = Object.assign(new Error('Invalid login: user=bob pass=hunter2 code 654321'), {
      code: 'EAUTH',
      responseCode: 535,
    });
    const { outbox, worker } = setup({ sendError: err, maxDeliveries: 3 });
    expect(await worker.handle(msg, 1)).toBe('retry');
    expect(await worker.handle(msg, 2)).toBe('retry');
    expect(outbox.markFailed).not.toHaveBeenCalled();
    expect(await worker.handle(msg, 3)).toBe('dead');
    const reason = vi.mocked(outbox.markFailed).mock.calls[0][1];
    expect(reason).toContain('EAUTH');
    expect(reason).toContain('535');
    expect(reason).not.toContain('hunter2');
    expect(reason).not.toContain('654321');
  });

  it('expired code -> sends code_expired_notice instead', async () => {
    const { send, outbox, worker } = setup({ valid: false });
    expect(await worker.handle(msg, 1)).toBe('sent');
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe('a@example.com');
    expect(mail.text).not.toContain('654321');
    expect(mail.subject).not.toBe('');
    expect(outbox.markSent).toHaveBeenCalledWith('m1');
  });

  it('a missing outbox row is still sent (status null)', async () => {
    const { send, worker } = setup({ status: null });
    expect(await worker.handle(msg, 1)).toBe('sent');
    expect(send).toHaveBeenCalledOnce();
  });
});
