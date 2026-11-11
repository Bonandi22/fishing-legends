// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, memoryHandlesOf } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { jarFrom, latestCodeFor, latestEmailTo, loginSession, registerSession } from '../testing/authClient.js';
import { createOpaqueToken, hashPassword, hashToken } from './crypto.js';

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
const post = (a: App, url: string, payload: unknown) => a.inject({ method: 'POST', url, payload: payload as never });
const handles = (a: App) => {
  const h = memoryHandlesOf(a);
  if (!h) throw new Error('memory app expected');
  return h;
};
const kindsTo = (a: App, email: string) => handles(a).outbox.messages().filter(m => m.to === email).map(m => m.kind);

/** Seed an account the way it looked before verification existed: unverified, with a live session. */
async function seedLegacyUserWithSession(a: App, email: string, username: string) {
  const repo = handles(a).authRepository;
  const user = await repo.createUser({
    email, passwordHash: await hashPassword('a-legacy-password-123'), username, country: 'PT', locale: 'en',
  });
  const refreshToken = createOpaqueToken();
  await repo.createSession({ userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + 3_600_000) });
  return { user, refreshToken };
}

describe('registration requires email confirmation', () => {
  it('register returns 202 { challengeId } and sets no cookies', async () => {
    const a = await app();
    const res = await post(a, '/api/v1/auth/register', { ...creds, locale: 'pt' });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ challengeId: expect.any(String) });
    expect(res.headers['set-cookie']).toBeUndefined();
    const mail = latestEmailTo(a, creds.email);
    expect(mail).toMatchObject({ kind: 'verify_email_code', locale: 'pt', challengeId: res.json().challengeId });
  });

  it('verify-email with the emailed code sets cookies and /me works', async () => {
    const a = await app();
    const verified = await registerSession(a, creds);
    expect(verified.statusCode).toBe(200);
    expect(verified.json().user).toMatchObject({ email: creds.email, username: creds.username });
    const me = await a.inject({ method: 'GET', url: '/api/v1/me', cookies: jarFrom(verified.headers['set-cookie']) });
    expect(me.statusCode).toBe(200);
    const stored = await handles(a).authRepository.findUserByEmail(creds.email);
    expect(stored?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('verify-email rejects a wrong code (400) and an unknown challenge (404)', async () => {
    const a = await app();
    const reg = await post(a, '/api/v1/auth/register', creds);
    const code = latestCodeFor(a, creds.email);
    const wrong = await post(a, '/api/v1/auth/verify-email', { challengeId: reg.json().challengeId, code: code === '000000' ? '000001' : '000000' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('INVALID_CODE');
    expect(wrong.headers['set-cookie']).toBeUndefined();
    const unknown = await post(a, '/api/v1/auth/verify-email', { challengeId: crypto.randomUUID(), code });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('CHALLENGE_NOT_FOUND');
  });

  it('register with an existing email responds identically and enqueues register_attempt_notice', async () => {
    const a = await app();
    const fresh = await post(a, '/api/v1/auth/register', creds);
    const again = await post(a, '/api/v1/auth/register', { ...creds, username: 'other_user', email: ' USER@x.com ' });
    expect(again.statusCode).toBe(fresh.statusCode);
    expect(Object.keys(again.json())).toEqual(Object.keys(fresh.json()));
    expect(again.json().challengeId).toEqual(expect.any(String));
    expect(again.headers['set-cookie']).toBeUndefined();
    expect(kindsTo(a, creds.email)).toEqual(['verify_email_code', 'register_attempt_notice']);
    expect(latestEmailTo(a, creds.email)?.payload).toEqual({});

    // The decoy behaves like a real challenge: wrong codes, never a session.
    const tryIt = await post(a, '/api/v1/auth/verify-email', { challengeId: again.json().challengeId, code: '123456' });
    expect(tryIt.statusCode).toBe(400);
    expect(tryIt.json().error.code).toBe('INVALID_CODE');
  });

  it('a taken username is still an explicit 409, whether or not the email exists', async () => {
    const a = await app();
    await post(a, '/api/v1/auth/register', creds);
    for (const email of ['someone@else.com', creds.email]) {
      const res = await post(a, '/api/v1/auth/register', { ...creds, email, username: 'FLOW_USER' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('USERNAME_TAKEN');
    }
  });

  it("register with 'Password1234' -> 400 WEAK_PASSWORD reason TOO_COMMON", async () => {
    const a = await app();
    const res = await post(a, '/api/v1/auth/register', { ...creds, password: 'Password1234' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: 'WEAK_PASSWORD', message: expect.any(String), reason: 'TOO_COMMON' } });
  });

  it('WEAK_PASSWORD reasons come from the shared policy (personal info, code-point length)', async () => {
    const a = await app();
    const personal = await post(a, '/api/v1/auth/register', { ...creds, password: 'my-flow_user-password' });
    expect(personal.json().error.reason).toBe('CONTAINS_PERSONAL_INFO');
    const short = await post(a, '/api/v1/auth/register', { ...creds, password: 'short' });
    expect(short.json().error).toMatchObject({ code: 'WEAK_PASSWORD', reason: 'TOO_SHORT' });
    // 12 emoji = 24 UTF-16 units but 12 code points: long enough for the policy.
    const emoji = await post(a, '/api/v1/auth/register', { ...creds, password: '🐟'.repeat(12) });
    expect(emoji.statusCode).toBe(202);
  });

  it('per-address cap reached: still 202 with an id, but no email is enqueued', async () => {
    const a = await app();
    for (let i = 0; i < 10; i++) {
      await handles(a).authRepository.enqueueEmail({ kind: 'register_attempt_notice', to: creds.email, locale: 'en', payload: {} });
    }
    const res = await post(a, '/api/v1/auth/register', creds);
    expect(res.statusCode).toBe(202);
    expect(res.json().challengeId).toEqual(expect.any(String));
    expect(kindsTo(a, creds.email)).not.toContain('verify_email_code');

    const again = await post(a, '/api/v1/auth/register', { ...creds, username: 'other_user' });
    expect(again.statusCode).toBe(202);
    expect(kindsTo(a, creds.email)).toHaveLength(10);
  });
});

describe('two-step login', () => {
  it('login -> 202, login/verify -> cookies', async () => {
    const a = await app();
    await registerSession(a, creds);
    const login = await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password });
    expect(login.statusCode).toBe(202);
    expect(login.json()).toEqual({ challengeId: expect.any(String) });
    expect(login.headers['set-cookie']).toBeUndefined();
    expect(latestEmailTo(a, creds.email)?.kind).toBe('login_code');

    const verified = await post(a, '/api/v1/auth/login/verify', { challengeId: login.json().challengeId, code: latestCodeFor(a, creds.email) });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().user.email).toBe(creds.email);
    const me = await a.inject({ method: 'GET', url: '/api/v1/me', cookies: jarFrom(verified.headers['set-cookie']) });
    expect(me.statusCode).toBe(200);
  });

  it("login with ' User@X.COM ' after registering 'user@x.com' works", async () => {
    const a = await app();
    await registerSession(a, creds);
    const res = await loginSession(a, { email: ' User@X.COM ', password: creds.password });
    expect(res.statusCode).toBe(200);
  });

  it('wrong password and unknown email are the same 401 INVALID_CREDENTIALS, with no challenge', async () => {
    const a = await app();
    await registerSession(a, creds);
    const before = handles(a).outbox.messages().length;
    for (const body of [{ email: creds.email, password: 'not-the-password' }, { email: 'ghost@x.com', password: 'not-the-password' }]) {
      const res = await post(a, '/api/v1/auth/login', body);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(handles(a).outbox.messages()).toHaveLength(before);
  });

  it('an unverified user logging in gets a verify_email challenge; verifying marks the account verified', async () => {
    const a = await app();
    await post(a, '/api/v1/auth/register', creds); // never verified
    const login = await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password });
    expect(login.statusCode).toBe(202);
    expect(latestEmailTo(a, creds.email)?.kind).toBe('verify_email_code');

    const verified = await post(a, '/api/v1/auth/login/verify', { challengeId: login.json().challengeId, code: latestCodeFor(a, creds.email) });
    expect(verified.statusCode).toBe(200);
    expect((await handles(a).authRepository.findUserByEmail(creds.email))?.emailVerifiedAt).toBeInstanceOf(Date);

    await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password });
    expect(latestEmailTo(a, creds.email)?.kind).toBe('login_code');
  });

  it('verify-email does not accept a login challenge', async () => {
    const a = await app();
    await registerSession(a, creds);
    const login = await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password });
    const res = await post(a, '/api/v1/auth/verify-email', { challengeId: login.json().challengeId, code: latestCodeFor(a, creds.email) });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CHALLENGE_NOT_FOUND');
  });

  it('login stores the request locale and the code email uses it', async () => {
    const a = await app();
    await registerSession(a, { ...creds, locale: 'pt' });
    await post(a, '/api/v1/auth/login', { email: creds.email, password: creds.password, locale: 'ja' });
    expect(latestEmailTo(a, creds.email)?.locale).toBe('ja');
    expect((await handles(a).authRepository.findUserByEmail(creds.email))?.locale).toBe('ja');
  });

  it('rejects an unsupported locale', async () => {
    const a = await app();
    const res = await post(a, '/api/v1/auth/register', { ...creds, locale: 'xx' });
    expect(res.statusCode).toBe(400);
  });
});

