# Server-side Game-State Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The account remembers game progress across logout/login and across devices — the frontend loads the player's saved `PlayerState` from the server on login and pushes it back continuously while playing.

**Architecture:** A new `player_game_state` table holds one `jsonb` row per user: the exact save envelope `{ schemaVersion, player }` that `serializePlayerState` already produces. `GET /api/v1/me/state` returns it (or `null`); `PUT /api/v1/me/state` upserts it (last-write-wins, CSRF-protected, Zod-validated with the client's own `saveSchema`). The frontend's `hydrateFromServer` stops merging `/me` and instead loads the blob and **replaces** local state; `afterAuth` auto-adopts the local save on a first login with no server state (no import dialog); a `useGameStateSync` hook pushes the envelope on a 4s debounce, on `pagehide`, and on logout (via a new `AuthProvider` `onBeforeLogout` hook).

**Tech Stack:** Fastify 5 + Drizzle + hand-written SQL migrations; Zod (shared `src/game/persistence.ts` `saveSchema`); React 18 + `useGameState`; Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-server-game-state-sync-design.md`

## Global Constraints

- **TypeScript strict everywhere. No new `any`.**
- **Backend ESM:** relative imports carry a `.js` suffix even for `.ts` files (`./service.js`). `moduleResolution: NodeNext`.
- **Zod validation** for every body/query/param on the backend. The `PUT /me/state` body is validated against the client's `saveSchema` (envelope `{ schemaVersion: 1, player: PlayerState }`), reused or key-parity-tested.
- **Backend errors:** `throw new Error('<SNAKE_CASE_CODE>')` for mapped codes, or `AppError`. Body shape always `{ error: { code, message } }`. No new codes needed (invalid body → `VALIDATION_ERROR`, already handled).
- **Migrations:** hand-written `backend/migrations/NNNN_name.sql` are the source of truth; mirror in `backend/src/db/schema.ts` (imports, `schema` export object). Run `npm run backend:db:generate` to confirm no unexpected drift. The runner records each applied version in `schema_migrations`.
- **CSRF:** `PUT /api/v1/me/state` is a mutation under `/api/v1/` and is NOT in the exempt list — it requires `X-CSRF-Token`.
- **Route auth:** `GET` and `PUT /me/state` both use `preHandler: app.requireAuth`; everything is scoped to `request.userId` (no user id in params).
- **Frontend:** `@/` alias, no `.js` suffix. API base is the literal `/api/v1`.
- **Commit** at the end of every task. Branch: `feature/task-10-1-auth-foundation` (current). Only push / open a PR when the user asks.
- **Verification per task:** `npm run backend:typecheck`, `npx tsc --noEmit -p tsconfig.app.json`, `npm test`, `npm run lint` (0 errors) must pass before the commit step. Integration tests where the task touches them.

## Scope note (spec deviation)

This plan pulls the core of **Task 10.2** (server as source of truth for game state)
into the 10.1 branch. `src/game/auth/importFlow.ts`, `src/components/game/menu/ImportSaveDialog.tsx`,
and `POST /api/v1/migration/local/{preview,import}` become **unused in the logged-in
flow** — files stay, wiring is removed from `Index.tsx`. `hydrateFromServer` stops
using `GET /me` (the `player_progress` columns) for progress; `/me` still serves the
account chip (`username`, `country`) and stays as-is.

---

## File Structure

**Backend — create:**
- `backend/migrations/0015_player_game_state.sql` — the table.
- `backend/src/gamestate/routes.ts` — `GET`/`PUT /api/v1/me/state`, thin.
- `backend/src/gamestate/memoryService.ts` — in-memory store (dev/test without `DATABASE_URL`).
- `backend/src/gamestate/pgRepository.ts` — transactional upsert against Postgres.
- `backend/src/gamestate/routes.test.ts` — memory-path route tests (runs under `npm test`).
- `backend/src/gamestate/pgRepository.integration.test.ts` — real-Postgres upsert / cascade.

**Backend — modify:**
- `backend/src/db/schema.ts` — add `jsonb` import, `playerGameState` table, add to `schema` export.
- `backend/src/app.ts` — wire the new routes (memory vs pg by `DATABASE_URL`).

**Shared — modify:**
- `src/game/persistence.ts` — `export` the `saveSchema` const (currently module-private).

**Frontend — create:**
- `src/game/auth/gameStateSync.ts` — `useGameStateSync({ player, enabled })` hook.
- `src/game/auth/gameStateSync.test.ts` — debounce / pagehide / flushNow / disabled.

**Frontend — modify:**
- `src/api/types.ts` — `GameStateEnvelope`.
- `src/api/endpoints.ts` — `getGameState`, `putGameState`.
- `src/api/endpoints.test.ts` — the two new wrappers.
- `src/game/auth/hydrate.ts` — rewrite: load blob → replace; return `'loaded' | 'empty' | 'error'`.
- `src/game/auth/hydrate.test.ts` — rewrite for the new contract.
- `src/game/auth/AuthProvider.tsx` — add `onBeforeLogout?`, awaited before `endpoints.logout()`.
- `src/game/auth/AuthProvider.test.tsx` — `onBeforeLogout` ordering + not-on-session-expiry.
- `src/pages/Index.tsx` — rewrite `afterAuth`, mount `useGameStateSync`, wire `onBeforeLogout`, remove `ImportSaveDialog` / `maybeOfferImport` / `confirmImport` / `importPreview`.
- `PROJECT_MEMORY.md` — record the feature + the deprecation of the import flow.

---

## Task 1: Export `saveSchema` from the shared persistence module

**Files:**
- Modify: `src/game/persistence.ts:68` (add `export` to the `saveSchema` const)

**Interfaces:**
- Produces: `export const saveSchema` — `z.object({ schemaVersion: z.literal(1), player: playerSchema })`, cast `as z.ZodType<SaveEnvelope>` is fine to keep if present. Consumed by the backend (Task 3) and `hydrate.ts` (Task 6).

- [ ] **Step 1: Add the export**

In `src/game/persistence.ts`, change `const saveSchema = z.object({` (line ~68) to `export const saveSchema = z.object({`. Nothing else changes — `parseSavedState` / `serializePlayerState` still use it internally.

- [ ] **Step 2: Typecheck both projects**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run backend:typecheck`
Expected: clean. (No consumer yet; this is just widening visibility.)

- [ ] **Step 3: Commit**

```bash
git add src/game/persistence.ts
git commit -m "persistence: export saveSchema for reuse (backend game-state validation)"
```

---

## Task 2: `player_game_state` table + schema mirror

**Files:**
- Create: `backend/migrations/0015_player_game_state.sql`
- Modify: `backend/src/db/schema.ts:1-18` (add `jsonb` to the `drizzle-orm/pg-core` import), `:119` area (add the table after `playerProgress`), `:204` (`schema` export object)

**Interfaces:**
- Produces: table `player_game_state (user_id uuid PK → users(id) ON DELETE CASCADE, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`; Drizzle `playerGameState`.

- [ ] **Step 1: Write the migration**

`backend/migrations/0015_player_game_state.sql`:

```sql
CREATE TABLE IF NOT EXISTS player_game_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Mirror in `backend/src/db/schema.ts`**

- Add `jsonb` to the named import from `drizzle-orm/pg-core` (alphabetical: after `integer`, before `numeric`).
- After the `playerProgress` table block (ends ~line 140), add:

```ts
export const playerGameState = pgTable('player_game_state', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- Add `playerGameState,` to the `schema` export object (line ~204), after `playerProgress`.

- [ ] **Step 3: Typecheck + drift check**

Run: `npm run backend:typecheck`
Expected: clean.
Run (needs a Postgres): `npm run backend:db:generate`
Expected: the generated output in `backend/migrations/generated/` shows the new table only, no unexpected drops/changes. If no Postgres is available, note it — the mirror is mechanical and the SQL is the source of truth.

- [ ] **Step 4: Apply the migration (with a Postgres)**

Run: `npm run backend:db:migrate`
Expected: `Applied 1 migration(s): 0015_player_game_state`. If no Postgres, note it — Task 4's integration test and CI apply it.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/0015_player_game_state.sql backend/src/db/schema.ts
git commit -m "backend: player_game_state table (jsonb blob, one row per user)"
```

---

## Task 3: `gamestate` module — routes, memory service, pg repository, wiring

**Files:**
- Create: `backend/src/gamestate/routes.ts`, `backend/src/gamestate/memoryService.ts`, `backend/src/gamestate/pgRepository.ts`
- Create: `backend/src/gamestate/routes.test.ts`
- Modify: `backend/src/app.ts` (imports near line 34-36; wiring near line 107 + 113; swagger tag list near line 69)

**Interfaces:**
- Consumes: `saveSchema` from `src/game/persistence` (Task 1); `app.requireAuth`; `Database` from `../db/client.js`.
- Produces:
  ```ts
  // both services implement:
  type GameStateService = {
    get(userId: string): Promise<{ state: unknown; updatedAt: string } | null>;
    put(userId: string, state: unknown): Promise<void>;
  };
  export function createMemoryGameStateService(): GameStateService;
  export function createPgGameStateService(db: Database): GameStateService;
  export function registerGameStateRoutes(app: FastifyInstance, service: GameStateService): void;
  ```
  - `GET /api/v1/me/state` → `200 { state: <object> | null, updatedAt: <iso string> | null }`
  - `PUT /api/v1/me/state` → `204`; body `{ state: <saveSchema> }`; invalid → `400 VALIDATION_ERROR`; no cookie → `401`; no `X-CSRF-Token` → `403`.

- [ ] **Step 1: Write the failing route test**

`backend/src/gamestate/routes.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { registerAndAuth } from '../testing/authClient.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, trustProxy: false, cookieSecure: false,
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });
async function app() { const a = await createApp({ config }); apps.add(a); return a; }

const envelope = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  player: {
    level: 5, xp: 40, xpToNextLevel: 500, totalFishCaught: 12,
    collection: [], unlockedLocations: ['atlantic', 'amazon'], heaviestFish: null, warehouse: [],
    coins: 300, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
    ...over,
  },
});

describe('me/state', () => {
  it('GET returns { state: null } when nothing is saved', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    const res = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ state: null, updatedAt: null });
  });

  it('PUT then GET round-trips the exact envelope', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    const body = envelope({ level: 9, coins: 1234 });
    const put = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: body } });
    expect(put.statusCode).toBe(204);
    const get = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(get.json().state).toEqual(body);
    expect(typeof get.json().updatedAt).toBe('string');
  });

  it('PUT with an invalid player shape is 400 VALIDATION_ERROR', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    const res = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: { schemaVersion: 1, player: { level: 0 } } } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('GET without a session is 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/v1/me/state' });
    expect(res.statusCode).toBe(401);
  });

  it('PUT without X-CSRF-Token is 403', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'g@example.com', password: 'a-very-strong-password', username: 'gs_user', country: 'br' } });
    const setCookie = ([] as string[]).concat(reg.headers['set-cookie'] as string[]);
    const jar: Record<string, string> = {};
    for (const c of setCookie) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); }
    const res = await a.inject({ method: 'PUT', url: '/api/v1/me/state', cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf }, payload: { state: envelope() } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run backend/src/gamestate/routes.test.ts`
Expected: FAIL — routes not registered (404s).

- [ ] **Step 3: Implement `backend/src/gamestate/memoryService.ts`**

```ts
type Entry = { state: unknown; updatedAt: string };

export function createMemoryGameStateService() {
  const store = new Map<string, Entry>();
  return {
    async get(userId: string): Promise<Entry | null> {
      return store.get(userId) ?? null;
    },
    async put(userId: string, state: unknown): Promise<void> {
      store.set(userId, { state, updatedAt: new Date().toISOString() });
    },
  };
}
```

- [ ] **Step 4: Implement `backend/src/gamestate/pgRepository.ts`**

```ts
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerGameState } from '../db/schema.js';

