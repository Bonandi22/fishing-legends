import { beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { createMemoryOutbox, type MemoryOutbox } from '../email/outbox.js';
import { createMemoryAuthRepository } from './memoryRepository.js';
import { createChallengeService } from './challenges.js';
import type { AuthUser } from './types.js';

const secret = new Uint8Array(Buffer.from('test-auth-code-secret-at-least-32-chars!!'));
const cfg = { secret, ttlSeconds: 1800, maxAttempts: 5, resendCooldownSeconds: 60 };

let t: number;
let outbox: MemoryOutbox;
let repo: ReturnType<typeof createMemoryAuthRepository>;
let svc: ReturnType<typeof createChallengeService>;
let user: AuthUser;

const now = () => new Date(t);
const advance = (s: number) => { t += s * 1000; };

beforeEach(async () => {
  t = Date.now();
  outbox = createMemoryOutbox({ now });
  repo = createMemoryAuthRepository(outbox);
  svc = createChallengeService(repo, cfg, now);
  user = await repo.createUser({
    email: `a-${crypto.randomUUID()}@example.com`, passwordHash: 'h',
    username: `u_${crypto.randomUUID().slice(0, 8)}`, country: 'BR', locale: 'pt',
  });
});

async function sentCode(): Promise<string> {
  const rows = await outbox.claimPending(100);
  return String(rows[rows.length - 1].payload.code);
}
const wrong = (code: string) => (code === '000000' ? '000001' : '000000');

describe('challenge service', () => {
  it('right code returns the user; second use is not found', async () => {
    const id = await svc.issue(user, 'verify_email');
    const code = await sentCode();
    expect(code).toMatch(/^\d{6}$/);
    expect((await svc.verify(id, code, ['verify_email'])).id).toBe(user.id);
    await expect(svc.verify(id, code, ['verify_email'])).rejects.toThrow('CHALLENGE_NOT_FOUND');
  });

  it('enqueues the right kind, locale and payload; stores only the hash', async () => {
    const id = await svc.issue(user, 'login');
    const [msg] = await outbox.claimPending(10);
    expect(msg.kind).toBe('login_code');
    expect(msg.to).toBe(user.email);
    expect(msg.locale).toBe('pt');
    expect(msg.challengeId).toBe(id);
    expect(msg.payload.minutes).toBe('30');
    const stored = await repo.findChallenge(id);
    expect(stored?.codeHash).not.toBe(msg.payload.code);
    expect(stored?.codeHash).toBe(createHmac('sha256', secret).update(String(msg.payload.code)).digest('hex'));
  });

  it('rejects a purpose that is not allowed', async () => {
    const id = await svc.issue(user, 'login');
    const code = await sentCode();
    await expect(svc.verify(id, code, ['verify_email'])).rejects.toThrow('CHALLENGE_NOT_FOUND');
  });

  it('locks after 5 wrong codes, even for the right code', async () => {
    const id = await svc.issue(user, 'verify_email');
    const code = await sentCode();
    for (let i = 0; i < 4; i++) await expect(svc.verify(id, wrong(code), ['verify_email'])).rejects.toThrow('INVALID_CODE');
    await expect(svc.verify(id, wrong(code), ['verify_email'])).rejects.toThrow('TOO_MANY_ATTEMPTS');
    await expect(svc.verify(id, code, ['verify_email'])).rejects.toThrow('TOO_MANY_ATTEMPTS');
  });

  it('malformed input counts as a wrong attempt', async () => {
    const id = await svc.issue(user, 'verify_email');
    await expect(svc.verify(id, 'abc', ['verify_email'])).rejects.toThrow('INVALID_CODE');
    expect((await repo.findChallenge(id))?.attempts).toBe(1);
  });

  it('trims whitespace around the code', async () => {
    const id = await svc.issue(user, 'verify_email');
    const code = await sentCode();
    await expect(svc.verify(id, ` ${code} `, ['verify_email'])).resolves.toBeTruthy();
  });

  it('expires at +1800 s', async () => {
    const id = await svc.issue(user, 'verify_email');
    const code = await sentCode();
    advance(1800);
    await expect(svc.verify(id, code, ['verify_email'])).rejects.toThrow('CHALLENGE_EXPIRED');
    expect(await svc.isStillValid(id)).toBe(false);
  });

  it('isStillValid is true while live, false once consumed', async () => {
    const id = await svc.issue(user, 'verify_email');
    expect(await svc.isStillValid(id)).toBe(true);
    await svc.verify(id, await sentCode(), ['verify_email']);
    expect(await svc.isStillValid(id)).toBe(false);
    expect(await svc.isStillValid(crypto.randomUUID())).toBe(false);
  });

  it('resend honours the cooldown and then only the newest code works', async () => {
    const id = await svc.issue(user, 'verify_email');
    const oldCode = await sentCode();
    advance(30);
    await expect(svc.resend(id)).rejects.toThrow('RESEND_TOO_SOON');
    advance(31);
    const next = await svc.resend(id);
    expect(next).not.toBe(id);
    await expect(svc.verify(id, oldCode, ['verify_email'])).rejects.toThrow('CHALLENGE_NOT_FOUND');
    const newCode = await sentCode();
    expect((await svc.verify(next, newCode, ['verify_email'])).id).toBe(user.id);
  });

  it('the 6th issue within an hour is refused', async () => {
    for (let i = 0; i < 5; i++) await svc.issue(user, 'login');
    await expect(svc.issue(user, 'login')).rejects.toThrow('RESEND_TOO_SOON');
  });

  it('per-address cap: 10 emails in an hour (notices included) block issue', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.enqueueEmail({ kind: 'register_attempt_notice', to: user.email, locale: 'pt', payload: {} });
    }
    await expect(svc.issue(user, 'verify_email')).rejects.toThrow('RESEND_TOO_SOON');
  });

  it('decoys: verify is not found, resend returns a uuid, nothing is stored', async () => {
    const decoy = svc.issueDecoy();
    expect(decoy).toMatch(/^[0-9a-f-]{36}$/);
    await expect(svc.verify(decoy, '123456', ['verify_email'])).rejects.toThrow('CHALLENGE_NOT_FOUND');
    expect(await svc.resend(decoy)).toMatch(/^[0-9a-f-]{36}$/);
    expect(await outbox.claimPending(10)).toHaveLength(0);
  });
});
