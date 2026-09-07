import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { saveSchema } from '../../../src/game/persistence.js';
import type { createMemoryGameStateService } from './memoryService.js';
import type { createPgGameStateService } from './pgRepository.js';

type GameStateService =
  | ReturnType<typeof createMemoryGameStateService>
  | ReturnType<typeof createPgGameStateService>;

const putBody = z.object({ state: saveSchema });
const STATE_BODY_LIMIT = 2 * 1024 * 1024;

export function registerGameStateRoutes(app: FastifyInstance, service: GameStateService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/me/state', {
    schema: { tags: ['gamestate'], summary: "The account's saved game state" },
    preHandler: app.requireAuth,
  }, async request => {
    const entry = await service.get(request.userId);
    return { state: entry?.state ?? null, updatedAt: entry?.updatedAt ?? null };
  });

  r.put('/api/v1/me/state', {
    schema: { tags: ['gamestate'], summary: 'Replace the account game state (last write wins)', body: putBody },
    bodyLimit: STATE_BODY_LIMIT,
    preHandler: app.requireAuth,
  }, async (request, reply) => {
    await service.put(request.userId, request.body.state);
    return reply.status(204).send();
  });
}