describe('resend', () => {
  it('202 with a new id once the cooldown passes; only the newest code works', async () => {
    const a = await app({ authCodes: { ...config.authCodes, resendCooldownSeconds: 0 } });
    const reg = await post(a, '/api/v1/auth/register', creds);
    const oldCode = latestCodeFor(a, creds.email);
    const res = await post(a, '/api/v1/auth/challenges/resend', { challengeId: reg.json().challengeId });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ challengeId: expect.any(String) });
    expect(res.json().challengeId).not.toBe(reg.json().challengeId);
    const stale = await post(a, '/api/v1/auth/verify-email', { challengeId: reg.json().challengeId, code: oldCode });
    expect(stale.statusCode).toBe(404);
    const ok = await post(a, '/api/v1/auth/verify-email', { challengeId: res.json().challengeId, code: latestCodeFor(a, creds.email) });
    expect(ok.statusCode).toBe(200);
  });

  it('429 RESEND_TOO_SOON inside the cooldown, for a real challenge and a decoy alike', async () => {
    const a = await app();
    const real = await post(a, '/api/v1/auth/register', creds);
    const decoy = await post(a, '/api/v1/auth/register', { ...creds, username: 'other_user' });
    for (const id of [real.json().challengeId, decoy.json().challengeId]) {
      const res = await post(a, '/api/v1/auth/challenges/resend', { challengeId: id });
      expect(res.statusCode).toBe(429);
      expect(res.json().error.code).toBe('RESEND_TOO_SOON');
    }
  });

  it('404 CHALLENGE_NOT_FOUND for an unknown id; 400 for a malformed one', async () => {
    const a = await app();
    const unknown = await post(a, '/api/v1/auth/challenges/resend', { challengeId: crypto.randomUUID() });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('CHALLENGE_NOT_FOUND');
    const malformed = await post(a, '/api/v1/auth/challenges/resend', { challengeId: 'nope' });
    expect(malformed.statusCode).toBe(400);
  });
});

