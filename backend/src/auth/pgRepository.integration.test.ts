import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { playerProgress } from '../db/schema.js';
import { createPgAuthRepository } from './pgRepository.js';
import { createAuthService } from './service.js';

let harness: TestDatabase;
let repo: ReturnType<typeof createPgAuthRepository>;

const serviceConfig = {
  accessTokenSecret: new Uint8Array(Buffer.from('test-secret-that-is-at-least-32-bytes-long')),
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};

async function legacyScryptHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await promisify(scrypt)(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

beforeAll(async () => {
  harness = await createTestDatabase();
  repo = createPgAuthRepository(harness.db);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

const newUser = (overrides: Partial<Parameters<typeof repo.createUser>[0]> = {}) => ({
  email: `angler-${crypto.randomUUID()}@example.com`,
  passwordHash: 'scrypt$c2FsdA$a2V5',
  username: `angler_${crypto.randomUUID().slice(0, 8)}`,
  country: 'BR',
  ...overrides,
});

describe('pg auth repository (integration)', () => {
  it('creates the user, profile and player progress in one transaction', async () => {
    const user = await repo.createUser(newUser());

    const found = await repo.findUserByEmail(user.email);
    expect(found?.id).toBe(user.id);
    expect(found?.username).toBe(user.username);

    const progress = await harness.db
      .select()
      .from(playerProgress)
      .where(eq(playerProgress.userId, user.id));
    expect(progress).toHaveLength(1);
    expect(progress[0].level).toBe(1);
  });

  it('rejects a duplicate email', async () => {
    const input = newUser();
    await repo.createUser(input);
    await expect(repo.createUser(newUser({ email: input.email }))).rejects.toThrow('ACCOUNT_ALREADY_EXISTS');
  });

  it('rejects a username that differs only in case', async () => {
    await repo.createUser(newUser({ username: 'Angler' }));
    await expect(repo.createUser(newUser({ username: 'angler' }))).rejects.toThrow('USERNAME_TAKEN');
  });

  it('returns null for an unknown email', async () => {
    expect(await repo.findUserByEmail('nobody@example.com')).toBeNull();
  });

  it('upgrades a legacy scrypt password hash to Argon2id on successful login', async () => {
    const email = `legacy-${crypto.randomUUID()}@example.com`;
    await repo.createUser(newUser({ email, passwordHash: await legacyScryptHash('legacy-secret-123') }));

    const service = createAuthService(repo, serviceConfig);
    const result = await service.login({ email, password: 'legacy-secret-123' });
    expect(result.accessToken).toEqual(expect.any(String));

    const stored = await repo.findUserByEmail(email);
    expect(stored?.passwordHash.startsWith('$argon2id$')).toBe(true);

    // the upgraded hash still authenticates
    await expect(service.login({ email, password: 'legacy-secret-123' })).resolves.toBeTruthy();
  });

  const later = () => new Date(Date.now() + 60_000);

  it('rotates the refresh token chain, keeping the same session', async () => {
    const user = await repo.createUser(newUser());
    const session = await repo.createSession({ userId: user.id, tokenHash: 'h1', expiresAt: later() });

    const first = await repo.rotateRefreshToken({ presentedHash: 'h1', nextHash: 'h2', nextExpiresAt: later() });
    expect(first).toMatchObject({ outcome: 'rotated', userId: user.id });
    if (first.outcome === 'rotated') expect(first.session.id).toBe(session.id);

    const second = await repo.rotateRefreshToken({ presentedHash: 'h2', nextHash: 'h3', nextExpiresAt: later() });
    expect(second.outcome).toBe('rotated');
  });

  it('rejects an unknown refresh token', async () => {
    expect(await repo.rotateRefreshToken({ presentedHash: 'nope', nextHash: 'x', nextExpiresAt: later() }))
      .toEqual({ outcome: 'invalid' });
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const user = await repo.createUser(newUser());
    await repo.createSession({ userId: user.id, tokenHash: 'r1', expiresAt: later() });
    await repo.rotateRefreshToken({ presentedHash: 'r1', nextHash: 'r2', nextExpiresAt: later() });

    // r1 was already rotated away -> reuse
    const reuse = await repo.rotateRefreshToken({ presentedHash: 'r1', nextHash: 'attacker', nextExpiresAt: later() });
    expect(reuse).toEqual({ outcome: 'reuse_detected' });

    // r2 (the tip a moment ago) is now dead too
    const afterReuse = await repo.rotateRefreshToken({ presentedHash: 'r2', nextHash: 'r3', nextExpiresAt: later() });
    expect(afterReuse.outcome).not.toBe('rotated');
  });

  it('revokeSession blocks further rotation', async () => {
    const user = await repo.createUser(newUser());
    const session = await repo.createSession({ userId: user.id, tokenHash: 'rev1', expiresAt: later() });

    await repo.revokeSession(session.id);

    const after = await repo.rotateRefreshToken({ presentedHash: 'rev1', nextHash: 'rev2', nextExpiresAt: later() });
    expect(after.outcome).not.toBe('rotated');
  });
});
