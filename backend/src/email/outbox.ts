import { randomUUID } from 'node:crypto';
import type { EmailMessage, EmailOutbox, OutboxStatus } from './types.js';

type Row = { msg: EmailMessage; status: OutboxStatus; attempts: number; lastError: string | null };

export type MemoryOutbox = EmailOutbox & {
  /** Test helper: backdate a row's creation time. */
  setCreatedAt(id: string, at: Date): void;
};

export function createMemoryOutbox(now: () => Date = () => new Date()): MemoryOutbox {
  const rows = new Map<string, Row>();

  return {
    async enqueue(msg) {
      const id = randomUUID();
      rows.set(id, {
        msg: { ...msg, to: msg.to.toLowerCase(), payload: { ...msg.payload }, id, createdAt: now() },
        status: 'pending',
        attempts: 0,
        lastError: null,
      });
      return id;
    },
    async claimPending(limit) {
      return [...rows.values()]
        .filter(r => r.status === 'pending')
        .sort((a, b) => a.msg.createdAt.getTime() - b.msg.createdAt.getTime())
        .slice(0, limit)
        .map(r => ({ ...r.msg }));
    },
    async markPublished(ids) {
      for (const id of ids) {
        const r = rows.get(id);
        if (r && r.status === 'pending') r.status = 'published';
      }
    },
    async markSent(id) {
      const r = rows.get(id);
      if (r) r.status = 'sent';
    },
    async markFailed(id, reason) {
      const r = rows.get(id);
      if (r) {
        r.status = 'failed';
        r.attempts += 1;
        r.lastError = reason;
      }
    },
    async status(id) {
      return rows.get(id)?.status ?? null;
    },
    async countRecipientSince(to, since) {
      const target = to.toLowerCase();
      return [...rows.values()].filter(
        r => r.msg.to === target && r.msg.createdAt.getTime() >= since.getTime(),
      ).length;
    },
    setCreatedAt(id, at) {
      const r = rows.get(id);
      if (r) r.msg.createdAt = at;
    },
  };
}
