import { randomUUID } from 'node:crypto';
import type { createCatalogService } from '../catalog/service.js';
import type { PlayerRepository } from '../players/types.js';

type FishingSession = {
  id: string;
  userId: string;
  locationId: string;
  rulesetVersion: string;
  idempotencyKey: string;
  status: 'open' | 'completed';
  result?: {
    fishId: string;
    weight: number;
    xp: number;
  };
};

export function createFishingService(
  catalog: ReturnType<typeof createCatalogService>,
  players: PlayerRepository,
) {
  const sessions = new Map<string, FishingSession>();
  const idempotentSessions = new Map<string, FishingSession>();

  return {
    async start(userId: string, locationId: string, idempotencyKey: string) {
      const profile = await players.getProfile(userId);
      const location = catalog.findLocation(locationId);
      if (!profile || !location) throw new Error('INVALID_FISHING_REQUEST');
      if (profile.level < location.requiredLevel) throw new Error('LOCATION_LOCKED');

      const existing = idempotentSessions.get(`${userId}:${idempotencyKey}`);
      if (existing) return existing;

      const session: FishingSession = {
        id: randomUUID(),
        userId,
        locationId,
        rulesetVersion: catalog.getPublicCatalog().version,
        idempotencyKey,
        status: 'open',
      };
      sessions.set(session.id, session);
      idempotentSessions.set(`${userId}:${idempotencyKey}`, session);
      return session;
    },

    async complete(userId: string, sessionId: string) {
      const session = sessions.get(sessionId);
      if (!session || session.userId !== userId) throw new Error('INVALID_FISHING_SESSION');
      if (session.status === 'completed' && session.result) return { session, result: session.result };

      const location = catalog.findLocation(session.locationId);
      if (!location) throw new Error('INVALID_FISHING_SESSION');
      const available = location.fishIds
        .map(id => catalog.findFish(id))
        .filter((fish): fish is NonNullable<typeof fish> => Boolean(fish));
      if (available.length === 0) throw new Error('INVALID_FISHING_SESSION');

      const fish = available[Math.floor(Math.random() * available.length)];
      const weight = Math.round((fish.minWeight + Math.random() * (fish.maxWeight - fish.minWeight)) * 100) / 100;
      const result = { fishId: fish.id, weight, xp: fish.xp };
      session.status = 'completed';
      session.result = result;
      return { session, result };
    },
  };
}
