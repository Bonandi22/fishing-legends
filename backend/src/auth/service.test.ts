// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest';
import { createAuthService } from './service.js';
import { createMemoryAuthRepository } from './memoryRepository.js';
import { createChallengeService } from './challenges.js';
import { createOpaqueToken, hashPassword, hashToken } from './crypto.js';
import { createMemoryOutbox, type MemoryOutbox } from '../email/outbox.js';
import type { AuthRepository } from './types.js';

const config = {
  accessTokenSecret: new Uint8Array(Buffer.from('test-secret-that-is-at-least-32-bytes-long')),
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};
const codes = { secret: new Uint8Array(32), ttlSeconds: 1800, maxAttempts: 5, resendCooldownSeconds: 60 };

let repo: AuthRepository;
let outbox: MemoryOutbox;
let hashCalls: number;
let service: ReturnType<typeof createAuthService>;

beforeEach(async () => {
  outbox = createMemoryOutbox();
  repo = createMemoryAuthRepository(outbox);
  await repo.createUser({
    email: 'known@example.com',
    passwordHash: await hashPassword('the-correct-password-123'),
    username: 'known_user',
    country: 'BR',
    locale: 'en',
  });
  hashCalls = 0;
  service = createAuthService(repo, config, {
    challenges: createChallengeService(repo, codes),
    hashPassword: async password => { hashCalls += 1; return hashPassword(password); },
  });
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

  it('a correct password returns a challenge, never a session', async () => {
    const result = await service.login({ email: 'known@example.com', password: 'the-correct-password-123' });
    expect(Object.keys(result)).toEqual(['challengeId']);
  });
});

describe('auth service register', () => {
  const input = { email: 'new@example.com', password: 'a-very-strong-password', username: 'new_user', country: 'BR' };

  it('hashes the password on both the fresh and the existing-email path (same timing class)', async () => {
    await service.register(input);
    expect(hashCalls).toBe(1);
    await service.register({ ...input, email: 'known@example.com', username: 'another_user' });
    expect(hashCalls).toBe(2);
  });

  it('the existing-email path never creates or changes an account', async () => {
    const before = await repo.findUserByEmail('known@example.com');
    const result = await service.register({ ...input, email: 'known@example.com', username: 'another_user' });
    expect(Object.keys(result)).toEqual(['challengeId']);
    expect(await repo.findUserByEmail('known@example.com')).toEqual(before);
    expect(outbox.messages().map(m => m.kind)).toEqual(['register_attempt_notice']);
  });

  it('a concurrent duplicate registration of the same email takes the decoy path, not an error', async () => {
    const results = await Promise.all([service.register(input), service.register({ ...input, username: 'twin_user' })]);
    for (const r of results) expect(r.challengeId).toEqual(expect.any(String));
  });
});

describe('auth service refresh', () => {
  it('refresh still works for a session created before verification existed', async () => {
    const user = await repo.findUserByEmail('known@example.com');
    expect(user?.emailVerifiedAt).toBeNull();
    const token = createOpaqueToken();
    await repo.createSession({ userId: user!.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.refresh(token)).resolves.toMatchObject({ user: { id: user!.id } });
  });
});

describe('auth service account status', () => {
  const password = 'the-correct-password-123';
  async function known() {
    return (await repo.findUserByEmail('known@example.com'))!;
  }

  it('a correct password on a suspended account reveals ACCOUNT_SUSPENDED and issues no login code', async () => {
    await repo.setStatus((await known()).id, 'suspended');
    await expect(service.login({ email: 'known@example.com', password })).rejects.toThrow('ACCOUNT_SUSPENDED');
    expect(outbox.messages().filter(m => m.kind === 'login_code')).toHaveLength(0);
  });

  it('a wrong password on a suspended account is still INVALID_CREDENTIALS', async () => {
    await repo.setStatus((await known()).id, 'suspended');
    await expect(service.login({ email: 'known@example.com', password: 'a-wrong-password' })).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('a correct password on a banned account reveals ACCOUNT_BANNED', async () => {
    await repo.setStatus((await known()).id, 'banned');
    await expect(service.login({ email: 'known@example.com', password })).rejects.toThrow('ACCOUNT_BANNED');
  });

  it('a deleted account keeps answering INVALID_CREDENTIALS', async () => {
    await repo.setStatus((await known()).id, 'deleted');
    await expect(service.login({ email: 'known@example.com', password })).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('verifyLogin refuses an account suspended after the code was issued', async () => {
    const { challengeId } = await service.login({ email: 'known@example.com', password });
    const code = outbox.messages().filter(m => m.kind === 'login_code').at(-1)!.payload.code;
    await repo.setStatus((await known()).id, 'suspended');
    await expect(service.verifyLogin({ challengeId, code })).rejects.toThrow('ACCOUNT_SUSPENDED');
  });

  it('refresh of a banned account answers ACCOUNT_BANNED', async () => {
    const user = await known();
    const token = createOpaqueToken();
    await repo.createSession({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) });
    await repo.setStatus(user.id, 'banned');
    await expect(service.refresh(token)).rejects.toThrow('ACCOUNT_BANNED');
  });

  it('forgotPassword answers a suspended account with a decoy (no email)', async () => {
    await repo.setStatus((await known()).id, 'suspended');
    const result = await service.forgotPassword({ email: 'known@example.com' });
    expect(Object.keys(result)).toEqual(['challengeId']);
    expect(outbox.messages().filter(m => m.kind === 'password_reset_code')).toHaveLength(0);
  });

  it('assertActive returns isAdmin for an active account and the status code otherwise', async () => {
    const user = await known();
    await expect(service.assertActive(user.id)).resolves.toEqual({ isAdmin: false });
    await repo.setStatus(user.id, 'suspended');
    await expect(service.assertActive(user.id)).rejects.toThrow('ACCOUNT_SUSPENDED');
    await repo.setStatus(user.id, 'banned');
    await expect(service.assertActive(user.id)).rejects.toThrow('ACCOUNT_BANNED');
    await expect(service.assertActive('00000000-0000-0000-0000-000000000000')).rejects.toThrow('INVALID_ACCESS_TOKEN');
  });
});