export function createPgGameStateService(db: Database) {
  return {
    async get(userId: string): Promise<{ state: unknown; updatedAt: string } | null> {
      const rows = await db.select().from(playerGameState).where(eq(playerGameState.userId, userId)).limit(1);
      const row = rows[0];
      return row ? { state: row.state, updatedAt: row.updatedAt.toISOString() } : null;
    },
    async put(userId: string, state: unknown): Promise<void> {
      await db.insert(playerGameState)
        .values({ userId, state, updatedAt: new Date() })
        .onConflictDoUpdate({ target: playerGameState.userId, set: { state, updatedAt: new Date() } });
    },
  };
}
```

(If `db.insert(...).onConflictDoUpdate` types reject `state: unknown`, cast the value object `as typeof playerGameState.$inferInsert` or type `state` as `Record<string, unknown>` at the boundary — Drizzle's `jsonb` column infers `unknown`.)

- [ ] **Step 5: Implement `backend/src/gamestate/routes.ts`**

```ts
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { saveSchema } from '../../../src/game/persistence.js';
import type { createMemoryGameStateService } from './memoryService.js';
import type { createPgGameStateService } from './pgRepository.js';

type GameStateService =
  | ReturnType<typeof createMemoryGameStateService>
  | ReturnType<typeof createPgGameStateService>;

