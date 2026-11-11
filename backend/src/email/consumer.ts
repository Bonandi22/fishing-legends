import amqplib from 'amqplib';
import {
  assertEmailTopology,
  EMAIL_EXCHANGE,
  EMAIL_RETRY_ROUTING_KEY,
  EMAIL_SEND_QUEUE,
  serializeEmail,
} from './amqp.js';
import type { EmailMessage } from './types.js';
import type { HandleResult } from './worker.js';

export const ATTEMPT_HEADER = 'x-attempt';

export interface EmailConsumer {
  /** Stops consuming, waits for in-flight messages, closes channel and connection. */
  stop(): Promise<void>;
}

type Handler = { handle(msg: EmailMessage, deliveryCount: number): Promise<HandleResult> };

function parseMessage(content: Buffer): EmailMessage | null {
  try {
    const raw = JSON.parse(content.toString()) as Omit<EmailMessage, 'createdAt'> & { createdAt: string };
    if (typeof raw.id !== 'string' || typeof raw.to !== 'string' || typeof raw.kind !== 'string') return null;
    return { ...raw, createdAt: new Date(raw.createdAt) };
  } catch {
    return null;
  }
}

export async function startEmailConsumer(opts: {
  url: string;
  worker: Handler;
  prefetch?: number;
  onError?: (err: unknown) => void;
}): Promise<EmailConsumer> {
  const connection = await amqplib.connect(opts.url);
  connection.on('error', (e) => opts.onError?.(e));
  try {
    const channel = await connection.createConfirmChannel();
    channel.on('error', (e) => opts.onError?.(e));
    await assertEmailTopology(channel);
    await channel.prefetch(opts.prefetch ?? 10);

    let inFlight = 0;
    let idle: (() => void) | null = null;

    const republishForRetry = (msg: EmailMessage, attempt: number) =>
      new Promise<void>((resolve, reject) => {
        channel.publish(
          EMAIL_EXCHANGE,
          EMAIL_RETRY_ROUTING_KEY,
          serializeEmail(msg),
          {
            persistent: true,
            contentType: 'application/json',
            messageId: msg.id,
            headers: { [ATTEMPT_HEADER]: attempt },
          },
          (err) => (err ? reject(err instanceof Error ? err : new Error('AMQP publish nacked')) : resolve()),
        );
      });

    const { consumerTag } = await channel.consume(
      EMAIL_SEND_QUEUE,
      (delivery) => {
        if (!delivery) return;
        inFlight++;
        void (async () => {
          try {
            const msg = parseMessage(delivery.content);
            if (!msg) {
              channel.nack(delivery, false, false); // unparseable: park in email.dead
              return;
            }
            const header: unknown = delivery.properties.headers?.[ATTEMPT_HEADER];
            const attempt = typeof header === 'number' && header >= 1 ? header : 1;
            const result = await opts.worker.handle(msg, attempt);
            if (result === 'retry') {
              await republishForRetry(msg, attempt + 1); // confirmed before the original is acked
              channel.ack(delivery);
            } else if (result === 'dead') {
              channel.nack(delivery, false, false);
            } else {
              channel.ack(delivery);
            }
          } catch (err) {
            opts.onError?.(err);
            try {
              channel.nack(delivery, false, true); // leave it for redelivery
            } catch {
              /* channel already closed */
            }
          } finally {
            inFlight--;
            if (inFlight === 0) idle?.();
          }
        })();
      },
      { noAck: false },
    );

    return {
      async stop() {
        await channel.cancel(consumerTag).catch(() => undefined);
        if (inFlight > 0) await new Promise<void>((resolve) => (idle = resolve));
        await channel.close().catch(() => undefined);
        await connection.close().catch(() => undefined);
      },
    };
  } catch (err) {
    await connection.close().catch(() => undefined);
    throw err;
  }
}
