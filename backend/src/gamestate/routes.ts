import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { saveSchema } from '../../../src/game/persistence.js';
import type { createMemoryGameStateService } from './memoryService.js';
import type { createPgGameStateService } from './pgRepository.js';

type GameStateService =
  | ReturnType<typeof createMemoryGameStateService>
  | ReturnType<typeof createPgGameStateService>;

const bootstrapBody = z.object({
  state: saveSchema,
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

  r.post('/api/v1/me/state/bootstrap', {
    schema: {
      tags: ['gamestate'],
      summary: 'Create the account\'s initial game state (once only; adopts anonymous local progress)',
      body: bootstrapBody,
    },
    bodyLimit: STATE_BODY_LIMIT,
    preHandler: app.requireAuth,
  }, async request => {
    return service.bootstrap(request.userId, request.body.state);
  });
}
