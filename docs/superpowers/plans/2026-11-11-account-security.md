# Account Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email confirmation on sign-up, mandatory email-code 2-step on every password login, password recovery and an NIST password policy, on top of a reliable outbox → RabbitMQ → worker email pipeline.

**Architecture:** Auth flows stop issuing a session directly; they create an `auth_challenges` row + an `email_outbox` row in one transaction and return a `challengeId`. A relay publishes outbox rows to RabbitMQ; an `email-worker` process renders localized templates and sends via SMTP. The session (existing cookies) is issued only when the code is verified. Refresh is untouched.

**Tech Stack:** Fastify + Zod, PostgreSQL + Drizzle, `amqplib`, `nodemailer`, Mailpit (dev/CI SMTP), RabbitMQ 3 (management image), React + `@zxcvbn-ts/core` (strength bar only), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-account-security-design.md` (read it first — this plan argues from it).

## Global Constraints

- Backend ESM: relative imports end in `.js`. TypeScript strict, no new `any`.
- Every module keeps memory (`service.ts`/`memoryRepository.ts`) and PostgreSQL (`pgRepository.ts`) implementations with the **same observable behaviour**; `app.ts` picks by `DATABASE_URL`.
- Migrations are hand-written `backend/migrations/NNNN_*.sql`, mirrored in `backend/src/db/schema.ts`; `npm run backend:db:generate` must show no unexpected diff.
- Zod on every body/query/param. Errors: `throw new Error('<CODE>')` with the code registered in `backend/src/http/errors.ts` `DOMAIN_ERRORS`.
- Never log codes, tokens, passwords or SMTP credentials (dev Mailpit UI is the only place codes are visible).
- Codes: 6 digits, `crypto.randomInt`, stored as HMAC-SHA256 keyed by `AUTH_CODE_SECRET`; TTL **1800 s**; **5** attempts; resend cooldown **60 s**; resend cap **5 per hour per user**; per-address email cap **10 per hour**.
- Password: **12–128** chars; reject common (bundled list, case-insensitive), reject containing email local-part or username (case-insensitive), on reset reject the current password. No composition rules.
- Unverified accounts created after migration `0024` and older than **7 days** are deleted.
- Languages: `pt en es fr de ja`; default `en`.
- No enumeration: register / login (wrong password) / forgot / resend must not reveal whether an email exists.
- Don't touch refresh-token rotation, reuse detection or the cookie model.
- Gate per PR: `npx tsc --noEmit -p tsconfig.app.json`, `npm run backend:typecheck`, `npm run lint` (0 errors), `npm test`, `npm run build`, `npm run backend:db:migrate && npm run test:integration`, browser smoke on the Docker stack (recreate the frontend `node_modules` volume after dependency changes).

## Review Focus

1. **Email delivered after its code expired** (queue backlog) → worker sends the "code expired, request a new one" email instead of a dead code. Tests in Task 5 + Task 9.
2. **Double submit** of verify / resend (double click, two tabs) → a code is consumed exactly once; after a resend only the newest code works. Tests in Task 7 + Task 8.
3. **Email casing/whitespace differs** between register and login (`" User@X.com "`) → same account, code flow works. Test in Task 9.
4. **Existing player with a live session at deploy time** → `/auth/refresh` keeps working without a code; their ranking row stays. Test in Task 9.
5. **RabbitMQ down when someone registers** → register still returns `{ challengeId }`; the email goes out once RabbitMQ is back. Tests in Task 4 + Task 12 smoke.

---

## PR 1 — Email pipeline

### Task 1: Config, dependencies and Docker/CI services

**Files:**
- Modify: `package.json` (deps `amqplib`, `nodemailer`; devDeps `@types/amqplib`, `@types/nodemailer`; script `"backend:email-worker": "tsx backend/src/email/workerMain.ts"`)
- Modify: `backend/src/config/env.ts`, Test: `backend/src/config/env.test.ts`
- Modify: `compose.yaml`, `docker-compose.prod.yaml`, `.env.docker.example`, `.env.production.example`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `AppConfig.email = { rabbitmqUrl?: string; smtp: { host: string; port: number; secure: boolean; user?: string; password?: string }; from: string }` and `AppConfig.authCodes = { secret: Uint8Array; ttlSeconds: number; maxAttempts: number; resendCooldownSeconds: number }`.

- [ ] **Step 1: Failing tests in `env.test.ts`**
  - `defaults auth code settings` → `ttlSeconds === 1800`, `maxAttempts === 5`, `resendCooldownSeconds === 60`.
  - `rejects AUTH_CODE_SECRET shorter than 32 chars` → `loadConfig` throws.
  - `requires RABBITMQ_URL and SMTP_HOST in production` → throws when `NODE_ENV=production` and either is missing.
- [ ] **Step 2: Run** `npx vitest run backend/src/config/env.test.ts` → FAIL.
- [ ] **Step 3: Add the env vars** `RABBITMQ_URL, SMTP_HOST (default 'localhost'), SMTP_PORT (1025), SMTP_SECURE (false), SMTP_USER, SMTP_PASSWORD, EMAIL_FROM (default 'Deep Blue Lure <no-reply@localhost>'), AUTH_CODE_SECRET, AUTH_CODE_TTL_SECONDS, AUTH_CODE_MAX_ATTEMPTS, AUTH_CODE_RESEND_COOLDOWN_SECONDS` to the Zod schema and map them into `AppConfig`. `AUTH_CODE_SECRET` is required whenever `DATABASE_URL` is set (a fixed dev default only in memory mode/tests).
- [ ] **Step 4: Run** the env test → PASS.
- [ ] **Step 5: Docker/CI.** `compose.yaml`: add `rabbitmq` (`rabbitmq:3-management-alpine`, ports 5672/15672, healthcheck `rabbitmq-diagnostics -q ping`), `mailpit` (`axllent/mailpit`, ports 1025/8025), `email-worker` (same build as `backend`, `command: npm run backend:email-worker`, depends on postgres + rabbitmq healthy); `backend` gets `RABBITMQ_URL`/`SMTP_*` and depends on rabbitmq. Prod compose: `rabbitmq` with named volume `deep_blue_lure_prod_rabbitmq`, no host ports; `email-worker`. CI `integration` job: add `services.rabbitmq` and `services.mailpit` and their env. Pin image tags.
- [ ] **Step 6: Verify** `docker compose config -q` exits 0 for both compose files; `npm run backend:typecheck` passes.
- [ ] **Step 7: Commit** `build(email): add RabbitMQ, Mailpit and email config`.

### Task 2: Email outbox (migration + repository)

**Files:**
- Create: `backend/migrations/0023_email_outbox.sql`; Modify: `backend/src/db/schema.ts`, `backend/src/testing/pgHarness.ts` (truncate list)
- Create: `backend/src/email/types.ts`, `backend/src/email/outbox.ts` (memory), `backend/src/email/pgOutbox.ts`
- Test: `backend/src/email/outbox.test.ts`, `backend/src/email/pgOutbox.integration.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type EmailKind = 'verify_email_code' | 'login_code' | 'password_reset_code' | 'register_attempt_notice' | 'code_expired_notice'`
  - `type Locale = 'pt' | 'en' | 'es' | 'fr' | 'de' | 'ja'`
  - `type EmailMessage = { id: string; kind: EmailKind; to: string; locale: Locale; payload: Record<string, string>; challengeId?: string; createdAt: Date }`
  - `type OutboxStatus = 'pending' | 'published' | 'sent' | 'failed'`
  - `interface EmailOutbox { enqueue(msg: Omit<EmailMessage, 'id' | 'createdAt'>, tx?: unknown): Promise<string>; claimPending(limit: number): Promise<EmailMessage[]>; markPublished(ids: string[]): Promise<void>; markSent(id: string): Promise<void>; markFailed(id: string, reason: string): Promise<void>; status(id: string): Promise<OutboxStatus | null> }`
  - pg: `createPgOutbox(db: Database): EmailOutbox` — `enqueue` accepts a Drizzle transaction as `tx` so callers write it atomically with their own rows; `claimPending` uses `FOR UPDATE SKIP LOCKED`.
- Table `email_outbox(id uuid pk, kind varchar(40) check in the 5 kinds, recipient varchar(320), locale char(2), payload jsonb, challenge_id uuid null, status varchar(16) default 'pending' check, attempts int default 0, last_error text null, created_at, published_at, sent_at)`; index on `(status, created_at)`.

- [ ] **Step 1: Failing tests** (`outbox.test.ts` against memory; the integration test runs the same cases against pg):
  - `enqueue then claimPending returns it once` (after `markPublished`, `claimPending` returns `[]`).
  - `markSent / markFailed set status` (`status(id)` → `'sent'` / `'failed'`).
  - pg only: `enqueue inside a rolled-back transaction leaves no row`.
- [ ] **Step 2: Run** both → FAIL.
- [ ] **Step 3: Implement** migration, `schema.ts` mirror (checks + index), memory and pg outbox.
- [ ] **Step 4: Run** `npx vitest run backend/src/email` and the integration test → PASS; `npm run backend:db:generate` → no unexpected diff.
- [ ] **Step 5: Commit** `feat(email): add the transactional email outbox`.

### Task 3: Localized templates

**Files:**
- Create: `backend/src/email/templates.ts`; Test: `backend/src/email/templates.test.ts`

**Interfaces:**
- Produces: `renderEmail(kind: EmailKind, locale: Locale, payload: Record<string, string>): { subject: string; text: string; html: string }`. Payload keys: `code` (the three `*_code` kinds), `minutes` (TTL in minutes, string).

- [ ] **Step 1: Failing tests**
  - `every kind renders in every locale with non-empty subject/text/html` (loop 5 × 6).
  - `code kinds include the code and the validity in minutes` (`text` contains `'123456'` and `'30'`).
  - `html escapes payload values` (`code: '<b>'` → html contains `&lt;b&gt;`).
  - `register_attempt_notice and code_expired_notice contain no code`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** a `Record<EmailKind, Record<Locale, { subject; body }>>` with `{code}`/`{minutes}` placeholders, plain text + minimal inline-styled HTML. `code_expired_notice` copy: the code they asked for expired before it could be delivered; request a new one in the app.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(email): add localized email templates`.

