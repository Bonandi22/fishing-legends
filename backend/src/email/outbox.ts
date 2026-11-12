import { randomUUID } from 'node:crypto';
import { OUTBOX_CLAIM_LEASE_SECONDS, REDACTED_CODE, type EmailMessage, type EmailOutbox, type OutboxStatus } from './types.js';

type Row = { msg: EmailMessage; status: OutboxStatus; attempts: number; lastError: string | null; claimedUntil: Date | null };

export type MemoryOutbox = EmailOutbox & {
  /** Test helper: backdate a row's creation time. */
  setCreatedAt(id: string, at: Date): void;
  /** Test helper: every enqueued message, oldest first, regardless of status. */
  messages(): EmailMessage[];
};

export function createMemoryOutbox({ now = () => new Date() }: { now?: () => Date } = {}): MemoryOutbox {
  const rows = new Map<string, Row>();
  const redact = (r: Row) => {
    if ('code' in r.msg.payload) r.msg.payload = { ...r.msg.payload, code: REDACTED_CODE };
  };

  return {
    async enqueue(msg) {
      const id = randomUUID();
      rows.set(id, {
        msg: { ...msg, to: msg.to.toLowerCase(), payload: { ...msg.payload }, id, createdAt: now() },
        status: 'pending',
        attempts: 0,
        lastError: null,
        claimedUntil: null,
      });
      return id;
    },
    async claimPending(limit) {
      const t = now();
      const claimed = [...rows.values()]
        .filter(r => r.status === 'pending' && (r.claimedUntil === null || r.claimedUntil < t))
        .sort((a, b) => a.msg.createdAt.getTime() - b.msg.createdAt.getTime())
        .slice(0, limit);
      const until = new Date(t.getTime() + OUTBOX_CLAIM_LEASE_SECONDS * 1000);
      for (const r of claimed) r.claimedUntil = until;
      return claimed.map(r => ({ ...r.msg, payload: { ...r.msg.payload } }));
    },
    async markPublished(ids) {
      for (const id of ids) {
        const r = rows.get(id);
        if (r && r.status === 'pending') r.status = 'published';
      }
    },
    async markSent(id) {
      const r = rows.get(id);
      if (r) {
        r.status = 'sent';
        redact(r);
      }
    },
    async markFailed(id, reason) {
      const r = rows.get(id);
      if (r) {
        r.status = 'failed';
        r.attempts += 1;
        r.lastError = reason;
        redact(r);
      }
    },
    async status(id) {
      return rows.get(id)?.status ?? null;
    },
    async countRecipientSince(to, since, kind) {
      const target = to.toLowerCase();
      return [...rows.values()].filter(
        r => r.msg.to === target && r.msg.createdAt.getTime() >= since.getTime() && (!kind || r.msg.kind === kind),
      ).length;
    },
    async deleteFinishedBefore(olderThan) {
      let deleted = 0;
      for (const [id, r] of [...rows]) {
        if ((r.status === 'sent' || r.status === 'failed') && r.msg.createdAt.getTime() < olderThan.getTime()) {
          rows.delete(id);
          deleted += 1;
        }
      }
      return deleted;
    },
    setCreatedAt(id, at) {
      const r = rows.get(id);
      if (r) r.msg.createdAt = at;
    },
    messages() {
      return [...rows.values()].map(r => ({ ...r.msg, payload: { ...r.msg.payload } }));
    },
  };
}
