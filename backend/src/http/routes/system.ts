import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export type SystemRouteOptions = {
  databaseConfigured: boolean;
};

export function registerSystemRoutes(
  app: FastifyInstance,
  options: SystemRouteOptions,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/health', {
    schema: {
      tags: ['system'],
      summary: 'Process liveness (no database required)',
      response: { 200: z.object({ status: z.literal('ok'), service: z.string() }) },
    },
  }, async () => ({ status: 'ok' as const, service: 'deep-blue-lure-api' }));

  r.get('/ready', {
    schema: {
      tags: ['system'],
      summary: 'Dependency readiness',
      response: {
        200: z.object({ status: z.literal('ready'), checks: z.object({ database: z.string() }) }),
        503: z.object({ status: z.literal('not_ready'), checks: z.object({ database: z.string() }) }),
      },
    },
  }, async (_request, reply) => {
    if (!options.databaseConfigured) {
      return reply.status(503).send({ status: 'not_ready' as const, checks: { database: 'not_configured' } });
    }
    return { status: 'ready' as const, checks: { database: 'configured' } };
  });

  r.get('/openapi.json', {
    schema: { tags: ['system'], summary: 'OpenAPI contract for this API', hide: true },
  }, async () => app.swagger());
}
