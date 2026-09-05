CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY,
  season_key varchar(64) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'scheduled',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  ruleset_version varchar(64) NOT NULL,
  minimum_level integer NOT NULL DEFAULT 1 CHECK (minimum_level >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seasons_status_check CHECK (status IN ('scheduled', 'active', 'closed')),
  CONSTRAINT seasons_dates_check CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS seasons_active_unique ON seasons(status) WHERE status = 'active';
