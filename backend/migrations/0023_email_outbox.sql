-- Transactional email outbox: rows are written in the same transaction as the
-- auth change that triggers them, then relayed to RabbitMQ and sent by a worker.
CREATE TABLE email_outbox (
  id uuid PRIMARY KEY,
  kind varchar(40) NOT NULL,
  recipient varchar(320) NOT NULL,
  locale char(2) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  challenge_id uuid,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  sent_at timestamptz,
  claimed_until timestamptz,
  CONSTRAINT email_outbox_kind_check CHECK (kind IN ('verify_email_code', 'login_code', 'password_reset_code', 'register_attempt_notice', 'code_expired_notice')),
  CONSTRAINT email_outbox_status_check CHECK (status IN ('pending', 'published', 'sent', 'failed'))
);

CREATE INDEX email_outbox_status_created_at_idx ON email_outbox (status, created_at);
CREATE INDEX email_outbox_recipient_created_at_idx ON email_outbox (recipient, created_at);
