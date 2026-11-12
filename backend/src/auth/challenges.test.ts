import { beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { createMemoryOutbox, type MemoryOutbox } from '../email/outbox.js';
import { createMemoryAuthRepository } from './memoryRepository.js';
import { createChallengeService } from './challenges.js';
import type { AuthUser, ChallengePurpose } from './types.js';

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

  // The address cap must never surface as an error: notices can push a real
  // address over it while a decoy never reaches it, which would be an oracle.
  it('per-address cap: at 10 emails in an hour (notices included) issue still succeeds but sends nothing', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.enqueueEmail({ kind: 'register_attempt_notice', to: user.email, locale: 'pt', payload: {} });
    }
    const id = await svc.issue(user, 'verify_email');
    expect(await svc.isStillValid(id)).toBe(true);
    expect(outbox.messages().filter(m => m.kind === 'verify_email_code')).toHaveLength(0);
    expect(await outbox.countRecipientSince(user.email, new Date(0))).toBe(10);
  });

  it('per-address cap: a capped issue still supersedes the previous live challenge', async () => {
    const first = await svc.issue(user, 'login');
    for (let i = 0; i < 9; i++) {
      await repo.enqueueEmail({ kind: 'register_attempt_notice', to: user.email, locale: 'pt', payload: {} });
    }
    await svc.issue(user, 'login');
    expect(await svc.isStillValid(first)).toBe(false);
  });

  it('20 concurrent wrong verifies grant at most 5 INVALID_CODE and end at 5 attempts', async () => {
    const id = await svc.issue(user, 'verify_email');
    const code = await sentCode();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => svc.verify(id, wrong(code), ['verify_email'])));
    const msgs = results.map(r => (r.status === 'rejected' ? (r.reason as Error).message : 'OK'));
    expect(msgs.filter(m => m === 'INVALID_CODE').length).toBeLessThanOrEqual(5);
    expect(msgs.filter(m => m === 'OK')).toHaveLength(0);
    expect((await repo.findChallenge(id))?.attempts).toBe(5);
  });

  it('unknown and superseded ids are CHALLENGE_NOT_FOUND for verify and resend', async () => {
    const first = await svc.issue(user, 'login');
    advance(61);
    await svc.resend(first);
    for (const id of [first, crypto.randomUUID()]) {
      await expect(svc.verify(id, '123456', ['login'])).rejects.toThrow('CHALLENGE_NOT_FOUND');
      await expect(svc.resend(id)).rejects.toThrow('CHALLENGE_NOT_FOUND');
    }
  });

  it('a decoy never verifies and is never emailed', async () => {
    const id = await svc.issueDecoy('nobody@example.com', 'login');
    expect(await svc.isStillValid(id)).toBe(true);
    await expect(svc.verify(id, '123456', ['login'])).rejects.toThrow('INVALID_CODE');
    expect(await outbox.claimPending(10)).toHaveLength(0);
  });

  // The same externally observable scenario must play out for a real challenge
  // and a decoy, so responses cannot be used to enumerate accounts.
  describe.each([
    ['real challenge', () => svc.issue(user, 'login')],
    ['decoy', () => svc.issueDecoy('ghost@example.com', 'login')],
  ])('indistinguishable behaviour: %s', (_name, start) => {
    const outcome = async (fn: () => Promise<unknown>) => {
      try { await fn(); return 'ok'; } catch (e) { return (e as Error).message; }
    };

    it('wrong code x6 -> INVALID_CODE x4 then TOO_MANY_ATTEMPTS x2', async () => {
      const id = await start();
      const out: string[] = [];
      for (let i = 0; i < 6; i++) out.push(await outcome(() => svc.verify(id, 'abcdef', ['login'])));
      expect(out).toEqual(['INVALID_CODE', 'INVALID_CODE', 'INVALID_CODE', 'INVALID_CODE', 'TOO_MANY_ATTEMPTS', 'TOO_MANY_ATTEMPTS']);
    });

    it('resend: +30 s too soon, +61 s new id', async () => {
      const id = await start();
      advance(30);
      expect(await outcome(() => svc.resend(id))).toBe('RESEND_TOO_SOON');
      advance(31);
      const next = await svc.resend(id);
      expect(next).not.toBe(id);
      await expect(svc.verify(id, '123456', ['login'])).rejects.toThrow('CHALLENGE_NOT_FOUND');
    });

    it('6th issue within an hour -> RESEND_TOO_SOON', async () => {
      for (let i = 0; i < 5; i++) await start();
      expect(await outcome(start)).toBe('RESEND_TOO_SOON');
    });
  });
  // I1: codes issued only after a correct password cannot be used to flood an
  // inbox, so the per-address cap must not suppress them.
  it('per-address cap: login codes, and verify_email issued after a password check, are still sent', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.enqueueEmail({ kind: 'register_attempt_notice', to: user.email, locale: 'pt', payload: {} });
    }
    await svc.issue(user, 'login');
    await svc.issue(user, 'verify_email', { afterPasswordCheck: true });
    await svc.issue(user, 'password_reset');
    const kinds = outbox.messages().map(m => m.kind);
    expect(kinds.filter(k => k === 'login_code')).toHaveLength(1);
    expect(kinds.filter(k => k === 'verify_email_code')).toHaveLength(1);
    expect(kinds.filter(k => k === 'password_reset_code')).toHaveLength(0);
  });

  it('per-address exemption does not lift the per-user hourly cap', async () => {
    for (let i = 0; i < 5; i++) await svc.issue(user, 'login');
    await expect(svc.issue(user, 'login')).rejects.toThrow('RESEND_TOO_SOON');
  });

  // I2: a check run after the code matched but before it is consumed (the reset
  // password policy) must leave the challenge usable; the attempt still counts.
  it('a rejecting beforeConsume hook keeps the challenge live and counts the attempt', async () => {
    const id = await svc.issue(user, 'password_reset');
    const code = await sentCode();
    await expect(svc.verify(id, code, ['password_reset'], async () => { throw new Error('WEAK'); })).rejects.toThrow('WEAK');
    expect((await repo.findChallenge(id))?.attempts).toBe(1);
    expect(await svc.isStillValid(id)).toBe(true);
    const seen: string[] = [];
    const verified = await svc.verify(id, code, ['password_reset'], async u => { seen.push(u.id); });
    expect(verified.id).toBe(user.id);
    expect(seen).toEqual([user.id]);
    expect(await svc.isStillValid(id)).toBe(false);
  });

  // I4: a rolling 24h ceiling of 30 failed attempts per subject, across purposes.
  describe.each([
    ['real account', (p: ChallengePurpose) => svc.issue(user, p)],
    ['decoy', (p: ChallengePurpose) => svc.issueDecoy('ghost@example.com', p)],
  ])('24h failed-attempt ceiling: %s', (_name, start) => {
    const outcome = async (fn: () => Promise<unknown>) => {
      try { await fn(); return 'ok'; } catch (e) { return (e as Error).message; }
    };
    async function burn(failures: number) {
      const purposes: ChallengePurpose[] = ['login', 'password_reset', 'verify_email'];
      let done = 0;
      for (let i = 0; done < failures; i++) {
        const purpose = purposes[i % 3];
        const id = await start(purpose);
        for (let k = 0; k < 5 && done < failures; k++, done++) {
          expect(await outcome(() => svc.verify(id, 'abcdef', [purpose]))).toMatch(/INVALID_CODE|TOO_MANY_ATTEMPTS/);
        }
      }
    }

    it('after 30 failures every verify answers TOO_MANY_ATTEMPTS without spending an attempt, until 24h pass', async () => {
      await burn(30);
      const id = await start('login');
      expect(await outcome(() => svc.verify(id, 'abcdef', ['login']))).toBe('TOO_MANY_ATTEMPTS');
      expect((await repo.findChallenge(id))?.attempts).toBe(0);
      advance(24 * 3600 + 1);
      const fresh = await start('login');
      expect(await outcome(() => svc.verify(fresh, 'abcdef', ['login']))).toBe('INVALID_CODE');
    });
  });

  it('after 30 failures the right code is refused too (real account)', async () => {
    const purposes: ChallengePurpose[] = ['login', 'password_reset', 'verify_email'];
    for (let i = 0; i < 6; i++) {
      const id = await svc.issue(user, purposes[i % 3]);
      for (let k = 0; k < 5; k++) await svc.verify(id, 'abcdef', [purposes[i % 3]]).catch(() => undefined);
    }
    const id = await svc.issue(user, 'login');
    const code = await sentCode();
    await expect(svc.verify(id, code, ['login'])).rejects.toThrow('TOO_MANY_ATTEMPTS');
  });

  // A register-existing decoy targets a real address. If it had its own budget, an
  // attacker could compare it against `forgot` to learn whether the address exists.
  it('failures on decoys for a real address count against that account', async () => {
    const purposes: ChallengePurpose[] = ['login', 'password_reset', 'verify_email'];
    for (let i = 0; i < 6; i++) {
      const id = await svc.issueDecoy(user.email.toUpperCase(), purposes[i % 3]);
      for (let k = 0; k < 5; k++) await svc.verify(id, 'abcdef', [purposes[i % 3]]).catch(() => undefined);
    }
    const id = await svc.issue(user, 'login');
    const code = await sentCode();
    await expect(svc.verify(id, code, ['login'])).rejects.toThrow('TOO_MANY_ATTEMPTS');
  });

  it('29 failures still allow the right code', async () => {
    const purposes: ChallengePurpose[] = ['login', 'password_reset', 'verify_email'];
    let done = 0;
    for (let i = 0; done < 29; i++) {
      const id = await svc.issue(user, purposes[i % 3]);
      for (let k = 0; k < 5 && done < 29; k++, done++) await svc.verify(id, 'abcdef', [purposes[i % 3]]).catch(() => undefined);
    }
    const id = await svc.issue(user, 'login');
    const code = await sentCode();
    expect((await svc.verify(id, code, ['login'])).id).toBe(user.id);
  });
});