describe('accounts from before verification existed', () => {
  it('refresh still works for a session created before verification existed', async () => {
    const a = await app();
    const { refreshToken } = await seedLegacyUserWithSession(a, 'legacy@x.com', 'legacy_user');
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { dbl_rt: refreshToken } });
    expect(res.statusCode).toBe(204);
    const me = await a.inject({ method: 'GET', url: '/api/v1/me', cookies: jarFrom(res.headers['set-cookie']) });
    expect(me.statusCode).toBe(200);
  });
});

const legacyState = {
  schemaVersion: 1,
  player: {
    level: 4, xp: 0, xpToNextLevel: 400, totalFishCaught: 3,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
  },
};

describe('leaderboard only lists players with game state', () => {
  it('an unverified user without game state never appears; a legacy unverified user with state does', async () => {
    const a = await app();
    await post(a, '/api/v1/auth/register', creds); // unverified, no state
    const { refreshToken } = await seedLegacyUserWithSession(a, 'legacy@x.com', 'legacy_user');
    const refreshed = await a.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { dbl_rt: refreshToken } });
    const jar = jarFrom(refreshed.headers['set-cookie']);
    const boot = await a.inject({
      method: 'POST', url: '/api/v1/me/state/bootstrap', cookies: jar,
      headers: { 'x-csrf-token': jar.dbl_csrf, 'idempotency-key': crypto.randomUUID() },
      payload: { state: legacyState },
    });
    expect(boot.statusCode).toBe(200);

    const board = await a.inject({ method: 'GET', url: '/api/v1/leaderboard?limit=50&offset=0', cookies: jar });
    expect(board.statusCode).toBe(200);
    const names = board.json().entries.map((e: { username: string }) => e.username);
    expect(names).toEqual(['legacy_user']);
    expect(board.json().total).toBe(1);
  });
});

describe('auth rate-limit bucket', () => {
  it('covers verify-email, login/verify and challenges/resend', async () => {
    for (const url of ['/api/v1/auth/verify-email', '/api/v1/auth/login/verify', '/api/v1/auth/challenges/resend']) {
      const a = await app({ authRateLimitMax: 2 });
      const body = url.endsWith('resend') ? { challengeId: crypto.randomUUID() } : { challengeId: crypto.randomUUID(), code: '123456' };
      expect((await post(a, url, body)).statusCode).toBe(404);
      expect((await post(a, url, body)).statusCode).toBe(404);
      const limited = await post(a, `${url}?bypass=1`, body);
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('RATE_LIMITED');
    }
  });
});