const putBody = z.object({ state: saveSchema });
const STATE_BODY_LIMIT = 2 * 1024 * 1024;

export function registerGameStateRoutes(app: FastifyInstance, service: GameStateService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/me/state', {
    schema: { tags: ['gamestate'], summary: "The account's saved game state" },
    preHandler: app.requireAuth,
  }, async request => {
    const entry = await service.get(request.userId);
    return { state: entry?.state ?? null, updatedAt: entry?.updatedAt ?? null };
  });

  r.put('/api/v1/me/state', {
    schema: { tags: ['gamestate'], summary: 'Replace the account game state (last write wins)', body: putBody },
    bodyLimit: STATE_BODY_LIMIT,
    preHandler: app.requireAuth,
  }, async (request, reply) => {
    await service.put(request.userId, request.body.state);
    return reply.status(204).send();
  });
}
```

Notes:
- The import path `'../../../src/game/persistence.js'` — verify the relative depth from `backend/src/gamestate/` to `src/game/persistence.ts` (it is `../../../src/game/persistence.js`). Check how `backend/src/fishing/` or another module imports `src/game/*` and match that style exactly (some use a `tsconfig` path alias — if so, use it). If the import pulls a browser-only transitive dep and breaks `backend:typecheck`, fall back: create `backend/src/gamestate/schema.ts` that re-declares the envelope schema, plus `backend/src/gamestate/schema.test.ts` asserting its `player` keys match `Object.keys` of a fresh `PlayerState` from `src/game/types` (import the `defaultState`/type only).
- `per-route bodyLimit` is supported by Fastify 5 (`migration/routes.ts` already uses it).

- [ ] **Step 6: Wire into `backend/src/app.ts`**

- Imports (near line 34-36):
  ```ts
  import { registerGameStateRoutes } from './gamestate/routes.js';
  import { createMemoryGameStateService } from './gamestate/memoryService.js';
  import { createPgGameStateService } from './gamestate/pgRepository.js';
  ```
- Swagger tags (line ~69): add `{ name: 'gamestate' }`.
- Wiring (after the `rewardsService` line ~107, and register near line ~113):
  ```ts
  const gameStateService = database ? createPgGameStateService(database) : createMemoryGameStateService();
  ```
  ```ts
  registerGameStateRoutes(app, gameStateService);
  ```

- [ ] **Step 7: Run the route test, verify it passes**

Run: `npx vitest run backend/src/gamestate/routes.test.ts`
Expected: PASS (5).

- [ ] **Step 8: Full backend + typecheck**

Run: `npm run backend:typecheck && npx vitest run backend/`
Expected: all green (no behavior change to other suites).

- [ ] **Step 9: Commit**

```bash
git add backend/src/gamestate/ backend/src/app.ts
git commit -m "backend: GET/PUT /api/v1/me/state (jsonb game-state blob, CSRF-protected, saveSchema-validated)"
```

---

## Task 4: `gamestate` integration test (real Postgres)

**Files:**
- Create: `backend/src/gamestate/pgRepository.integration.test.ts`

**Interfaces:**
- Consumes: `createPgGameStateService` (Task 3), the pg test harness (`backend/src/testing/pgHarness.ts`).

- [ ] **Step 1: Write the integration test**

Follow the shape of `backend/src/rewards/pgRepository.integration.test.ts` (same harness import, `beforeAll`/`afterEach` truncate). Cover:
- `get` on an unknown user → `null`.
- `put` then `get` → the exact `state` object back; `updatedAt` is an ISO string.
- second `put` with a different state → `get` reflects it; `updatedAt` is strictly later.
- deleting the user row (via the harness / a direct `db.delete(users)`) cascades — `get` → `null` (or the row is gone; assert no error).

Create a user first with the harness's user helper (see how the rewards integration test makes a `userId`).

- [ ] **Step 2: Run it (needs Postgres)**

Run: `npm run backend:db:migrate && npm run test:integration -- backend/src/gamestate/pgRepository.integration.test.ts`
Expected: PASS. If no Postgres in this environment, note it — CI's `integration` job runs it.

- [ ] **Step 3: Commit**

```bash
git add backend/src/gamestate/pgRepository.integration.test.ts
git commit -m "backend: integration test for player_game_state (upsert, updatedAt, cascade)"
```

---

## Task 5: Frontend endpoints — `getGameState` / `putGameState`

**Files:**
- Modify: `src/api/types.ts`, `src/api/endpoints.ts`, `src/api/endpoints.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (existing).
- Produces:
  ```ts
  // types.ts
  export interface GameStateEnvelope { state: unknown; updatedAt: string | null; }
  // endpoints.ts
  export function getGameState(): Promise<GameStateEnvelope>;
  export function putGameState(state: unknown): Promise<void>;
  ```

- [ ] **Step 1: Add the type**

`src/api/types.ts`: append `export interface GameStateEnvelope { state: unknown; updatedAt: string | null; }`.

- [ ] **Step 2: Write the failing test**

In `src/api/endpoints.test.ts`, add:

```ts
it('getGameState GETs /me/state', async () => {
  const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ state: null, updatedAt: null } as never);
  await getGameState();
  expect(spy).toHaveBeenCalledWith('/me/state');
  spy.mockRestore();
});

it('putGameState PUTs /me/state with { state }', async () => {
  const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue(undefined as never);
  await putGameState({ schemaVersion: 1, player: { level: 3 } });
  expect(spy).toHaveBeenCalledWith('/me/state', { method: 'PUT', body: { state: { schemaVersion: 1, player: { level: 3 } } } });
  spy.mockRestore();
});
```

Add `getGameState, putGameState` to the file's import from `./endpoints`.

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run src/api/endpoints.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 4: Implement**

`src/api/endpoints.ts`:

```ts
import type { ApiUser, PlayerProfile, MigrationPreview, MigrationResult, GameStateEnvelope } from './types';

export function getGameState(): Promise<GameStateEnvelope> {
  return apiFetch('/me/state');
}
export function putGameState(state: unknown): Promise<void> {
  return apiFetch('/me/state', { method: 'PUT', body: { state } });
}
```

(Merge the `GameStateEnvelope` import into the existing `import type { ... } from './types'` line.)

- [ ] **Step 5: Run the test, verify it passes; typecheck**

Run: `npx vitest run src/api/endpoints.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/endpoints.ts src/api/endpoints.test.ts
git commit -m "frontend: getGameState / putGameState endpoint wrappers"
```

---

## Task 6: Rewrite `hydrateFromServer` — load the blob, replace local state

**Files:**
- Modify: `src/game/auth/hydrate.ts` (full rewrite), `src/game/auth/hydrate.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `getGameState` (Task 5); `saveSchema` from `@/game/persistence` (Task 1); `PlayerState` from `@/game/types`.
- Produces:
  ```ts
  export type HydrateResult = { kind: 'loaded' | 'empty' | 'error' };
  export function hydrateFromServer(
    replace: (updater: (prev: PlayerState) => Partial<PlayerState>) => void,
  ): Promise<HydrateResult>;
  ```

- [ ] **Step 1: Write the failing test**

`src/game/auth/hydrate.test.ts` (replace the whole file):

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import * as endpoints from '@/api/endpoints';
import { SAVE_SCHEMA_VERSION } from '@/game/persistence';
import { hydrateFromServer } from './hydrate';

afterEach(() => vi.restoreAllMocks());

const validPlayer = {
  level: 7, xp: 60, xpToNextLevel: 700, totalFishCaught: 20,
  collection: [], unlockedLocations: ['atlantic', 'amazon'], heaviestFish: null, warehouse: [],
  coins: 900, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
  luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
  aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
};

describe('hydrateFromServer', () => {
  it('loads a valid blob and replaces local state', async () => {
    vi.spyOn(endpoints, 'getGameState').mockResolvedValue({
      state: { schemaVersion: SAVE_SCHEMA_VERSION, player: validPlayer }, updatedAt: '2026-09-07T00:00:00Z',
    });
    const replace = vi.fn();
    const res = await hydrateFromServer(replace);
    expect(res).toEqual({ kind: 'loaded' });
    const applied = replace.mock.calls[0][0]({ level: 1, coins: 0 });
    expect(applied).toMatchObject({ level: 7, coins: 900, totalFishCaught: 20 });
  });

  it('returns empty when the server has no state', async () => {
    vi.spyOn(endpoints, 'getGameState').mockResolvedValue({ state: null, updatedAt: null });
    const replace = vi.fn();
    expect(await hydrateFromServer(replace)).toEqual({ kind: 'empty' });
    expect(replace).not.toHaveBeenCalled();
  });

  it('returns empty when the blob fails validation', async () => {
    vi.spyOn(endpoints, 'getGameState').mockResolvedValue({ state: { schemaVersion: 1, player: { level: 0 } }, updatedAt: 'x' });
    const replace = vi.fn();
    expect(await hydrateFromServer(replace)).toEqual({ kind: 'empty' });
    expect(replace).not.toHaveBeenCalled();
  });

  it('returns error when the GET fails', async () => {
    vi.spyOn(endpoints, 'getGameState').mockRejectedValue(new Error('network'));
    const replace = vi.fn();
    expect(await hydrateFromServer(replace)).toEqual({ kind: 'error' });
    expect(replace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/game/auth/hydrate.test.ts`
Expected: FAIL — old signature (`{ user }` from `getMe`).

- [ ] **Step 3: Rewrite `src/game/auth/hydrate.ts`**

```ts
import type { PlayerState } from '@/game/types';
import { saveSchema } from '@/game/persistence';
import { getGameState } from '@/api/endpoints';

export type HydrateResult = { kind: 'loaded' | 'empty' | 'error' };

/**
 * Loads the account's saved game state from the server and REPLACES local state.
 * The server blob is authoritative (this pulls Task 10.2 forward). `onAuthenticated`
 * calls this on every authenticated app start.
 */
