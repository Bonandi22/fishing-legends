CREATE TABLE IF NOT EXISTS local_save_migrations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_version integer NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT local_save_migrations_user_unique UNIQUE (user_id)
);
