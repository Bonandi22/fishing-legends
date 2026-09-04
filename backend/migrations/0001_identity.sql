CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email varchar(320) NOT NULL,
  password_hash text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'deleted'))
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username varchar(20) NOT NULL,
  country char(2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_username_unique UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_refresh_token_hash_idx ON sessions(refresh_token_hash);