export async function hydrateFromServer(
  replace: (updater: (prev: PlayerState) => Partial<PlayerState>) => void,
): Promise<HydrateResult> {
  let envelope: unknown;
  try {
    ({ state: envelope } = await getGameState());
  } catch {
    return { kind: 'error' };
  }
  if (envelope == null) return { kind: 'empty' };
  const parsed = saveSchema.safeParse(envelope);
  if (!parsed.success) {
    console.warn('game state blob failed validation; treating as empty');
    return { kind: 'empty' };
  }
  replace(() => parsed.data.player);
  return { kind: 'loaded' };
}
```

Note: `replace(() => parsed.data.player)` relies on `replaceFromServer` doing
`setPlayer(prev => ({ ...prev, ...updater(prev) }))`. Since `parsed.data.player` is a
complete `PlayerState`, the spread overwrites every field — effectively a replace.
(If a stricter replace is wanted, Task 8 can add a `replaceFromServer` that does
`setPlayer(() => updater(prev))`; not required — the full-object spread is
equivalent given a validated complete `PlayerState`.)

- [ ] **Step 4: Run the test, verify it passes; typecheck**

Run: `npx vitest run src/game/auth/hydrate.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS (4), clean. `tsc` may now flag `src/pages/Index.tsx` (still calls `hydrateFromServer(replaceFromServer).catch(...)` and expects `void`) — that is Task 8. Note it; do not fix here.

