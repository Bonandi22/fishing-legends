import { describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { createMemoryOutbox } from './outbox.js';
import { createOutboxRelay } from './relay.js';
import type { EmailPublisher } from './amqp.js';
import type { EmailMessage } from './types.js';

const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as unknown as FastifyBaseLogger;
const enqueue = (outbox: ReturnType<typeof createMemoryOutbox>, to = 'a@example.com') =>
  outbox.enqueue({ kind: 'login_code', to, locale: 'en', payload: { code: '123456' } });

describe('outbox relay', () => {
  it('tick publishes pending rows and marks them published', async () => {
    const outbox = createMemoryOutbox();
    const id = await enqueue(outbox);
    const sent: EmailMessage[] = [];
    const publisher: EmailPublisher = { publish: async (m) => void sent.push(m), close: async () => undefined };
    const relay = createOutboxRelay({ outbox, connect: async () => publisher, log });
    expect(await relay.tick()).toBe(1);
    expect(sent.map((m) => m.id)).toEqual([id]);
    expect(await outbox.status(id)).toBe('published');
    expect(await relay.tick()).toBe(0);
  });

  it('tick leaves rows pending when publish throws, and publishes them on a later tick', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const outbox = createMemoryOutbox({ now: () => now });
    const id = await enqueue(outbox);
    let fail = true;
    const sent: string[] = [];
    const connect = vi.fn(
      async (): Promise<EmailPublisher> => ({
        publish: async (m) => {
          if (fail) throw new Error('broker down');
          sent.push(m.id);
        },
        close: async () => undefined,
      }),
    );
    const relay = createOutboxRelay({ outbox, connect, log });
    expect(await relay.tick()).toBe(0);
    expect(await outbox.status(id)).toBe('pending');
    fail = false;
    now = new Date(now.getTime() + 31_000); // lease expired
    expect(await relay.tick()).toBe(1);
    expect(sent).toEqual([id]);
    expect(connect).toHaveBeenCalledTimes(2); // reconnected after the failure
    expect(await outbox.status(id)).toBe('published');
  });

  it('survives a broker that is down at connect time and never logs credentials', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const outbox = createMemoryOutbox({ now: () => now });
    const id = await enqueue(outbox);
    let up = false;
    const relay = createOutboxRelay({
      outbox,
      connect: async () => {
        if (!up) throw new Error('connect ECONNREFUSED amqp://user:secret@host');
        return { publish: async () => undefined, close: async () => undefined };
      },
      log,
    });
    expect(await relay.tick()).toBe(0);
    expect(JSON.stringify((log.warn as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('secret');
    up = true;
    now = new Date(now.getTime() + 31_000);
    expect(await relay.tick()).toBe(1);
    expect(await outbox.status(id)).toBe('published');
  });
});
