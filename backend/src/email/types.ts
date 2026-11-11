export type EmailKind =
  | 'verify_email_code'
  | 'login_code'
  | 'password_reset_code'
  | 'register_attempt_notice'
  | 'code_expired_notice';

export type Locale = 'pt' | 'en' | 'es' | 'fr' | 'de' | 'ja';

export type EmailMessage = {
  id: string;
  kind: EmailKind;
  to: string;
  locale: Locale;
  payload: Record<string, string>;
  challengeId?: string;
  createdAt: Date;
};

export type OutboxStatus = 'pending' | 'published' | 'sent' | 'failed';

export interface EmailOutbox {
  /** `tx` is an implementation-specific transaction handle (a Drizzle transaction in PostgreSQL). */
  enqueue(msg: Omit<EmailMessage, 'id' | 'createdAt'>, tx?: unknown): Promise<string>;
  claimPending(limit: number): Promise<EmailMessage[]>;
  markPublished(ids: string[]): Promise<void>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  status(id: string): Promise<OutboxStatus | null>;
  /** Rows (any status/kind) addressed to `to` (case-insensitive) created at or after `since`. */
  countRecipientSince(to: string, since: Date): Promise<number>;
}

/** How long a claimPending() claim holds a row before another relay may take it. */
export const OUTBOX_CLAIM_LEASE_SECONDS = 30;
