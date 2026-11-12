// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, memoryHandlesOf } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { jarFrom, latestCodeFor, latestEmailTo, registerSession } from '../testing/authClient.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000,
  authRateLimitMax: 1000, authRateLimitWindowMs: 300_000, trustProxy: false,
  cookieSecure: false, email: { smtp: { host: 'localhost', port: 1025, secure: false }, from: 'test@localhost' },
  authCodes: { secret: new Uint8Array(32), ttlSeconds: 1800, maxAttempts: 5, resendCooldownSeconds: 60 },
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });
async function app(overrides: Partial<AppConfig> = {}) {
  const a = await createApp({ config: { ...config, ...overrides } });
  apps.add(a);
  return a;
}
type App = Awaited<ReturnType<typeof app>>;

const creds = { email: 'user@x.com', password: 'a-very-strong-password', username: 'flow_user', country: 'br' };
const NEW_PASSWORD = 'a-brand-new-password-987';
const post = (a: App, url: string, payload: unknown) => a.inject({ method: 'POST', url, payload: payload as never });
const forgot = (a: App, email: string, extra: object = {}) => post(a, '/api/v1/auth/password/forgot', { email, ...extra });
const reset = (a: App, body: object) => post(a, '/api/v1/auth/password/reset', body);
const handles = (a: App) => {
  const h = memoryHandlesOf(a);
  if (!h) throw new Error('memory app expected');
  return h;
};
const kindsTo = (a: App, email: string) => handles(a).outbox.messages().filter(m => m.to === email).map(m => m.kind);

