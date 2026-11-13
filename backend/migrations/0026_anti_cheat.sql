-- Anti-cheat: account states (banned), admin flag, session timing inputs,
-- landing log, event log and fraud cases (one open case per user).
ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'banned', 'deleted'));
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

ALTER TABLE fishing_sessions ADD COLUMN client_id uuid;
ALTER TABLE fishing_sessions ADD COLUMN strength_active boolean NOT NULL DEFAULT false;
CREATE INDEX fishing_sessions_user_created_at_idx ON fishing_sessions (user_id, created_at DESC);

CREATE TABLE fishing_lands (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES fishing_sessions(id) ON DELETE CASCADE,
  mode varchar(16) NOT NULL,
  fish_id varchar(120) NOT NULL,
  landed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fishing_lands_user_landed_at_idx ON fishing_lands (user_id, landed_at);

CREATE TABLE anti_cheat_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(32) NOT NULL,
  session_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anti_cheat_events_type_check CHECK (type IN ('cast_too_fast', 'land_too_fast'))
);
CREATE INDEX anti_cheat_events_user_created_at_idx ON anti_cheat_events (user_id, created_at);

CREATE TABLE fraud_cases (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL,
  evidence jsonb NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES users(id),
  note text,
  CONSTRAINT fraud_cases_status_check CHECK (status IN ('flagged', 'suspended', 'banned', 'restored', 'dismissed'))
);
CREATE UNIQUE INDEX fraud_cases_one_open ON fraud_cases (user_id) WHERE status IN ('flagged', 'suspended');
