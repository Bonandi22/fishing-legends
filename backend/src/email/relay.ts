import type { FastifyBaseLogger } from 'fastify';
import type { EmailPublisher } from './amqp.js';
import type { EmailOutbox } from './types.js';

export type OutboxRelayDeps = {
  outbox: EmailOutbox;
  connect: () => Promise<EmailPublisher>;
  intervalMs?: number;
  batchSize?: number;
  log: FastifyBaseLogger;
};

/**
 * Moves claimed outbox rows to the broker. On any failure the remaining rows are simply not marked
 * published: their claim lease expires and a later tick retries (at-least-once; the worker dedupes by id).
 * Never logs message contents or connection details.
 */
export function createOutboxRelay(deps: OutboxRelayDeps) {
  const { outbox, connect, log } = deps;
  const intervalMs = deps.intervalMs ?? 1000;
  const batchSize = deps.batchSize ?? 50;
  let publisher: EmailPublisher | null = null;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<number> | null = null;
  let stopped = false;

  async function dropPublisher() {
    const p = publisher;
    publisher = null;
    await p?.close().catch(() => undefined);
  }

  async function runTick(): Promise<number> {
    let rows;
    try {
      rows = await outbox.claimPending(batchSize);
    } catch (err) {
      log.error({ err: describe(err) }, 'email relay: claiming outbox rows failed');
      return 0;
    }
    if (rows.length === 0) return 0;
    try {
      publisher ??= await connect();
    } catch (err) {
      log.warn({ err: describe(err) }, 'email relay: broker unavailable, will retry');
      return 0;
    }
    const published: string[] = [];
    try {
      for (const row of rows) {
        await publisher.publish(row);
        published.push(row.id);
      }
    } catch (err) {
      log.warn({ err: describe(err) }, 'email relay: publish failed, will retry');
      await dropPublisher();
    }
    if (published.length > 0) {
      try {
        await outbox.markPublished(published);
      } catch (err) {
        // Rows stay claimed until the lease expires, then are re-published (duplicates are deduped downstream).
        log.error({ err: describe(err) }, 'email relay: marking rows published failed');
        return 0;
      }
    }
    return published.length;
  }

  function tick(): Promise<number> {
    if (running) return running;
    running = runTick().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    tick,
    start() {
      if (timer || stopped) return;
      timer = setInterval(() => void tick(), intervalMs);
      timer.unref();
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      await running?.catch(() => undefined);
      await dropPublisher();
    },
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message.replace(/\w+:\/\/\S+/g, '[redacted-url]')}` : 'unknown error';
}
