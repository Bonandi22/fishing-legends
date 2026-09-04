import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { AppConfig } from './config/env.js';

const testConfig: AppConfig = {
  environment: 'test',
  host: '127.0.0.1',
  port: 8090,
  logLevel: 'silent',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};

const apps = new Set<Awaited<ReturnType<typeof createApp>>>();

afterEach(async () => {
  await Promise.all([...apps].map(app => app.close()));
  apps.clear();
});

describe('backend foundation', () => {
  it('reports liveness without requiring a database', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'deep-blue-lure-api',
    });
  });

  it('reports readiness failure when the database is not configured', async () => {
    const app = createApp({ config: testConfig });
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe('not_ready');
  });
});
