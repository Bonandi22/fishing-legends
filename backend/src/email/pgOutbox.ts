import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { emailOutbox } from '../db/schema.js';
import { OUTBOX_CLAIM_LEASE_SECONDS, REDACTED_CODE, type EmailKind, type EmailMessage, type EmailOutbox, type Locale, type OutboxStatus } from './types.js';

/** A Drizzle transaction (what `db.transaction(async tx => ...)` hands you). */
export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The payload with its code (if any) replaced by REDACTED_CODE; other keys are kept. */
const redactedPayload = sql`jsonb_set(${emailOutbox.payload}, '{code}', to_jsonb(${REDACTED_CODE}::text), false)`;

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
      // One atomic statement: the UPDATE persists the lease, so the claim
      // outlives this statement (a bare FOR UPDATE would release on autocommit).
      const result = await db.execute<{
        id: string; kind: string; recipient: string; locale: string;
        payload: Record<string, string>; challenge_id: string | null; created_at: Date;
      }>(sql`
        UPDATE email_outbox
        SET claimed_until = now() + make_interval(secs => ${OUTBOX_CLAIM_LEASE_SECONDS})
        WHERE id IN (
          SELECT id FROM email_outbox
          WHERE status = 'pending' AND (claimed_until IS NULL OR claimed_until < now())
          ORDER BY created_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, kind, recipient, locale, payload, challenge_id, created_at
      `);
      return [...result.rows].sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()).map((r): EmailMessage => ({
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
        .set({ status: 'sent', sentAt: sql`now()`, payload: redactedPayload })
        .where(eq(emailOutbox.id, id));
    },
    async markFailed(id, reason) {
      await db.update(emailOutbox)
        .set({ status: 'failed', lastError: reason, attempts: sql`${emailOutbox.attempts} + 1`, payload: redactedPayload })
        .where(eq(emailOutbox.id, id));
    },
    async status(id) {
      const [row] = await db.select({ status: emailOutbox.status }).from(emailOutbox).where(eq(emailOutbox.id, id));
      return (row?.status as OutboxStatus | undefined) ?? null;
    },
    async countRecipientSince(to, since, kind) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(emailOutbox)
        .where(and(
          eq(emailOutbox.recipient, to.toLowerCase()),
          gte(emailOutbox.createdAt, since),
          kind ? eq(emailOutbox.kind, kind) : undefined,
        ));
      return row?.n ?? 0;
    },
    async deleteFinishedBefore(olderThan) {
      const rows = await db.delete(emailOutbox)
        .where(and(inArray(emailOutbox.status, ['sent', 'failed']), lt(emailOutbox.createdAt, olderThan)))
        .returning({ id: emailOutbox.id });
      return rows.length;
    },
  };
}
