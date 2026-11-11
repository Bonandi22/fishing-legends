// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { loadConfig, parseTrustProxy } from './env.js';

describe('parseTrustProxy', () => {
  it('defaults to not trusting any proxy', () => {
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('FALSE')).toBe(false);
  });

  it('accepts an explicit boolean true', () => {
    expect(parseTrustProxy('true')).toBe(true);
  });

  it('accepts a comma-separated list of trusted addresses/subnets', () => {
    expect(parseTrustProxy('10.0.0.0/8, 192.168.0.0/16')).toEqual(['10.0.0.0/8', '192.168.0.0/16']);
  });
});

const base = {
  ACCESS_TOKEN_SECRET: 'x'.repeat(32),
};

describe('loadConfig rate limiting', () => {
  it('defaults the auth bucket to 20 attempts per 5 minutes', () => {
    const config = loadConfig({ ...base } as NodeJS.ProcessEnv);
    expect(config.authRateLimitMax).toBe(20);
    expect(config.authRateLimitWindowMs).toBe(300_000);
  });

  it('reads AUTH_RATE_LIMIT_MAX and AUTH_RATE_LIMIT_WINDOW_MS', () => {
    const config = loadConfig({
      ...base, AUTH_RATE_LIMIT_MAX: '5', AUTH_RATE_LIMIT_WINDOW_MS: '60000',
    } as NodeJS.ProcessEnv);
    expect(config.authRateLimitMax).toBe(5);
    expect(config.authRateLimitWindowMs).toBe(60_000);
  });
});

describe('loadConfig cookie settings', () => {
  it('defaults cookieSecure to true and leaves cookieDomain undefined', () => {
    const config = loadConfig({ ...base } as NodeJS.ProcessEnv);
    expect(config.cookieSecure).toBe(true);
    expect(config.cookieDomain).toBeUndefined();
  });

  it('reads COOKIE_SECURE=false and COOKIE_DOMAIN', () => {
    const config = loadConfig({ ...base, COOKIE_SECURE: 'false', COOKIE_DOMAIN: 'example.test' } as NodeJS.ProcessEnv);
    expect(config.cookieSecure).toBe(false);
    expect(config.cookieDomain).toBe('example.test');
  });
});

describe('loadConfig auth codes and email', () => {
  it('defaults auth code settings', () => {
    const config = loadConfig({ ...base } as NodeJS.ProcessEnv);
    expect(config.authCodes.ttlSeconds).toBe(1800);
    expect(config.authCodes.maxAttempts).toBe(5);
    expect(config.authCodes.resendCooldownSeconds).toBe(60);
    expect(config.authCodes.secret.length).toBeGreaterThanOrEqual(32);
  });

  it('rejects AUTH_CODE_SECRET shorter than 32 chars', () => {
    expect(() => loadConfig({ ...base, AUTH_CODE_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('requires AUTH_CODE_SECRET when DATABASE_URL is set', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: 'postgres://u:p@h/db' } as NodeJS.ProcessEnv)).toThrow();
  });

  it('requires RABBITMQ_URL and SMTP_HOST in production', () => {
    const prod = { ...base, NODE_ENV: 'production', AUTH_CODE_SECRET: 'y'.repeat(32) };
    expect(() => loadConfig({ ...prod, SMTP_HOST: 'smtp.example.test' } as NodeJS.ProcessEnv)).toThrow();
    expect(() => loadConfig({ ...prod, RABBITMQ_URL: 'amqp://h' } as NodeJS.ProcessEnv)).toThrow();
    const ok = loadConfig({ ...prod, RABBITMQ_URL: 'amqp://h', SMTP_HOST: 'smtp.example.test' } as NodeJS.ProcessEnv);
    expect(ok.email.rabbitmqUrl).toBe('amqp://h');
  });

  it('defaults smtp to local Mailpit', () => {
    const config = loadConfig({ ...base } as NodeJS.ProcessEnv);
    expect(config.email.smtp).toMatchObject({ host: 'localhost', port: 1025, secure: false });
    expect(config.email.from).toBe('Deep Blue Lure <no-reply@localhost>');
  });
});
