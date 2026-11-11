import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { authChallenges, emailOutbox, playerProgress, users } from '../db/schema.js';
import { createPgOutbox } from '../email/pgOutbox.js';
import { createPgAuthRepository } from './pgRepository.js';
import { createAuthService } from './service.js';
import { createChallengeService } from './challenges.js';

let harness: TestDatabase;
let repo: ReturnType<typeof createPgAuthRepository>;

const authCodes = {
  secret: new Uint8Array(Buffer.from('test-auth-code-secret-at-least-32-chars!!')),
  ttlSeconds: 1800,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
};

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
  locale: 'en' as const,
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

    const service = createAuthService(repo, serviceConfig, { challenges: createChallengeService(repo, authCodes) });
    const result = await service.login({ email, password: 'legacy-secret-123' });
    expect(result.challengeId).toEqual(expect.any(String));

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

  const challengeInput = (userId: string, to: string, purpose: 'verify_email' | 'login' | 'password_reset' = 'verify_email') => ({
    userId,
    purpose,
    codeHash: 'hash',
    expiresAt: new Date(Date.now() + 600_000),
    email: { kind: 'verify_email_code' as const, to, locale: 'en' as const, payload: { code: '123456' } },
  });

  it('createChallenge with email: null stores and supersedes, but enqueues nothing', async () => {
    const user = await repo.createUser(newUser());
    const first = await repo.createChallenge(challengeInput(user.id, user.email));
    const silent = await repo.createChallenge({ ...challengeInput(user.id, user.email), email: null });
    expect((await repo.findChallenge(first))?.invalidatedAt).toBeInstanceOf(Date);
    expect((await repo.findChallenge(silent))?.invalidatedAt).toBeNull();
    expect(await harness.db.select().from(emailOutbox).where(eq(emailOutbox.challengeId, silent))).toHaveLength(0);
    expect(await repo.countEmailsTo(user.email, new Date(Date.now() - 60_000))).toBe(1);
  });

  it('isUsernameTaken is case-insensitive', async () => {
    await repo.createUser(newUser({ username: 'Taken_Name' }));
    expect(await repo.isUsernameTaken('taken_NAME')).toBe(true);
    expect(await repo.isUsernameTaken('free_name')).toBe(false);
  });

  describe('auth flows against PostgreSQL', () => {
    const service = () => createAuthService(repo, serviceConfig, { challenges: createChallengeService(repo, authCodes) });
    const codeFor = async (challengeId: string) => {
      const [row] = await harness.db.select().from(emailOutbox).where(eq(emailOutbox.challengeId, challengeId));
      return String((row.payload as Record<string, string>).code);
    };
    const input = () => ({
      email: `flow-${crypto.randomUUID()}@example.com`, password: 'a-very-strong-password',
      username: `f_${crypto.randomUUID().slice(0, 8)}`, country: 'BR', locale: 'pt' as const,
    });

    it('register -> verify-email marks verified and starts a session', async () => {
      const svc = service();
      const data = input();
      const { challengeId } = await svc.register(data);
      const session = await svc.verifyEmail({ challengeId, code: await codeFor(challengeId) });
      expect(session.accessToken).toEqual(expect.any(String));
      expect((await repo.findUserByEmail(data.email))?.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('register with an existing email: decoy id + register_attempt_notice, no new user', async () => {
      const svc = service();
      const data = input();
      await svc.register(data);
      const { challengeId } = await svc.register({ ...data, username: `g_${crypto.randomUUID().slice(0, 8)}` });
      const decoy = await repo.findChallenge(challengeId);
      expect(decoy).toMatchObject({ userId: null, decoyEmail: data.email, purpose: 'verify_email' });
      const kinds = (await harness.db.select().from(emailOutbox).where(eq(emailOutbox.recipient, data.email))).map(r => r.kind);
      expect(kinds.sort()).toEqual(['register_attempt_notice', 'verify_email_code']);
      expect(await harness.db.select().from(users).where(eq(users.email, data.email))).toHaveLength(1);
    });

    it('login of an unverified account -> verify_email challenge; login/verify marks it verified', async () => {
      const svc = service();
      const data = input();
      await svc.register(data);
      const { challengeId } = await svc.login({ email: data.email, password: data.password, locale: 'fr' });
      expect((await repo.findChallenge(challengeId))?.purpose).toBe('verify_email');
      await svc.verifyLogin({ challengeId, code: await codeFor(challengeId) });
      const stored = await repo.findUserByEmail(data.email);
      expect(stored?.emailVerifiedAt).toBeInstanceOf(Date);
      expect(stored?.locale).toBe('fr');
    });
  });

  it('createUser stores locale and marks verification as required', async () => {
    const user = await repo.createUser(newUser({ locale: 'pt' }));
    expect(user.locale).toBe('pt');
    expect(user.emailVerifiedAt).toBeNull();
    const [row] = await harness.db.select().from(users).where(eq(users.id, user.id));
    expect(row.verificationRequiredSince).toBeInstanceOf(Date);
  });

  it('createChallenge invalidates the previous live challenge of the same purpose', async () => {
    const user = await repo.createUser(newUser());
    const first = await repo.createChallenge(challengeInput(user.id, user.email));
    const other = await repo.createChallenge(challengeInput(user.id, user.email, 'login'));
    const second = await repo.createChallenge(challengeInput(user.id, user.email));

    expect((await repo.findChallenge(first))?.invalidatedAt).toBeInstanceOf(Date);
    expect((await repo.findChallenge(second))?.invalidatedAt).toBeNull();
    expect((await repo.findChallenge(other))?.invalidatedAt).toBeNull();
    expect(await repo.consumeChallenge(first)).toBe(false);
    expect(await repo.countChallengesSince(user.id, new Date(Date.now() - 60_000))).toBe(3);
    expect(await repo.countEmailsTo(user.email, new Date(Date.now() - 60_000))).toBe(3);

    const rows = await harness.db.select().from(emailOutbox).where(eq(emailOutbox.challengeId, second));
    expect(rows).toHaveLength(1);
  });

  it('concurrent createChallenge calls leave exactly one live challenge', async () => {
    const user = await repo.createUser(newUser());
    await Promise.all(Array.from({ length: 6 }, () => repo.createChallenge(challengeInput(user.id, user.email))));
    const rows = await harness.db.select().from(authChallenges).where(eq(authChallenges.userId, user.id));
    expect(rows).toHaveLength(6);
    expect(rows.filter(r => !r.invalidatedAt && !r.consumedAt)).toHaveLength(1);
  });

  it('createChallenge throws for an unknown user', async () => {
    await expect(repo.createChallenge(challengeInput(crypto.randomUUID(), 'x@example.com'))).rejects.toThrow();
  });

  it('a failure inside createChallenge leaves neither challenge nor outbox row', async () => {
    const user = await repo.createUser(newUser());
    const real = createPgOutbox(harness.db);
    const failing = createPgAuthRepository(harness.db, {
      ...real,
      enqueue: async (msg, tx) => {
        await real.enqueue(msg, tx);
        throw new Error('boom');
      },
    });
    await expect(failing.createChallenge(challengeInput(user.id, user.email))).rejects.toThrow('boom');
    expect(await harness.db.select().from(authChallenges)).toHaveLength(0);
    expect(await harness.db.select().from(emailOutbox)).toHaveLength(0);
  });

  it('consumeChallenge is true exactly once under two concurrent calls', async () => {
    const user = await repo.createUser(newUser());
    const id = await repo.createChallenge(challengeInput(user.id, user.email));
    const results = await Promise.all([repo.consumeChallenge(id), repo.consumeChallenge(id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repo.findChallenge(id))?.consumedAt).toBeInstanceOf(Date);
  });

  it('reserveAttempt increments up to the max, then returns null', async () => {
    const user = await repo.createUser(newUser());
    const id = await repo.createChallenge(challengeInput(user.id, user.email));
    expect(await repo.reserveAttempt(id, 2)).toBe(1);
    expect(await repo.reserveAttempt(id, 2)).toBe(2);
    expect(await repo.reserveAttempt(id, 2)).toBeNull();
    expect((await repo.findChallenge(id))?.attempts).toBe(2);
  });

  it('20 concurrent wrong verifies end at exactly 5 attempts', async () => {
    const user = await repo.createUser(newUser());
    const svc = createChallengeService(repo, authCodes);
    const id = await svc.issue(user, 'verify_email');
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => svc.verify(id, 'abcdef', ['verify_email'])));
    const messages = results.map(r => (r.status === 'rejected' ? (r.reason as Error).message : 'OK'));
    expect(messages.filter(m => m === 'INVALID_CODE').length).toBeLessThanOrEqual(5);
    expect(messages.filter(m => m === 'TOO_MANY_ATTEMPTS').length).toBeGreaterThanOrEqual(15);
    expect((await repo.findChallenge(id))?.attempts).toBe(5);
  });

  it('decoy challenges are stored without a user, lowercased, counted and superseded', async () => {
    const d = { email: 'Ghost@Example.com', purpose: 'login' as const, codeHash: 'x', expiresAt: new Date(Date.now() + 600_000) };
    const first = await repo.createDecoyChallenge(d);
    const second = await repo.createDecoyChallenge(d);
    expect((await repo.findChallenge(first))?.invalidatedAt).toBeInstanceOf(Date);
    const live = await repo.findChallenge(second);
    expect(live?.userId).toBeNull();
    expect(live?.decoyEmail).toBe('ghost@example.com');
    expect(await repo.countDecoyChallengesSince('GHOST@example.com', new Date(Date.now() - 60_000))).toBe(2);
    expect(await repo.countEmailsTo('ghost@example.com', new Date(Date.now() - 60_000))).toBe(0);
  });

  it('rejects a challenge row with both or neither owner', async () => {
    const user = await repo.createUser(newUser());
    const base = { id: crypto.randomUUID(), purpose: 'login', codeHash: 'x', expiresAt: new Date(Date.now() + 1000) };
    await expect(harness.db.insert(authChallenges).values({ ...base, userId: user.id, decoyEmail: 'a@b.c' })).rejects.toThrow();
    await expect(harness.db.insert(authChallenges).values({ ...base, id: crypto.randomUUID() })).rejects.toThrow();
  });

  it('markEmailVerified and setLocale update the user', async () => {
    const user = await repo.createUser(newUser());
    await repo.markEmailVerified(user.id);
    await repo.setLocale(user.id, 'ja');
    const found = await repo.findUserById(user.id);
    expect(found?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(found?.locale).toBe('ja');
  });

  it('revokeAllSessions blocks rotation on every session of the user', async () => {
    const user = await repo.createUser(newUser());
    await repo.createSession({ userId: user.id, tokenHash: 'a1', expiresAt: later() });
    await repo.createSession({ userId: user.id, tokenHash: 'b1', expiresAt: later() });
    await repo.revokeAllSessions(user.id);
    for (const h of ['a1', 'b1']) {
      const r = await repo.rotateRefreshToken({ presentedHash: h, nextHash: `${h}-n`, nextExpiresAt: later() });
      expect(r.outcome).not.toBe('rotated');
    }
  });

  it('enqueueEmail writes an outbox row without a challenge', async () => {
    await repo.enqueueEmail({ kind: 'register_attempt_notice', to: 'x@example.com', locale: 'en', payload: {} });
    const rows = await harness.db.select().from(emailOutbox);
    expect(rows).toHaveLength(1);
    expect(rows[0].challengeId).toBeNull();
  });

  it('deleteStaleUnverified removes only unverified users whose verification_required_since is older than the cutoff', async () => {
    const stale = await repo.createUser(newUser());
    const fresh = await repo.createUser(newUser());
    const verified = await repo.createUser(newUser());
    const legacy = await repo.createUser(newUser());
    await repo.markEmailVerified(verified.id);
    await repo.createSession({ userId: stale.id, tokenHash: 'stale1', expiresAt: later() });
    await repo.createChallenge(challengeInput(stale.id, stale.email));

    const old = new Date(Date.now() - 8 * 86_400_000);
    await harness.db.execute(sql`UPDATE users SET verification_required_since = ${old} WHERE id IN (${stale.id}, ${verified.id})`);
    await harness.db.execute(sql`UPDATE users SET verification_required_since = NULL WHERE id = ${legacy.id}`);

    const deleted = await repo.deleteStaleUnverified(new Date(Date.now() - 7 * 86_400_000));
    expect(deleted).toBe(1);
    expect(await repo.findUserById(stale.id)).toBeNull();
    expect(await repo.findUserById(fresh.id)).not.toBeNull();
    expect(await repo.findUserById(verified.id)).not.toBeNull();
    expect(await repo.findUserById(legacy.id)).not.toBeNull();
    expect(await harness.db.select().from(authChallenges)).toHaveLength(0);
  });
});
