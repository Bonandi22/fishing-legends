CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  replaced_by uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  replaced_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS refresh_tokens_session_id_idx ON refresh_tokens(session_id);

-- Carry existing sessions forward as their first token in the chain.
INSERT INTO refresh_tokens (id, session_id, token_hash, created_at, revoked_at)
SELECT gen_random_uuid(), id, refresh_token_hash, created_at, revoked_at
FROM sessions
WHERE refresh_token_hash IS NOT NULL;

ALTER TABLE sessions DROP COLUMN IF EXISTS refresh_token_hash;
