/**
 * Validate an `Idempotency-Key` header value. The contract is shared by every
 * value-granting endpoint (auth, inventory, economy, game-state economy,
 * migration, fishing): a string of 16–128 chars, else `INVALID_IDEMPOTENCY_KEY`
 * (mapped to HTTP 400 in `http/errors.ts`).
 */
export function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.length < 16 || value.length > 128) {
    throw new Error('INVALID_IDEMPOTENCY_KEY');
  }
  return value;
}
