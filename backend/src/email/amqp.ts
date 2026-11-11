import amqplib from 'amqplib';
import type { EmailMessage } from './types.js';

/**
 * RabbitMQ topology (all durable):
 *   exchange `email` (direct)
 *     -- `email.send`  --> queue `email.send` (dead-letters to `email.dlx`)
 *     -- `email.retry` --> queue `email.retry` (message TTL, then dead-letters back to `email`/`email.send`)
 *   exchange `email.dlx` (direct)
 *     -- `email.send`  --> queue `email.dead` (messages the worker gave up on)
 * The worker retries by publishing to `email.retry`; it parks poison messages by rejecting
 * (requeue=false) from `email.send`, which routes them to `email.dead`.
 */
export const EMAIL_EXCHANGE = 'email';
export const EMAIL_SEND_QUEUE = 'email.send';
export const EMAIL_SEND_ROUTING_KEY = 'email.send';
export const EMAIL_DLX = 'email.dlx';
export const EMAIL_DEAD_QUEUE = 'email.dead';
export const EMAIL_RETRY_QUEUE = 'email.retry';
export const EMAIL_RETRY_ROUTING_KEY = 'email.retry';
export const EMAIL_RETRY_DELAY_MS = 30_000;

export interface EmailPublisher {
  publish(msg: EmailMessage): Promise<void>;
  close(): Promise<void>;
}

/** Declares the topology above; idempotent. */
export async function assertEmailTopology(ch: amqplib.Channel): Promise<void> {
  await ch.assertExchange(EMAIL_EXCHANGE, 'direct', { durable: true });
  await ch.assertExchange(EMAIL_DLX, 'direct', { durable: true });
  await ch.assertQueue(EMAIL_DEAD_QUEUE, { durable: true });
  await ch.bindQueue(EMAIL_DEAD_QUEUE, EMAIL_DLX, EMAIL_SEND_ROUTING_KEY);
  await ch.assertQueue(EMAIL_SEND_QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': EMAIL_DLX, 'x-dead-letter-routing-key': EMAIL_SEND_ROUTING_KEY },
  });
  await ch.bindQueue(EMAIL_SEND_QUEUE, EMAIL_EXCHANGE, EMAIL_SEND_ROUTING_KEY);
  await ch.assertQueue(EMAIL_RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-message-ttl': EMAIL_RETRY_DELAY_MS,
      'x-dead-letter-exchange': EMAIL_EXCHANGE,
      'x-dead-letter-routing-key': EMAIL_SEND_ROUTING_KEY,
    },
  });
  await ch.bindQueue(EMAIL_RETRY_QUEUE, EMAIL_EXCHANGE, EMAIL_RETRY_ROUTING_KEY);
}

export function serializeEmail(msg: EmailMessage): Buffer {
  return Buffer.from(JSON.stringify({ ...msg, createdAt: msg.createdAt.toISOString() }));
}

export async function createAmqpPublisher(url: string): Promise<EmailPublisher> {
  const connection = await amqplib.connect(url);
  // Without listeners an 'error' event would crash the process; publish() then fails and the relay reconnects.
  connection.on('error', () => undefined);
  try {
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => undefined);
    await assertEmailTopology(channel);
    return {
      publish: (msg) =>
        new Promise<void>((resolve, reject) => {
          channel.publish(
            EMAIL_EXCHANGE,
            EMAIL_SEND_ROUTING_KEY,
            serializeEmail(msg),
            { persistent: true, contentType: 'application/json', messageId: msg.id },
            (err) => (err ? reject(err instanceof Error ? err : new Error('AMQP publish nacked')) : resolve()),
          );
        }),
      close: async () => {
        await connection.close().catch(() => undefined);
      },
    };
  } catch (err) {
    await connection.close().catch(() => undefined);
    throw err;
  }
}
