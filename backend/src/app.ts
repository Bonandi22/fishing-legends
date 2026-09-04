import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import { registerErrorHandling } from './http/errors.js';
import { registerSystemRoutes } from './http/routes/system.js';
import { createAuthService } from './auth/service.js';
import { createMemoryAuthRepository } from './auth/memoryRepository.js';
import { registerAuthRoutes } from './auth/routes.js';
import { createDatabase } from './db/client.js';
import { createPgAuthRepository } from './auth/pgRepository.js';

export type AppDependencies = {
  config: AppConfig;
};

export function createApp({ config }: AppDependencies): FastifyInstance {
  if (config.environment === 'production' && !config.databaseUrl) {
    throw new Error('DATABASE_URL is required in production');
  }

  const app = Fastify({ logger: { level: config.logLevel } });

  registerErrorHandling(app);
  registerSystemRoutes(app, {
    databaseConfigured: Boolean(config.databaseUrl),
  });
  const authRepository = config.databaseUrl
    ? createPgAuthRepository(createDatabase(config.databaseUrl))
    : createMemoryAuthRepository();
  void registerAuthRoutes(app, createAuthService(authRepository, {
    accessTokenSecret: config.accessTokenSecret,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
  }));

  return app;
}
