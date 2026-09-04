import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { wallets } from '../db/schema.js';

export function createPgEconomyService(db: Database) {
  return {
    async getBalance(userId: string) {
      const rows = await db.select({ balance: wallets.balance })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1);
      return { balance: rows[0]?.balance ?? 0 };
    },
  };
}
