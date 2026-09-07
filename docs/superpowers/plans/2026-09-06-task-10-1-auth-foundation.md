# Task 10.1 — Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the frontend into an authenticated client of the backend using httpOnly cookies behind a same-origin `/api` proxy, without moving game state to the server yet.

**Architecture:** The backend sets `dbl_at` / `dbl_rt` / `dbl_csrf` cookies on register/login/refresh and clears them on logout; `requireAuth` reads the cookie (Bearer stays as a test fallback); a double-submit CSRF check guards mutations. nginx (prod) and Vite (dev) proxy `/api/*` to the backend so cookies are first-party. The frontend gets a tiny `apiFetch` client (401→refresh→retry, CSRF header, typed errors), an `AuthProvider` (`getMe` on mount → `anonymous` | `authenticated`), a rewired `AccountModal` (email login, no birthdate), and a one-shot hydrate of `useGameState` from `GET /me` after login. A first-login dialog offers importing the local save via `/migration/local/import`.

**Tech Stack:** Fastify 5 + `@fastify/cookie`, `jose` (existing), Zod (existing); Vite 5 dev proxy + nginx; React 18 + framer-motion (existing); Vitest + Testing Library (existing).

**Spec:** `docs/superpowers/specs/2026-09-06-task-10-1-auth-foundation-design.md`

## Global Constraints

- **TypeScript strict everywhere. No new `any`.** (project convention)
- **Backend ESM:** relative imports carry a `.js` suffix even for `.ts` files (`./cookies.js`). `moduleResolution: NodeNext`.
- **Zod validation** for every body/query/param on the backend. Never trust client input.
- **Backend errors:** `throw new Error('<SNAKE_CASE_CODE>')` for codes mapped in `backend/src/http/errors.ts`, or `new AppError(status, code, message)`. Never leak internal detail, SQL, tokens, or secrets in a response. Error response body shape is always `{ error: { code: string, message: string } }`.
- **Idempotency:** value-granting operations require an `Idempotency-Key` header (16–128 chars).
- **Secrets:** never write keys/tokens/passwords/connection strings to code, commits, migrations, logs, or debug output. Sensitive values live in env vars only.
- **Shared domain:** the backend imports catalog + constants from `src/game/*`. Prefer importing to duplicating.
- **Commit** at the end of every task. Branch: `feature/task-10-1-auth-foundation` (already created). Only push / open a PR when the user asks.
- **Cookie names:** `dbl_at` (access), `dbl_rt` (refresh), `dbl_csrf` (CSRF token, readable by JS).
- **Cookie attributes (verbatim):**
  - `dbl_at`: `HttpOnly; Secure=<COOKIE_SECURE>; SameSite=Lax; Path=/api; Max-Age=<ACCESS_TOKEN_TTL_SECONDS>`
  - `dbl_rt`: `HttpOnly; Secure=<COOKIE_SECURE>; SameSite=Strict; Path=/api/v1/auth; Max-Age=<REFRESH_TOKEN_TTL_SECONDS>`
  - `dbl_csrf`: `Secure=<COOKIE_SECURE>; SameSite=Lax; Path=/api` (NOT HttpOnly)
  - `COOKIE_DOMAIN` is added to every cookie only when set (non-empty).
- **CSRF exemptions:** `POST /api/v1/auth/login` and `POST /api/v1/auth/register` only. Every other mutating request (`POST|PUT|PATCH|DELETE`) under `/api/v1/` requires `X-CSRF-Token` === `dbl_csrf` cookie.
- **Frontend API base:** always the relative string `/api/v1`. No configurable base URL in browser code.
- **Verification per task:** `npm run backend:typecheck`, `npx tsc --noEmit -p tsconfig.app.json`, `npm test`, and (tasks touching integration) `npm run test:integration` must pass before the commit step. `npm run lint` must show 0 errors.

---

## File Structure

**Backend — create:**
- `backend/src/auth/cookies.ts` — cookie read/write helpers + CSRF token helper. One responsibility: translate between the auth service's token strings and HTTP cookies.
- `backend/src/auth/cookies.test.ts` — unit tests for the helpers.
- `backend/src/testing/authClient.ts` — integration-test helper that logs in, keeps the `Set-Cookie` jar, and replays `Cookie` + `X-CSRF-Token`.

**Backend — modify:**
- `backend/package.json` — add `@fastify/cookie`.
- `backend/src/config/env.ts` — `COOKIE_SECURE`, `COOKIE_DOMAIN`.
- `backend/src/app.ts` — register `@fastify/cookie`; pass cookie config into routes/middleware.
- `backend/src/auth/routes.ts` — set/clear cookies; `refresh` reads cookie.
- `backend/src/auth/schemas.ts` — drop `refreshSchema` body.
- `backend/src/auth/middleware.ts` — read `dbl_at` cookie, Bearer fallback.
- `backend/src/security/http.ts` — CSRF double-submit hook; `x-csrf-token` in allow-headers.
- `backend/src/http/errors.ts` — `CSRF_FAILED` → 403.
- `backend/src/app.test.ts` + every `backend/src/**/*.integration.test.ts` — use `authClient`.
- `.env.docker`, `.env.docker.example`, `.env.example` — `COOKIE_SECURE`, `COOKIE_DOMAIN`.

**Proxy — modify:**
- `vite.config.ts` — `server.proxy['/api']`.
- `docker/nginx.conf` — `location /api/`.
- `compose.yaml` — `VITE_API_BASE_URL: http://backend:8090`.

**Frontend — create:**
- `src/api/types.ts` — hand-written types mirroring backend Zod schemas.
- `src/api/client.ts` — `apiFetch`, `ApiError`, CSRF, refresh-retry, `onLoggedOut`.
- `src/api/client.test.ts` — mocked-`fetch` tests.
- `src/api/endpoints.ts` — typed endpoint functions.
- `src/game/auth/AuthProvider.tsx` — `AuthProvider`, `useAuth`.
- `src/game/auth/AuthProvider.test.tsx` — status-machine tests.
- `src/game/auth/hydrate.ts` — `hydrateFromServer()`.
- `src/game/auth/countries.ts` — `flagToIso2` / `iso2ToFlag` maps + `COUNTRIES` (moved from `account.ts`).

**Frontend — modify:**
- `src/game/useGameState.ts` — `replaceFromServer(partial)`.
- `src/pages/Index.tsx` — wrap in `AuthProvider`.
- `src/components/game/menu/account.ts` — reduce to `TUTORIAL_KEY` re-export + drop `Account`/`loadAccount`/`saveAccount`/`COUNTRIES` (moved).
- `src/components/game/menu/AccountModal.tsx` — 2-step, email login, `useAuth`, import dialog.
- `src/components/game/MainMenu.tsx` — account chip from `useAuth`.
- `src/game/i18n.tsx` — auth error + import-dialog keys (6 languages).
- `src/test/AccountModal.test.tsx` — rewritten.
- `src/test/MainMenu.test.tsx` — updated for the new chip / provider.

---

## Task 1: `@fastify/cookie` + cookie config

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/config/env.test.ts` (if present; else create assertions in an existing config test)
- Modify: `backend/src/app.ts:57-59` (register plugin)
- Modify: `backend/src/app.test.ts:7-19` (add fields to `testConfig`)

**Interfaces:**
- Produces: `AppConfig` gains `cookieSecure: boolean` and `cookieDomain?: string`. `createApp` registers `@fastify/cookie` so `request.cookies` and `reply.setCookie`/`reply.clearCookie` exist.

- [ ] **Step 1: Add the dependency**

Run: `cd . && npm install --workspace-root @fastify/cookie@^11` — if the repo is not a workspace, `npm install @fastify/cookie@^11`.
Then confirm `backend`-side resolution: `node -e "require.resolve('@fastify/cookie')"`.
Expected: prints a path, no error. `package.json` `dependencies` now lists `"@fastify/cookie": "^11.x"`.

- [ ] **Step 2: Write the failing config test**

In `backend/src/config/env.test.ts` (create if absent, `// @vitest-environment node` header, import `loadConfig`):

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

const base = {
  ACCESS_TOKEN_SECRET: 'x'.repeat(32),
};

