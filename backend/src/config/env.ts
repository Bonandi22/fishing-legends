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
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(300_000),
  TRUST_PROXY: z.string().default('false'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  COOKIE_DOMAIN: z.string().trim().optional(),
  RABBITMQ_URL: z.string().trim().min(1).optional(),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().trim().min(1).default('Fishing Legends <no-reply@localhost>'),
  AUTH_CODE_SECRET: z.string().min(32).optional(),
  AUTH_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  AUTH_CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_CODE_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
});

// Fixed dev-only default so memory mode / tests run without configuration.
// Never used when DATABASE_URL is set or in production.
const DEV_AUTH_CODE_SECRET = 'dev-only-auth-code-secret-not-for-production-use';

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
  authRateLimitMax: number;
  authRateLimitWindowMs: number;
  trustProxy: TrustProxy;
  cookieSecure: boolean;
  cookieDomain?: string;
  email: {
    rabbitmqUrl?: string;
    smtp: { host: string; port: number; secure: boolean; user?: string; password?: string };
    from: string;
  };
  authCodes: {
    secret: Uint8Array;
    ttlSeconds: number;
    maxAttempts: number;
    resendCooldownSeconds: number;
  };
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

  if (parsed.DATABASE_URL && !parsed.AUTH_CODE_SECRET) {
    throw new Error('AUTH_CODE_SECRET is required when DATABASE_URL is set');
  }
  if (parsed.NODE_ENV === 'production') {
    if (!parsed.RABBITMQ_URL) throw new Error('RABBITMQ_URL is required in production');
    if (!parsed.SMTP_HOST) throw new Error('SMTP_HOST is required in production');
  }

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
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
    authRateLimitWindowMs: parsed.AUTH_RATE_LIMIT_WINDOW_MS,
    trustProxy: parseTrustProxy(parsed.TRUST_PROXY),
    cookieSecure: parsed.COOKIE_SECURE === 'true',
    cookieDomain: parsed.COOKIE_DOMAIN && parsed.COOKIE_DOMAIN.length > 0 ? parsed.COOKIE_DOMAIN : undefined,
    email: {
      rabbitmqUrl: parsed.RABBITMQ_URL,
      smtp: {
        host: parsed.SMTP_HOST ?? 'localhost',
        port: parsed.SMTP_PORT,
        secure: parsed.SMTP_SECURE === 'true',
        user: parsed.SMTP_USER || undefined,
        password: parsed.SMTP_PASSWORD || undefined,
      },
      from: parsed.EMAIL_FROM,
    },
    authCodes: {
      secret: new Uint8Array(Buffer.from(parsed.AUTH_CODE_SECRET ?? DEV_AUTH_CODE_SECRET)),
      ttlSeconds: parsed.AUTH_CODE_TTL_SECONDS,
      maxAttempts: parsed.AUTH_CODE_MAX_ATTEMPTS,
      resendCooldownSeconds: parsed.AUTH_CODE_RESEND_COOLDOWN_SECONDS,
    },
  };
}
