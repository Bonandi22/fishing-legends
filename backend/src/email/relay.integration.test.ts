import { describe, expect, it } from 'vitest';
import amqplib from 'amqplib';
import { createAmqpPublisher, EMAIL_SEND_QUEUE } from './amqp.js';

const url = process.env.RABBITMQ_URL;

describe.skipIf(!url)('amqp publisher (real RabbitMQ)', () => {
  it('a published message lands on email.send', async () => {
    const publisher = await createAmqpPublisher(url!);
    const conn = await amqplib.connect(url!);
    const ch = await conn.createChannel();
    await ch.purgeQueue(EMAIL_SEND_QUEUE);
    const id = crypto.randomUUID();
    await publisher.publish({
      id,
      kind: 'login_code',
      to: 'a@example.com',
      locale: 'pt',
      payload: { code: '123456' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    let got: Awaited<ReturnType<typeof ch.get>> = false;
    for (let i = 0; i < 20 && !got; i++) {
      got = await ch.get(EMAIL_SEND_QUEUE, { noAck: false });
      if (!got) await new Promise((r) => setTimeout(r, 100));
    }
    expect(got).not.toBe(false);
    if (got) {
      const body = JSON.parse(got.content.toString());
      expect(body.id).toBe(id);
      expect(body.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(got.properties.messageId).toBe(id);
      expect(got.properties.deliveryMode).toBe(2);
      ch.ack(got);
    }
    await conn.close();
    await publisher.close();
  });
});