describe('loadConfig cookie settings', () => {
  it('defaults cookieSecure to true and leaves cookieDomain undefined', () => {
    const config = loadConfig({ ...base } as NodeJS.ProcessEnv);
    expect(config.cookieSecure).toBe(true);
    expect(config.cookieDomain).toBeUndefined();
  });

  it('reads COOKIE_SECURE=false and COOKIE_DOMAIN', () => {
    const config = loadConfig({ ...base, COOKIE_SECURE: 'false', COOKIE_DOMAIN: 'example.test' } as NodeJS.ProcessEnv);
    expect(config.cookieSecure).toBe(false);
    expect(config.cookieDomain).toBe('example.test');
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run backend/src/config/env.test.ts`
Expected: FAIL — `config.cookieSecure` is `undefined`.

- [ ] **Step 4: Extend `env.ts`**

In `backend/src/config/env.ts`:
- Add to `envSchema`: `COOKIE_SECURE: z.enum(['true', 'false']).default('true'), COOKIE_DOMAIN: z.string().trim().optional(),`
- Add to `AppConfig`: `cookieSecure: boolean; cookieDomain?: string;`
- Add to the `loadConfig` return object: `cookieSecure: parsed.COOKIE_SECURE === 'true', cookieDomain: parsed.COOKIE_DOMAIN && parsed.COOKIE_DOMAIN.length > 0 ? parsed.COOKIE_DOMAIN : undefined,`

- [ ] **Step 5: Run the config test, verify it passes**

Run: `npx vitest run backend/src/config/env.test.ts`
Expected: PASS.

- [ ] **Step 6: Register the plugin + update test config**

In `backend/src/app.ts`, add near the top: `import cookie from '@fastify/cookie';`
After `const app = Fastify(serverOptions);` and before `app.setValidatorCompiler(...)`:

```ts
  await app.register(cookie);
```

In `backend/src/app.test.ts` `testConfig`, add: `cookieSecure: false,` (after `trustProxy: false,`). Leave `cookieDomain` off (optional).

- [ ] **Step 7: Typecheck + full backend tests**

Run: `npm run backend:typecheck && npx vitest run backend/`
Expected: PASS (no behavior change yet; `app.test.ts` still green).

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json package.json package-lock.json backend/src/config/env.ts backend/src/config/env.test.ts backend/src/app.ts backend/src/app.test.ts
git commit -m "backend: add @fastify/cookie and COOKIE_SECURE / COOKIE_DOMAIN config"
```

---

## Task 2: Cookie helpers (`auth/cookies.ts`)

**Files:**
- Create: `backend/src/auth/cookies.ts`
- Create: `backend/src/auth/cookies.test.ts`

**Interfaces:**
- Consumes: `AppConfig` fields `cookieSecure`, `cookieDomain`, `accessTokenTtlSeconds`, `refreshTokenTtlSeconds` (Task 1).
- Produces:
  ```ts
  export type CookieConfig = {
    secure: boolean;
    domain?: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
  };
  export const AT_COOKIE = 'dbl_at';
  export const RT_COOKIE = 'dbl_rt';
  export const CSRF_COOKIE = 'dbl_csrf';
  export function setAuthCookies(reply: FastifyReply, tokens: { accessToken: string; refreshToken: string }, cfg: CookieConfig): string; // returns the csrf token it set
  export function clearAuthCookies(reply: FastifyReply, cfg: CookieConfig): void;
  export function readAccessToken(request: FastifyRequest): string | null;
  export function readRefreshToken(request: FastifyRequest): string | null;
  export function readCsrfCookie(request: FastifyRequest): string | null;
  export function generateCsrfToken(): string; // 32 random bytes, base64url
  ```

- [ ] **Step 1: Write the failing test**

`backend/src/auth/cookies.test.ts` (`// @vitest-environment node`):

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  setAuthCookies, clearAuthCookies, readAccessToken, readRefreshToken,
  readCsrfCookie, generateCsrfToken, AT_COOKIE, RT_COOKIE, CSRF_COOKIE, type CookieConfig,
} from './cookies.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const cfg: CookieConfig = { secure: true, accessTtlSeconds: 900, refreshTtlSeconds: 2_592_000 };

function fakeReply() {
  const calls: Array<{ name: string; value: string; opts: Record<string, unknown> }> = [];
  const reply = {
    setCookie: (name: string, value: string, opts: Record<string, unknown>) => { calls.push({ name, value, opts }); return reply; },
    clearCookie: (name: string, opts: Record<string, unknown>) => { calls.push({ name, value: '', opts }); return reply; },
  } as unknown as FastifyReply;
  return { reply, calls };
}

describe('cookies', () => {
  it('generateCsrfToken returns a 43-char base64url string each call', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('setAuthCookies writes dbl_at, dbl_rt and dbl_csrf with the spec attributes', () => {
    const { reply, calls } = fakeReply();
    const csrf = setAuthCookies(reply, { accessToken: 'AT', refreshToken: 'RT' }, cfg);

    const at = calls.find(c => c.name === AT_COOKIE)!;
    expect(at.value).toBe('AT');
    expect(at.opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api', maxAge: 900 });

    const rt = calls.find(c => c.name === RT_COOKIE)!;
    expect(rt.value).toBe('RT');
    expect(rt.opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth', maxAge: 2_592_000 });

    const csrfCookie = calls.find(c => c.name === CSRF_COOKIE)!;
    expect(csrfCookie.value).toBe(csrf);
    expect(csrfCookie.opts).toMatchObject({ httpOnly: false, secure: true, sameSite: 'lax', path: '/api' });
  });

  it('adds domain only when set', () => {
    const { reply, calls } = fakeReply();
    setAuthCookies(reply, { accessToken: 'AT', refreshToken: 'RT' }, { ...cfg, domain: 'example.test' });
    expect(calls.every(c => c.opts.domain === 'example.test')).toBe(true);
  });

  it('clearAuthCookies clears all three on their paths', () => {
    const { reply, calls } = fakeReply();
    clearAuthCookies(reply, cfg);
    expect(calls.map(c => c.name).sort()).toEqual([AT_COOKIE, CSRF_COOKIE, RT_COOKIE].sort());
    expect(calls.find(c => c.name === RT_COOKIE)!.opts).toMatchObject({ path: '/api/v1/auth' });
  });

  it('reads tokens from request.cookies', () => {
    const req = { cookies: { [AT_COOKIE]: 'a', [RT_COOKIE]: 'r', [CSRF_COOKIE]: 'c' } } as unknown as FastifyRequest;
    expect(readAccessToken(req)).toBe('a');
    expect(readRefreshToken(req)).toBe('r');
    expect(readCsrfCookie(req)).toBe('c');
    const empty = { cookies: {} } as unknown as FastifyRequest;
    expect(readAccessToken(empty)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run backend/src/auth/cookies.test.ts`
Expected: FAIL — module `./cookies.js` not found.

- [ ] **Step 3: Implement `backend/src/auth/cookies.ts`**

```ts
import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const AT_COOKIE = 'dbl_at';
export const RT_COOKIE = 'dbl_rt';
export const CSRF_COOKIE = 'dbl_csrf';

const AT_PATH = '/api';
const RT_PATH = '/api/v1/auth';
const CSRF_PATH = '/api';

export type CookieConfig = {
  secure: boolean;
  domain?: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
};

export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

function base(cfg: CookieConfig, path: string) {
  return { secure: cfg.secure, path, ...(cfg.domain ? { domain: cfg.domain } : {}) };
}

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
  cfg: CookieConfig,
): string {
  const csrf = generateCsrfToken();
  reply.setCookie(AT_COOKIE, tokens.accessToken, {
    ...base(cfg, AT_PATH), httpOnly: true, sameSite: 'lax', maxAge: cfg.accessTtlSeconds,
  });
  reply.setCookie(RT_COOKIE, tokens.refreshToken, {
    ...base(cfg, RT_PATH), httpOnly: true, sameSite: 'strict', maxAge: cfg.refreshTtlSeconds,
  });
  reply.setCookie(CSRF_COOKIE, csrf, {
    ...base(cfg, CSRF_PATH), httpOnly: false, sameSite: 'lax', maxAge: cfg.refreshTtlSeconds,
  });
  return csrf;
}

export function clearAuthCookies(reply: FastifyReply, cfg: CookieConfig): void {
  reply.clearCookie(AT_COOKIE, base(cfg, AT_PATH));
  reply.clearCookie(RT_COOKIE, base(cfg, RT_PATH));
  reply.clearCookie(CSRF_COOKIE, base(cfg, CSRF_PATH));
}

export function readAccessToken(request: FastifyRequest): string | null {
  return request.cookies?.[AT_COOKIE] ?? null;
}
export function readRefreshToken(request: FastifyRequest): string | null {
  return request.cookies?.[RT_COOKIE] ?? null;
}
export function readCsrfCookie(request: FastifyRequest): string | null {
  return request.cookies?.[CSRF_COOKIE] ?? null;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run backend/src/auth/cookies.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run backend:typecheck`
Expected: no errors.

```bash
git add backend/src/auth/cookies.ts backend/src/auth/cookies.test.ts
git commit -m "backend: auth cookie helpers (dbl_at / dbl_rt / dbl_csrf)"
```

---

## Task 3: Wire cookies into auth routes + middleware

**Files:**
- Modify: `backend/src/auth/schemas.ts` (remove `refreshSchema`)
- Modify: `backend/src/auth/routes.ts`
- Modify: `backend/src/auth/middleware.ts`
- Modify: `backend/src/app.ts` (pass `CookieConfig` to `registerAuthRoutes` and `createRequireAuth`)
- Test: `backend/src/auth/routes.integration.test.ts` (create — memory-repo route tests via `createApp` + `app.inject`)

**Interfaces:**
- Consumes: `cookies.ts` helpers (Task 2); `authService.register/login/refresh/logout/verifyAccessToken` (existing — return `{ accessToken, refreshToken, session, user }`, `session.id` is the sessionId).
- Produces:
  - `registerAuthRoutes(app, service, cookieCfg: CookieConfig)` — new 3rd param.
  - `createRequireAuth(authService, cookieCfg?: CookieConfig)` — reads `dbl_at` cookie, then `Authorization: Bearer`.
  - `POST /api/v1/auth/register` → `201 { user }` + `Set-Cookie` ×3.
  - `POST /api/v1/auth/login` → `200 { user }` + `Set-Cookie` ×3.
  - `POST /api/v1/auth/refresh` → `204`, reads `dbl_rt` cookie, re-emits ×3. `401 INVALID_REFRESH_TOKEN` when cookie missing/invalid.
  - `POST /api/v1/auth/logout` → `204`, clears ×3 (still `preHandler: requireAuth`).

- [ ] **Step 1: Write the failing integration test**

`backend/src/auth/routes.integration.test.ts` — note: uses the **memory** repo path (no `DATABASE_URL`), so it runs under `npm test`, not only `test:integration`. Name it `routes.test.ts` if the runner excludes `*.integration.test.ts` from `npm test` — check `vitest.config.ts` `exclude`. **It does** exclude `**/*.integration.test.ts`, so name this file **`backend/src/auth/routes.test.ts`**.

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, trustProxy: false,
  cookieSecure: false,
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });

async function app() { const a = await createApp({ config }); apps.add(a); return a; }

const creds = { email: 'a@example.com', password: 'a-very-strong-password', username: 'angler_one', country: 'br' };

function cookieJar(setCookie: string | string[] | undefined): Record<string, string> {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const jar: Record<string, string> = {};
  for (const c of arr) { const [pair] = c.split(';'); const [k, v] = pair.split('='); jar[k] = v; }
  return jar;
}

describe('auth routes with cookies', () => {
  it('register sets dbl_at, dbl_rt, dbl_csrf and returns only { user }', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ user: expect.objectContaining({ email: 'a@example.com', username: 'angler_one' }) });
    expect(res.json()).not.toHaveProperty('accessToken');
    const jar = cookieJar(res.headers['set-cookie']);
    expect(jar.dbl_at).toEqual(expect.any(String));
    expect(jar.dbl_rt).toEqual(expect.any(String));
    expect(jar.dbl_csrf).toEqual(expect.any(String));
  });

  it('refresh reads the dbl_rt cookie and re-emits cookies (204)', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/refresh',
      cookies: { dbl_rt: jar.dbl_rt, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(204);
    const next = cookieJar(res.headers['set-cookie']);
    expect(next.dbl_rt).toEqual(expect.any(String));
    expect(next.dbl_rt).not.toBe(jar.dbl_rt);
  });

  it('refresh without a cookie is 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('logout clears the cookies', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(204);
    const cleared = res.headers['set-cookie'] as string[];
    expect(cleared.join(';')).toMatch(/dbl_at=;/);
  });

  it('requireAuth still accepts a Bearer token (fallback)', async () => {
    const a = await app();
    // Use the memory login helper directly is not exposed; instead assert /me works with a cookie.
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const me = await a.inject({ method: 'GET', url: '/api/v1/me', cookies: { dbl_at: jar.dbl_at } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: 'a@example.com' });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run backend/src/auth/routes.test.ts`
Expected: FAIL — register still returns `accessToken` in body; no `set-cookie`; `/me` with cookie is 401 (middleware only reads Bearer). The CSRF-header lines will not matter yet (CSRF hook is Task 4).

- [ ] **Step 3: Remove the refresh body schema**

In `backend/src/auth/schemas.ts` delete the `refreshSchema` export.

- [ ] **Step 4: Rewrite `backend/src/auth/routes.ts`**

```ts
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { loginSchema, registerSchema } from './schemas.js';
import type { createAuthService } from './service.js';
import { setAuthCookies, clearAuthCookies, readRefreshToken, type CookieConfig } from './cookies.js';

type AuthService = ReturnType<typeof createAuthService>;

const userSchema = z.object({ id: z.string(), email: z.string(), username: z.string(), country: z.string() });
const sessionSchema = z.object({ user: userSchema });

function pickUser(u: { id: string; email: string; username: string; country: string }) {
  return { id: u.id, email: u.email, username: u.username, country: u.country };
}

export async function registerAuthRoutes(app: FastifyInstance, service: AuthService, cookieCfg: CookieConfig): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/v1/auth/register', {
    schema: { tags: ['auth'], summary: 'Create an account', body: registerSchema, response: { 201: sessionSchema } },
  }, async (request, reply) => {
    const result = await service.register(request.body);
    setAuthCookies(reply, result, cookieCfg);
    return reply.status(201).send({ user: pickUser(result.user) });
  });

  r.post('/api/v1/auth/login', {
    schema: { tags: ['auth'], summary: 'Start an authenticated session', body: loginSchema, response: { 200: sessionSchema } },
  }, async (request, reply) => {
    const result = await service.login(request.body);
    setAuthCookies(reply, result, cookieCfg);
    return reply.status(200).send({ user: pickUser(result.user) });
  });

  r.post('/api/v1/auth/refresh', {
    schema: { tags: ['auth'], summary: 'Rotate the session' },
  }, async (request, reply) => {
    const token = readRefreshToken(request);
    if (!token) throw new Error('INVALID_REFRESH_TOKEN');
    const result = await service.refresh(token);
    setAuthCookies(reply, result, cookieCfg);
    return reply.status(204).send();
  });

  r.post('/api/v1/auth/logout', {
    schema: { tags: ['auth'], summary: 'Revoke the current session' },
    preHandler: app.requireAuth,
  }, async (request, reply) => {
    if (request.sessionId) await service.logout(request.sessionId);
    clearAuthCookies(reply, cookieCfg);
    return reply.status(204).send();
  });
}
```

- [ ] **Step 5: Rewrite `backend/src/auth/middleware.ts`**

```ts
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { createAuthService } from './service.js';
import { readAccessToken } from './cookies.js';

type AuthService = ReturnType<typeof createAuthService>;

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    sessionId?: string;
  }
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler;
  }
}

export function createRequireAuth(authService: AuthService): preHandlerHookHandler {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    const cookieToken = readAccessToken(request);
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = cookieToken ?? bearer;
    if (!token) throw new Error('INVALID_ACCESS_TOKEN');
    const { userId, sessionId } = await authService.verifyAccessToken(token);
    request.userId = userId;
    request.sessionId = sessionId;
  };
}
```

- [ ] **Step 6: Wire the cookie config in `backend/src/app.ts`**

After `const authService = createAuthService(...)` add:

```ts
  const cookieCfg = {
    secure: config.cookieSecure,
    domain: config.cookieDomain,
    accessTtlSeconds: config.accessTokenTtlSeconds,
    refreshTtlSeconds: config.refreshTokenTtlSeconds,
  };
```

Change `void registerAuthRoutes(app, authService);` → `void registerAuthRoutes(app, authService, cookieCfg);`

(`createRequireAuth` signature is unchanged in Step 5 — no `app.ts` change there.)

- [ ] **Step 7: Run the auth route test, verify it passes**

Run: `npx vitest run backend/src/auth/routes.test.ts`
Expected: PASS (5). The `x-csrf-token` header the test sends on refresh/logout is harmless (no CSRF hook yet).

- [ ] **Step 8: Run all backend memory tests — expect `app.test.ts` to now FAIL**

Run: `npx vitest run backend/`
Expected: `app.test.ts` "registers and refreshes an account…" FAILS (it reads `registered.accessToken` from the body and posts a `refreshToken` payload). **Do not fix it here** — Task 5 rewrites all such tests with the helper. Note the failing files.

- [ ] **Step 9: Commit (with the known-failing legacy tests)**

```bash
git add backend/src/auth/ backend/src/app.ts
git commit -m "backend: auth via httpOnly cookies (register/login set, refresh/logout via cookie)

app.test.ts and the *.integration.test.ts suites still read tokens from
the body; migrated in the next task."
```

---

## Task 4: CSRF double-submit + errors

**Files:**
- Modify: `backend/src/http/errors.ts:25-47` (add `CSRF_FAILED`)
- Modify: `backend/src/security/http.ts` (CSRF check in the `onRequest` hook; add `x-csrf-token` to allow-headers)
- Test: `backend/src/security/csrf.test.ts` (create)

**Interfaces:**
- Consumes: `readCsrfCookie` (Task 2).
- Produces: any `POST|PUT|PATCH|DELETE` to `/api/v1/*` except `/api/v1/auth/login` and `/api/v1/auth/register` returns `403 { error: { code: 'CSRF_FAILED' } }` unless `X-CSRF-Token` header equals the `dbl_csrf` cookie.

- [ ] **Step 1: Write the failing test**

`backend/src/security/csrf.test.ts` (`// @vitest-environment node`), reuse the `config` + `app()` + `cookieJar` boilerplate from Task 3 Step 1 (copy it in — the plan may be read out of order):

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, trustProxy: false, cookieSecure: false,
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });
async function app() { const a = await createApp({ config }); apps.add(a); return a; }
function cookieJar(sc: string | string[] | undefined): Record<string, string> {
  const arr = Array.isArray(sc) ? sc : sc ? [sc] : [];
  const jar: Record<string, string> = {};
  for (const c of arr) { const [p] = c.split(';'); const [k, v] = p.split('='); jar[k] = v; }
  return jar;
}
const creds = { email: 'c@example.com', password: 'a-very-strong-password', username: 'csrf_user', country: 'br' };

describe('CSRF double-submit', () => {
  it('rejects a mutating request without X-CSRF-Token', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });

  it('rejects a mismatched X-CSRF-Token', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': 'wrong' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepts a matching X-CSRF-Token', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    const jar = cookieJar(reg.headers['set-cookie']);
    const res = await a.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(204);
  });

  it('does not require CSRF for login or register', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
    expect(res.statusCode).toBe(201);
  });

  it('does not require CSRF for GET', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/v1/catalog' });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run backend/src/security/csrf.test.ts`
Expected: FAIL — logout without the header currently returns 204 (no CSRF check).

- [ ] **Step 3: Add the error code**

In `backend/src/http/errors.ts` `DOMAIN_ERRORS`, add:
```ts
  CSRF_FAILED: { status: 403, message: 'CSRF token missing or invalid' },
```

- [ ] **Step 4: Add the CSRF check to `backend/src/security/http.ts`**

Import at the top: `import { readCsrfCookie } from '../auth/cookies.js';`

In the `onRequest` hook, add — after the security headers block and the `OPTIONS` short-circuit, before the rate-limit block:

```ts
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const csrfExempt = request.url === '/api/v1/auth/login' || request.url === '/api/v1/auth/register';
    if (isMutation && request.url.startsWith('/api/v1/') && !csrfExempt) {
      const header = request.headers['x-csrf-token'];
      const cookie = readCsrfCookie(request);
      if (typeof header !== 'string' || !cookie || header !== cookie) {
        return reply.status(403).send({ error: { code: 'CSRF_FAILED', message: 'CSRF token missing or invalid' } });
      }
    }
```

Also change the allow-headers line:
```ts
    reply.header('access-control-allow-headers', 'authorization, content-type, idempotency-key, x-csrf-token');
```

- [ ] **Step 5: Run the CSRF test, verify it passes**

Run: `npx vitest run backend/src/security/csrf.test.ts`
Expected: PASS (5). Also re-run `npx vitest run backend/src/auth/routes.test.ts` — still PASS (that test sends `x-csrf-token` on refresh/logout).

- [ ] **Step 6: Commit**

```bash
git add backend/src/http/errors.ts backend/src/security/http.ts backend/src/security/csrf.test.ts
git commit -m "backend: CSRF double-submit check for /api/v1 mutations"
```

---

## Task 5: `authClient` test helper + migrate the suites

**Files:**
- Create: `backend/src/testing/authClient.ts`
- Modify: `backend/src/app.test.ts`
- Modify: every `backend/src/**/*.integration.test.ts` that authenticates (players, economy, inventory, fishing, leaderboard, rewards, migration, auth/pgRepository, seasons if it authenticates)

**Interfaces:**
- Consumes: a Fastify app instance from `createApp`.
- Produces:
  ```ts
  export type AuthedClient = {
    userId: string;
    request(opts: { method: string; url: string; payload?: unknown; idempotencyKey?: string; headers?: Record<string, string> }): Promise<import('light-my-request').Response>;
    raw: FastifyInstance;
  };
  export async function registerAndAuth(app: FastifyInstance, overrides?: Partial<{ email: string; password: string; username: string; country: string }>): Promise<AuthedClient>;
  ```
  `request()` injects `Cookie: dbl_at=…; dbl_rt=…; dbl_csrf=…` on every call and `X-CSRF-Token` + `Idempotency-Key` on mutations.

- [ ] **Step 1: Write the helper**

`backend/src/testing/authClient.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

type Creds = { email: string; password: string; username: string; country: string };

const DEFAULT: Creds = {
  email: `angler-${randomUUID()}@example.com`,
  password: 'a-very-strong-password-123',
  username: `a${randomUUID().replace(/-/g, '').slice(0, 12)}`,
  country: 'br',
};

function jarFrom(setCookie: string | string[] | undefined): Record<string, string> {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const jar: Record<string, string> = {};
  for (const c of arr) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

export type AuthedClient = {
  userId: string;
  request(opts: {
    method: string; url: string; payload?: unknown;
    idempotencyKey?: string; headers?: Record<string, string>;
  }): Promise<Awaited<ReturnType<FastifyInstance['inject']>>>;
  raw: FastifyInstance;
};

export async function registerAndAuth(
  app: FastifyInstance,
  overrides: Partial<Creds> = {},
): Promise<AuthedClient> {
  const creds: Creds = {
    ...DEFAULT,
    email: `angler-${randomUUID()}@example.com`,
    username: `a${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    ...overrides,
  };
  const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: creds });
  if (reg.statusCode !== 201) throw new Error(`registerAndAuth failed: ${reg.statusCode} ${reg.body}`);
  let jar = jarFrom(reg.headers['set-cookie']);
  const me = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: jar });
  const userId: string = me.json().user.userId;

  return {
    userId,
    raw: app,
    async request(opts) {
      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(opts.method.toUpperCase());
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (isMutation) {
        headers['x-csrf-token'] = jar.dbl_csrf;
        if (opts.idempotencyKey ?? true) headers['idempotency-key'] = opts.idempotencyKey ?? randomUUID();
      }
      const res = await app.inject({
        method: opts.method as never,
        url: opts.url,
        payload: opts.payload as never,
        cookies: jar,
        headers,
      });
      const next = jarFrom(res.headers['set-cookie']);
      jar = { ...jar, ...next };
      return res;
    },
  };
}
```

Note: `idempotencyKey ?? true` sends a key on every mutation by default. Tests that assert "missing key → 400" pass `idempotencyKey: ''` and the call sites in those tests should inject directly instead — keep those as raw `app.inject`.

- [ ] **Step 2: Migrate `backend/src/app.test.ts`**

Replace the "registers and refreshes an account…" test body: register via inject, read the `set-cookie` jar, assert `dbl_at`/`dbl_rt` present and `res.json()` has no `accessToken`; then `POST /api/v1/auth/refresh` with `cookies: jar` + `x-csrf-token` and assert `204` + a new `dbl_rt`. Assert `res.json()` on `/me` (via jar) has no `passwordHash`.

- [ ] **Step 3: Migrate each `*.integration.test.ts`**

Mechanical pattern per file:
1. `import { registerAndAuth } from '../testing/authClient.js';`
2. Replace the local "register → grab `accessToken` → build `authHeaders`" block with `const client = await registerAndAuth(app);`
3. Replace `app.inject({ method, url, payload, headers: authHeaders })` with `client.request({ method, url, payload })`.
4. For `Idempotency-Key` cases: `client.request({ method: 'POST', url, payload, idempotencyKey: 'fixed-key-for-this-test' })`.
5. "missing/invalid idempotency key → 400" tests: keep as raw `app.inject` but add `cookies` from a jar + `x-csrf-token`.
6. `userId` references: `client.userId`.

Do the files one at a time, running that file's suite after each:
Run: `npm run test:integration -- <path>` (needs `TEST_DATABASE_URL` / `DATABASE_URL` + a live Postgres; `npm run backend:db:migrate` first).

- [ ] **Step 4: Full runs**

Run: `npm test` — expect all green (the memory suites + `app.test.ts`).
Run (with Postgres up): `npm run backend:db:migrate && npm run test:integration` — expect all green.
Run: `npm run backend:typecheck`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/testing/authClient.ts backend/src/app.test.ts backend/src/**/*.integration.test.ts
git commit -m "backend: migrate auth-using tests to the cookie authClient helper"
```

---

## Task 6: `/api` proxy (Vite + nginx + compose)

**Files:**
- Modify: `vite.config.ts`
- Modify: `docker/nginx.conf`
- Modify: `compose.yaml`
- Modify: `.env.docker`, `.env.docker.example`, `.env.example`

**Interfaces:**
- Produces: in dev (`npm run dev`) and in the frontend container, a browser request to `/api/v1/...` is proxied to the backend; cookies are first-party to the SPA origin.

- [ ] **Step 1: Add the Vite dev proxy**

In `vite.config.ts`, inside the existing `server: { ... }` object add:

```ts
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8090',
        changeOrigin: true,
      },
    },
```

If `vite.config.ts` reads env via `loadEnv`, use that value; `process.env.VITE_API_BASE_URL` works because `vite.config.ts` runs in Node. Keep the existing `host` / `port: 8080` settings.

- [ ] **Step 2: Manually verify the dev proxy**

Run in one shell: `npm run backend:dev` (needs `ACCESS_TOKEN_SECRET` ≥32 chars in env; no DB needed — memory mode).
Run in another: `npm run dev`.
Run: `curl -i http://localhost:8080/api/v1/catalog`
Expected: `200` with the catalog JSON (proxied), and the response is same-origin as `:8080`.

- [ ] **Step 3: Add the nginx `/api` block**

In `docker/nginx.conf`, add **before** `location / {`:

```nginx
  location /api/ {
    proxy_pass http://backend:8090;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
```

- [ ] **Step 4: Point the compose Vite proxy at the backend service**

In `compose.yaml`, under `frontend:` → `environment:` change:
```yaml
      VITE_API_BASE_URL: http://backend:8090
```
(The frontend container runs Vite `target: dev`, so its proxy resolves `backend` on the compose network.)

- [ ] **Step 5: Env files**

Append to `.env.example` and `.env.docker.example`:
```
# Cookies (auth). false only for local http dev.
COOKIE_SECURE=false
COOKIE_DOMAIN=
```
And add the same to `.env.docker`. Ensure `.env.docker` `CORS_ORIGINS` still lists `http://localhost:8080` (harmless; the browser path is now same-origin).

- [ ] **Step 6: Smoke the container stack**

Run: `docker compose up --build`
Then in the browser DevTools console at `http://localhost:8080`:
```js
await fetch('/api/v1/catalog').then(r => r.status)   // 200
```
Register via the app (Task 12 UI is not done yet — use the console):
```js
await fetch('/api/v1/auth/register', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'x@y.com', password: 'a-strong-password-1', username: 'smoke_user', country: 'br' }),
}).then(r => r.status)   // 201
```
Check Application → Cookies for `dbl_at` / `dbl_rt` / `dbl_csrf` scoped to `localhost:8080`.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts docker/nginx.conf compose.yaml .env.example .env.docker.example .env.docker
git commit -m "proxy: serve /api same-origin (Vite dev + nginx prod) for cookie auth"
```

---

## Task 7: Frontend API client (`src/api/client.ts` + types)

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/client.ts`
- Create: `src/api/client.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export interface ApiUser { id: string; email: string; username: string; country: string; }
  export interface PlayerProfile {
    userId: string; email: string; username: string; country: string;
    level: number; xp: number; totalFishCaught: number; coins: number; unlockedLocations: string[];
  }
  export interface MigrationPreview {
    sourceVersion: number;
    summary: { accepted: number; rejected: number };
    rejected: unknown[];
  }
  export interface MigrationResult { imported: boolean; sourceVersion: number; summary: { accepted: number; rejected: number }; }

  // client.ts
  export class ApiError extends Error { status: number; code: string; }
  export function setLoggedOutHandler(fn: () => void): void;
  export function apiFetch<T>(path: string, opts?: {
    method?: string; body?: unknown; idempotencyKey?: string;
  }): Promise<T>;
  ```

- [ ] **Step 1: Write `src/api/types.ts`**

Exactly the interfaces above. No logic.

- [ ] **Step 2: Write the failing client test**

`src/api/client.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError, setLoggedOutHandler } from './client';

const g = globalThis as unknown as { fetch: ReturnType<typeof vi.fn> };

beforeEach(() => {
  g.fetch = vi.fn();
  document.cookie = 'dbl_csrf=csrf-token-value; path=/';
});
afterEach(() => { document.cookie = 'dbl_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('apiFetch', () => {
  it('GETs /api/v1<path> with credentials and no CSRF header', async () => {
    g.fetch.mockResolvedValueOnce(jsonResponse(200, { user: { id: '1' } }));
    const out = await apiFetch<{ user: { id: string } }>('/me');
    expect(out).toEqual({ user: { id: '1' } });
    const [url, init] = g.fetch.mock.calls[0];
    expect(url).toBe('/api/v1/me');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('adds X-CSRF-Token and Idempotency-Key on a mutation', async () => {
    g.fetch.mockResolvedValueOnce(jsonResponse(204, undefined));
    await apiFetch('/economy/nets/purchase', { method: 'POST', body: { quantity: 1 }, idempotencyKey: 'k-123456789012345' });
    const [, init] = g.fetch.mock.calls[0];
    expect(init.headers['X-CSRF-Token']).toBe('csrf-token-value');
    expect(init.headers['Idempotency-Key']).toBe('k-123456789012345');
    expect(init.body).toBe(JSON.stringify({ quantity: 1 }));
  });

  it('throws a typed ApiError from { error: { code, message } }', async () => {
    g.fetch.mockResolvedValueOnce(jsonResponse(409, { error: { code: 'ACCOUNT_ALREADY_EXISTS', message: 'taken' } }));
    await expect(apiFetch('/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409, code: 'ACCOUNT_ALREADY_EXISTS',
    });
    await expect(apiFetch('/auth/register', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
  });

  it('on 401 for a normal route: refreshes once and retries', async () => {
    g.fetch
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_ACCESS_TOKEN', message: '' } })) // /me
      .mockResolvedValueOnce(jsonResponse(204, undefined))                                                // /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: '1' } }));                                   // retry /me
    const out = await apiFetch<{ user: { id: string } }>('/me');
    expect(out).toEqual({ user: { id: '1' } });
    expect(g.fetch.mock.calls.map(c => c[0])).toEqual(['/api/v1/me', '/api/v1/auth/refresh', '/api/v1/me']);
  });

  it('on 401 where refresh also fails: calls the logged-out handler and throws', async () => {
    const onOut = vi.fn();
    setLoggedOutHandler(onOut);
    g.fetch
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_ACCESS_TOKEN', message: '' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: '' } }));
    await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
    expect(onOut).toHaveBeenCalledTimes(1);
    setLoggedOutHandler(() => {});
  });

  it('does not refresh-retry a 401 from an /auth/ route', async () => {
    g.fetch.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: '' } }));
    await expect(apiFetch('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(g.fetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run src/api/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/api/client.ts`**

```ts
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

let loggedOut: () => void = () => {};
export function setLoggedOutHandler(fn: () => void): void { loggedOut = fn; }

function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)dbl_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const headers: Record<string, string> = {};
  const t = csrfToken();
  if (t) headers['X-CSRF-Token'] = t;
  const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers });
  return res.ok;
}

interface Opts { method?: string; body?: unknown; idempotencyKey?: string; }

export async function apiFetch<T>(path: string, opts: Opts = {}): Promise<T> {
  return run<T>(path, opts, false);
}

async function run<T>(path: string, opts: Opts, isRetry: boolean): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET' && method !== 'HEAD') {
    const t = csrfToken();
    if (t) headers['X-CSRF-Token'] = t;
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (res.status === 401 && !isRetry && !path.startsWith('/auth/')) {
    const ok = await (refreshing ??= doRefresh().finally(() => { refreshing = null; }));
    if (ok) return run<T>(path, opts, true);
    loggedOut();
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired');
  }

  if (!res.ok) {
    const parsed = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(
      res.status,
      parsed?.error?.code ?? 'UNKNOWN',
      parsed?.error?.message ?? res.statusText,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

- [ ] **Step 5: Run the client test, verify it passes**

Run: `npx vitest run src/api/client.test.ts`
Expected: PASS (6).

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.app.json`

```bash
git add src/api/types.ts src/api/client.ts src/api/client.test.ts
git commit -m "frontend: apiFetch client (relative /api/v1, CSRF, 401->refresh->retry)"
```

---

## Task 8: Frontend endpoints (`src/api/endpoints.ts`)

**Files:**
- Create: `src/api/endpoints.ts`
- Create: `src/api/endpoints.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (Task 7), types from `src/api/types.ts`.
- Produces:
  ```ts
  export interface RegisterInput { email: string; password: string; username: string; country: string; }
  export function register(input: RegisterInput): Promise<{ user: ApiUser }>;
  export function login(input: { email: string; password: string }): Promise<{ user: ApiUser }>;
  export function logout(): Promise<void>;
  export function getMe(): Promise<{ user: PlayerProfile }>;
  export function previewMigration(save: unknown): Promise<MigrationPreview>;
  export function importMigration(save: unknown, idempotencyKey: string): Promise<MigrationResult>;
  ```

- [ ] **Step 1: Write the failing test**

`src/api/endpoints.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import * as client from './client';
import { register, login, logout, getMe, previewMigration, importMigration } from './endpoints';

describe('endpoints', () => {
  it('register POSTs /auth/register with the body', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ user: { id: '1' } } as never);
    await register({ email: 'a@b.c', password: 'p', username: 'u', country: 'br' });
    expect(spy).toHaveBeenCalledWith('/auth/register', { method: 'POST', body: { email: 'a@b.c', password: 'p', username: 'u', country: 'br' } });
    spy.mockRestore();
  });

  it('getMe GETs /me', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ user: {} } as never);
    await getMe();
    expect(spy).toHaveBeenCalledWith('/me');
    spy.mockRestore();
  });

  it('importMigration passes the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ imported: true } as never);
    await importMigration({ any: 'save' }, 'idem-key-1234567890');
    expect(spy).toHaveBeenCalledWith('/migration/local/import', { method: 'POST', body: { any: 'save' }, idempotencyKey: 'idem-key-1234567890' });
    spy.mockRestore();
  });

  it('logout POSTs /auth/logout', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue(undefined as never);
    await logout();
    expect(spy).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/api/endpoints.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/api/endpoints.ts`**

```ts
import { apiFetch } from './client';
import type { ApiUser, PlayerProfile, MigrationPreview, MigrationResult } from './types';

export interface RegisterInput { email: string; password: string; username: string; country: string; }

export function register(input: RegisterInput): Promise<{ user: ApiUser }> {
  return apiFetch('/auth/register', { method: 'POST', body: input });
}
export function login(input: { email: string; password: string }): Promise<{ user: ApiUser }> {
  return apiFetch('/auth/login', { method: 'POST', body: input });
}
export function logout(): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST' });
}
export function getMe(): Promise<{ user: PlayerProfile }> {
  return apiFetch('/me');
}
export function previewMigration(save: unknown): Promise<MigrationPreview> {
  return apiFetch('/migration/local/preview', { method: 'POST', body: save });
}
export function importMigration(save: unknown, idempotencyKey: string): Promise<MigrationResult> {
  return apiFetch('/migration/local/import', { method: 'POST', body: save, idempotencyKey });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/api/endpoints.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add src/api/endpoints.ts src/api/endpoints.test.ts
git commit -m "frontend: typed API endpoint wrappers (auth + migration + me)"
```

---

## Task 9: `AuthProvider` + `useAuth`

**Files:**
- Create: `src/game/auth/AuthProvider.tsx`
- Create: `src/game/auth/AuthProvider.test.tsx`
- Create: `src/game/auth/countries.ts` (flag↔ISO2 + `COUNTRIES`)

**Interfaces:**
- Consumes: `register`, `login`, `logout`, `getMe` (Task 8); `ApiError` (Task 7); `setLoggedOutHandler` (Task 7).
- Produces:
  ```ts
  export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';
  export interface AuthContextValue {
    status: AuthStatus;
    user: ApiUser | null;
    login(email: string, password: string): Promise<void>;
    register(input: { email: string; password: string; username: string; country: string }): Promise<void>;
    logout(): Promise<void>;
  }
  export function AuthProvider(props: { children: React.ReactNode; onAuthenticated?: () => void | Promise<void> }): JSX.Element;
  export function useAuth(): AuthContextValue;
  ```
  `onAuthenticated` fires after a successful `login`/`register` AND after the mount `getMe()` finds a session — this is where Task 10's `hydrateFromServer()` and Task 13's import flow hook in.

- [ ] **Step 1: Write `src/game/auth/countries.ts`**

Move `COUNTRIES` out of `account.ts` and add the ISO-2 mapping. Cover exactly the 16 flags currently in `account.ts`:

```ts
export const COUNTRIES = ['🇧🇷','🇵🇹','🇺🇸','🇪🇸','🇫🇷','🇩🇪','🇮🇹','🇬🇧','🇯🇵','🇰🇷','🇲🇽','🇦🇷','🇨🇦','🇦🇺','🇨🇳','🌍'] as const;

const FLAG_TO_ISO: Record<string, string> = {
  '🇧🇷': 'BR', '🇵🇹': 'PT', '🇺🇸': 'US', '🇪🇸': 'ES', '🇫🇷': 'FR', '🇩🇪': 'DE',
  '🇮🇹': 'IT', '🇬🇧': 'GB', '🇯🇵': 'JP', '🇰🇷': 'KR', '🇲🇽': 'MX', '🇦🇷': 'AR',
  '🇨🇦': 'CA', '🇦🇺': 'AU', '🇨🇳': 'CN', '🌍': 'ZZ',
};
const ISO_TO_FLAG: Record<string, string> = Object.fromEntries(
  Object.entries(FLAG_TO_ISO).map(([flag, iso]) => [iso, flag]),
);

export function flagToIso2(flag: string): string { return FLAG_TO_ISO[flag] ?? 'ZZ'; }
export function iso2ToFlag(iso: string): string { return ISO_TO_FLAG[iso?.toUpperCase()] ?? '🌍'; }
```

(Backend `registerSchema` requires `/^[A-Za-z]{2}$/` — `ZZ` for "world" is valid and unassigned in ISO 3166.)

- [ ] **Step 2: Write the failing test**

`src/game/auth/AuthProvider.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import * as endpoints from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const a = useAuth();
  return (
    <div>
      <span data-testid="status">{a.status}</span>
      <span data-testid="user">{a.user?.username ?? '-'}</span>
      <button onClick={() => a.login('e@x.com', 'pw').catch(() => {})}>login</button>
      <button onClick={() => a.logout()}>logout</button>
    </div>
  );
}

beforeEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AuthProvider', () => {
  it('starts loading, then anonymous when /me is 401', async () => {
    vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'INVALID_ACCESS_TOKEN', ''));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId('status').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
  });

  it('is authenticated when /me returns a user', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('Angler');
  });

  it('login updates status and user; fires onAuthenticated', async () => {
    vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', ''));
    vi.spyOn(endpoints, 'login').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    const onAuth = vi.fn();
    render(<AuthProvider onAuthenticated={onAuth}><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(onAuth).toHaveBeenCalled();
  });

  it('logout returns to anonymous', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'A', email: 'e', country: 'BR' } } as never);
    vi.spyOn(endpoints, 'logout').mockResolvedValue();
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run src/game/auth/AuthProvider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/game/auth/AuthProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApiUser } from '@/api/types';
import { ApiError, setLoggedOutHandler } from '@/api/client';
import * as endpoints from '@/api/endpoints';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: ApiUser | null;
  login(email: string, password: string): Promise<void>;
  register(input: { email: string; password: string; username: string; country: string }): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, onAuthenticated }: { children: ReactNode; onAuthenticated?: () => void | Promise<void> }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<ApiUser | null>(null);
  const onAuthRef = useRef(onAuthenticated);
  onAuthRef.current = onAuthenticated;

  const enter = useCallback(async (u: ApiUser) => {
    setUser(u);
    setStatus('authenticated');
    await onAuthRef.current?.();
  }, []);

  useEffect(() => {
    setLoggedOutHandler(() => { setUser(null); setStatus('anonymous'); });
    let alive = true;
    endpoints.getMe()
      .then(({ user: p }) => { if (alive) void enter({ id: p.userId, email: p.email, username: p.username, country: p.country }); })
      .catch((e: unknown) => { if (alive && e instanceof ApiError) { setUser(null); setStatus('anonymous'); } });
    return () => { alive = false; };
  }, [enter]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await endpoints.login({ email, password });
    await enter(u);
  }, [enter]);

  const register = useCallback(async (input: { email: string; password: string; username: string; country: string }) => {
    const { user: u } = await endpoints.register(input);
    await enter(u);
  }, [enter]);

  const logout = useCallback(async () => {
    try { await endpoints.logout(); } finally { setUser(null); setStatus('anonymous'); }
  }, []);

  return <AuthContext.Provider value={{ status, user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run src/game/auth/AuthProvider.test.tsx`
Expected: PASS (4).

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.app.json`

```bash
git add src/game/auth/AuthProvider.tsx src/game/auth/AuthProvider.test.tsx src/game/auth/countries.ts
git commit -m "frontend: AuthProvider / useAuth (getMe on mount, login/register/logout)"
```

---

## Task 10: `useGameState.replaceFromServer` + `hydrate.ts`

**Files:**
- Modify: `src/game/useGameState.ts`
- Create: `src/game/auth/hydrate.ts`
- Create: `src/test/replaceFromServer.test.ts`
- Create: `src/game/auth/hydrate.test.ts`

**Interfaces:**
- Consumes: `getMe` (Task 8); `getXpForLevel` from `@/game/types`.
- Produces:
  - `useGameState()` return gains `replaceFromServer(partial: Partial<PlayerState>): void` — merges `partial` over the current state, recomputes nothing except what `partial` provides, and persists.
  - `export async function hydrateFromServer(replace: (p: Partial<PlayerState>) => void): Promise<void>` in `hydrate.ts`.

- [ ] **Step 1: Write the failing `replaceFromServer` test**

`src/test/replaceFromServer.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from '@/game/useGameState';

beforeEach(() => localStorage.clear());

describe('replaceFromServer', () => {
  it('merges server fields over local state and persists', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.replaceFromServer({ level: 7, coins: 1234, unlockedLocations: ['atlantic', 'caribbean'] });
    });
    expect(result.current.player.level).toBe(7);
    expect(result.current.player.coins).toBe(1234);
    expect(result.current.player.unlockedLocations).toEqual(['atlantic', 'caribbean']);
    // untouched fields keep their defaults
    expect(result.current.player.ownedSkins).toEqual(['default']);

    const saved = JSON.parse(localStorage.getItem('fishing-game-state')!);
    expect(saved.player.coins).toBe(1234);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/test/replaceFromServer.test.ts`
Expected: FAIL — `result.current.replaceFromServer is not a function`.

- [ ] **Step 3: Add `replaceFromServer` to `src/game/useGameState.ts`**

Add a callback inside the hook (near the other `setPlayer` helpers):

```ts
  const replaceFromServer = useCallback((partial: Partial<PlayerState>) => {
    setPlayer(prev => ({ ...prev, ...partial }));
  }, []);
```

Add `replaceFromServer` to the object the hook returns.
(`setPlayer` already persists via the existing `useEffect` that writes `serializePlayerState`. Confirm that effect has `player` in its deps.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/test/replaceFromServer.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing `hydrate` test**

`src/game/auth/hydrate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import * as endpoints from '@/api/endpoints';
import { hydrateFromServer } from './hydrate';

describe('hydrateFromServer', () => {
  it('maps /me to a PlayerState partial and calls replace', async () => {
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({
      user: {
        userId: 'u1', email: 'e', username: 'A', country: 'BR',
        level: 5, xp: 40, totalFishCaught: 12, coins: 999, unlockedLocations: ['atlantic'],
      },
    });
    const replace = vi.fn();
    await hydrateFromServer(replace);
    expect(replace).toHaveBeenCalledWith(expect.objectContaining({
      level: 5, xp: 40, totalFishCaught: 12, coins: 999, unlockedLocations: ['atlantic'],
    }));
    // xpToNextLevel is derived
    const arg = replace.mock.calls[0][0];
    expect(typeof arg.xpToNextLevel).toBe('number');
  });
});
```

- [ ] **Step 6: Run it, verify it fails**

Run: `npx vitest run src/game/auth/hydrate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/game/auth/hydrate.ts`**

```ts
import type { PlayerState } from '@/game/types';
import { getXpForLevel } from '@/game/types';
import { getMe } from '@/api/endpoints';

export async function hydrateFromServer(replace: (partial: Partial<PlayerState>) => void): Promise<void> {
  const { user } = await getMe();
  replace({
    level: user.level,
    xp: user.xp,
    xpToNextLevel: getXpForLevel(user.level),
    totalFishCaught: user.totalFishCaught,
    coins: user.coins,
    unlockedLocations: user.unlockedLocations,
  });
}
```

- [ ] **Step 8: Run the test, verify it passes**

Run: `npx vitest run src/game/auth/hydrate.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.app.json`

```bash
git add src/game/useGameState.ts src/game/auth/hydrate.ts src/test/replaceFromServer.test.ts src/game/auth/hydrate.test.ts
git commit -m "frontend: useGameState.replaceFromServer + hydrateFromServer(/me)"
```

---

## Task 11: i18n keys + `account.ts` cleanup + mount `AuthProvider`

**Files:**
- Modify: `src/game/i18n.tsx`
- Modify: `src/components/game/menu/account.ts`
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `AuthProvider` (Task 9); `hydrateFromServer` (Task 10).
- Produces: `Index.tsx` renders `<AuthProvider onAuthenticated={...}>` around `IndexInner`; `onAuthenticated` runs `hydrateFromServer(replaceFromServer)`. `account.ts` no longer exports `Account` / `loadAccount` / `saveAccount` / `COUNTRIES` (moved to `countries.ts`); keeps `TUTORIAL_KEY`.

- [ ] **Step 1: Add i18n keys**

In `src/game/i18n.tsx` `translations`, add (all six languages — follow the existing style; PT shown, translate the rest):

```ts
  'auth.emailLabel': { pt: 'E-mail', en: 'Email', es: 'Correo', fr: 'E-mail', de: 'E-Mail', ja: 'メール' },
  'auth.passwordLabel': { pt: 'Palavra-passe', en: 'Password', es: 'Contraseña', fr: 'Mot de passe', de: 'Passwort', ja: 'パスワード' },
  'auth.passwordHint': { pt: 'Mínimo 12 caracteres', en: 'At least 12 characters', es: 'Mínimo 12 caracteres', fr: 'Au moins 12 caractères', de: 'Mindestens 12 Zeichen', ja: '12文字以上' },
  'auth.usernameLabel': { pt: 'Nome de utilizador', en: 'Username', es: 'Usuario', fr: "Nom d'utilisateur", de: 'Benutzername', ja: 'ユーザー名' },
  'auth.countryLabel': { pt: 'País', en: 'Country', es: 'País', fr: 'Pays', de: 'Land', ja: '国' },
  'auth.signupCta': { pt: 'Criar conta', en: 'Create account', es: 'Crear cuenta', fr: 'Créer un compte', de: 'Konto erstellen', ja: 'アカウント作成' },
  'auth.loginCta': { pt: 'Entrar', en: 'Log in', es: 'Entrar', fr: 'Se connecter', de: 'Anmelden', ja: 'ログイン' },
  'auth.logoutCta': { pt: 'Sair', en: 'Log out', es: 'Salir', fr: 'Se déconnecter', de: 'Abmelden', ja: 'ログアウト' },
  'auth.haveAccount': { pt: 'Já tenho conta', en: 'I already have an account', es: 'Ya tengo cuenta', fr: "J'ai déjà un compte", de: 'Ich habe schon ein Konto', ja: 'アカウントを持っています' },
  'auth.needAccount': { pt: 'Criar uma conta nova', en: 'Create a new account', es: 'Crear una cuenta nueva', fr: 'Créer un nouveau compte', de: 'Neues Konto erstellen', ja: '新しいアカウントを作成' },
  'auth.err.INVALID_CREDENTIALS': { pt: 'E-mail ou palavra-passe inválidos', en: 'Invalid email or password', es: 'Correo o contraseña inválidos', fr: 'E-mail ou mot de passe invalide', de: 'E-Mail oder Passwort ungültig', ja: 'メールまたはパスワードが違います' },
  'auth.err.ACCOUNT_ALREADY_EXISTS': { pt: 'Já existe uma conta com esse e-mail', en: 'An account with that email already exists', es: 'Ya existe una cuenta con ese correo', fr: 'Un compte avec cet e-mail existe déjà', de: 'Ein Konto mit dieser E-Mail existiert bereits', ja: 'そのメールのアカウントは既に存在します' },
  'auth.err.USERNAME_TAKEN': { pt: 'Esse nome de utilizador já está em uso', en: 'That username is already taken', es: 'Ese usuario ya está en uso', fr: "Ce nom d'utilisateur est déjà pris", de: 'Dieser Benutzername ist vergeben', ja: 'そのユーザー名は使われています' },
  'auth.err.VALIDATION_ERROR': { pt: 'Verifica os campos', en: 'Check the fields', es: 'Revisa los campos', fr: 'Vérifiez les champs', de: 'Prüfe die Felder', ja: '入力を確認してください' },
  'auth.err.NETWORK': { pt: 'Sem ligação ao servidor', en: 'No connection to the server', es: 'Sin conexión al servidor', fr: 'Pas de connexion au serveur', de: 'Keine Verbindung zum Server', ja: 'サーバーに接続できません' },
  'auth.importTitle': { pt: 'Importar o teu progresso local?', en: 'Import your local progress?', es: '¿Importar tu progreso local?', fr: 'Importer votre progression locale ?', de: 'Lokalen Fortschritt importieren?', ja: 'ローカルの進行状況をインポートしますか？' },
  'auth.importBody': { pt: 'Nível {level}, {coins} moedas, {fish} peixes.', en: 'Level {level}, {coins} coins, {fish} fish.', es: 'Nivel {level}, {coins} monedas, {fish} peces.', fr: 'Niveau {level}, {coins} pièces, {fish} poissons.', de: 'Level {level}, {coins} Münzen, {fish} Fische.', ja: 'レベル{level}、{coins}コイン、{fish}匹。' },
  'auth.importYes': { pt: 'Importar', en: 'Import', es: 'Importar', fr: 'Importer', de: 'Importieren', ja: 'インポート' },
  'auth.importNo': { pt: 'Agora não', en: 'Not now', es: 'Ahora no', fr: 'Pas maintenant', de: 'Jetzt nicht', ja: '後で' },
```

- [ ] **Step 2: Reduce `src/components/game/menu/account.ts`**

New full contents:

```ts
export const TUTORIAL_KEY = 'fishing-game-tutorial-seen';
```

(Any other module importing `Account` / `loadAccount` / `saveAccount` / `COUNTRIES` / `ACCOUNT_KEY` from here will break — Task 12 fixes `AccountModal` and `MainMenu`. Run `grep -rn "from '@/components/game/menu/account'" src` and note the consumers.)

- [ ] **Step 3: Mount `AuthProvider` in `src/pages/Index.tsx`**

`IndexInner` currently owns `useGameState()`. The hydrate needs `replaceFromServer` from that hook, but `AuthProvider` must wrap `IndexInner`. Resolve by lifting: keep `useGameState` in `IndexInner`, and pass a hydrate callback down via a ref, OR — simpler — move the `AuthProvider` inside `IndexInner` between the hook and the render:

```tsx
const IndexInner = () => {
  const game = useGameState();
  // ...existing music, world, etc.
  return (
    <AuthProvider onAuthenticated={() => hydrateFromServer(game.replaceFromServer).catch(() => {})}>
      {/* existing screen switch / MainMenu tree, unchanged */}
    </AuthProvider>
  );
};
```

Add imports: `import { AuthProvider } from '@/game/auth/AuthProvider';` and `import { hydrateFromServer } from '@/game/auth/hydrate';`.

- [ ] **Step 4: Typecheck — expect `AccountModal` / `MainMenu` errors**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: errors in `AccountModal.tsx` and `MainMenu.tsx` (missing `Account` etc.). Task 12 fixes them. Do **not** fix here.

- [ ] **Step 5: Commit (with known typecheck failures in two files)**

```bash
git add src/game/i18n.tsx src/components/game/menu/account.ts src/pages/Index.tsx
git commit -m "frontend: auth i18n keys, AuthProvider mounted, account.ts reduced to TUTORIAL_KEY

AccountModal and MainMenu still reference the removed helpers; fixed next."
```

---

## Task 12: `AccountModal` rewrite + `MainMenu` chip

**Files:**
- Modify: `src/components/game/menu/AccountModal.tsx` (full rewrite)
- Modify: `src/components/game/MainMenu.tsx` (account chip)
- Modify: `src/test/AccountModal.test.tsx` (full rewrite)
- Modify: `src/test/MainMenu.test.tsx` (wrap in `AuthProvider`, fix chip assertions)

**Interfaces:**
- Consumes: `useAuth` (Task 9); `COUNTRIES`, `flagToIso2`, `iso2ToFlag` (Task 9 countries.ts); `ApiError` (Task 7); i18n keys (Task 11).
- Produces: `AccountModal` is a self-contained dialog driven by `useAuth()`; `MainMenu` no longer imports from `account.ts` for the chip — it reads `useAuth().user`.

- [ ] **Step 1: Rewrite `src/test/AccountModal.test.tsx`**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/game/i18n';
import * as endpoints from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { AuthProvider } from '@/game/auth/AuthProvider';
import AccountModal from '@/components/game/menu/AccountModal';

function renderModal() {
  const onClose = vi.fn();
  render(
    <I18nProvider>
      <AuthProvider><AccountModal open onClose={onClose} /></AuthProvider>
    </I18nProvider>,
  );
  return { onClose };
}

beforeEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear();
  vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', '')); });

describe('AccountModal', () => {
  it('logs in with email + password', async () => {
    const login = vi.spyOn(endpoints, 'login').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'e@x.com', password: 'a-strong-password' }));
  });

  it('registers with email, password, username, country (ISO-2)', async () => {
    const register = vi.spyOn(endpoints, 'register').mockResolvedValue({ user: { id: 'u1', username: 'Angler', email: 'e@x.com', country: 'BR' } } as never);
    renderModal();
    fireEvent.change(await screen.findByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'a-strong-password' } });
    fireEvent.change(screen.getByLabelText(/nome de utilizador/i), { target: { value: 'Angler' } });
    // default country is 🌍 -> ZZ; pick Brazil
    fireEvent.click(screen.getByRole('button', { name: '🇧🇷' }));
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }));
    await waitFor(() => expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'e@x.com', password: 'a-strong-password', username: 'Angler', country: 'BR' }),
    ));
  });

  it('shows a mapped error message on invalid credentials', async () => {
    vi.spyOn(endpoints, 'login').mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'x'));
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /já tenho conta/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'e@x.com' } });
    fireEvent.change(screen.getByLabelText(/palavra-passe/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
    expect(await screen.findByText(/inválidos/i)).toBeInTheDocument();
  });

  it('when authenticated: shows the username and a log-out button', async () => {
    vi.restoreAllMocks();
    vi.spyOn(endpoints, 'getMe').mockResolvedValue({ user: { userId: 'u1', username: 'Angler', email: 'e', country: 'BR', level: 1, xp: 0, totalFishCaught: 0, coins: 0, unlockedLocations: [] } } as never);
    vi.spyOn(endpoints, 'logout').mockResolvedValue();
    renderModal();
    expect(await screen.findByText('Angler')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    await waitFor(() => expect(endpoints.logout).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/test/AccountModal.test.tsx`
Expected: FAIL — the current modal uses the localStorage stub / username login.

- [ ] **Step 3: Rewrite `src/components/game/menu/AccountModal.tsx`**

Props become `{ open: boolean; onClose: () => void }` (drop `account` / `onAccountChange`). Keep the existing visual shell (overlay, `role="dialog"`, `aria-modal`, the tutorial banner gated on `TUTORIAL_KEY`, the close `×`). Replace the body:

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/game/i18n';
import { useAuth } from '@/game/auth/AuthProvider';
import { ApiError } from '@/api/client';
import { COUNTRIES, flagToIso2 } from '@/game/auth/countries';
import { TUTORIAL_KEY } from './account';

type Mode = 'signup' | 'login';

interface Props { open: boolean; onClose: () => void; }

export default function AccountModal({ open, onClose }: Props) {
  const { t } = useI18n();
  const { status, user, login, register, logout } = useAuth();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [flag, setFlag] = useState('🌍');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(() => localStorage.getItem(TUTORIAL_KEY) !== '1');

  const dismissTutorial = () => { localStorage.setItem(TUTORIAL_KEY, '1'); setTutorialVisible(false); };

  const errText = (e: unknown): string => {
    if (e instanceof ApiError) {
      const key = `auth.err.${e.code}` as const;
      const msg = t(key as never);
      return msg === key ? t('auth.err.VALIDATION_ERROR') : msg;
    }
    return t('auth.err.NETWORK');
  };

  const submit = async () => {
    setError(null); setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register({ email: email.trim(), password, username: username.trim(), country: flagToIso2(flag) });
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 p-4 backdrop-blur-sm"
        >
          {tutorialVisible && (
            <div className="max-w-sm rounded-xl border border-lure/40 bg-card/90 p-4 text-left shadow-lg backdrop-blur" role="status" onClick={e => e.stopPropagation()}>
              <h2 className="mb-1 text-base font-bold text-foreground">{t('menu.tutorialTitle')}</h2>
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{t('menu.tutorialBody')}</p>
              <Button type="button" size="sm" onClick={dismissTutorial} className="min-h-10">{t('menu.tutorialDismiss')}</Button>
            </div>
          )}

          <motion.div
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="account-modal-title"
            className="w-full max-w-sm rounded-2xl border-2 border-lure bg-card p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="account-modal-title" className="flex items-center gap-2 text-xl font-bold text-foreground">
                <User className="h-5 w-5 text-lure" /> {t('account.title')}
              </h2>
              <button onClick={onClose} aria-label={t('menu.close')} className="text-2xl leading-none text-muted-foreground hover:text-foreground">×</button>
            </div>

            {status === 'authenticated' && user ? (
              <div className="space-y-3 text-center">
                <p className="text-lg font-semibold text-foreground">{user.username}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <Button variant="outline" className="w-full" onClick={() => { void logout(); onClose(); }}>{t('auth.logoutCta')}</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                <label className="block text-xs text-muted-foreground" htmlFor="acc-email">{t('auth.emailLabel')}</label>
                <Input id="acc-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />

                <label className="block text-xs text-muted-foreground" htmlFor="acc-pw">{t('auth.passwordLabel')}</label>
                <Input id="acc-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                {mode === 'signup' && <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>}

                {mode === 'signup' && (
                  <>
                    <label className="block text-xs text-muted-foreground" htmlFor="acc-user">{t('auth.usernameLabel')}</label>
                    <Input id="acc-user" type="text" value={username} onChange={e => setUsername(e.target.value)} maxLength={20} placeholder="MyAngler" />
                    <span className="block text-xs text-muted-foreground">{t('auth.countryLabel')}</span>
                    <div className="grid grid-cols-8 gap-1.5">
                      {COUNTRIES.map(c => (
                        <button key={c} type="button" aria-label={c} onClick={() => setFlag(c)}
                          className={`rounded border-2 p-1.5 text-xl ${flag === c ? 'border-lure bg-lure/10' : 'border-transparent hover:border-border'}`}>{c}</button>
                      ))}
                    </div>
                  </>
                )}

                <Button onClick={submit} disabled={busy || !email || !password || (mode === 'signup' && !username.trim())} className="w-full">
                  {mode === 'signup' ? t('auth.signupCta') : t('auth.loginCta')}
                </Button>
                <button type="button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null); }}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 text-sm text-lure hover:underline">
                  <LogIn className="h-3.5 w-3.5" />
                  {mode === 'signup' ? t('auth.haveAccount') : t('auth.needAccount')}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Update `src/components/game/MainMenu.tsx`**

- Remove `import { Account, loadAccount } from './menu/account';` and the `account` / `setAccount` state.
- Import `useAuth`: `import { useAuth } from '@/game/auth/AuthProvider';`
- In the component: `const { status, user } = useAuth();`
- The account chip button label:
  ```tsx
  {status === 'authenticated' && user ? user.username : t('menu.register')}
  ```
- `<AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />` — drop the `account` / `onAccountChange` props.

- [ ] **Step 5: Run the modal test, verify it passes**

Run: `npx vitest run src/test/AccountModal.test.tsx`
Expected: PASS (4).

- [ ] **Step 6: Fix `src/test/MainMenu.test.tsx`**

Wrap the render in `<AuthProvider>` and stub `getMe` to reject (anonymous) in `beforeEach`:
```tsx
import { AuthProvider } from '@/game/auth/AuthProvider';
import * as endpoints from '@/api/endpoints';
import { ApiError } from '@/api/client';
// in beforeEach: vi.spyOn(endpoints, 'getMe').mockRejectedValue(new ApiError(401, 'X', ''));
// render: <I18nProvider><AuthProvider><MainMenu ... /></AuthProvider></I18nProvider>
```
The "account modal" test that asserted `/cadastro/i` → the chip now shows `t('menu.register')` when anonymous — keep that assertion; drop any assertion about the old 3-step credential flow (that lives in `AccountModal.test.tsx` now).

- [ ] **Step 7: Full frontend suite + typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run src/`
Expected: all green, 0 lint errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/game/menu/AccountModal.tsx src/components/game/MainMenu.tsx src/test/AccountModal.test.tsx src/test/MainMenu.test.tsx
git commit -m "frontend: AccountModal + MainMenu chip on real auth (email login, no birthdate)"
```

---

## Task 13: First-login local-save import flow

**Files:**
- Create: `src/game/auth/importFlow.ts`
- Create: `src/game/auth/importFlow.test.ts`
- Modify: `src/pages/Index.tsx` (call the flow from `onAuthenticated`)
- Modify: `src/components/game/menu/AccountModal.tsx` — no; the dialog is rendered by `Index` via a small component. Create: `src/components/game/menu/ImportSaveDialog.tsx`.

**Interfaces:**
- Consumes: `previewMigration`, `importMigration` (Task 8); the raw local save string at `localStorage['fishing-game-state']`; `hydrateFromServer` (Task 10).
- Produces:
  - `export const IMPORT_DONE_KEY = 'dbl-import-done';`
  - `export async function maybeOfferImport(deps: { onPreview: (p: MigrationPreview & { raw: unknown }) => void }): Promise<void>` — reads local save, if present and not yet imported, calls `previewMigration` and hands the preview to `onPreview`; otherwise no-op.
  - `export async function runImport(raw: unknown): Promise<void>` — `importMigration(raw, crypto.randomUUID())`, then sets `IMPORT_DONE_KEY = '1'`. Maps `LOCAL_SAVE_ALREADY_IMPORTED` to a silent success.
  - `ImportSaveDialog` — presentational: `{ preview, onImport, onDismiss }`.

- [ ] **Step 1: Write the failing test**

`src/game/auth/importFlow.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as endpoints from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { maybeOfferImport, runImport, IMPORT_DONE_KEY } from './importFlow';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

const save = JSON.stringify({ schemaVersion: 1, player: { level: 3, coins: 50 } });

describe('importFlow', () => {
  it('offers a preview when a local save exists and import not done', async () => {
    localStorage.setItem('fishing-game-state', save);
    vi.spyOn(endpoints, 'previewMigration').mockResolvedValue({ sourceVersion: 1, summary: { accepted: 2, rejected: 0 }, rejected: [] });
    const onPreview = vi.fn();
    await maybeOfferImport({ onPreview });
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ summary: { accepted: 2, rejected: 0 } }));
  });

  it('does nothing when there is no local save', async () => {
    const onPreview = vi.fn();
    await maybeOfferImport({ onPreview });
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('does nothing when already imported', async () => {
    localStorage.setItem('fishing-game-state', save);
    localStorage.setItem(IMPORT_DONE_KEY, '1');
    const onPreview = vi.fn();
    await maybeOfferImport({ onPreview });
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('runImport calls importMigration with an idempotency key and marks done', async () => {
    const spy = vi.spyOn(endpoints, 'importMigration').mockResolvedValue({ imported: true, sourceVersion: 1, summary: { accepted: 2, rejected: 0 } });
    await runImport({ any: 'thing' });
    expect(spy).toHaveBeenCalledTimes(1);
    const [, key] = spy.mock.calls[0];
    expect(typeof key).toBe('string');
    expect(localStorage.getItem(IMPORT_DONE_KEY)).toBe('1');
  });

  it('runImport treats LOCAL_SAVE_ALREADY_IMPORTED as success', async () => {
    vi.spyOn(endpoints, 'importMigration').mockRejectedValue(new ApiError(409, 'LOCAL_SAVE_ALREADY_IMPORTED', 'x'));
    await expect(runImport({})).resolves.toBeUndefined();
    expect(localStorage.getItem(IMPORT_DONE_KEY)).toBe('1');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/game/auth/importFlow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/game/auth/importFlow.ts`**

```ts
import type { MigrationPreview } from '@/api/types';
import { ApiError } from '@/api/client';
import { previewMigration, importMigration } from '@/api/endpoints';

export const IMPORT_DONE_KEY = 'dbl-import-done';
const SAVE_KEY = 'fishing-game-state';

function readLocalSave(): unknown | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function maybeOfferImport(deps: {
  onPreview: (p: MigrationPreview & { raw: unknown }) => void;
}): Promise<void> {
  if (localStorage.getItem(IMPORT_DONE_KEY) === '1') return;
  const raw = readLocalSave();
  if (!raw) return;
  try {
    const preview = await previewMigration(raw);
    deps.onPreview({ ...preview, raw });
  } catch {
    // preview failed (invalid save / offline) — skip silently, offer again next login
  }
}

export async function runImport(raw: unknown): Promise<void> {
  try {
    await importMigration(raw, crypto.randomUUID());
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'LOCAL_SAVE_ALREADY_IMPORTED')) throw e;
  }
  localStorage.setItem(IMPORT_DONE_KEY, '1');
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/game/auth/importFlow.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Create `src/components/game/menu/ImportSaveDialog.tsx`**

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/game/i18n';
import type { MigrationPreview } from '@/api/types';

interface Props {
  preview: (MigrationPreview & { raw: unknown }) | null;
  localLevel: number;
  localCoins: number;
  onImport: () => void;
  onDismiss: () => void;
}

export default function ImportSaveDialog({ preview, localLevel, localCoins, onImport, onDismiss }: Props) {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {preview && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true"
            className="menu-panel w-full max-w-sm rounded-2xl border border-lure/40 p-6 text-center"
          >
            <h2 className="mb-2 font-display text-xl font-bold text-foreground">{t('auth.importTitle')}</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              {t('auth.importBody')
                .replace('{level}', String(localLevel))
                .replace('{coins}', String(localCoins))
                .replace('{fish}', String(preview.summary.accepted))}
            </p>
            <div className="flex gap-3">
              <Button className="flex-1 bg-lure font-semibold text-lure-foreground hover:bg-lure/90" onClick={onImport}>{t('auth.importYes')}</Button>
              <Button variant="outline" className="flex-1 border-lure/25" onClick={onDismiss}>{t('auth.importNo')}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 6: Wire it into `src/pages/Index.tsx`**

```tsx
const IndexInner = () => {
  const game = useGameState();
  // ...existing
  const [importPreview, setImportPreview] = useState<(MigrationPreview & { raw: unknown }) | null>(null);

  const afterAuth = async () => {
    await hydrateFromServer(game.replaceFromServer).catch(() => {});
    await maybeOfferImport({ onPreview: setImportPreview });
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    await runImport(importPreview.raw).catch(() => {});
    setImportPreview(null);
    await hydrateFromServer(game.replaceFromServer).catch(() => {});
  };

  return (
    <AuthProvider onAuthenticated={afterAuth}>
      {/* existing tree */}
      <ImportSaveDialog
        preview={importPreview}
        localLevel={game.player.level}
        localCoins={game.player.coins}
        onImport={confirmImport}
        onDismiss={() => setImportPreview(null)}
      />
    </AuthProvider>
  );
};
```

Imports: `MigrationPreview` from `@/api/types`, `maybeOfferImport`, `runImport` from `@/game/auth/importFlow`, `ImportSaveDialog`.

- [ ] **Step 7: Full verification**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npm test && npm run build`
Expected: all green, 0 lint errors.

- [ ] **Step 8: Commit**

```bash
git add src/game/auth/importFlow.ts src/game/auth/importFlow.test.ts src/components/game/menu/ImportSaveDialog.tsx src/pages/Index.tsx
git commit -m "frontend: first-login dialog to import the local save (/migration/local/import)"
```

---

## Task 14: End-to-end verification + PROJECT_MEMORY

**Files:**
- Modify: `PROJECT_MEMORY.md` (append a Task 10.1 section)

- [ ] **Step 1: Full local verification**

Run, all must pass:
```
npx tsc --noEmit -p tsconfig.app.json
npm run backend:typecheck
npm run lint
npm test
npm run build
```
With a local Postgres (`npm run backend:db:migrate` first):
```
npm run test:integration
```

- [ ] **Step 2: Container smoke test**

Run: `docker compose up --build`
In the browser at `http://localhost:8080`:
1. Play a bit anonymously (catch a fish, buy nothing) — localStorage save exists.
2. Open the account modal → **Create account** (email, 12+ char password, username, 🇧🇷).
3. Expect: modal closes, then the **import dialog** appears ("Nível X, Y moedas, Z peixes"). Click **Importar**.
4. DevTools → Application → Cookies: `dbl_at`, `dbl_rt`, `dbl_csrf` on `localhost:8080`.
5. Reload the page — still logged in (the account chip shows the username).
6. Open the modal → **Sair** → chip returns to "Cadastro"; the game still runs.
7. Log in again with the same credentials → account chip shows the username; no second import dialog (`dbl-import-done`).
8. Network tab: a mutating request (e.g. trigger nothing yet — or inspect `/auth/logout`) carries `X-CSRF-Token`.

- [ ] **Step 3: Manual test hand-off**

Ask the user to repeat Step 2 in their own browser and confirm the flow, plus: register with an email that is already taken → the mapped "já existe uma conta" error shows.

- [ ] **Step 4: Update PROJECT_MEMORY.md**

Append under the Task 9 section a `### Task 10.1 — Fundação de auth` entry: what changed (cookie auth, `/api` proxy, `apiFetch`, `AuthProvider`, `AccountModal` religado, hidratação one-shot, import no 1º login), the cookie names/attributes, the CSRF scheme, and "fora de âmbito: 10.2–10.5". Note the spec + plan paths.

- [ ] **Step 5: Commit**

```bash
git add PROJECT_MEMORY.md
git commit -m "docs: record Task 10.1 (auth foundation) in PROJECT_MEMORY"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| A — cookies (`dbl_at`/`dbl_rt`/`dbl_csrf`, attributes) | 2 |
| A — register/login set, refresh via cookie, logout clears | 3 |
| A — `requireAuth` cookie + Bearer fallback | 3 |
| A — CSRF double-submit + `CSRF_FAILED` + allow-headers | 4 |
| A — `@fastify/cookie`, `COOKIE_SECURE`/`COOKIE_DOMAIN`, `.env*` | 1, 6 |
| A — `authClient` helper + migrate 39 integration tests + `app.test.ts` | 5 |
| B — Vite proxy | 6 |
| B — nginx `/api` | 6 |
| B — `compose.yaml` `VITE_API_BASE_URL` | 6 |
| C — `apiFetch` (401→refresh→retry, CSRF, `ApiError`, `/api/v1` relative) | 7 |
| C — `endpoints.ts` (register/login/logout/getMe/preview/import) | 8 |
| C — hand-written types | 7 |
| D — `AuthProvider` / `useAuth`, `getMe` on mount | 9 |
| D — `AccountModal` 2-step, email login, country ISO-2, drop birthdate | 12 |
| D — `account.ts` reduced, `MainMenu` chip via `useAuth` | 11, 12 |
| D — first-login import dialog | 13 |
| E — `useGameState.replaceFromServer` + `hydrateFromServer` | 10 |
| E — called by `AuthProvider` after auth + after import | 11, 13 |
| F — leaderboard/useGameState game-loop unchanged | (no task — nothing to change) |
| i18n keys (auth errors, import) | 11 |
| Verification (typecheck/test/integration/build/smoke/manual) | 14 (+ per-task) |

No gaps.

**2. Placeholder scan**

- Task 5 Step 3 describes a mechanical per-file pattern rather than showing every edited file's diff. This is the one place the plan says "do X to each of N files" — acceptable because the edit is identical and listing 9 near-identical diffs adds no information; the pattern and the per-file test-run command are concrete. Not a code step producing new types.
- All type/function names introduced in a task's **Interfaces → Produces** block are used consistently downstream (`apiFetch`, `ApiError`, `setLoggedOutHandler`, `useAuth`, `replaceFromServer`, `hydrateFromServer`, `maybeOfferImport`, `runImport`, `IMPORT_DONE_KEY`, `flagToIso2`, `COUNTRIES`, `CookieConfig`, `setAuthCookies`, `readRefreshToken`, `registerAndAuth`).
- No "TODO" / "add error handling" / "similar to Task N" without the code.

**3. Type consistency**

- `PlayerProfile` (Task 7 types.ts) has `userId` (not `id`) — matches backend `PlayerProfile` and is used as `p.userId` in `AuthProvider` (Task 9 Step 4) and `hydrate.ts` (Task 10 Step 7) and `authClient` (`me.json().user.userId`, Task 5). Consistent.
- `ApiUser` has `id` — `/auth/*` responses (`pickUser`) return `id`. `AuthProvider.enter` takes an `ApiUser`; on the mount path it maps `PlayerProfile → ApiUser` via `{ id: p.userId, ... }`. Consistent.
- `apiFetch` option object is `{ method?, body?, idempotencyKey? }` everywhere (Tasks 7, 8, 13).
- Cookie names `dbl_at`/`dbl_rt`/`dbl_csrf` identical in backend `cookies.ts`, `security/http.ts`, `client.ts` regex, and every test.
- `IMPORT_DONE_KEY = 'dbl-import-done'` defined once (Task 13), referenced in its own tests only.

Fixes applied inline: none needed beyond what's written.
