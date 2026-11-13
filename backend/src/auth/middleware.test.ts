// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createAuthService } from './service.js';
import { createMemoryAuthRepository } from './memoryRepository.js';
import { createChallengeService } from './challenges.js';
import { createOpaqueToken, hashToken } from './crypto.js';
import { createRequireAuth } from './middleware.js';
import { registerErrorHandling } from '../http/errors.js';
import type { AuthRepository } from './types.js';

const config = {
  accessTokenSecret: new Uint8Array(Buffer.from('test-secret-that-is-at-least-32-bytes-long')),
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};
const codes = { secret: new Uint8Array(32), ttlSeconds: 1800, maxAttempts: 5, resendCooldownSeconds: 60 };

let repo: AuthRepository;
let app: FastifyInstance;
let userId: string;
let accessToken: string;

beforeEach(async () => {
  repo = createMemoryAuthRepository();
  const service = createAuthService(repo, config, { challenges: createChallengeService(repo, codes) });
  const user = await repo.createUser({ email: 'mw@example.com', passwordHash: 'h', username: 'mw_user', country: 'BR', locale: 'en' });
  userId = user.id;
  const refreshToken = createOpaqueToken();
  await repo.createSession({ userId, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + 60_000) });
  accessToken = (await service.refresh(refreshToken)).accessToken;

  app = Fastify();
  registerErrorHandling(app);
  app.get('/me', { preHandler: createRequireAuth(service) }, async request => ({ userId: request.userId, isAdmin: request.isAdmin }));
  await app.ready();
});

afterEach(() => app.close());

const call = () => app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${accessToken}` } });

describe('requireAuth', () => {
  it('lets an active account through and exposes isAdmin', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId, isAdmin: false });
  });

  it('rejects a still-valid token of a suspended account with ACCOUNT_SUSPENDED', async () => {
    await repo.setStatus(userId, 'suspended');
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'ACCOUNT_SUSPENDED' } });
  });

  it('rejects a still-valid token of a banned account with ACCOUNT_BANNED', async () => {
    await repo.setStatus(userId, 'banned');
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'ACCOUNT_BANNED' } });
  });
});
