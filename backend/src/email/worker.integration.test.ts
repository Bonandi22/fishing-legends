import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { createPgOutbox } from './pgOutbox.js';
import { createAmqpPublisher } from './amqp.js';
import { createSmtpSender } from './smtp.js';
import { createEmailWorker } from './worker.js';
import { startEmailConsumer } from './consumer.js';

const rabbitmqUrl = process.env.RABBITMQ_URL;
const mailpitUrl = process.env.MAILPIT_URL;

type MailpitList = { messages: { ID: string; To: { Address: string }[] }[] };

let harness: TestDatabase;

describe.skipIf(!rabbitmqUrl || !mailpitUrl)('email worker (RabbitMQ + Mailpit)', () => {
  beforeAll(async () => {
    harness = await createTestDatabase();
  });
  afterEach(() => harness?.reset());
  afterAll(() => harness?.close());

  it('delivers a login_code message to Mailpit and marks the row sent', async () => {
    const outbox = createPgOutbox(harness.db);
    const to = `worker-${crypto.randomUUID()}@example.com`;
    const code = '482913';
    const id = await outbox.enqueue({ kind: 'login_code', to, locale: 'en', payload: { code } });
    const [row] = await outbox.claimPending(10);
    expect(row.id).toBe(id);

    const sender = createSmtpSender({
      rabbitmqUrl,
      smtp: { host: process.env.SMTP_HOST ?? 'localhost', port: Number(process.env.SMTP_PORT ?? 1025), secure: false },
      from: 'Deep Blue Lure <no-reply@example.com>',
    });
    const worker = createEmailWorker({ sender, outbox, isCodeStillValid: async () => true, ttlMinutes: 30 });
    const consumer = await startEmailConsumer({ url: rabbitmqUrl!, worker });
    const publisher = await createAmqpPublisher(rabbitmqUrl!);
    try {
      await publisher.publish(row);
      let found: MailpitList['messages'][number] | undefined;
      for (let i = 0; i < 100 && !found; i++) {
        const res = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
        const body = (await res.json()) as MailpitList;
        found = body.messages[0];
        if (!found) await new Promise((r) => setTimeout(r, 100));
      }
      expect(found).toBeDefined();
      const full = (await (await fetch(`${mailpitUrl}/api/v1/message/${found!.ID}`)).json()) as { Text: string };
      expect(full.Text).toContain(code);
      for (let i = 0; i < 50 && (await outbox.status(id)) !== 'sent'; i++) await new Promise((r) => setTimeout(r, 100));
      expect(await outbox.status(id)).toBe('sent');
    } finally {
      await consumer.stop();
      await publisher.close();
      await sender.close?.();
    }
  }, 30_000);
});
