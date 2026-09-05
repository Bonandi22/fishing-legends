// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';

const baseConfig: AppConfig = {
  environment: 'test',
  host: '127.0.0.1',
  port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [],
  rateLimitMax: 2,
  rateLimitWindowMs: 60_000,
  trustProxy: false,
};

const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => {
  await Promise.all([...apps].map(app => app.close()));
  apps.clear();
});

describe('rate limiting', () => {
  it('cannot be bypassed by spoofing X-Forwarded-For when no proxy is trusted', async () => {
    const app = createApp({ config: baseConfig });
    apps.add(app);

    const first = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '1.1.1.1' } });
    const second = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '2.2.2.2' } });
    const third = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '3.3.3.3' } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe('RATE_LIMITED');
  });

  it('separates buckets by forwarded client IP when a proxy is trusted', async () => {
    const app = createApp({ config: { ...baseConfig, trustProxy: true } });
    apps.add(app);

    const a1 = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '1.1.1.1' } });
    const a2 = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '1.1.1.1' } });
    const a3 = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '1.1.1.1' } });
    const b1 = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-for': '9.9.9.9' } });

    expect(a1.statusCode).toBe(200);
    expect(a2.statusCode).toBe(200);
    expect(a3.statusCode).toBe(429);
    expect(b1.statusCode).toBe(200);
  });
});
