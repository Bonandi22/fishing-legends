import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import { registerErrorHandling } from './http/errors.js';
import { registerSystemRoutes } from './http/routes/system.js';
import { createAuthService } from './auth/service.js';
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
import { registerSecurityHooks } from './security/http.js';
import { registerSeasonsRoutes } from './seasons/routes.js';
import { createMemorySeasonsService } from './seasons/service.js';
import { createPgSeasonsService } from './seasons/pgRepository.js';

export type AppDependencies = {
  config: AppConfig;
};

export function createApp({ config }: AppDependencies): FastifyInstance {
  if (config.environment === 'production' && !config.databaseUrl) {
    throw new Error('DATABASE_URL is required in production');
  }

  const app = Fastify({ logger: { level: config.logLevel } });
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
  const playerRepository = database
    ? createPgPlayerRepository(database)
    : createMemoryPlayerRepository(authRepository);
  const migrationService = database ? createPgMigrationService(database) : createMemoryMigrationService();
  const leaderboardService = database
    ? createPgLeaderboardService(database)
    : createMemoryLeaderboardService(playerRepository);
  const rewardsService = database ? createPgRewardsService(database) : createMemoryRewardsService();
  const seasonsService = database ? createPgSeasonsService(database) : createMemorySeasonsService();
  void registerAuthRoutes(app, authService);
  registerPlayerRoutes(app, authService, playerRepository);
  registerMigrationRoutes(app, authService, migrationService);
  registerLeaderboardRoutes(app, authService, leaderboardService);
  registerRewardsRoutes(app, authService, rewardsService);
  registerSeasonsRoutes(app, authService, seasonsService);
  const catalogService = createCatalogService();
  registerCatalogRoutes(app, catalogService);
  const economyService = database ? createPgEconomyService(database) : createMemoryEconomyService();
  registerEconomyRoutes(app, authService, economyService);
  const inventoryService = database
    ? createPgInventoryService(database, catalogService, economyService)
    : createMemoryInventoryService(catalogService, economyService);
  registerInventoryRoutes(app, authService, inventoryService);
  const fishingService = database
    ? createPgFishingService(database, catalogService, playerRepository)
    : createFishingService(catalogService, playerRepository, input => Promise.resolve(inventoryService.addCatch(input)));
  registerFishingRoutes(app, authService, fishingService);

  return app;
}
