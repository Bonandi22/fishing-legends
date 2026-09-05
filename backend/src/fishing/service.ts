import { randomUUID } from 'node:crypto';
import type { createCatalogService } from '../catalog/service.js';
import type { PlayerRepository } from '../players/types.js';
import { rollCatch } from './roll.js';

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
  onCatch?: (input: { userId: string; fishId: string; locationId: string; weight: number; xp: number }) => Promise<unknown>,
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

      const profile = await players.getProfile(userId);
      const { fish, weight } = rollCatch(available, profile?.level ?? 1);
      const result = { fishId: fish.id, weight, xp: fish.xp };
      if (onCatch) await onCatch({ userId, fishId: fish.id, locationId: session.locationId, weight, xp: fish.xp });
      session.status = 'completed';
      session.result = result;
      return { session, result };
    },
  };
}
