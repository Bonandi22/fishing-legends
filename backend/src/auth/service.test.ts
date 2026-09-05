// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest';
import { createAuthService } from './service.js';
import { createMemoryAuthRepository } from './memoryRepository.js';
import { hashPassword } from './crypto.js';

const config = {
  accessTokenSecret: new Uint8Array(Buffer.from('test-secret-that-is-at-least-32-bytes-long')),
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};

let service: ReturnType<typeof createAuthService>;

beforeEach(async () => {
  const repo = createMemoryAuthRepository();
  await repo.createUser({
    email: 'known@example.com',
    passwordHash: await hashPassword('the-correct-password-123'),
    username: 'known_user',
    country: 'BR',
  });
  service = createAuthService(repo, config);
});

async function timeRejectedLogin(email: string): Promise<number> {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await service.login({ email, password: 'a-wrong-password' }).catch(() => undefined);
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

describe('auth service login', () => {
  it('rejects a wrong password and an unknown email with the same error', async () => {
    await expect(service.login({ email: 'known@example.com', password: 'nope' })).rejects.toThrow('INVALID_CREDENTIALS');
    await expect(service.login({ email: 'ghost@example.com', password: 'nope' })).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('spends comparable time whether or not the account exists (no timing oracle)', async () => {
    const unknownTime = await timeRejectedLogin('ghost@example.com');
    const knownTime = await timeRejectedLogin('known@example.com');

    // The password hash comparison dominates; skipping it for unknown accounts
    // would make this branch near-instant.
    expect(unknownTime).toBeGreaterThan(5);
    expect(unknownTime).toBeGreaterThan(knownTime * 0.5);
  });
});