- [ ] **Step 5: Commit (with the known Index.tsx typecheck error)**

```bash
git add src/game/auth/hydrate.ts src/game/auth/hydrate.test.ts
git commit -m "frontend: hydrateFromServer loads the server blob and replaces local state

Index.tsx still uses the old void signature; rewired in a later task."
```

---

## Task 7: `useGameStateSync` hook

**Files:**
- Create: `src/game/auth/gameStateSync.ts`, `src/game/auth/gameStateSync.test.ts`

**Interfaces:**
- Consumes: `putGameState` (Task 5); `SAVE_SCHEMA_VERSION` from `@/game/persistence`; `PlayerState` from `@/game/types`.
- Produces:
  ```ts
  export function useGameStateSync(args: { player: PlayerState; enabled: boolean }): { flushNow: () => Promise<void> };
  ```
  - While `enabled`: a `player` change schedules a `putGameState({ schemaVersion: SAVE_SCHEMA_VERSION, player })` ~4000ms after the last change (debounced; the timer resets on each change).
  - `pagehide` and `visibilitychange` (when `document.visibilityState === 'hidden'`) → immediate send via `fetch('/api/v1/me/state', { method:'PUT', keepalive:true, credentials:'same-origin', headers: { 'Content-Type':'application/json', 'X-CSRF-Token': <dbl_csrf cookie> }, body: JSON.stringify({ state: envelope }) })`. Only when `enabled`.
  - `flushNow()` → clears the debounce timer and awaits a `putGameState(...)` immediately (used by logout). Resolves even on failure (best-effort).
  - `enabled === false` → the hook does nothing (no timer, listeners are no-ops).

