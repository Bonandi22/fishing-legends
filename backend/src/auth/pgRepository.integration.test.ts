import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { playerProgress } from '../db/schema.js';
import { createPgAuthRepository } from './pgRepository.js';

let harness: TestDatabase;
let repo: ReturnType<typeof createPgAuthRepository>;

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
    await expect(repo.createUser(newUser({ email: input.email }))).rejects.toThrow();
  });

  it('returns null for an unknown email', async () => {
    expect(await repo.findUserByEmail('nobody@example.com')).toBeNull();
  });

  it('rotates a session: the old token stops resolving, the new one resolves', async () => {
    const user = await repo.createUser(newUser());
    const session = await repo.createSession({
      userId: user.id,
      refreshTokenHash: 'hash-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const rotated = await repo.rotateSession({
      sessionId: session.id,
      refreshTokenHash: 'hash-2',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(rotated?.id).toBe(session.id);

    expect(await repo.findSessionByTokenHash('hash-1')).toBeNull();
    expect((await repo.findSessionByTokenHash('hash-2'))?.id).toBe(session.id);
  });

  it('revokes a session', async () => {
    const user = await repo.createUser(newUser());
    const session = await repo.createSession({
      userId: user.id,
      refreshTokenHash: 'hash-revoke',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await repo.revokeSession(session.id);

    expect(await repo.findSessionByTokenHash('hash-revoke')).toBeNull();
    expect(
      await repo.rotateSession({
        sessionId: session.id,
        refreshTokenHash: 'hash-after-revoke',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toBeNull();
  });
});
