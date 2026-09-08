// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';

const config: AppConfig = {
  environment: 'test',
  host: '127.0.0.1',
  port: 8090,
  accessTokenSecret: new Uint8Array(Buffer.from('test-secret-that-is-at-least-32-bytes-long')),
  logLevel: 'silent',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [],
  rateLimitMax: 120,
  rateLimitWindowMs: 60_000,
  authRateLimitMax: 1000,
  authRateLimitWindowMs: 300_000,
  trustProxy: false,
  cookieSecure: false,
};

let app: FastifyInstance;
let doc: { openapi: string; info: unknown; paths: Record<string, unknown> };

beforeAll(async () => {
  app = await createApp({ config });
  await app.ready();
  doc = (await app.inject({ method: 'GET', url: '/openapi.json' })).json();
});

afterAll(() => app.close());

describe('generated OpenAPI contract', () => {
  it('is a valid OpenAPI 3 document', () => {
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info).toMatchObject({ title: 'Deep Blue Lure API' });
  });

  it('covers the whole API surface', () => {
    const expected = [
      '/health', '/ready',
      '/api/v1/auth/register', '/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout',
      '/api/v1/me', '/api/v1/catalog',
      '/api/v1/me/fishing/cast', '/api/v1/me/fishing/land',
      '/api/v1/wallet', '/api/v1/economy/nets/purchase', '/api/v1/economy/multipliers/purchase',
      '/api/v1/inventory/warehouse', '/api/v1/inventory/warehouse/sell',
      '/api/v1/inventory/aquarium', '/api/v1/inventory/aquarium/{sector}',
      '/api/v1/migration/local/preview', '/api/v1/migration/local/import',
      '/api/v1/leaderboard', '/api/v1/rewards/daily/claim', '/api/v1/seasons/current',
    ];
    for (const path of expected) {
      expect(Object.keys(doc.paths), `${path} missing from /openapi.json`).toContain(path);
    }
  });

  it('does not expose the openapi document route in itself', () => {
    expect(Object.keys(doc.paths)).not.toContain('/openapi.json');
  });
});