- [ ] **Step 1: Write the failing test**

`src/game/auth/gameStateSync.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as endpoints from '@/api/endpoints';
import { SAVE_SCHEMA_VERSION } from '@/game/persistence';
import { useGameStateSync } from './gameStateSync';

const mkPlayer = (over = {}) => ({ level: 1, coins: 0, /* ...only fields the hook reads; it serializes the whole object */ ...over }) as never;

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(endpoints, 'putGameState').mockResolvedValue(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('useGameStateSync', () => {
  it('debounces a PUT ~4s after the last player change', async () => {
    const { rerender } = renderHook(({ player }) => useGameStateSync({ player, enabled: true }), { initialProps: { player: mkPlayer({ level: 1 }) } });
    rerender({ player: mkPlayer({ level: 2 }) });
    vi.advanceTimersByTime(3000);
    rerender({ player: mkPlayer({ level: 3 }) });      // resets the timer
    vi.advanceTimersByTime(3999);
    expect(endpoints.putGameState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
    expect(endpoints.putGameState).toHaveBeenLastCalledWith({ schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 3 }) });
  });

  it('does nothing when disabled', () => {
    const { rerender } = renderHook(({ player }) => useGameStateSync({ player, enabled: false }), { initialProps: { player: mkPlayer({ level: 1 }) } });
    rerender({ player: mkPlayer({ level: 2 }) });
    vi.advanceTimersByTime(10000);
    expect(endpoints.putGameState).not.toHaveBeenCalled();
  });

  it('flushNow sends immediately and clears the pending timer', async () => {
    const { result, rerender } = renderHook(({ player }) => useGameStateSync({ player, enabled: true }), { initialProps: { player: mkPlayer({ level: 1 }) } });
    rerender({ player: mkPlayer({ level: 5 }) });
    await result.current.flushNow();
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(endpoints.putGameState).toHaveBeenCalledTimes(1);   // timer was cleared
  });
});
```

(The `pagehide`/`keepalive` path is hard to unit test cleanly with jsdom; assert it in the manual/container check instead, and keep a comment in the hook. If a test is feasible with `window.dispatchEvent(new Event('pagehide'))` + a `global.fetch` spy, add it.)

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/game/auth/gameStateSync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/game/auth/gameStateSync.ts`**

```ts
import { useCallback, useEffect, useRef } from 'react';
import type { PlayerState } from '@/game/types';
import { SAVE_SCHEMA_VERSION } from '@/game/persistence';
import { putGameState } from '@/api/endpoints';

const DEBOUNCE_MS = 4000;

