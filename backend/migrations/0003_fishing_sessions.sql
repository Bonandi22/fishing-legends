CREATE TABLE IF NOT EXISTS fishing_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id varchar(120) NOT NULL,
  ruleset_version varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'open',
  idempotency_key varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT fishing_sessions_status_check CHECK (status IN ('open', 'completed', 'expired')),
  CONSTRAINT fishing_sessions_idempotency_unique UNIQUE (user_id, idempotency_key)
);