### Task 4: Relay (outbox → RabbitMQ)

**Files:**
- Create: `backend/src/email/amqp.ts`, `backend/src/email/relay.ts`
- Modify: `backend/src/app.ts` (start the relay when `DATABASE_URL` and `RABBITMQ_URL` are set; stop it in `onClose`)
- Test: `backend/src/email/relay.test.ts`, `backend/src/email/relay.integration.test.ts`

**Interfaces:**
- Produces:
  - `interface EmailPublisher { publish(msg: EmailMessage): Promise<void>; close(): Promise<void> }`
  - `createAmqpPublisher(url: string): Promise<EmailPublisher>` — confirm channel, persistent messages, asserts the topology: exchange `email`, queue `email.send` with DLX `email.dlx` → `email.dead`, plus delayed-retry queue(s) (exact topology is the implementer's call).
  - `createOutboxRelay(deps: { outbox: EmailOutbox; connect: () => Promise<EmailPublisher>; intervalMs?: number /* 1000 */; batchSize?: number /* 50 */; log: FastifyBaseLogger }): { tick(): Promise<number>; start(): void; stop(): Promise<void> }` — `tick` returns how many rows it published; on connect/publish failure rows stay `pending` and a later tick reconnects.

- [ ] **Step 1: Failing unit tests** (fake publisher):
  - `tick publishes pending rows and marks them published`.
  - `tick leaves rows pending when publish throws, and publishes them on a later tick` (Review Focus 5).
- [ ] **Step 2: Failing integration test** (real RabbitMQ at `RABBITMQ_URL`): `a published message lands on email.send` (consume once, compare `id`).
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** `amqp.ts`, `relay.ts`; wire into `app.ts`.
- [ ] **Step 5: Run** unit + integration → PASS.
- [ ] **Step 6: Commit** `feat(email): relay outbox rows to RabbitMQ`.

### Task 5: Email worker (RabbitMQ → SMTP)

**Files:**
- Create: `backend/src/email/smtp.ts`, `backend/src/email/worker.ts`, `backend/src/email/workerMain.ts`
- Test: `backend/src/email/worker.test.ts`, `backend/src/email/worker.integration.test.ts`

**Interfaces:**
- Consumes: `EmailMessage`, `EmailOutbox`, `renderEmail`, the Task 4 topology.
- Produces:
  - `interface EmailSender { send(mail: { to: string; subject: string; text: string; html: string }): Promise<void> }`; `createSmtpSender(cfg: AppConfig['email']): EmailSender` (nodemailer).
  - `createEmailWorker(deps: { sender: EmailSender; outbox: EmailOutbox; isCodeStillValid: (msg: EmailMessage) => Promise<boolean>; ttlMinutes: number; maxDeliveries?: number /* 5 */ }): { handle(msg: EmailMessage, deliveryCount: number): Promise<'sent' | 'retry' | 'dead'> }` — `workerMain.ts` binds it to the AMQP consumer (ack on `sent`/`dead`, delayed retry on `retry`) and to `markSent`/`markFailed`.
  - In PR 1, `isCodeStillValid` is `async () => true`; Task 9 replaces it.

- [ ] **Step 1: Failing unit tests** (fake sender/outbox):
  - `sends the rendered email and marks the row sent`.
  - `an already-sent row is not sent twice` (`status(id) === 'sent'` → `'sent'` without calling `sender.send`).
  - `sender failure returns 'retry' until maxDeliveries, then 'dead' and markFailed` (the stored reason has no SMTP credentials).
  - `expired code → sends code_expired_notice instead` (`isCodeStillValid` → false; the sent text has no code) — Review Focus 1.
- [ ] **Step 2: Failing integration test**: publish a `login_code` message → worker → Mailpit API `GET /api/v1/messages` lists one message to the recipient containing the code.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** `smtp.ts`, `worker.ts`, `workerMain.ts` (loads config, connects, consumes with prefetch 10, graceful SIGTERM).
- [ ] **Step 5: Run** → PASS. Then `docker compose up -d --build`, push a row through via the integration test, confirm it appears at http://localhost:8025.
- [ ] **Step 6: Commit** `feat(email): add the email worker`. **Open PR 1** after the full gate.

---

## PR 2 — Email confirmation, 2-step login, password policy

### Task 6: Shared password policy

**Files:**
- Create: `src/game/passwordPolicy.ts`, `src/game/data/commonPasswords.ts` (≈10k most-common passwords from a public list, lowercased, exported as `Set<string>`)
- Test: `src/test/passwordPolicy.test.ts`

**Interfaces:**
- Produces:
  - `type PasswordIssue = 'TOO_SHORT' | 'TOO_LONG' | 'TOO_COMMON' | 'CONTAINS_PERSONAL_INFO' | 'SAME_AS_CURRENT'`
  - `checkPassword(password: string, ctx: { email?: string; username?: string }): PasswordIssue | null` (synchronous; `SAME_AS_CURRENT` is checked by the server against the hash)
  - `PASSWORD_MIN = 12`, `PASSWORD_MAX = 128`

- [ ] **Step 1: Failing tests**: `'short'` → `TOO_SHORT`; 129 chars → `TOO_LONG`; `'Password1234'` → `TOO_COMMON`; username `'MyAngler'` + password `'xx-myangler-2026'` → `CONTAINS_PERSONAL_INFO`; email `'joao.silva@x.pt'` + password `'JOAO.SILVA-2026!'` → `CONTAINS_PERSONAL_INFO`; `'correct horse battery staple'` → `null`; a local-part shorter than 3 chars is ignored (email `'ab@x.pt'`, password `'abacate-azul-grande'` → `null`).
- [ ] **Step 2: Run** `npx vitest run src/test/passwordPolicy.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(auth): add the shared NIST password policy`.

### Task 7: Verification + challenge storage

**Files:**
- Create: `backend/migrations/0024_email_verification_challenges.sql`; Modify: `backend/src/db/schema.ts`, `pgHarness.ts`
- Modify: `backend/src/auth/types.ts`, `memoryRepository.ts`, `pgRepository.ts`
- Test: `backend/src/auth/pgRepository.integration.test.ts` (extend); memory behaviour is covered through Tasks 8–9

**Interfaces:**
- Migration: `users.email_verified_at timestamptz null`, `users.locale char(2) not null default 'en'`, `users.verification_required_since timestamptz null` (set only for accounts created after this migration — drives the 7-day cleanup and leaves legacy accounts alone); table `auth_challenges(id uuid pk, user_id uuid fk users on delete cascade, purpose varchar(20) check in ('verify_email','login','password_reset'), code_hash text, expires_at, attempts int default 0, consumed_at null, invalidated_at null, created_at)`; index `(user_id, purpose, created_at desc)`.
- `AuthUser` gains `emailVerifiedAt: Date | null`, `locale: Locale`.
- `type ChallengePurpose = 'verify_email' | 'login' | 'password_reset'`; `type AuthChallenge = { id; userId; purpose; codeHash; expiresAt: Date; attempts: number; consumedAt: Date | null; invalidatedAt: Date | null; createdAt: Date }`.
- `AuthRepository` changes/additions:
  - `createUser(input & { locale: Locale })` (sets `verification_required_since = now()`)
  - `createChallenge(input: { userId: string; purpose: ChallengePurpose; codeHash: string; expiresAt: Date; email: Omit<EmailMessage, 'id' | 'createdAt' | 'challengeId'> }): Promise<string>` — one transaction: invalidates the user's live challenges of the same purpose, inserts the challenge, enqueues the outbox row with its `challengeId`.
  - `findChallenge(id: string): Promise<AuthChallenge | null>`
  - `recordFailedAttempt(id: string): Promise<number>` (new attempt count)
  - `consumeChallenge(id: string): Promise<boolean>` (atomic `UPDATE … WHERE consumed_at IS NULL AND invalidated_at IS NULL` → true only for the first caller)
  - `countChallengesSince(userId: string, since: Date): Promise<number>`
  - `markEmailVerified(userId: string): Promise<void>`, `setLocale(userId: string, locale: Locale): Promise<void>`
  - `revokeAllSessions(userId: string): Promise<void>`
  - `deleteStaleUnverified(olderThan: Date): Promise<number>`
  - `enqueueEmail(msg: Omit<EmailMessage, 'id' | 'createdAt'>): Promise<void>` (notices without a challenge)
- The memory repository takes the memory `EmailOutbox` in its factory so tests can read enqueued emails.

- [ ] **Step 1: Failing integration tests** (pg): `createChallenge invalidates the previous live challenge of the same purpose`; `a failure inside createChallenge leaves neither challenge nor outbox row`; `consumeChallenge is true exactly once under two concurrent calls` (Review Focus 2); `deleteStaleUnverified removes only unverified users whose verification_required_since is older than the cutoff` (legacy row with null survives; verified row survives).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** migration, schema mirror, both repositories.
- [ ] **Step 4: Run** → PASS; `backend:db:generate` clean.
- [ ] **Step 5: Commit** `feat(auth): store email verification state and code challenges`.

### Task 8: Challenge service

**Files:**
- Create: `backend/src/auth/challenges.ts`; Test: `backend/src/auth/challenges.test.ts`

**Interfaces:**
- Consumes: Task 7 repository, `EmailKind`, `AppConfig.authCodes`.
- Produces: `createChallengeService(repo: AuthRepository, cfg: AppConfig['authCodes'], now?: () => Date)` returning:
  - `issue(user: AuthUser, purpose: ChallengePurpose): Promise<string>` — enforces the hourly cap; email kind from purpose; payload `{ code, minutes: String(cfg.ttlSeconds / 60) }`.
  - `issueDecoy(): string` — random uuid never stored (enumeration-safe responses).
  - `verify(challengeId: string, code: string, purposes: ChallengePurpose[]): Promise<AuthUser>` — throws `CHALLENGE_NOT_FOUND` (unknown / decoy / purpose not allowed / invalidated / lost consume race), `CHALLENGE_EXPIRED`, `TOO_MANY_ATTEMPTS`, `INVALID_CODE`; constant-time compare; consumes on success.
  - `resend(challengeId: string): Promise<string>` — `RESEND_TOO_SOON` inside the cooldown or over the hourly cap; unknown/decoy ids return a fresh decoy.
  - `isStillValid(challengeId: string): Promise<boolean>` (for the worker).

- [ ] **Step 1: Failing tests** (memory repo, injected clock): right code → user, second use → `CHALLENGE_NOT_FOUND`; 5 wrong codes → the 5th throws `TOO_MANY_ATTEMPTS` and the right code then fails too; at +1800 s → `CHALLENGE_EXPIRED`; resend at +30 s → `RESEND_TOO_SOON`, at +61 s → new id and the old code no longer verifies (Review Focus 2); 6th issue within an hour → `RESEND_TOO_SOON`; decoy → verify `CHALLENGE_NOT_FOUND`, resend returns a uuid; enqueued payload has the code and `minutes: '30'`; stored hash ≠ code; **per-address cap**: once 10 emails went to the same address within an hour (any kind, notices included — count via the outbox), `issue` throws `RESEND_TOO_SOON` and the register-notice path silently skips enqueueing (the HTTP response shape is unchanged).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(auth): add the email code challenge service`.

### Task 9: Auth flows, routes, ranking filter, worker validity

**Files:**
- Modify: `backend/src/auth/service.ts`, `schemas.ts`, `routes.ts`, `backend/src/http/errors.ts`, `backend/src/security/http.ts` (auth rate-limit bucket covers the new paths), `backend/src/app.ts`, `backend/src/email/workerMain.ts` (`isCodeStillValid` → `challenges.isStillValid`)
- Modify: `backend/src/leaderboard/pgRepository.ts` (`leftJoin` → `innerJoin` on `playerGameState`), `backend/src/leaderboard/service.ts` (memory: skip users without game state)
- Test: `backend/src/auth/service.test.ts`, `routes.test.ts`, `backend/src/app.test.ts`, leaderboard tests, `pgRepository.integration.test.ts`

**Interfaces:**
- Routes (all `POST`, Zod bodies; `locale` optional, one of the 6, default `'en'`):
  - `/api/v1/auth/register { email, password, username, country, locale? }` → `202 { challengeId }`, no cookies. `checkPassword` → `WEAK_PASSWORD`. Existing email → enqueue `register_attempt_notice` to that address and respond with `issueDecoy()`. Username taken → current explicit error.
  - `/api/v1/auth/verify-email { challengeId, code }` → `200 { user }` + session cookies; marks verified.
  - `/api/v1/auth/login { email, password, locale? }` → `202 { challengeId }`; wrong password/unknown → `INVALID_CREDENTIALS` as today; verified → `login` challenge; unverified → `verify_email` challenge. Updates `users.locale`.
  - `/api/v1/auth/login/verify { challengeId, code }` → `200 { user }` + cookies; accepts purposes `['login', 'verify_email']`, marking verified for the latter.
  - `/api/v1/auth/challenges/resend { challengeId }` → `202 { challengeId }`.
- `DOMAIN_ERRORS` adds `INVALID_CODE 400`, `CHALLENGE_EXPIRED 410`, `TOO_MANY_ATTEMPTS 429`, `CHALLENGE_NOT_FOUND 404`, `RESEND_TOO_SOON 429`, `WEAK_PASSWORD 400`; `WEAK_PASSWORD` responses carry `error.reason: PasswordIssue` (via an `AppError` subclass or a handler extension — implementer's call). Register no longer throws `ACCOUNT_ALREADY_EXISTS`.

- [ ] **Step 1: Failing tests** (memory app via `app.inject`, codes read from the memory outbox):
  - `register returns 202 { challengeId } and sets no cookies`; `verify-email with the emailed code sets cookies and /me works`.
  - `register with an existing email responds identically (status and body shape) and enqueues register_attempt_notice`.
  - `register with 'Password1234' → 400 WEAK_PASSWORD reason TOO_COMMON`.
  - `login → 202, login/verify → cookies`; `login with ' User@X.COM ' after registering 'user@x.com' works` (Review Focus 3).
  - `an unverified user logging in gets a verify_email challenge; verifying marks the account verified`.
  - `refresh still works for a session created before verification existed` (seed `emailVerifiedAt: null` user + session; `/auth/refresh` → 204) — Review Focus 4.
  - `an unverified user without game state never appears in GET /api/v1/leaderboard`; a legacy unverified user **with** game state still appears.
  - `worker with challenges.isStillValid: an expired challenge → code_expired_notice` (Review Focus 1).
- [ ] **Step 2: Run** `npm test` → FAIL (existing register/login tests that expect immediate sessions must be updated to the new flow).
- [ ] **Step 3: Implement** service, routes, errors, rate limit, leaderboard, worker wiring.
- [ ] **Step 4: Run** `npm test` and `npm run test:integration` → PASS.
- [ ] **Step 5: Commit** `feat(auth): require email confirmation and a 2-step code on login`.

### Task 10: Frontend — code step and password feedback

**Files:**
- Modify: `src/api/endpoints.ts` (+ `endpoints.test.ts`), `src/game/auth/AuthProvider.tsx` (+ test), `src/components/game/menu/AccountModal.tsx`, `src/game/i18n.tsx`, `package.json` (`@zxcvbn-ts/core`, `@zxcvbn-ts/language-common`)
- Create: `src/components/game/menu/CodeStep.tsx`, `src/components/game/menu/PasswordStrength.tsx`

**Interfaces:**
- `endpoints`: `register(input & { locale }) → { challengeId }`, `verifyEmail({ challengeId, code }) → { user }`, `login({ email, password, locale }) → { challengeId }`, `verifyLogin({ challengeId, code }) → { user }`, `resendCode({ challengeId }) → { challengeId }`.
- `AuthContextValue`: `register(...): Promise<{ challengeId: string }>`, `login(...): Promise<{ challengeId: string }>`, `completeChallenge(kind: 'register' | 'login', challengeId: string, code: string): Promise<void>` (sets user, status `authenticated`, runs `onAuthenticated`), `resendCode(challengeId: string): Promise<string>`.
- `CodeStep` props `{ challengeId: string; kind: 'register' | 'login'; onDone(): void; onBack(): void }` — 6-digit numeric input, resend disabled with a 60 s countdown, maps `INVALID_CODE` / `CHALLENGE_EXPIRED` / `TOO_MANY_ATTEMPTS` / `RESEND_TOO_SOON` to i18n messages.
- `PasswordStrength` props `{ password: string; email: string; username?: string }` — shows the first `checkPassword` issue as text plus a zxcvbn-ts score bar (visual only).

- [ ] **Step 1: Failing tests**: `AuthProvider` — `register` resolves `{ challengeId }` and status stays `anonymous`; `completeChallenge` makes it `authenticated`. `endpoints.test.ts` — new paths and bodies, `locale` taken from the current UI language.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (every new string in the 6 languages). **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Browser smoke** (Docker): register → code from Mailpit → plays; logout → login → code → in; weak password shows the reason and blocks submit; resend countdown; an account created before this PR logs in with one code and keeps its ranking row.
- [ ] **Step 6: Commit** `feat(auth): add the code step and password feedback to the account modal`. **Open PR 2** after the full gate.

---

## PR 3 — Password recovery and cleanup

### Task 11: Password recovery

**Files:**
- Modify: `backend/src/auth/service.ts`, `schemas.ts`, `routes.ts`; `src/api/endpoints.ts`, `AuthProvider.tsx`, `AccountModal.tsx`, `i18n.tsx`; Create: `src/components/game/menu/ForgotPassword.tsx`
- Test: `service.test.ts`, `routes.test.ts`, frontend tests

**Interfaces:**
- `POST /api/v1/auth/password/forgot { email, locale? }` → always `202 { challengeId }` (decoy when unknown).
- `POST /api/v1/auth/password/reset { challengeId, code, newPassword }` → `204`; `checkPassword` with the user's email/username; `verifyPassword(newPassword, currentHash)` true → `WEAK_PASSWORD` reason `SAME_AS_CURRENT`; on success `updatePasswordHash`, `markEmailVerified`, `revokeAllSessions`; no cookies issued.
- `endpoints.forgotPassword`, `endpoints.resetPassword`; `AuthContextValue.forgotPassword(email): Promise<{ challengeId: string }>`, `resetPassword(challengeId, code, newPassword): Promise<void>`.

- [ ] **Step 1: Failing tests**: unknown email → same 202 shape and no outbox row; known → `password_reset_code` enqueued; reset with the right code → old password fails login, new one passes; existing sessions → `/auth/refresh` 401; same password → `WEAK_PASSWORD SAME_AS_CURRENT`; reset marks an unverified account verified (the "someone took my email" path).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** backend + `ForgotPassword` (email → code + new password with `PasswordStrength`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(auth): add password recovery by email code`.

### Task 12: Stale unverified cleanup, docs, smoke

**Files:**
- Create: `backend/src/auth/cleanup.ts`; Modify: `backend/src/email/workerMain.ts` (runs the cleanup hourly — it is the long-lived background process)
- Modify: `.env.docker.example`, `.env.production.example`, `docs/deploy/production.md`, `CLAUDE.md` (commands: `backend:email-worker`, Mailpit at :8025), `PROJECT_MEMORY.md` (append a section)
- Test: `backend/src/auth/cleanup.test.ts`

**Interfaces:**
- `runUnverifiedCleanup(repo: AuthRepository, now: Date): Promise<number>` → `repo.deleteStaleUnverified(now − 7 days)`.

- [ ] **Step 1: Failing test**: unverified, created 8 days ago → deleted; 6 days → kept; legacy (null `verification_required_since`) → kept; verified → kept.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** + hourly schedule. **Step 4: Run** → PASS.
- [ ] **Step 5: Docs** as listed (no secrets in examples).
- [ ] **Step 6: Full gate + browser smoke**: forgot-password flow end to end via Mailpit; `docker compose stop rabbitmq`, register, `docker compose start rabbitmq` → the code email arrives (Review Focus 5 live).
- [ ] **Step 7: Commit** `feat(auth): clean up never-confirmed accounts; docs`. **Open PR 3.**
