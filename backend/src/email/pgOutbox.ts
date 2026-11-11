import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { emailOutbox } from '../db/schema.js';
import type { EmailKind, EmailMessage, EmailOutbox, Locale, OutboxStatus } from './types.js';

/** A Drizzle transaction (what `db.transaction(async tx => ...)` hands you). */
export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function createPgOutbox(db: Database): EmailOutbox {
  return {
    async enqueue(msg, tx) {
      const exec: Database | DatabaseTransaction = (tx as DatabaseTransaction | undefined) ?? db;
      const id = randomUUID();
      await exec.insert(emailOutbox).values({
        id,
        kind: msg.kind,
        recipient: msg.to.toLowerCase(),
        locale: msg.locale,
        payload: msg.payload,
        challengeId: msg.challengeId ?? null,
      });
      return id;
    },
    async claimPending(limit) {
      const result = await db.execute<{
        id: string; kind: string; recipient: string; locale: string;
        payload: Record<string, string>; challenge_id: string | null; created_at: Date;
      }>(sql`
        SELECT id, kind, recipient, locale, payload, challenge_id, created_at
        FROM email_outbox
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      return result.rows.map((r): EmailMessage => ({
        id: r.id,
        kind: r.kind as EmailKind,
        to: r.recipient,
        locale: r.locale as Locale,
        payload: r.payload,
        ...(r.challenge_id ? { challengeId: r.challenge_id } : {}),
        createdAt: new Date(r.created_at),
      }));
    },
    async markPublished(ids) {
      if (ids.length === 0) return;
      await db.update(emailOutbox)
        .set({ status: 'published', publishedAt: sql`now()` })
        .where(and(inArray(emailOutbox.id, ids), eq(emailOutbox.status, 'pending')));
    },
    async markSent(id) {
      await db.update(emailOutbox)
        .set({ status: 'sent', sentAt: sql`now()` })
        .where(eq(emailOutbox.id, id));
    },
    async markFailed(id, reason) {
      await db.update(emailOutbox)
        .set({ status: 'failed', lastError: reason, attempts: sql`${emailOutbox.attempts} + 1` })
        .where(eq(emailOutbox.id, id));
    },
    async status(id) {
      const [row] = await db.select({ status: emailOutbox.status }).from(emailOutbox).where(eq(emailOutbox.id, id));
      return (row?.status as OutboxStatus | undefined) ?? null;
    },
    async countRecipientSince(to, since) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(emailOutbox)
        .where(and(eq(emailOutbox.recipient, to.toLowerCase()), gte(emailOutbox.createdAt, since)));
      return row?.n ?? 0;
    },
  };
}