function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)dbl_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function useGameStateSync({ player, enabled }: { player: PlayerState; enabled: boolean }): { flushNow: () => Promise<void> } {
  const playerRef = useRef(player);
  playerRef.current = player;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const envelope = useCallback(() => ({ schemaVersion: SAVE_SCHEMA_VERSION, player: playerRef.current }), []);

  const clearTimer = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const flushNow = useCallback(async () => {
    clearTimer();
    if (!enabledRef.current) return;
    try { await putGameState(envelope()); } catch { /* best-effort */ }
  }, [clearTimer, envelope]);

  // debounce on player change
  useEffect(() => {
    if (!enabled) { clearTimer(); return; }
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      putGameState(envelope()).catch(() => { /* retried on next change */ });
    }, DEBOUNCE_MS);
    return clearTimer;
  }, [player, enabled, clearTimer, envelope]);

  // flush on tab close / hide (keepalive so it survives unload)
  useEffect(() => {
    const send = () => {
      if (!enabledRef.current) return;
      const t = csrfToken();
      try {
        void fetch('/api/v1/me/state', {
          method: 'PUT', credentials: 'same-origin', keepalive: true,
          headers: { 'Content-Type': 'application/json', ...(t ? { 'X-CSRF-Token': t } : {}) },
          body: JSON.stringify({ state: envelope() }),
        });
      } catch { /* best-effort */ }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') send(); };
    window.addEventListener('pagehide', send);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', send);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [envelope]);

  return { flushNow };
}
```

- [ ] **Step 4: Run the test, verify it passes; typecheck**

Run: `npx vitest run src/game/auth/gameStateSync.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/auth/gameStateSync.ts src/game/auth/gameStateSync.test.ts
git commit -m "frontend: useGameStateSync (4s debounce + pagehide keepalive + flushNow)"
```

---

## Task 8: `AuthProvider` `onBeforeLogout` + `Index.tsx` rewire

**Files:**
- Modify: `src/game/auth/AuthProvider.tsx`, `src/game/auth/AuthProvider.test.tsx`
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `hydrateFromServer` (Task 6), `useGameStateSync` (Task 7), `putGameState` (Task 5), `SAVE_SCHEMA_VERSION` from `@/game/persistence`.
- Produces:
  - `AuthProvider` prop `onBeforeLogout?: () => void | Promise<void>` — awaited inside `logout()` BEFORE `endpoints.logout()`. Not fired on session-expiry.
  - `Index.tsx`: `afterAuth` uses the new `hydrateFromServer` result; `useGameStateSync` mounted; `<ImportSaveDialog>` and its state/handlers removed.

- [ ] **Step 1: AuthProvider — add `onBeforeLogout`**

In `src/game/auth/AuthProvider.tsx`:
- Widen the props destructure + type: `{ children, onAuthenticated, onLoggedOut, onBeforeLogout }` with `onBeforeLogout?: () => void | Promise<void>`.
- Add `const onBeforeLogoutRef = useRef(onBeforeLogout); onBeforeLogoutRef.current = onBeforeLogout;`
- Rewrite `logout`:
  ```ts
  const logout = useCallback(async () => {
    try { await onBeforeLogoutRef.current?.(); } catch { /* best-effort flush */ }
    try { await endpoints.logout(); } finally { setUser(null); setStatus('anonymous'); }
    onLoggedOutRef.current?.();
  }, []);
  ```
- `setLoggedOutHandler` path (session-expiry) is unchanged — it fires neither hook.

- [ ] **Step 2: AuthProvider test**

In `src/game/auth/AuthProvider.test.tsx`, add:
- `logout()` calls `onBeforeLogout` **before** `endpoints.logout`: use a shared array to record call order (`push('before')` in the `onBeforeLogout` spy, `vi.spyOn(endpoints,'logout').mockImplementation(async () => { order.push('logout'); })`), assert `order` is `['before', 'logout']`.
- session-expiry (the existing test that drives the `setLoggedOutHandler` callback / a mount `getMe` reject) does **not** call `onBeforeLogout` — `expect(onBeforeLogout).not.toHaveBeenCalled()`.
- Existing `onLoggedOut` tests still pass.

- [ ] **Step 3: Run AuthProvider test**

Run: `npx vitest run src/game/auth/AuthProvider.test.tsx`
Expected: PASS.

- [ ] **Step 4: Rewrite the auth wiring in `src/pages/Index.tsx`**

Remove:
- imports of `maybeOfferImport, runImport, IMPORT_DONE_KEY, ImportPreview` and `ImportSaveDialog`.
- `const [importPreview, setImportPreview] = useState(...)`.
- `confirmImport`, and the `maybeOfferImport(...)` call inside `afterAuth`.
- the `<ImportSaveDialog .../>` element from the returned tree.
(Keep the `IMPORT_DONE_KEY` cleanup out of `handleLoggedOut` — the key is dead now. If `handleLoggedOut` referenced it, drop that line.)

Add:
- `import { putGameState, /* existing */ } from '@/api/endpoints';` (or wherever endpoints are imported).
- `import { SAVE_SCHEMA_VERSION } from '@/game/persistence';`
- `import { useGameStateSync } from '@/game/auth/gameStateSync';`
- `const [syncEnabled, setSyncEnabled] = useState(false);`
- `const { flushNow } = useGameStateSync({ player, enabled: syncEnabled });`

Rewrite `afterAuth`:
```ts
const afterAuth = async () => {
  const res = await hydrateFromServer(replaceFromServer);
  setSyncEnabled(res.kind !== 'error');
  if (res.kind === 'empty') {
    await putGameState({ schemaVersion: SAVE_SCHEMA_VERSION, player }).catch(() => {});
  }
};
```

Rewrite `handleLoggedOut` (fires after logout completes — order: `onBeforeLogout` flush → `endpoints.logout` → `onLoggedOut`):
```ts
const handleLoggedOut = () => {
  setSyncEnabled(false);
  resetProgress();
};
```

Wire the provider:
```tsx
<AuthProvider onAuthenticated={afterAuth} onBeforeLogout={flushNow} onLoggedOut={handleLoggedOut}>
  {content}
</AuthProvider>
```
(`<ImportSaveDialog>` is gone; `<AuthProvider>` now has a single child `{content}`.)

Note on `player` freshness in `afterAuth`/`onBeforeLogout`: `afterAuth` and `flushNow`
are recreated each render with the current `player` closure (`flushNow` reads
`playerRef` inside the hook, so it is always current; `afterAuth`'s `player` is the
render's value, which is fine — `afterAuth` only runs right after auth, before
gameplay). `AuthProvider` holds both in refs, so passing a new function identity each
render does not re-run its effects.

- [ ] **Step 5: Typecheck + full frontend suite + lint**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run src/`
Expected: all green, 0 lint errors. `importFlow.ts` / `ImportSaveDialog.tsx` / their tests still exist and still pass in isolation (unused but valid) — leave them.

- [ ] **Step 6: Commit**

```bash
git add src/game/auth/AuthProvider.tsx src/game/auth/AuthProvider.test.tsx src/pages/Index.tsx
git commit -m "frontend: server game-state is authoritative — load on login, sync while playing, flush on logout

afterAuth loads the blob (replace) and adopts the local save on a first login;
useGameStateSync pushes on a 4s debounce + pagehide; AuthProvider.onBeforeLogout
flushes before the session is cleared. The first-login import dialog is removed."
```

---

## Task 9: End-to-end verification + PROJECT_MEMORY

**Files:**
- Modify: `PROJECT_MEMORY.md`

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

Run: `docker compose up --build`. In the browser at `http://localhost:8080`:
1. Create an account (email, 12+ char password, username, country).
2. Fish a fish — the panel shows level/coins/fish moving.
3. Wait ~5s (debounce). DevTools → Network: a `PUT /api/v1/me/state` → `204`.
4. **Log out** ("Sair") — Network shows a final `PUT /api/v1/me/state` then `POST /api/v1/auth/logout` `204`. The game resets to level 1 / 0 coins.
5. **Log in again** — the game loads your fished-fish state (level/coins/fish back). **No import dialog.**
6. Play a bit, then **close the tab** (no logout). Reopen `localhost:8080`, log in → progress up to the tab close is there.
7. `GET /api/v1/me/state` in the console while logged in returns your envelope; while anonymous returns `401`.

- [ ] **Step 3: Manual test hand-off**

Ask the user to repeat Step 2 in their own browser and confirm: fish → logout → login → fish is remembered; tab-close → login → progress kept.

- [ ] **Step 4: Update `PROJECT_MEMORY.md`**

Append a `### Persistência de estado de jogo no servidor (núcleo do 10.2, feito na branch do 10.1) — 2026-09-07` section: the `player_game_state` jsonb table, `GET/PUT /api/v1/me/state`, `hydrateFromServer` agora carrega o blob e faz replace, `useGameStateSync` (debounce 4s + pagehide + logout flush), `AuthProvider.onBeforeLogout`, adopção automática no 1º login. State it **deprecates the Task-13 import flow** (`importFlow.ts` / `ImportSaveDialog.tsx` / `/api/v1/migration/local/*` unused in the logged-in path — kept for now). Note the spec + plan paths and "último-a-gravar-ganha; guarda de versão fica para o 10.2 completo".

- [ ] **Step 5: Commit**

```bash
git add PROJECT_MEMORY.md
git commit -m "docs: record server-side game-state persistence in PROJECT_MEMORY"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| A — `player_game_state` migration + schema mirror | 2 |
| A — `GET`/`PUT /api/v1/me/state`, `saveSchema` validation, CSRF, requireAuth, 2MB limit, upsert | 3 |
| A — memory service + pg repository | 3 |
| A — integration test (upsert / updatedAt / cascade) | 4 |
| B — `getGameState` / `putGameState` + `GameStateEnvelope` | 5 |
| B — `hydrateFromServer` rewrite (loaded/empty/error, replace not merge) | 6 |
| B — `afterAuth` auto-adopt on `empty`, read-only on `error`, no dialog | 8 |
| B — import dialog / `maybeOfferImport` / `/migration` removed from the flow | 8 |
| C — `useGameStateSync` (debounce, pagehide keepalive, flushNow, disabled) | 7 |
| D — `AuthProvider.onBeforeLogout` (awaited before logout, not on session-expiry) | 8 |
| Flow — load on login / sync while playing / flush + zero on logout / restore next login | 8 + 9 (verify) |
| Error cases — GET fails → read-only; blob invalid → empty; PUT fails → retry | 6 (unit) + 8 (afterAuth) + 9 (manual) |
| `saveSchema` export | 1 |
| Shared schema reuse OR replicated-with-parity-test fallback | 3 Step 5 |

No gaps.

**2. Placeholder scan**

- Task 3 Step 5 leaves the exact `src/game/persistence` import path to verification ("`../../../src/game/persistence.js` — verify the relative depth … match how `backend/src/fishing/` imports `src/game/*`"). This is a real, named check with a concrete fallback (replicated schema + parity test), not a TODO — the import mechanism genuinely depends on how the repo already wires backend→`src/game`, which the implementer confirms in one grep.
- Task 7 Step 1 notes the `pagehide`/`keepalive` path is asserted in the manual check rather than a brittle jsdom test, with a concrete "add it if feasible with `window.dispatchEvent`" — deliberate test-scope call, not a skipped requirement.
- No "TODO" / "similar to Task N" / bare "add error handling" without the code.

**3. Type consistency**

- `HydrateResult = { kind: 'loaded' | 'empty' | 'error' }` — produced in Task 6, consumed in Task 8 (`res.kind !== 'error'`, `res.kind === 'empty'`). Consistent.
- `GameStateEnvelope = { state: unknown; updatedAt: string | null }` — Task 5 type, Task 6 destructures `{ state }`, Task 3 backend returns `{ state: ... ?? null, updatedAt: ... ?? null }`. Consistent.
- The persisted blob is the envelope `{ schemaVersion: SAVE_SCHEMA_VERSION, player }` everywhere: `putGameState` body (Task 5/7/8), `saveSchema` validation (Task 3), `saveSchema.safeParse` load (Task 6). `serializePlayerState` (returns a string) is NOT used on the wire — the envelope object is built inline. Consistent.
- `useGameStateSync({ player, enabled })` → `{ flushNow }` — Task 7 produces, Task 8 consumes (`onBeforeLogout={flushNow}`). Consistent.
- `putGameState(state: unknown): Promise<void>` — Task 5 signature; callers in 7 and 8 pass the envelope object. Consistent.
- `GameStateService` shape (`get` → `{ state, updatedAt } | null`, `put` → `void`) identical between `memoryService.ts` and `pgRepository.ts` (Task 3). Route handler uses `entry?.state ?? null`. Consistent.

Fixes applied inline: none needed.
