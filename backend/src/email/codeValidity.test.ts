// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createMemoryOutbox } from './outbox.js';
import { createEmailWorker, type EmailSender } from './worker.js';
import { renderEmail } from './templates.js';
import { codeValidityCheck } from './codeValidity.js';
import { createMemoryAuthRepository } from '../auth/memoryRepository.js';
import { createChallengeService } from '../auth/challenges.js';

const cfg = { secret: new Uint8Array(32), ttlSeconds: 1800, maxAttempts: 5, resendCooldownSeconds: 60 };

async function setup() {
  let t = Date.now();
  const now = () => new Date(t);
  const outbox = createMemoryOutbox({ now });
  const repo = createMemoryAuthRepository(outbox);
  const challenges = createChallengeService(repo, cfg, now);
  const user = await repo.createUser({ email: 'w@example.com', passwordHash: 'h', username: 'worker_u', country: 'BR', locale: 'en' });
  const send = vi.fn<EmailSender['send']>(async () => undefined);
  const worker = createEmailWorker({ sender: { send }, outbox, isCodeStillValid: codeValidityCheck(challenges), ttlMinutes: 30 });
  return { outbox, repo, challenges, user, send, worker, advance: (s: number) => { t += s * 1000; } };
}

describe('worker code validity backed by challenges.isStillValid', () => {
  it('a live challenge sends the code', async () => {
    const { outbox, challenges, user, send, worker } = await setup();
    await challenges.issue(user, 'login');
    const [msg] = outbox.messages();
    expect(await worker.handle(msg, 1)).toBe('sent');
    expect(send.mock.calls[0][0].text).toContain(msg.payload.code);
  });

  it('an expired challenge -> code_expired_notice, never the code', async () => {
    const { outbox, challenges, user, send, worker, advance } = await setup();
    await challenges.issue(user, 'login');
    advance(1801);
    const [msg] = outbox.messages();
    expect(await worker.handle(msg, 1)).toBe('sent');
    const mail = send.mock.calls[0][0];
    expect(mail.subject).toBe(renderEmail('code_expired_notice', 'en', {}).subject);
    expect(mail.text).not.toContain(msg.payload.code);
  });

  it('a superseded challenge -> code_expired_notice', async () => {
    const { outbox, challenges, user, send, worker } = await setup();
    await challenges.issue(user, 'login');
    await challenges.issue(user, 'login');
    const [first] = outbox.messages();
    await worker.handle(first, 1);
    expect(send.mock.calls[0][0].subject).toBe(renderEmail('code_expired_notice', 'en', {}).subject);
  });

  it('a message without a challengeId is treated as valid', async () => {
    const { challenges } = await setup();
    const check = codeValidityCheck(challenges);
    expect(await check({ id: 'x', kind: 'register_attempt_notice', to: 'a@b.c', locale: 'en', payload: {}, createdAt: new Date() })).toBe(true);
  });
});
