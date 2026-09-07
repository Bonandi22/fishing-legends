import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8090),
  DATABASE_URL: z.string().min(1).optional(),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  TRUST_PROXY: z.string().default('false'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  COOKIE_DOMAIN: z.string().trim().optional(),
});

export type TrustProxy = boolean | string[];

export type AppConfig = {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl?: string;
  accessTokenSecret: Uint8Array;
  logLevel: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  corsOrigins: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
  trustProxy: TrustProxy;
  cookieSecure: boolean;
  cookieDomain?: string;
};

/**
 * How Fastify should treat `X-Forwarded-For`. Defaults to `false` — the header is
 * ignored and `request.ip` is the socket address, so a client cannot spoof its
 * identity to escape rate limiting. Behind a known proxy/LB set this to `true`
 * or, better, to a comma-separated list of the proxy address(es)/CIDRs to trust.
 */
export function parseTrustProxy(value: string): TrustProxy {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'false') return false;
  if (trimmed.toLowerCase() === 'true') return true;
  return trimmed.split(',').map(entry => entry.trim()).filter(Boolean);
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(source);

  return {
    environment: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    accessTokenSecret: new Uint8Array(Buffer.from(parsed.ACCESS_TOKEN_SECRET)),
    logLevel: parsed.LOG_LEVEL,
    accessTokenTtlSeconds: parsed.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: parsed.REFRESH_TOKEN_TTL_SECONDS,
    corsOrigins: parsed.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean),
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    trustProxy: parseTrustProxy(parsed.TRUST_PROXY),
    cookieSecure: parsed.COOKIE_SECURE === 'true',
    cookieDomain: parsed.COOKIE_DOMAIN && parsed.COOKIE_DOMAIN.length > 0 ? parsed.COOKIE_DOMAIN : undefined,
  };
}
