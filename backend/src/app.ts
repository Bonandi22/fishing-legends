import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import cookie from '@fastify/cookie';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppConfig } from './config/env.js';
import { registerErrorHandling } from './http/errors.js';
import { registerSystemRoutes } from './http/routes/system.js';
import { createAuthService } from './auth/service.js';
import { createRequireAuth } from './auth/middleware.js';
import { createMemoryAuthRepository } from './auth/memoryRepository.js';
import { registerAuthRoutes } from './auth/routes.js';
import { createDatabase } from './db/client.js';
import { createPgAuthRepository } from './auth/pgRepository.js';
import { registerPlayerRoutes } from './players/routes.js';
import { createMemoryPlayerRepository } from './players/memoryRepository.js';
import { createPgPlayerRepository } from './players/pgRepository.js';
import { createCatalogService } from './catalog/service.js';
import { registerCatalogRoutes } from './catalog/routes.js';
import { createFishingService } from './fishing/service.js';
import { registerFishingRoutes } from './fishing/routes.js';
import { createMemoryEconomyService } from './economy/service.js';
import { registerEconomyRoutes } from './economy/routes.js';
import { createPgEconomyService } from './economy/pgRepository.js';
import { createMemoryInventoryService } from './inventory/service.js';
import { registerInventoryRoutes } from './inventory/routes.js';
import { createPgInventoryService } from './inventory/pgRepository.js';
import { createPgFishingService } from './fishing/pgService.js';
import { registerMigrationRoutes } from './migration/routes.js';
import { createMemoryMigrationService } from './migration/memoryRepository.js';
import { createPgMigrationService } from './migration/pgRepository.js';
import { registerLeaderboardRoutes } from './leaderboard/routes.js';
import { createMemoryLeaderboardService } from './leaderboard/service.js';
import { createPgLeaderboardService } from './leaderboard/pgRepository.js';
import { registerRewardsRoutes } from './rewards/routes.js';
import { createMemoryRewardsService } from './rewards/memoryRepository.js';
import { createPgRewardsService } from './rewards/pgRepository.js';
import { registerGameStateRoutes } from './gamestate/routes.js';
import { createMemoryGameStateService } from './gamestate/memoryService.js';
import { createPgGameStateService } from './gamestate/pgRepository.js';
import { registerSecurityHooks } from './security/http.js';
import { registerSeasonsRoutes } from './seasons/routes.js';
import { createMemorySeasonsService } from './seasons/service.js';
import { createPgSeasonsService } from './seasons/pgRepository.js';

export type AppDependencies = {
  config: AppConfig;
};

export async function createApp({ config }: AppDependencies): Promise<FastifyInstance> {
  if (config.environment === 'production' && !config.databaseUrl) {
    throw new Error('DATABASE_URL is required in production');
  }

  const serverOptions: FastifyServerOptions = {
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy,
    // Every current endpoint takes a small JSON body; the local-save migration
    // routes raise their own limit.
    bodyLimit: 128 * 1024,
  };
  const app = Fastify(serverOptions);
  await app.register(cookie);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: { title: 'Deep Blue Lure API', version: '0.1.0' },
      tags: [
        { name: 'system' }, { name: 'auth' }, { name: 'players' }, { name: 'catalog' },
        { name: 'fishing' }, { name: 'economy' }, { name: 'inventory' },
        { name: 'migration' }, { name: 'leaderboard' }, { name: 'rewards' }, { name: 'seasons' },
        { name: 'gamestate' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  registerSecurityHooks(app, {
    allowedOrigins: config.corsOrigins ?? [],
    rateLimitMax: config.rateLimitMax ?? 120,
    rateLimitWindowMs: config.rateLimitWindowMs ?? 60_000,
  });

  registerErrorHandling(app);
  registerSystemRoutes(app, {
    databaseConfigured: Boolean(config.databaseUrl),
  });
  const database = config.databaseUrl ? createDatabase(config.databaseUrl) : null;
  const authRepository = database ? createPgAuthRepository(database) : createMemoryAuthRepository();
  const authService = createAuthService(authRepository, {
    accessTokenSecret: config.accessTokenSecret,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
  });
  const cookieCfg = {
    secure: config.cookieSecure,
    domain: config.cookieDomain,
    accessTtlSeconds: config.accessTokenTtlSeconds,
    refreshTtlSeconds: config.refreshTokenTtlSeconds,
  };
  app.decorateRequest('userId', '');
  app.decorate('requireAuth', createRequireAuth(authService));
  const playerRepository = database
    ? createPgPlayerRepository(database)
    : createMemoryPlayerRepository(authRepository);
  const migrationService = database ? createPgMigrationService(database) : createMemoryMigrationService();
  const leaderboardService = database
    ? createPgLeaderboardService(database)
    : createMemoryLeaderboardService(playerRepository);
  const rewardsService = database ? createPgRewardsService(database) : createMemoryRewardsService();
  const seasonsService = database ? createPgSeasonsService(database) : createMemorySeasonsService();
  const gameStateService = database ? createPgGameStateService(database) : createMemoryGameStateService();
  void registerAuthRoutes(app, authService, cookieCfg);
  registerPlayerRoutes(app, playerRepository);
  registerMigrationRoutes(app, migrationService);
  registerLeaderboardRoutes(app, leaderboardService);
  registerRewardsRoutes(app, rewardsService);
  registerSeasonsRoutes(app, seasonsService);
  registerGameStateRoutes(app, gameStateService);
  const catalogService = createCatalogService();
  registerCatalogRoutes(app, catalogService);
  const economyService = database ? createPgEconomyService(database) : createMemoryEconomyService();
  registerEconomyRoutes(app, economyService);
  const inventoryService = database
    ? createPgInventoryService(database, catalogService, economyService)
    : createMemoryInventoryService(catalogService, economyService);
  registerInventoryRoutes(app, inventoryService);
  const fishingService = database
    ? createPgFishingService(database, catalogService, playerRepository)
    : createFishingService(catalogService, playerRepository, input => Promise.resolve(inventoryService.addCatch(input)));
  registerFishingRoutes(app, fishingService);

  return app;
}