describe('password recovery', () => {
  it('unknown email: same 202 shape, no email, a stored decoy that never verifies', async () => {
    const a = await app();
    await registerSession(a, creds);
    const known = await forgot(a, creds.email);
    const before = handles(a).outbox.messages().length;
    const unknown = await forgot(a, ' Ghost@X.com ');
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.statusCode).toBe(202);
    expect(Object.keys(unknown.json())).toEqual(Object.keys(known.json()));
    expect(unknown.headers['set-cookie']).toBeUndefined();
    expect(handles(a).outbox.messages()).toHaveLength(before);
    expect(kindsTo(a, 'ghost@x.com')).toEqual([]);

    const decoy = await handles(a).authRepository.findChallenge(unknown.json().challengeId);
    expect(decoy).toMatchObject({ userId: null, decoyEmail: 'ghost@x.com', purpose: 'password_reset' });
    const attempt = await reset(a, { challengeId: unknown.json().challengeId, code: '123456', newPassword: NEW_PASSWORD });
    expect(attempt.statusCode).toBe(400);
    expect(attempt.json().error.code).toBe('INVALID_CODE');
  });

  it('known email enqueues a password_reset_code in the stored locale; locale updated only if sent', async () => {
    const a = await app();
    await registerSession(a, { ...creds, locale: 'pt' });
    const res = await forgot(a, creds.email);
    expect(res.statusCode).toBe(202);
    expect(latestEmailTo(a, creds.email)).toMatchObject({ kind: 'password_reset_code', locale: 'pt', challengeId: res.json().challengeId });
    const b = await app();
    await registerSession(b, { ...creds, locale: 'pt' });
    await forgot(b, creds.email, { locale: 'ja' });
    expect(latestEmailTo(b, creds.email)?.locale).toBe('ja');
  });

  it('the hourly cap is per purpose: a recently active account and an unknown email hit 429 on the same (6th) request', async () => {
    const a = await app();
    await registerSession(a, creds); // verify_email challenge
    await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password }); // login challenge
    for (const email of [creds.email, 'ghost@x.com']) {
      for (let i = 0; i < 5; i++) expect((await forgot(a, email)).statusCode).toBe(202);
      const sixth = await forgot(a, email);
      expect(sixth.statusCode).toBe(429);
      expect(sixth.json().error.code).toBe('RESEND_TOO_SOON');
    }
  });

  it('reset with the right code: old password fails, new one gets a login challenge, sessions revoked, no cookies', async () => {
    const a = await app();
    const session = await registerSession(a, creds);
    const refreshToken = jarFrom(session.headers['set-cookie']).dbl_rt;
    const f = await forgot(a, creds.email);
    const res = await reset(a, { challengeId: f.json().challengeId, code: latestCodeFor(a, creds.email), newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined();

    expect((await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password })).statusCode).toBe(401);
    expect((await post(a, '/api/v1/auth/login', { email: creds.email, password: NEW_PASSWORD })).statusCode).toBe(202);
    expect(latestEmailTo(a, creds.email)?.kind).toBe('login_code');

    const refreshed = await a.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { dbl_rt: refreshToken } });
    expect(refreshed.statusCode).toBe(401);
  });

  it('the code is single use', async () => {
    const a = await app();
    await registerSession(a, creds);
    const f = await forgot(a, creds.email);
    const body = { challengeId: f.json().challengeId, code: latestCodeFor(a, creds.email), newPassword: NEW_PASSWORD };
    expect((await reset(a, body)).statusCode).toBe(204);
    expect((await reset(a, { ...body, newPassword: 'yet-another-password-555' })).statusCode).toBe(404);
  });

  it('wrong code: 400 INVALID_CODE and the password is unchanged', async () => {
    const a = await app();
    await registerSession(a, creds);
    const f = await forgot(a, creds.email);
    const code = latestCodeFor(a, creds.email);
    const res = await reset(a, { challengeId: f.json().challengeId, code: code === '000000' ? '000001' : '000000', newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_CODE');
    expect((await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password })).statusCode).toBe(202);
  });

  it('same password -> WEAK_PASSWORD SAME_AS_CURRENT; weak password -> its policy reason', async () => {
    const a = await app();
    await registerSession(a, creds);
    const same = await forgot(a, creds.email);
    const r1 = await reset(a, { challengeId: same.json().challengeId, code: latestCodeFor(a, creds.email), newPassword: creds.password });
    expect(r1.statusCode).toBe(400);
    expect(r1.json().error).toMatchObject({ code: 'WEAK_PASSWORD', reason: 'SAME_AS_CURRENT' });

    const weak = await forgot(a, creds.email);
    const r2 = await reset(a, { challengeId: weak.json().challengeId, code: latestCodeFor(a, creds.email), newPassword: 'Password1234' });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().error).toMatchObject({ code: 'WEAK_PASSWORD', reason: 'TOO_COMMON' });
  });

  it('reset marks an unverified account verified', async () => {
    const a = await app();
    await post(a, '/api/v1/auth/register', creds); // never verified
    expect((await handles(a).authRepository.findUserByEmail(creds.email))?.emailVerifiedAt).toBeNull();
    const f = await forgot(a, creds.email);
    const res = await reset(a, { challengeId: f.json().challengeId, code: latestCodeFor(a, creds.email), newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(204);
    expect((await handles(a).authRepository.findUserByEmail(creds.email))?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('reset does not accept a login challenge', async () => {
    const a = await app();
    await registerSession(a, creds);
    const login = await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password });
    const res = await reset(a, { challengeId: login.json().challengeId, code: latestCodeFor(a, creds.email), newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(404);
  });

  it('both routes are in the auth rate-limit bucket (encoded variant too)', async () => {
    for (const url of ['/api/v1/auth/password/forgot', '/api/v1/auth/password/reset']) {
      const a = await app({ authRateLimitMax: 2 });
      const isForgot = url.endsWith('forgot');
      const body = isForgot ? { email: 'ghost@x.com' } : { challengeId: crypto.randomUUID(), code: '123456', newPassword: NEW_PASSWORD };
      const expected = isForgot ? 202 : 404;
      expect((await post(a, url, body)).statusCode).toBe(expected);
      expect((await post(a, url, body)).statusCode).toBe(expected);
      const limited = await post(a, url.replace('password', 'p%61ssword'), body);
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('RATE_LIMITED');
    }
  });

  it('CSRF is required on both routes when a dbl_csrf cookie exists', async () => {
    const a = await app();
    const calls = [
      ['/api/v1/auth/password/forgot', { email: 'ghost@x.com' }],
      ['/api/v1/auth/password/reset', { challengeId: crypto.randomUUID(), code: '123456', newPassword: NEW_PASSWORD }],
    ] as const;
    for (const [url, payload] of calls) {
      const res = await a.inject({ method: 'POST', url, payload, cookies: { dbl_csrf: 'abc' } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('CSRF_FAILED');
    }
  });

  it('a failing password update leaves sessions revoked and the old password working', async () => {
    const a = await app();
    const session = await registerSession(a, creds);
    const refreshToken = jarFrom(session.headers['set-cookie']).dbl_rt;
    const f = await forgot(a, creds.email);
    const repo = handles(a).authRepository;
    const original = repo.updatePasswordHash;
    repo.updatePasswordHash = async () => { throw new Error('boom'); };
    const res = await reset(a, { challengeId: f.json().challengeId, code: latestCodeFor(a, creds.email), newPassword: NEW_PASSWORD });
    repo.updatePasswordHash = original;
    expect(res.statusCode).toBe(500);
    expect((await a.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { dbl_rt: refreshToken } })).statusCode).toBe(401);
    expect((await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password })).statusCode).toBe(202);
  });
  it('a password the server rejects does not burn the code: the same challenge then succeeds', async () => {
    const a = await app();
    await registerSession(a, creds);
    const f = await forgot(a, creds.email);
    const code = latestCodeFor(a, creds.email);
    const same = await reset(a, { challengeId: f.json().challengeId, code, newPassword: creds.password });
    expect(same.json().error).toMatchObject({ code: 'WEAK_PASSWORD', reason: 'SAME_AS_CURRENT' });
    const personal = await reset(a, { challengeId: f.json().challengeId, code, newPassword: `my-${creds.username}-pass-77` });
    expect(personal.json().error).toMatchObject({ code: 'WEAK_PASSWORD', reason: 'CONTAINS_PERSONAL_INFO' });
    expect((await handles(a).authRepository.findChallenge(f.json().challengeId))?.attempts).toBe(2);
    const ok = await reset(a, { challengeId: f.json().challengeId, code, newPassword: NEW_PASSWORD });
    expect(ok.statusCode).toBe(204);
    expect((await post(a, '/api/v1/auth/login', { email: creds.email, password: NEW_PASSWORD })).statusCode).toBe(202);
  });
});

describe('per-address email cap', () => {
  it('5 resets + 5 register attempts to an address do not stop the owner login code', async () => {
    const a = await app();
    await registerSession(a, creds);
    for (let i = 0; i < 5; i++) expect((await forgot(a, creds.email)).statusCode).toBe(202);
    for (let i = 0; i < 5; i++) {
      const res = await post(a, '/api/v1/auth/register', { ...creds, username: `squatter_${i}` });
      expect(res.statusCode).toBe(202);
    }
    // The notice throttle keeps those 10 requests to 7 emails; top the address up to the cap.
    const repo = handles(a).authRepository;
    while ((await repo.countEmailsTo(creds.email, new Date(Date.now() - 3_600_000))) < 10) {
      await repo.enqueueEmail({ kind: 'register_attempt_notice', to: creds.email, locale: 'en', payload: {} });
    }
    const before = kindsTo(a, creds.email).length;
    const login = await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password });
    expect(login.statusCode).toBe(202);
    expect(kindsTo(a, creds.email)).toHaveLength(before + 1);
    expect(latestEmailTo(a, creds.email)).toMatchObject({ kind: 'login_code', challengeId: login.json().challengeId });
  });

  it('register_attempt_notice is sent at most once per address per 24h, with an unchanged response', async () => {
    const a = await app();
    await registerSession(a, creds);
    const answers: number[] = [];
    for (let i = 0; i < 3; i++) {
      answers.push((await post(a, '/api/v1/auth/register', { ...creds, username: `squatter_${i}` })).statusCode);
    }
    expect(answers).toEqual([202, 202, 202]);
    expect(kindsTo(a, creds.email).filter(k => k === 'register_attempt_notice')).toHaveLength(1);
  });
});
