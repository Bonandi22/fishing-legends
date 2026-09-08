import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { gameStateOperations } from '../db/schema.js';

/** A `db` or a transaction handle — both expose `.select()`. */
type Selector = Pick<Database, 'select'>;

/**
 * The recorded result of a prior `(userId, operation, idempotencyKey)` write to
 * `game_state_operations`, or `null`. Shared by every server-authoritative op
 * (economy, reward, fishing land) as the idempotency-replay read.
 */
export async function readRecordedResult<T>(
  tx: Selector,
  userId: string,
  operation: string,
  idempotencyKey: string,
): Promise<T | null> {
  const found = await tx
    .select({ result: gameStateOperations.result })
    .from(gameStateOperations)
    .where(and(
      eq(gameStateOperations.userId, userId),
      eq(gameStateOperations.operation, operation),
      eq(gameStateOperations.idempotencyKey, idempotencyKey),
    ))
    .limit(1);
  return found[0] ? (found[0].result as T) : null;
}
