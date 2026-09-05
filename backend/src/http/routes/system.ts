import type { FastifyInstance } from 'fastify';

export type SystemRouteOptions = {
  databaseConfigured: boolean;
};

export function registerSystemRoutes(
  app: FastifyInstance,
  options: SystemRouteOptions,
): void {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'deep-blue-lure-api',
  }));

  app.get('/ready', async (_request, reply) => {
    if (!options.databaseConfigured) {
      return reply.status(503).send({
        status: 'not_ready',
        checks: { database: 'not_configured' },
      });
    }

    return {
      status: 'ready',
      checks: { database: 'configured' },
    };
  });

  app.get('/openapi.json', async () => ({
    openapi: '3.0.3',
    info: {
      title: 'Deep Blue Lure API',
      version: '0.1.0',
    },
    paths: {
      '/health': { get: { responses: { '200': { description: 'Service is alive' } } } },
      '/ready': { get: { responses: { '200': { description: 'Service is ready' } } } },
    },
  }));
}
