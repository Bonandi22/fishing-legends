import { renderEmail } from './templates.js';
import type { EmailSender } from './smtp.js';
import type { EmailKind, EmailMessage, EmailOutbox } from './types.js';

export type { EmailSender } from './smtp.js';

export type WorkerDeps = {
  sender: EmailSender;
  outbox: EmailOutbox;
  isCodeStillValid: (msg: EmailMessage) => Promise<boolean>;
  ttlMinutes: number;
  /** Total delivery attempts before the message is parked in the dead-letter queue. */
  maxDeliveries?: number;
};

export type HandleResult = 'sent' | 'retry' | 'dead';

const CODE_KINDS: ReadonlySet<EmailKind> = new Set(['verify_email_code', 'login_code', 'password_reset_code']);

export function createEmailWorker(deps: WorkerDeps) {
  const { sender, outbox, isCodeStillValid, ttlMinutes } = deps;
  const maxDeliveries = deps.maxDeliveries ?? 5;

  return {
    async handle(msg: EmailMessage, deliveryCount: number): Promise<HandleResult> {
      try {
        // At-least-once delivery from the relay: never send a row twice.
        if ((await outbox.status(msg.id)) === 'sent') return 'sent';

        const expired = CODE_KINDS.has(msg.kind) && !(await isCodeStillValid(msg));
        const rendered = expired
          ? renderEmail('code_expired_notice', msg.locale, {})
          : renderEmail(msg.kind, msg.locale, { ...msg.payload, minutes: String(ttlMinutes) });
        await sender.send({ to: msg.to, ...rendered });
        await outbox.markSent(msg.id);
        return 'sent';
      } catch (err) {
        if (deliveryCount < maxDeliveries) return 'retry';
        await outbox.markFailed(msg.id, sanitizeReason(err)).catch(() => undefined);
        return 'dead';
      }
    },
  };
}

/** Short reason that can never echo SMTP credentials or the code: only error name/code and response code. */
export function sanitizeReason(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown error';
  const e = err as Error & { code?: unknown; responseCode?: unknown };
  const parts = [err.name];
  if (typeof e.code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(e.code)) parts.push(e.code);
  if (typeof e.responseCode === 'number') parts.push(String(e.responseCode));
  return parts.join(' ');
}
