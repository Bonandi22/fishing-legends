import { and, eq, lte, gte } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { seasons } from '../db/schema.js';

export function createPgSeasonsService(db: Database) {
  return {
    async current() {
      const now = new Date();
      const rows = await db.select().from(seasons).where(and(
        eq(seasons.status, 'active'),
        lte(seasons.startsAt, now),
        gte(seasons.endsAt, now),
      )).limit(1);
      const season = rows[0];
      return season ? {
        season: {
          id: season.id,
          seasonKey: season.seasonKey,
          name: season.name,
          status: season.status as 'scheduled' | 'active' | 'closed',
          startsAt: season.startsAt.toISOString(),
          endsAt: season.endsAt.toISOString(),
          rulesetVersion: season.rulesetVersion,
          minimumLevel: season.minimumLevel,
        },
      } : { season: null };
    },
  };
}
