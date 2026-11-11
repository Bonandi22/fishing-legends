import { describe, expect, it, vi } from 'vitest';
import type amqplib from 'amqplib';
import { ATTEMPT_HEADER, startEmailConsumer, type ConsumerChannel, type ConsumerConnection } from './consumer.js';
import type { EmailMessage } from './types.js';
import type { HandleResult } from './worker.js';

type Delivery = amqplib.ConsumeMessage;

function fakeBroker(opts: { publishError?: Error } = {}) {
  const calls: string[] = [];
  const handlers: Record<string, ((e?: unknown) => void)[]> = {};
  let deliver: (m: Delivery | null) => void = () => undefined;
  const publishes: { exchange: string; key: string; body: Buffer; options: amqplib.Options.Publish }[] = [];
  const channel = {
    on: (ev: string, cb: (e?: unknown) => void) => void (handlers[`ch.${ev}`] ??= []).push(cb),
    prefetch: async () => undefined,
    consume: async (_q: string, cb: (m: Delivery | null) => void) => {
      deliver = cb;
      return { consumerTag: 't' };
    },
    cancel: async () => {
      calls.push('cancel');
    },
    publish: (exchange: string, key: string, body: Buffer, options: amqplib.Options.Publish, cb: (e: unknown) => void) => {
      publishes.push({ exchange, key, body, options });
      calls.push('publish');
      cb(opts.publishError ?? null);
    },
    ack: () => void calls.push('ack'),
    nack: (_m: Delivery, all: boolean, requeue: boolean) => void calls.push(`nack:${all}:${requeue}`),
    close: async () => {
      calls.push('channel.close');
    },
    assertExchange: async () => undefined,
    assertQueue: async () => undefined,
    bindQueue: async () => undefined,
  } as unknown as ConsumerChannel;
  const connection: ConsumerConnection = {
    on: (ev, cb) => void (handlers[`conn.${ev}`] ??= []).push(cb),
    createConfirmChannel: async () => channel,
    close: async () => {
      calls.push('conn.close');
    },
  };
  return {
    calls,
    publishes,
    connect: async () => connection,
    deliver: (m: Delivery) => deliver(m),
    emit: (name: string) => handlers[name]?.forEach((h) => h()),
  };
}

const msg: EmailMessage = {
  id: 'm1',
  kind: 'login_code',
  to: 'a@example.com',
  locale: 'en',
  payload: { code: '123456' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function delivery(content: Buffer | object, headers?: Record<string, unknown>): Delivery {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(JSON.stringify({ ...content, createdAt: '2026-01-01T00:00:00.000Z' }));
  return { content: body, fields: {}, properties: { headers } } as unknown as Delivery;
}

const tick = () => new Promise((r) => setTimeout(r, 10));

async function setup(result: HandleResult | (() => Promise<HandleResult>), brokerOpts = {}, extra: { onClosed?: () => void } = {}) {
  const broker = fakeBroker(brokerOpts);
  const handle = vi.fn(async () => (typeof result === 'function' ? result() : result));
  const consumer = await startEmailConsumer({ url: 'amqp://fake', worker: { handle }, connect: broker.connect, ...extra });
  return { broker, handle, consumer };
}

describe('email consumer', () => {
  it('malformed JSON is nacked without requeue and the handler is not called', async () => {
    const { broker, handle } = await setup('sent');
    broker.deliver(delivery(Buffer.from('{not json')));
    await tick();
    expect(broker.calls).toContain('nack:false:false');
    expect(handle).not.toHaveBeenCalled();
  });

  it('unknown kind or locale goes straight to dead', async () => {
    const { broker, handle } = await setup('sent');
    broker.deliver(delivery({ ...msg, kind: 'bogus' }));
    broker.deliver(delivery({ ...msg, locale: 'xx' }));
    await tick();
    expect(broker.calls.filter((c) => c === 'nack:false:false')).toHaveLength(2);
    expect(handle).not.toHaveBeenCalled();
  });

  it("'retry' publishes to email/email.retry with attempt+1 and acks only afterwards", async () => {
    const { broker, handle } = await setup('retry');
    broker.deliver(delivery(msg, { [ATTEMPT_HEADER]: 2 }));
    await tick();
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 2);
    expect(broker.publishes).toHaveLength(1);
    const p = broker.publishes[0];
    expect(p.exchange).toBe('email');
    expect(p.key).toBe('email.retry');
    expect(p.options.headers?.[ATTEMPT_HEADER]).toBe(3);
    expect(p.options.messageId).toBe('m1');
    expect(p.options.persistent).toBe(true);
    expect(broker.calls).toEqual(['publish', 'ack']);
  });

  it('a first delivery without the header counts as attempt 1', async () => {
    const { broker, handle } = await setup('retry');
    broker.deliver(delivery(msg));
    await tick();
    expect(handle).toHaveBeenCalledWith(expect.anything(), 1);
    expect(broker.publishes[0].options.headers?.[ATTEMPT_HEADER]).toBe(2);
  });

  it('republish failure does not ack the original (nack with requeue)', async () => {
    const { broker } = await setup('retry', { publishError: new Error('nacked') });
    broker.deliver(delivery(msg));
    await tick();
    expect(broker.calls).toEqual(['publish', 'nack:false:true']);
  });

  it("'dead' nacks without requeue; 'sent' acks", async () => {
    const dead = await setup('dead');
    dead.broker.deliver(delivery(msg));
    await tick();
    expect(dead.broker.calls).toEqual(['nack:false:false']);
    const sent = await setup('sent');
    sent.broker.deliver(delivery(msg));
    await tick();
    expect(sent.broker.calls).toEqual(['ack']);
  });

  it('stop() waits for an in-flight message before closing', async () => {
    let release: (v: HandleResult) => void = () => undefined;
    const { broker, consumer } = await setup(() => new Promise<HandleResult>((r) => (release = r)));
    broker.deliver(delivery(msg));
    await tick();
    const stopped = consumer.stop();
    await tick();
    expect(broker.calls).toEqual(['cancel']);
    release('sent');
    await stopped;
    expect(broker.calls).toEqual(['cancel', 'ack', 'channel.close', 'conn.close']);
  });

  it('an unexpected close fires onClosed; a close during stop() does not', async () => {
    const onClosed = vi.fn();
    const a = await setup('sent', {}, { onClosed });
    a.broker.emit('conn.close');
    expect(onClosed).toHaveBeenCalledTimes(1);
    a.broker.emit('ch.close');
    expect(onClosed).toHaveBeenCalledTimes(2);

    const onClosed2 = vi.fn();
    const b = await setup('sent', {}, { onClosed: onClosed2 });
    const stopped = b.consumer.stop();
    b.broker.emit('ch.close');
    b.broker.emit('conn.close');
    await stopped;
    expect(onClosed2).not.toHaveBeenCalled();
  });
});
