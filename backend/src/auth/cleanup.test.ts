import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryOutbox, type MemoryOutbox } from '../email/outbox.js';
import { createMemoryAuthRepository } from './memoryRepository.js';
import { runAuthCleanup } from './cleanup.js';

const DAY = 86_400_000;
let repo: ReturnType<typeof createMemoryAuthRepository>;
let outbox: MemoryOutbox;

beforeEach(() => {
  outbox = createMemoryOutbox();
  repo = createMemoryAuthRepository(outbox);
});

const newUser = () => ({
  email: `a-${crypto.randomUUID()}@example.com`,
  passwordHash: 'h',
  username: `u_${crypto.randomUUID().slice(0, 8)}`,
  country: 'BR',
  locale: 'pt' as const,
});

describe('runAuthCleanup', () => {
  it('deletes unverified accounts older than 7 days and keeps newer or verified ones', async () => {
    const stale = await repo.createUser(newUser());
    const verified = await repo.createUser(newUser());
    await repo.markEmailVerified(verified.id);

    const young = await runAuthCleanup(repo, new Date(Date.now() + 6 * DAY));
    expect(young.unverified).toBe(0);
    expect(await repo.findUserById(stale.id)).not.toBeNull();

    const old = await runAuthCleanup(repo, new Date(Date.now() + 8 * DAY));
    expect(old.unverified).toBe(1);
    expect(await repo.findUserById(stale.id)).toBeNull();
    expect(await repo.findUserById(verified.id)).not.toBeNull();
  });

  it('deletes real and decoy challenges only once they expired more than 24h ago', async () => {
    const user = await repo.createUser(newUser());
    await repo.markEmailVerified(user.id);
    const expiresAt = new Date(Date.now() + 60_000);
    const realId = await repo.createChallenge({ userId: user.id, purpose: 'login', codeHash: 'x', expiresAt, email: null });
    const decoyId = await repo.createDecoyChallenge({ email: 'nobody@example.com', purpose: 'password_reset', codeHash: 'x', expiresAt });

    // 23h after expiry: kept
    const early = await runAuthCleanup(repo, new Date(expiresAt.getTime() + 23 * 3_600_000));
    expect(early.challenges).toBe(0);
    expect(await repo.findChallenge(realId)).not.toBeNull();
    expect(await repo.findChallenge(decoyId)).not.toBeNull();

    // 25h after expiry: both gone
    const late = await runAuthCleanup(repo, new Date(expiresAt.getTime() + 25 * 3_600_000));
    expect(late.challenges).toBe(2);
    expect(await repo.findChallenge(realId)).toBeNull();
    expect(await repo.findChallenge(decoyId)).toBeNull();
  });
  it('deletes sent/failed outbox rows older than 7 days only', async () => {
    const msg = { kind: 'login_code', to: 'a@example.com', locale: 'en', payload: { code: '123456' } } as const;
    const oldSent = await outbox.enqueue(msg);
    const oldFailed = await outbox.enqueue(msg);
    const oldPending = await outbox.enqueue(msg);
    const recentSent = await outbox.enqueue(msg);
    await outbox.markSent(oldSent);
    await outbox.markFailed(oldFailed, 'x');
    await outbox.markSent(recentSent);
    for (const id of [oldSent, oldFailed, oldPending]) outbox.setCreatedAt(id, new Date(Date.now() - 8 * DAY));

    const result = await runAuthCleanup(repo, new Date());
    expect(result.emails).toBe(2);
    expect(await outbox.status(oldSent)).toBeNull();
    expect(await outbox.status(oldFailed)).toBeNull();
    expect(await outbox.status(oldPending)).toBe('pending');
    expect(await outbox.status(recentSent)).toBe('sent');
  });
});
