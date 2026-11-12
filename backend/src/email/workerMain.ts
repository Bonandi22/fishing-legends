import { loadConfig } from '../config/env.js';
import { createDatabase } from '../db/client.js';
import { createPgOutbox } from './pgOutbox.js';
import { createSmtpSender } from './smtp.js';
import { createEmailWorker } from './worker.js';
import { startEmailConsumer } from './consumer.js';
import { codeValidityCheck } from './codeValidity.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createChallengeService } from '../auth/challenges.js';
import { runAuthCleanup } from '../auth/cleanup.js';

// Never log payloads, codes or credentials: only error names.
async function main() {
  const config = loadConfig();
  const databaseUrl = config.databaseUrl;
  const rabbitmqUrl = config.email.rabbitmqUrl;
  if (!databaseUrl || !rabbitmqUrl) {
    console.error('email-worker: DATABASE_URL and RABBITMQ_URL are required');
    process.exit(1);
  }

  let shuttingDown = false;
  const db = createDatabase(databaseUrl);
  const sender = createSmtpSender(config.email);
  const outbox = createPgOutbox(db);
  const authRepo = createPgAuthRepository(db, outbox);
  const challenges = createChallengeService(authRepo, config.authCodes);
  const worker = createEmailWorker({
    sender,
    outbox,
    isCodeStillValid: codeValidityCheck(challenges),
    ttlMinutes: Math.round(config.authCodes.ttlSeconds / 60),
  });
  const consumer = await startEmailConsumer({
    url: rabbitmqUrl,
    worker,
    prefetch: 10,
    onClosed: () => {
      if (shuttingDown) return;
      console.error('email-worker: broker connection lost, exiting so the supervisor restarts the worker');
      process.exit(1);
    },
    onError: (err) => console.error('email-worker: consumer error:', err instanceof Error ? err.name : 'unknown'),
  });
  console.log('email-worker: consuming email.send');

  // Purge never-confirmed accounts and long-expired challenges: at startup, then hourly.
  const cleanup = async () => {
    try {
      const { unverified, challenges: expired, emails } = await runAuthCleanup(authRepo, new Date());
      console.log(`email-worker: cleanup removed ${unverified} unverified accounts, ${expired} challenges, ${emails} outbox rows`);
    } catch (err) {
      console.error('email-worker: cleanup failed:', err instanceof Error ? err.name : 'unknown');
    }
  };
  void cleanup();
  const cleanupTimer = setInterval(() => void cleanup(), 3_600_000);
  cleanupTimer.unref();

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(cleanupTimer);
    console.log(`email-worker: ${signal} received, shutting down`);
    await consumer.stop();
    await sender.close?.();
    await (db as unknown as { $client?: { end(): Promise<void> } }).$client?.end().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('email-worker: fatal:', err instanceof Error ? err.name : 'unknown');
  process.exit(1);
});
