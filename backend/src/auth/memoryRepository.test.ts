import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryOutbox } from '../email/outbox.js';
import { createMemoryAuthRepository } from './memoryRepository.js';

let repo: ReturnType<typeof createMemoryAuthRepository>;

beforeEach(() => {
  repo = createMemoryAuthRepository(createMemoryOutbox());
});

const newUser = () => ({
  email: `a-${crypto.randomUUID()}@example.com`,
  passwordHash: 'h',
  username: `u_${crypto.randomUUID().slice(0, 8)}`,
  country: 'BR',
  locale: 'pt' as const,
});
const later = () => new Date(Date.now() + 60_000);
const input = (userId: string, to: string, purpose: 'verify_email' | 'login' = 'verify_email') => ({
  userId, purpose, codeHash: 'x', expiresAt: later(),
  email: { kind: 'verify_email_code' as const, to, locale: 'pt' as const, payload: { code: '1' } },
});

describe('memory auth repository (verification + challenges)', () => {
  it('createUser stores locale and an unverified state', async () => {
    const u = await repo.createUser(newUser());
    expect(u.locale).toBe('pt');
    expect(u.emailVerifiedAt).toBeNull();
  });

  it('createChallenge invalidates the previous live challenge of the same purpose and enqueues email', async () => {
    const u = await repo.createUser(newUser());
    const a = await repo.createChallenge(input(u.id, u.email));
    const other = await repo.createChallenge(input(u.id, u.email, 'login'));
    const b = await repo.createChallenge(input(u.id, u.email));
    expect((await repo.findChallenge(a))?.invalidatedAt).toBeInstanceOf(Date);
    expect((await repo.findChallenge(other))?.invalidatedAt).toBeNull();
    expect((await repo.findChallenge(b))?.invalidatedAt).toBeNull();
    expect(await repo.consumeChallenge(a)).toBe(false);
    expect(await repo.countChallengesSince(u.id, new Date(Date.now() - 1000))).toBe(3);
    expect(await repo.countEmailsTo(u.email, new Date(Date.now() - 1000))).toBe(3);
  });

  it('consumeChallenge is true only once; recordFailedAttempt counts', async () => {
    const u = await repo.createUser(newUser());
    const id = await repo.createChallenge(input(u.id, u.email));
    expect(await repo.recordFailedAttempt(id)).toBe(1);
    expect(await repo.recordFailedAttempt(id)).toBe(2);
    expect(await repo.consumeChallenge(id)).toBe(true);
    expect(await repo.consumeChallenge(id)).toBe(false);
  });

  it('markEmailVerified, setLocale and enqueueEmail work', async () => {
    const u = await repo.createUser(newUser());
    await repo.markEmailVerified(u.id);
    await repo.setLocale(u.id, 'ja');
    const f = await repo.findUserById(u.id);
    expect(f?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(f?.locale).toBe('ja');
    await repo.enqueueEmail({ kind: 'register_attempt_notice', to: u.email, locale: 'ja', payload: {} });
    expect(await repo.countEmailsTo(u.email, new Date(Date.now() - 1000))).toBe(1);
  });

  it('revokeAllSessions blocks rotation on every session', async () => {
    const u = await repo.createUser(newUser());
    await repo.createSession({ userId: u.id, tokenHash: 'a', expiresAt: later() });
    await repo.createSession({ userId: u.id, tokenHash: 'b', expiresAt: later() });
    await repo.revokeAllSessions(u.id);
    for (const h of ['a', 'b']) {
      expect((await repo.rotateRefreshToken({ presentedHash: h, nextHash: `${h}2`, nextExpiresAt: later() })).outcome).not.toBe('rotated');
    }
  });

  it('deleteStaleUnverified removes only unverified users past the cutoff', async () => {
    const stale = await repo.createUser(newUser());
    const verified = await repo.createUser(newUser());
    await repo.markEmailVerified(verified.id);
    expect(await repo.deleteStaleUnverified(new Date(Date.now() - 1000))).toBe(0);
    expect(await repo.deleteStaleUnverified(new Date(Date.now() + 1000))).toBe(1);
    expect(await repo.findUserById(stale.id)).toBeNull();
    expect(await repo.findUserById(verified.id)).not.toBeNull();
  });
});

describe('memory auth repository (createChallenge guard)', () => {
  it('throws for an unknown user', async () => {
    const r = createMemoryAuthRepository(createMemoryOutbox());
    await expect(r.createChallenge(input(crypto.randomUUID(), 'x@example.com'))).rejects.toThrow('USER_NOT_FOUND');
  });
});
