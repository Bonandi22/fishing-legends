-- Scope the idempotency identity to the operation, matching the service's replay
-- lookup (userId, operation, idempotencyKey). Without this a client that reuses one
-- Idempotency-Key across two economy endpoints hits a 23505 on the second INSERT
-- instead of the second operation running fresh.
ALTER TABLE game_state_operations DROP CONSTRAINT game_state_operations_idempotency_pk;
ALTER TABLE game_state_operations ADD CONSTRAINT game_state_operations_idempotency_pk
  PRIMARY KEY (user_id, idempotency_key, operation);
