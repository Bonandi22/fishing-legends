import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { saveSchema } from '../../../src/game/persistence.js';
import type { createMemoryGameStateService } from './memoryService.js';
import type { createPgGameStateService } from './pgRepository.js';

type GameStateService =
  | ReturnType<typeof createMemoryGameStateService>
  | ReturnType<typeof createPgGameStateService>;

const putBody = z.object({
  state: saveSchema,
  baseVersion: z.number().int().nonnegative().nullable(),
});
const STATE_BODY_LIMIT = 2 * 1024 * 1024;

export function registerGameStateRoutes(app: FastifyInstance, service: GameStateService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/me/state', {
    schema: { tags: ['gamestate'], summary: "The account's saved game state" },
    preHandler: app.requireAuth,
  }, async request => {
    const entry = await service.get(request.userId);
    return { state: entry?.state ?? null, updatedAt: entry?.updatedAt ?? null, version: entry?.version ?? null };
  });

  r.put('/api/v1/me/state', {
    schema: { tags: ['gamestate'], summary: 'Replace the account game state (optimistic concurrency on baseVersion)', body: putBody },
    bodyLimit: STATE_BODY_LIMIT,
    preHandler: app.requireAuth,
  }, async request => {
    return service.put(request.userId, request.body.state, request.body.baseVersion);
  });
}
