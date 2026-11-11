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
import { createMemoryFishingService } from './fishing/service.js';
import { createPgFishingService } from './fishing/pgRepository.js';
import { registerFishingRoutes } from './fishing/routes.js';
import { registerMigrationRoutes } from './migration/routes.js';
import { createMemoryMigrationService } from './migration/memoryRepository.js';
import { createPgMigrationService } from './migration/pgRepository.js';
import { registerLeaderboardRoutes } from './leaderboard/routes.js';
import { createMemoryLeaderboardService } from './leaderboard/service.js';
import { createPgLeaderboardService } from './leaderboard/pgRepository.js';
import { registerGameStateRoutes } from './gamestate/routes.js';
import { createMemoryGameStateService, createMemoryGameStateStore } from './gamestate/memoryService.js';
import { createPgGameStateService } from './gamestate/pgRepository.js';
import { registerGameStateEconomyRoutes } from './gamestate/economyRoutes.js';
import { createMemoryGameStateEconomyService, createPgGameStateEconomyService } from './gamestate/economyService.js';
import { registerSecurityHooks } from './security/http.js';
import { registerSeasonsRoutes } from './seasons/routes.js';
import { createMemorySeasonsService } from './seasons/service.js';
import { createPgSeasonsService } from './seasons/pgRepository.js';
import { createPgOutbox } from './email/pgOutbox.js';
import { createMemoryOutbox, type MemoryOutbox } from './email/outbox.js';
import { createAmqpPublisher } from './email/amqp.js';
import { createOutboxRelay } from './email/relay.js';
import { createChallengeService } from './auth/challenges.js';
import type { AuthRepository } from './auth/types.js';

export type AppDependencies = {
  config: AppConfig;
};

/** Dev/test only: the in-memory collaborators behind an app built without DATABASE_URL. */
export type MemoryHandles = { outbox: MemoryOutbox; authRepository: AuthRepository };
const memoryHandles = new WeakMap<FastifyInstance, MemoryHandles>();

/** Returns the in-memory outbox and auth repository, or undefined for a PostgreSQL-backed app. */
export function memoryHandlesOf(app: FastifyInstance): MemoryHandles | undefined {
  return memoryHandles.get(app);
}

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
        { name: 'fishing' }, { name: 'migration' }, { name: 'leaderboard' }, { name: 'seasons' },
        { name: 'gamestate' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  registerSecurityHooks(app, {
    allowedOrigins: config.corsOrigins ?? [],
    rateLimitMax: config.rateLimitMax ?? 120,
    rateLimitWindowMs: config.rateLimitWindowMs ?? 60_000,
    authRateLimitMax: config.authRateLimitMax ?? 20,
    authRateLimitWindowMs: config.authRateLimitWindowMs ?? 300_000,
  });

  registerErrorHandling(app);
  registerSystemRoutes(app, {
    databaseConfigured: Boolean(config.databaseUrl),
  });
  const database = config.databaseUrl ? createDatabase(config.databaseUrl) : null;
  const memoryOutbox = database ? null : createMemoryOutbox();
  const authRepository = database
    ? createPgAuthRepository(database, createPgOutbox(database))
    : createMemoryAuthRepository(memoryOutbox!);
  if (memoryOutbox) memoryHandles.set(app, { outbox: memoryOutbox, authRepository });
  const challengeService = createChallengeService(authRepository, config.authCodes);
  const authService = createAuthService(authRepository, {
    accessTokenSecret: config.accessTokenSecret,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
  }, { challenges: challengeService });
  const cookieCfg = {
    secure: config.cookieSecure,
    domain: config.cookieDomain,
    accessTtlSeconds: config.accessTokenTtlSeconds,
    refreshTtlSeconds: config.refreshTokenTtlSeconds,
  };
  app.decorateRequest('userId', '');
  app.decorate('requireAuth', createRequireAuth(authService));
  const memoryGameStateStore = database ? undefined : createMemoryGameStateStore();
  const playerRepository = database
    ? createPgPlayerRepository(database)
    : createMemoryPlayerRepository(authRepository, memoryGameStateStore!);
  const migrationService = database ? createPgMigrationService(database) : createMemoryMigrationService();
  const leaderboardService = database
    ? createPgLeaderboardService(database)
    : createMemoryLeaderboardService(authRepository, memoryGameStateStore!);
  const seasonsService = database ? createPgSeasonsService(database) : createMemorySeasonsService();
  const gameStateService = database
    ? createPgGameStateService(database)
    : createMemoryGameStateService(memoryGameStateStore);
  const gameStateEconomyService = database
    ? createPgGameStateEconomyService(database)
    : createMemoryGameStateEconomyService(memoryGameStateStore!);
  void registerAuthRoutes(app, authService, cookieCfg);
  registerPlayerRoutes(app, playerRepository);
  registerMigrationRoutes(app, migrationService);
  registerLeaderboardRoutes(app, leaderboardService);
  registerSeasonsRoutes(app, seasonsService);
  registerGameStateRoutes(app, gameStateService);
  registerGameStateEconomyRoutes(app, gameStateEconomyService);
  const catalogService = createCatalogService();
  registerCatalogRoutes(app, catalogService);
  const fishingService = database
    ? createPgFishingService(database)
    : createMemoryFishingService(memoryGameStateStore!);
  registerFishingRoutes(app, fishingService);

  if (database && config.email?.rabbitmqUrl) {
    const rabbitmqUrl = config.email.rabbitmqUrl;
    const relay = createOutboxRelay({
      outbox: createPgOutbox(database),
      connect: () => createAmqpPublisher(rabbitmqUrl),
      log: app.log,
    });
    app.addHook('onReady', async () => relay.start());
    app.addHook('onClose', async () => relay.stop());
  }

  return app;
}
