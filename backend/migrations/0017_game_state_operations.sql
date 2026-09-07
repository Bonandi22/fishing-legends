CREATE TABLE IF NOT EXISTS game_state_operations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_state_operations_idempotency_pk PRIMARY KEY (user_id, idempotency_key)
);
