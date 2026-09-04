import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import { registerErrorHandling } from './http/errors.js';
import { registerSystemRoutes } from './http/routes/system.js';

export type AppDependencies = {
  config: AppConfig;
};

export function createApp({ config }: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });

  registerErrorHandling(app);
  registerSystemRoutes(app, {
    databaseConfigured: Boolean(config.databaseUrl),
  });

  return app;
}
