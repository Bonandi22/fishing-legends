# Retire the Free-Form `PUT /me/state` Write — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close security checklist item #8 — an authenticated client can no longer overwrite its `player_game_state` blob with arbitrary content — while preserving the one legitimate free-write use (turning anonymous local progress into a new account's starting state) and giving the only two mutations that had no dedicated op (equip rod/boat skin) a real, validated server op.

**Architecture:** `PUT /api/v1/me/state` (generic overwrite, gated only by knowing the current `version`) is replaced by `POST /api/v1/me/state/bootstrap` (create-only, no version — fails if a row already exists) plus a new `POST /api/v1/me/economy/skins/equip` op that reuses the existing `runMemoryOp`/`runPgOp` + `game_state_operations` replay machinery every other economy op already uses. The frontend's debounced-push/pagehide/`flushNow` autosave machinery is deleted — once equip is a real op there is nothing left that needs a generic "diff and push."

**Tech Stack:** Fastify + Zod + Drizzle (backend), React + Vitest (frontend), shared pure rules in `src/game/stateRules.ts` imported by both.

**Spec:** `docs/superpowers/specs/2026-09-11-retire-free-form-state-write-design.md`

## Global Constraints

- No database migration: `player_game_state`'s schema does not change, only the application-layer contract around it.
- `POST /api/v1/me/state/bootstrap` keeps the existing 2 MiB body limit (`STATE_BODY_LIMIT`).
- The equip op requires `Idempotency-Key` and goes through the same `game_state_operations` replay-row treatment as every other economy op — no special-casing, even though equip is naturally idempotent and grants no value.
- "Resetar Progresso" is hidden entirely while `status === 'authenticated'`; no new server-side reset endpoint.
- The `migration` module (local-save import into an *existing* account) and its already-known latent bug are untouched.

---

### Task 1: Backend — rename `PUT /me/state` to `POST /me/state/bootstrap`

**Files:**
- Modify: `backend/src/gamestate/memoryService.ts`
- Modify: `backend/src/gamestate/pgRepository.ts`
- Modify: `backend/src/gamestate/routes.ts`
- Modify: `backend/src/gamestate/routes.test.ts`
- Modify: `backend/src/gamestate/pgRepository.integration.test.ts`
- Modify: `backend/src/gamestate/economyService.integration.test.ts`
- Modify: `backend/src/fishing/pgRepository.integration.test.ts`
- Modify: `backend/src/app.test.ts`
- Modify: `backend/src/gamestate/economyRoutes.test.ts`
- Modify: `backend/src/fishing/routes.test.ts`

**Interfaces:**
- Produces: `createMemoryGameStateService(store?)` and `createPgGameStateService(db)` both now return `{ get(userId), bootstrap(userId, state): Promise<{ version: number }> }` — `put` no longer exists. `bootstrap` throws `Error('STATE_VERSION_CONFLICT')` if a row already exists for that user; there is no update path.
- Produces: route `POST /api/v1/me/state/bootstrap`, body `{ state: <saveSchema> }` (no `baseVersion`), 200 → `{ version: 1 }`, 409 `STATE_VERSION_CONFLICT` if the row already exists, 400 `VALIDATION_ERROR` on a malformed body, 401/403 as every other authenticated route.

This is one atomic task — the rename does not compile until every call site is fixed, so there is one commit at the end covering the implementation and every affected test file.

- [ ] **Step 1: Rewrite `backend/src/gamestate/memoryService.ts`**

```ts
export type MemoryGameStateEntry = { state: unknown; updatedAt: string; version: number };
export type MemoryGameStateStore = Map<string, MemoryGameStateEntry>;

export function createMemoryGameStateStore(): MemoryGameStateStore {
  return new Map();
}

/**
 * In-memory game-state store (dev/test without DATABASE_URL). `bootstrap` is
 * create-only: it succeeds exactly once per account and throws
 * `STATE_VERSION_CONFLICT` if a row already exists. There is no update path —
 * every subsequent mutation goes through a dedicated, validated op instead of
 * a free-form overwrite.
 */
export function createMemoryGameStateService(store: MemoryGameStateStore = createMemoryGameStateStore()) {
  return {
    async get(userId: string): Promise<MemoryGameStateEntry | null> {
      return store.get(userId) ?? null;
    },
    async bootstrap(userId: string, state: unknown): Promise<{ version: number }> {
      if (store.has(userId)) throw new Error('STATE_VERSION_CONFLICT');
      store.set(userId, { state, updatedAt: new Date().toISOString(), version: 1 });
      return { version: 1 };
    },
  };
}
```

- [ ] **Step 2: Rewrite `backend/src/gamestate/pgRepository.ts`**

```ts
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { playerGameState } from '../db/schema.js';

/**
 * `bootstrap` is create-only: it succeeds exactly once per account (the row
 * that turns anonymous local progress into the account's starting state) and
 * throws `STATE_VERSION_CONFLICT` if a row already exists. There is no
 * update path any more — every subsequent mutation goes through a dedicated,
 * validated op instead of a free-form overwrite.
 */
export function createPgGameStateService(db: Database) {
  return {
    async get(userId: string): Promise<{ state: unknown; updatedAt: string; version: number } | null> {
      const rows = await db.select().from(playerGameState).where(eq(playerGameState.userId, userId)).limit(1);
      const row = rows[0];
      return row ? { state: row.state, updatedAt: row.updatedAt.toISOString(), version: row.version } : null;
    },
    async bootstrap(userId: string, state: unknown): Promise<{ version: number }> {
      const now = new Date();
      const value = { userId, state, updatedAt: now, version: 1 } as typeof playerGameState.$inferInsert;
      const inserted = await db.insert(playerGameState)
        .values(value)
        .onConflictDoNothing({ target: playerGameState.userId })
        .returning({ version: playerGameState.version });
      if (inserted.length === 0) throw new Error('STATE_VERSION_CONFLICT');
      return { version: inserted[0].version };
    },
  };
}
```

- [ ] **Step 3: Rewrite `backend/src/gamestate/routes.ts`**

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

const bootstrapBody = z.object({
  state: saveSchema,
});
const STATE_BODY_LIMIT = 2 * 1024 * 1024;

export function registerGameStateRoutes(app: FastifyInstance, service: GameStateService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/me/state', {
    schema: { tags: ['gamestate'], summary: "The account's saved game state" },
    preHandler: app.requireAuth,
  }, async request => {
    const entry = await service.get(request.userId);
    return { state: entry?.state ?? null, updatedAt: entry?.updatedAt ?? null, version: entry?.version ?? null };
  });

  r.post('/api/v1/me/state/bootstrap', {
    schema: {
      tags: ['gamestate'],
      summary: 'Create the account\'s initial game state (once only; adopts anonymous local progress)',
      body: bootstrapBody,
    },
    bodyLimit: STATE_BODY_LIMIT,
    preHandler: app.requireAuth,
  }, async request => {
    return service.bootstrap(request.userId, request.body.state);
  });
}
```

- [ ] **Step 4: Run the backend typecheck to see the ripple of failures**

Run: `npm run backend:typecheck`
Expected: FAIL — errors in every file listed under **Files** above, each complaining that `.put` does not exist on the service type, or that `PUT /api/v1/me/state` style requests reference a route that no longer exists. This confirms the full blast radius before fixing it.

- [ ] **Step 5: Rewrite `backend/src/gamestate/routes.test.ts`**

Replace the entire file with:

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
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, authRateLimitMax: 1000, authRateLimitWindowMs: 300_000, trustProxy: false, cookieSecure: false,
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
  it('GET returns { state: null, version: null } when nothing is saved', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    const res = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ state: null, updatedAt: null, version: null });
  });

  it('bootstrap creates the row at version 1 and GET round-trips it', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    const body = envelope({ level: 9, coins: 1234 });
    const post = await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state: body } });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual({ version: 1 });
    const get = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(get.json().state).toEqual(body);
    expect(get.json().version).toBe(1);
    expect(typeof get.json().updatedAt).toBe('string');
  });

  it('bootstrap when a row already exists is 409 STATE_VERSION_CONFLICT', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state: envelope() } });
    const res = await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state: envelope({ coins: 5 }) } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('STATE_VERSION_CONFLICT');
  });

  it('bootstrap with an invalid player shape is 400 VALIDATION_ERROR', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    const res = await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state: { schemaVersion: 1, player: { level: 0 } } } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('GET without a session is 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/api/v1/me/state' });
    expect(res.statusCode).toBe(401);
  });

  it('bootstrap without X-CSRF-Token is 403', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'g@example.com', password: 'a-very-strong-password', username: 'gs_user', country: 'br' } });
    const setCookie = ([] as string[]).concat(reg.headers['set-cookie'] as string[]);
    const jar: Record<string, string> = {};
    for (const c of setCookie) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); }
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/state/bootstrap', cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf }, payload: { state: envelope() } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });
});
```

- [ ] **Step 6: Rewrite `backend/src/gamestate/pgRepository.integration.test.ts`**

Replace the entire file with:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../testing/pgHarness.js';
import { users } from '../db/schema.js';
import { createPgAuthRepository } from '../auth/pgRepository.js';
import { createPgGameStateService } from './pgRepository.js';

let harness: TestDatabase;
let auth: ReturnType<typeof createPgAuthRepository>;
let svc: ReturnType<typeof createPgGameStateService>;

beforeAll(async () => {
  harness = await createTestDatabase();
  auth = createPgAuthRepository(harness.db);
  svc = createPgGameStateService(harness.db);
});

afterEach(() => harness?.reset());
afterAll(() => harness?.close());

async function seedUser() {
  const user = await auth.createUser({
    email: `gs-${randomUUID()}@example.com`,
    passwordHash: 'scrypt$c2FsdA$a2V5',
    username: `gs_${randomUUID().slice(0, 8)}`,
    country: 'BR',
  });
  return user.id;
}

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

describe('pg game-state service (integration)', () => {
  it('returns null for an unknown user', async () => {
    expect(await svc.get(randomUUID())).toBeNull();
  });

  it('bootstrap creates version 1 and round-trips the envelope', async () => {
    const userId = await seedUser();
    const blob = envelope();

    const put = await svc.bootstrap(userId, blob);
    expect(put).toEqual({ version: 1 });
    const got = await svc.get(userId);

    expect(got).not.toBeNull();
    expect(got!.state).toEqual(blob);
    expect(got!.version).toBe(1);
    expect(Number.isNaN(Date.parse(got!.updatedAt))).toBe(false);
  });

  it('rejects bootstrap when a row already exists', async () => {
    const userId = await seedUser();
    await svc.bootstrap(userId, envelope());

    await expect(svc.bootstrap(userId, envelope({ coins: 7 }))).rejects.toThrow('STATE_VERSION_CONFLICT');
  });

  it('cascades on user deletion: get returns null with no error', async () => {
    const userId = await seedUser();
    await svc.bootstrap(userId, envelope());

    await harness.db.delete(users).where(eq(users.id, userId));

    expect(await svc.get(userId)).toBeNull();
  });
});
```

- [ ] **Step 7: Fix `backend/src/gamestate/economyService.integration.test.ts` call sites (25 occurrences)**

Every call in this file has the shape `gameState.put(userId, X, null)` (22 single-line occurrences) or a multi-line object literal ending in `}, null);` (3 occurrences, the `placeAquariumFish` tests). Apply this transform to **every** occurrence in the file:

- Rename `gameState.put(` → `gameState.bootstrap(`.
- Remove the trailing `, null` immediately before the call's closing `)`.

Single-line example (one of 22 identical-shape lines):

```ts
// before
await gameState.put(userId, blob(oneFish), null);
// after
await gameState.bootstrap(userId, blob(oneFish));
```

Multi-line example (one of 3, e.g. around the `placeAquariumFish transactionally` test):

```ts
// before
await gameState.put(userId, {
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: { ...blob([]).player, xpToNextLevel: 999999, aquariumWarehouse: [aq] },
}, null);
// after
await gameState.bootstrap(userId, {
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: { ...blob([]).player, xpToNextLevel: 999999, aquariumWarehouse: [aq] },
});
```

After editing, confirm no occurrences remain: searching the file for `.put(` must return nothing.

- [ ] **Step 8: Fix `backend/src/fishing/pgRepository.integration.test.ts` call sites (10 occurrences)**

Same transform as Step 7 — every occurrence in this file is single-line. Example:

```ts
// before
await gameState.put(userId, blob(), null);
// after
await gameState.bootstrap(userId, blob());
```

Apply to all 10 (some have a non-empty `blob({...})` argument — keep that argument, only drop the trailing `, null`).

- [ ] **Step 9: Fix `backend/src/app.test.ts` (3 identical occurrences)**

All three occurrences are the exact same line. Replace every occurrence of:

```ts
expect((await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: seedState, baseVersion: null } })).statusCode).toBe(200);
```

with:

```ts
expect((await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state: seedState } })).statusCode).toBe(200);
```

- [ ] **Step 10: Fix `backend/src/gamestate/economyRoutes.test.ts` seed helpers (2 functions)**

Replace:

```ts
async function seed(client: Awaited<ReturnType<typeof registerAndAuth>>, warehouse: unknown[]) {
  const put = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: blob(warehouse), baseVersion: null } });
  expect(put.statusCode).toBe(200);
}
```

with:

```ts
async function seed(client: Awaited<ReturnType<typeof registerAndAuth>>, warehouse: unknown[]) {
  const put = await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state: blob(warehouse) } });
  expect(put.statusCode).toBe(200);
}
```

And replace:

```ts
async function seedBlob(client: Awaited<ReturnType<typeof registerAndAuth>>, state: unknown) {
  const put = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state, baseVersion: null } });
  expect(put.statusCode).toBe(200);
}
```

with:

```ts
async function seedBlob(client: Awaited<ReturnType<typeof registerAndAuth>>, state: unknown) {
  const put = await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state } });
  expect(put.statusCode).toBe(200);
}
```

- [ ] **Step 11: Fix `backend/src/fishing/routes.test.ts` seed helper**

Replace:

```ts
async function seed(client: Awaited<ReturnType<typeof registerAndAuth>>, state: unknown) {
  const put = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state, baseVersion: null } });
  expect(put.statusCode).toBe(200);
}
```

with:

```ts
async function seed(client: Awaited<ReturnType<typeof registerAndAuth>>, state: unknown) {
  const put = await client.request({ method: 'POST', url: '/api/v1/me/state/bootstrap', payload: { state } });
  expect(put.statusCode).toBe(200);
}
```

- [ ] **Step 12: Run the backend typecheck again**

Run: `npm run backend:typecheck`
Expected: PASS — no errors.

- [ ] **Step 13: Run the backend unit test suite**

Run: `npm test`
Expected: PASS for every backend test file touched in this task (frontend tests are untouched by this task and should also still pass).

- [ ] **Step 14: Run the backend integration suite against a real Postgres**

This requires `DATABASE_URL`/`TEST_DATABASE_URL` pointing at a running Postgres (the project's `docker compose up` stack; see `compose.yaml`).

Run: `npm run test:integration`
Expected: PASS, including the rewritten `gamestate/pgRepository.integration.test.ts`, `economyService.integration.test.ts`, and `fishing/pgRepository.integration.test.ts`.

- [ ] **Step 15: Commit**

```bash
git add backend/src/gamestate/memoryService.ts backend/src/gamestate/pgRepository.ts backend/src/gamestate/routes.ts backend/src/gamestate/routes.test.ts backend/src/gamestate/pgRepository.integration.test.ts backend/src/gamestate/economyService.integration.test.ts backend/src/fishing/pgRepository.integration.test.ts backend/src/app.test.ts backend/src/gamestate/economyRoutes.test.ts backend/src/fishing/routes.test.ts
git commit -m "backend: replace PUT /me/state with a create-only bootstrap endpoint"
```

---

### Task 2: Shared pure rule — `equipSkin` in `stateRules.ts`

**Files:**
- Modify: `src/game/stateRules.ts`
- Test: `src/test/stateRules.test.ts`

**Interfaces:**
- Produces: `equipSkin(state: PlayerState, kind: 'rod' | 'boat', id: string): PlayerState` — no-op (returns `state` unchanged) if `id` is not in `ownedSkins`/`ownedBoatSkins`; otherwise sets `activeSkin`/`activeBoatSkin` to `id`. Matches `buyOwnedItem`'s no-op-on-invalid-input style: the pure rule never throws, the caller decides what an invalid attempt means.

- [ ] **Step 1: Write the failing test**

In `src/test/stateRules.test.ts`, add `equipSkin` to the import list from `@/game/stateRules` (alphabetically, after `consumeNet` and before `getUnlockedLocationIds`):

```ts
import {
  applyCatch,
  applyXp,
  addToWarehouse,
  buyMultiplier,
  buyNet,
  buyOwnedItem,
  consumeNet,
  equipSkin,
  getUnlockedLocationIds,
  grantOwnedItem,
  placeAquariumFish,
  resolveDailyGift,
  resolveLuckyMode,
  sellWarehouse,
  spendCoins,
  spinDailyRoulette,
  spinSkinRoulette,
} from '@/game/stateRules';
```

Then add this test, right after the existing `'keeps economy operations transactional and bounded'` test (which already exercises `buyOwnedItem` on the same `player` fixture):

```ts
  it('equips an owned skin and no-ops on one it does not own', () => {
    const withShark = { ...player, ownedSkins: ['default', 'shark'] };
    expect(equipSkin(withShark, 'rod', 'shark').activeSkin).toBe('shark');
    expect(equipSkin(player, 'rod', 'shark')).toBe(player); // not owned: no-op, same reference

    const withYacht = { ...player, ownedBoatSkins: ['classic', 'yacht'] };
    expect(equipSkin(withYacht, 'boat', 'yacht').activeBoatSkin).toBe('yacht');
    expect(equipSkin(player, 'boat', 'yacht')).toBe(player);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/stateRules.test.ts`
Expected: FAIL — `equipSkin is not defined` / import error, since `stateRules.ts` does not export it yet.

- [ ] **Step 3: Implement `equipSkin` in `src/game/stateRules.ts`**

Add this function right after `buyOwnedItem` (which ends just before `grantOwnedItem`):

```ts
export function equipSkin(state: PlayerState, kind: 'rod' | 'boat', id: string): PlayerState {
  const owned = kind === 'rod' ? state.ownedSkins : state.ownedBoatSkins;
  if (!owned.includes(id)) return state;
  return kind === 'rod' ? { ...state, activeSkin: id } : { ...state, activeBoatSkin: id };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/stateRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/stateRules.ts src/test/stateRules.test.ts
git commit -m "game: add the equipSkin pure rule, shared by the client and the new server op"
```

---

### Task 3: Backend — the `skins/equip` op (compute, wiring, memory unit tests)

**Files:**
- Modify: `backend/src/http/errors.ts`
- Modify: `backend/src/gamestate/economyService.ts`
- Test: `backend/src/gamestate/economyService.test.ts`

**Interfaces:**
- Consumes: `equipSkin` from Task 2 (`src/game/stateRules.ts`).
- Produces: `GameStateEconomyService.equipSkin(userId: string, idempotencyKey: string, kind: SkinKind, skinId: string): Promise<Result>` on both `createMemoryGameStateEconomyService` and `createPgGameStateEconomyService`. Throws `SKIN_NOT_OWNED` (mapped to `404`) when the skin is not in the player's owned list.

- [ ] **Step 1: Add the `SKIN_NOT_OWNED` domain error**

In `backend/src/http/errors.ts`, in the `DOMAIN_ERRORS` map, add this line right after `SKIN_ALREADY_OWNED`:

```ts
  SKIN_ALREADY_OWNED: { status: 409, message: 'That skin is already owned' },
  SKIN_NOT_OWNED: { status: 404, message: 'You do not own that skin' },
```

- [ ] **Step 2: Write the failing memory-service test**

In `backend/src/gamestate/economyService.test.ts`, add a new `describe` block right after the `describe('memory game-state economy service — purchaseSkin', ...)` block closes (before `describe('memory game-state economy service — reward ops', ...)`):

```ts
describe('memory game-state economy service — equipSkin', () => {
  it('equips an owned rod skin', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ ownedSkins: ['default', 'shark'] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const res = await svc.equipSkin('u1', 'equip-key-aaaaaaaaaaa1', 'rod', 'shark');

    expect(res.version).toBe(2);
    expect(res.state.player.activeSkin).toBe('shark');
    expect(store.get('u1')!.version).toBe(2);
  });

  it('equips an owned boat skin', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ ownedBoatSkins: ['classic', 'yacht'] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const res = await svc.equipSkin('u1', 'equip-key-bbbbbbbbbbb1', 'boat', 'yacht');

    expect(res.state.player.activeBoatSkin).toBe('yacht');
  });

  it('replays the same key without re-applying', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ ownedSkins: ['default', 'shark'] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const first = await svc.equipSkin('u1', 'equip-key-ccccccccccc1', 'rod', 'shark');
    const replay = await svc.equipSkin('u1', 'equip-key-ccccccccccc1', 'rod', 'shark');

    expect(replay).toEqual(first);
    expect(store.get('u1')!.version).toBe(2); // not 3
  });

  it('rejects SKIN_NOT_OWNED', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins(), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    await expect(svc.equipSkin('u1', 'equip-key-ddddddddddd1', 'rod', 'shark')).rejects.toThrow('SKIN_NOT_OWNED');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('rejects a user with no blob with GAME_STATE_NOT_FOUND', async () => {
    const svc = createMemoryGameStateEconomyService(createMemoryGameStateStore());
    await expect(svc.equipSkin('ghost', 'equip-key-eeeeeeeeeee1', 'rod', 'shark')).rejects.toThrow('GAME_STATE_NOT_FOUND');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run backend/src/gamestate/economyService.test.ts`
Expected: FAIL — `svc.equipSkin is not a function`.

- [ ] **Step 4: Implement `computeSkinEquip` and wire it into both services**

In `backend/src/gamestate/economyService.ts`:

1. Change the `stateRules` import to also bring in `equipSkin`, aliased to avoid colliding with the service method name:

```ts
import {
  buyMultiplier as applyMultiplierPurchase,
  buyNet as applyNetPurchase,
  buyOwnedItem as applySkinPurchase,
  equipSkin as applySkinEquip,
  placeAquariumFish as applyAquariumPlace,
  resolveDailyGift,
  sellWarehouse as applyWarehouseSale,
  spinDailyRoulette,
  spinSkinRoulette,
} from '../../../src/game/stateRules.js';
```

2. Add `skinEquip: 'skin_equip'` to the `OPS` map, right after `skinPurchase`:

```ts
const OPS = {
  warehouseSell: 'warehouse_sell',
  netPurchase: 'net_purchase',
  multiplierPurchase: 'multiplier_purchase',
  skinPurchase: 'skin_purchase',
  skinEquip: 'skin_equip',
  rouletteSpin: 'roulette_spin',
  skinRouletteSpin: 'skin_roulette_spin',
  dailyGiftClaim: 'daily_gift_claim',
  aquariumPlace: 'aquarium_place',
} as const;
```

3. Add `computeSkinEquip`, right after `computeSkinPurchase`:

```ts
/**
 * The validating check the pure rule intentionally skips (it no-ops instead
 * of throwing) — same split as every other op: `compute` validates, then
 * delegates.
 */
function computeSkinEquip(envelope: SaveEnvelope, kind: SkinKind, skinId: string): { player: Player } {
  const owned = kind === 'rod' ? envelope.player.ownedSkins : envelope.player.ownedBoatSkins;
  if (!owned.includes(skinId)) throw new Error('SKIN_NOT_OWNED');
  return { player: applySkinEquip(envelope.player, kind, skinId) };
}
```

4. Add `equipSkin` to the `GameStateEconomyService` interface, right after `purchaseSkin`:

```ts
export interface GameStateEconomyService {
  sellWarehouse(userId: string, idempotencyKey: string): Promise<Result>;
  purchaseNet(userId: string, idempotencyKey: string): Promise<Result>;
  purchaseMultiplier(
    userId: string,
    idempotencyKey: string,
    type: MultiplierType,
    power: MultiplierPower,
  ): Promise<Result>;
  purchaseSkin(
    userId: string,
    idempotencyKey: string,
    kind: SkinKind,
    skinId: string,
  ): Promise<Result>;
  equipSkin(
    userId: string,
    idempotencyKey: string,
    kind: SkinKind,
    skinId: string,
  ): Promise<Result>;
  spinRoulette(userId: string, idempotencyKey: string): Promise<Result>;
  spinSkinRoulette(userId: string, idempotencyKey: string): Promise<Result>;
  claimDailyGift(userId: string, idempotencyKey: string): Promise<Result>;
  placeAquariumFish(userId: string, idempotencyKey: string, timestamp: number, sector: number): Promise<Result>;
}
```

5. In `createMemoryGameStateEconomyService`, add the method right after `purchaseSkin`:

```ts
    async equipSkin(userId, idempotencyKey, kind, skinId) {
      return runMemoryOp(store, ops, userId, OPS.skinEquip, idempotencyKey,
        env => computeSkinEquip(env, kind, skinId));
    },
```

6. In `createPgGameStateEconomyService`, add the same method right after its `purchaseSkin`:

```ts
    async equipSkin(userId, idempotencyKey, kind, skinId) {
      return runPgOp(db, userId, OPS.skinEquip, idempotencyKey,
        env => computeSkinEquip(env, kind, skinId));
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run backend/src/gamestate/economyService.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the backend typecheck**

Run: `npm run backend:typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/http/errors.ts backend/src/gamestate/economyService.ts backend/src/gamestate/economyService.test.ts
git commit -m "backend: add the skins/equip op (compute + memory/pg wiring)"
```

---

### Task 4: Backend — the `POST /me/economy/skins/equip` route

**Files:**
- Modify: `backend/src/gamestate/economyRoutes.ts`
- Test: `backend/src/gamestate/economyRoutes.test.ts`

**Interfaces:**
- Consumes: `GameStateEconomyService.equipSkin` from Task 3.
- Produces: `POST /api/v1/me/economy/skins/equip`, body `{ kind: 'rod'|'boat', skinId: string }` (reuses the existing `skinBody` Zod schema), `Idempotency-Key` header required, 200 → `Result` (`{ state, version }`), 404 `SKIN_NOT_OWNED`, 400 `VALIDATION_ERROR`, 401 unauthenticated.

- [ ] **Step 1: Write the failing HTTP-level test**

In `backend/src/gamestate/economyRoutes.test.ts`, add this `describe` block right after `describe('POST /api/v1/me/economy/skins/purchase', ...)` closes (before `describe('POST /api/v1/me/economy reward ops', ...)`):

```ts
describe('POST /api/v1/me/economy/skins/equip', () => {
  it('equips an owned rod skin', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ ownedSkins: ['default', 'shark'] }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/equip', payload: { kind: 'rod', skinId: 'shark' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().state.player.activeSkin).toBe('shark');
  });

  it('equips an owned boat skin', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ ownedBoatSkins: ['classic', 'yacht'] }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/equip', payload: { kind: 'boat', skinId: 'yacht' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().state.player.activeBoatSkin).toBe('yacht');
  });

  it('replay with the same Idempotency-Key returns the same body', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ ownedSkins: ['default', 'shark'] }));
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/equip', payload: { kind: 'rod', skinId: 'shark' }, idempotencyKey: 'equip-key-replayreplay1' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/equip', payload: { kind: 'rod', skinId: 'shark' }, idempotencyKey: 'equip-key-replayreplay1' });
    expect(replay.json()).toEqual(first.json());
  });

  it('unowned skin -> 404 SKIN_NOT_OWNED', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({}));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/equip', payload: { kind: 'rod', skinId: 'shark' } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('SKIN_NOT_OWNED');
  });

  it('invalid body (unknown kind) -> 400 VALIDATION_ERROR', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({}));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/skins/equip', payload: { kind: 'sail', skinId: 'shark' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('no session -> 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/economy/skins/equip', payload: { kind: 'rod', skinId: 'shark' } });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run backend/src/gamestate/economyRoutes.test.ts`
Expected: FAIL — `404` (route not found) on every request to `/api/v1/me/economy/skins/equip`.

- [ ] **Step 3: Add the route**

In `backend/src/gamestate/economyRoutes.ts`, add this route right after the `skins/purchase` route (it can reuse the existing `skinBody` schema declared at the top of the file — no new Zod schema needed):

```ts
  r.post('/api/v1/me/economy/skins/equip', {
    schema: {
      tags: ['gamestate'],
      summary: 'Equip an owned rod or boat skin (needs Idempotency-Key)',
      body: skinBody,
    },
    preHandler: app.requireAuth,
  }, async (request) => {
    const { kind, skinId } = request.body;
    return service.equipSkin(request.userId, idempotencyKey(request.headers['idempotency-key']), kind, skinId);
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run backend/src/gamestate/economyRoutes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/gamestate/economyRoutes.ts backend/src/gamestate/economyRoutes.test.ts
git commit -m "backend: expose POST /me/economy/skins/equip"
```

---

### Task 5: Backend — PG integration tests for `skins/equip`

**Files:**
- Test: `backend/src/gamestate/economyService.integration.test.ts`

**Interfaces:**
- Consumes: `GameStateEconomyService.equipSkin` from Task 3 (PG path).

- [ ] **Step 1: Write the failing integration test**

In `backend/src/gamestate/economyService.integration.test.ts`, add this `describe` block right after the existing `placeAquariumFish` describe block closes (at the end of the file, before the final `});` that closes the outer suite — check the file's structure; if the whole file is one flat `describe('pg game-state economy service (integration)', () => { ... })` block rather than several sibling `describe`s, add these `it`s directly inside it, after the last `placeAquariumFish` test):

```ts
  it('equips an owned rod skin transactionally: version +1, one op row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ ownedSkins: ['default', 'shark'] }));

    const res = await economy.equipSkin(userId, 'equip-key-int-aaaaaaa1', 'rod', 'shark');
    expect(res.version).toBe(2);
    expect(res.state.player.activeSkin).toBe('shark');

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('skin_equip');
  });

  it('equip replays the same key: identical result, still one row', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ ownedSkins: ['default', 'shark'] }));

    const first = await economy.equipSkin(userId, 'equip-key-int-bbbbbbb1', 'rod', 'shark');
    const replay = await economy.equipSkin(userId, 'equip-key-int-bbbbbbb1', 'rod', 'shark');
    expect(replay).toEqual(first);

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('equip: concurrent same-key resolves identically, one op row, version 2', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({ ownedSkins: ['default', 'shark'] }));

    const [a, b] = await Promise.all([
      economy.equipSkin(userId, 'equip-key-int-ccccccc1', 'rod', 'shark'),
      economy.equipSkin(userId, 'equip-key-int-ccccccc1', 'rod', 'shark'),
    ]);
    expect(a).toEqual(b);
    expect(a.version).toBe(2);
  });

  it('rejects equipping a skin the account does not own', async () => {
    const userId = await seedUser();
    await gameState.bootstrap(userId, netBlob({}));

    await expect(economy.equipSkin(userId, 'equip-key-int-ddddddd1', 'rod', 'shark')).rejects.toThrow('SKIN_NOT_OWNED');
  });
```

Note: this file already imports `gameStateOperations` and `eq` for the other transactional-op tests (see the `placeAquariumFish` tests above it), so no new imports are needed.

- [ ] **Step 2: Run the test to verify it fails**

This requires a running Postgres (`docker compose up`, `DATABASE_URL`/`TEST_DATABASE_URL` set).

Run: `npm run test:integration`
Expected: FAIL — `economy.equipSkin is not a function` (it will actually pass, since Task 3 already added it — if it fails here, Task 3 was not completed correctly; verify before continuing).

- [ ] **Step 3: Run the full integration suite to confirm**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/gamestate/economyService.integration.test.ts
git commit -m "backend: PG integration tests for the skins/equip op"
```

---

### Task 6: Backend — OpenAPI surface check

**Files:**
- Modify: `backend/src/http/openapi.test.ts`

**Interfaces:**
- Consumes: the two new routes from Tasks 1 and 4.

- [ ] **Step 1: Update the expected path list**

In `backend/src/http/openapi.test.ts`, in the `expected` array inside `'covers the whole API surface'`, replace:

```ts
      '/api/v1/me/economy/aquarium/place',
      '/api/v1/migration/local/preview', '/api/v1/migration/local/import',
      '/api/v1/leaderboard', '/api/v1/seasons/current',
```

with:

```ts
      '/api/v1/me/economy/aquarium/place', '/api/v1/me/economy/skins/equip',
      '/api/v1/me/state/bootstrap',
      '/api/v1/migration/local/preview', '/api/v1/migration/local/import',
      '/api/v1/leaderboard', '/api/v1/seasons/current',
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run backend/src/http/openapi.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/http/openapi.test.ts
git commit -m "backend: openapi surface test covers bootstrap + skins/equip"
```

---

### Task 7: Frontend — `useGameState.ts` equip delegates to the shared pure rule

**Files:**
- Modify: `src/game/useGameState.ts`

**Interfaces:**
- Consumes: `equipSkin` from `src/game/stateRules.ts` (Task 2).
- Produces: no change to `useGameState()`'s returned `equipSkin`/`equipBoatSkin` signatures — both remain `(skinId: string) => void`, so no caller elsewhere needs to change.

- [ ] **Step 1: Import the pure rule**

In `src/game/useGameState.ts`, the top import from `./stateRules` currently reads:

```ts
import {
  applyCatch,
  buyMultiplier as applyMultiplierPurchase,
  buyNet as applyNetPurchase,
  buyOwnedItem,
  consumeNet as applyNetConsumption,
  placeAquariumFish,
  resolveDailyGift,
  sellWarehouse as applyWarehouseSale,
  spinDailyRoulette,
  spinSkinRoulette,
} from './stateRules';
```

Add `equipSkin as applyEquipSkin` (aliased — the file already defines a local function called `equipSkin`), right after `consumeNet as applyNetConsumption`:

```ts
import {
  applyCatch,
  buyMultiplier as applyMultiplierPurchase,
  buyNet as applyNetPurchase,
  buyOwnedItem,
  consumeNet as applyNetConsumption,
  equipSkin as applyEquipSkin,
  placeAquariumFish,
  resolveDailyGift,
  sellWarehouse as applyWarehouseSale,
  spinDailyRoulette,
  spinSkinRoulette,
} from './stateRules';
```

- [ ] **Step 2: Replace the inline equip logic**

Replace:

```ts
  const equipSkin = useCallback((skinId: string) => {
    setPlayer(prev => {
      if (!prev.ownedSkins.includes(skinId)) return prev;
      return { ...prev, activeSkin: skinId };
    });
  }, []);
```

with:

```ts
  const equipSkin = useCallback((skinId: string) => {
    setPlayer(prev => applyEquipSkin(prev, 'rod', skinId));
  }, []);
```

And replace:

```ts
  const equipBoatSkin = useCallback((skinId: string) => {
    setPlayer(prev => {
      if (!prev.ownedBoatSkins.includes(skinId)) return prev;
      return { ...prev, activeBoatSkin: skinId };
    });
  }, []);
```

with:

```ts
  const equipBoatSkin = useCallback((skinId: string) => {
    setPlayer(prev => applyEquipSkin(prev, 'boat', skinId));
  }, []);
```

- [ ] **Step 3: Run the frontend typecheck and existing tests**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS.

Run: `npx vitest run src/test/stateRules.test.ts`
Expected: PASS (unaffected — this task only changes `useGameState.ts`'s wiring, not `stateRules.ts` itself).

Also run any existing test that exercises `useGameState`'s `equipSkin`/`equipBoatSkin` directly if one exists — search `src/test` for `equipSkin` to confirm nothing else needs updating:

Run: `npx vitest run src/test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/game/useGameState.ts
git commit -m "frontend: useGameState equip delegates to the shared equipSkin pure rule"
```

---

### Task 8: Frontend — `endpoints.ts` bootstrap + equip calls

**Files:**
- Modify: `src/api/endpoints.ts`
- Test: `src/api/endpoints.test.ts`

**Interfaces:**
- Produces: `bootstrapGameState(state: unknown): Promise<{ version: number }>` (replaces `putGameState`, drops `baseVersion`). `equipSkin(idempotencyKey: string, kind: 'rod' | 'boat', skinId: string): Promise<GameStateEnvelope>`.

- [ ] **Step 1: Write the failing tests**

In `src/api/endpoints.test.ts`, update the import line to replace `putGameState` with `bootstrapGameState` and add `equipSkin`:

```ts
import { register, login, logout, getMe, getGameState, bootstrapGameState, sellWarehouse, purchaseNet, purchaseMultiplier, purchaseSkin, equipSkin, spinRoulette, spinSkinRoulette, claimDailyGift, placeAquariumFish, castLine, landCatch, getLeaderboard, getCurrentSeason } from './endpoints';
```

Replace the two `putGameState` test cases:

```ts
  it('putGameState PUTs /me/state with { state, baseVersion } and returns the new version', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ version: 4 } as never);
    const out = await putGameState({ schemaVersion: 1, player: { level: 3 } }, 3);
    expect(spy).toHaveBeenCalledWith('/me/state', { method: 'PUT', body: { state: { schemaVersion: 1, player: { level: 3 } }, baseVersion: 3 } });
    expect(out).toEqual({ version: 4 });
    spy.mockRestore();
  });

  it('putGameState sends baseVersion null for a first write', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ version: 1 } as never);
    await putGameState({ schemaVersion: 1, player: { level: 1 } }, null);
    expect(spy).toHaveBeenCalledWith('/me/state', { method: 'PUT', body: { state: { schemaVersion: 1, player: { level: 1 } }, baseVersion: null } });
    spy.mockRestore();
  });
```

with:

```ts
  it('bootstrapGameState POSTs /me/state/bootstrap with { state } and returns the version', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ version: 1 } as never);
    const out = await bootstrapGameState({ schemaVersion: 1, player: { level: 1 } });
    expect(spy).toHaveBeenCalledWith('/me/state/bootstrap', { method: 'POST', body: { state: { schemaVersion: 1, player: { level: 1 } } } });
    expect(out).toEqual({ version: 1 });
    spy.mockRestore();
  });
```

Add a new test near the other `/me/economy/*` cases (e.g., right after `purchaseSkin POSTs ...`):

```ts
  it('equipSkin POSTs /me/economy/skins/equip with the kind, skinId and idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await equipSkin('idem-key-equipequipe', 'rod', 'shark');
    expect(spy).toHaveBeenCalledWith('/me/economy/skins/equip', { method: 'POST', body: { kind: 'rod', skinId: 'shark' }, idempotencyKey: 'idem-key-equipequipe' });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api/endpoints.test.ts`
Expected: FAIL — `bootstrapGameState`/`equipSkin` are not exported yet.

- [ ] **Step 3: Update `src/api/endpoints.ts`**

Replace:

```ts
export function putGameState(state: unknown, baseVersion: number | null): Promise<{ version: number }> {
  return apiFetch('/me/state', { method: 'PUT', body: { state, baseVersion } });
}
```

with:

```ts
export function bootstrapGameState(state: unknown): Promise<{ version: number }> {
  return apiFetch('/me/state/bootstrap', { method: 'POST', body: { state } });
}
```

Add this after `purchaseSkin`:

```ts
export function equipSkin(idempotencyKey: string, kind: 'rod' | 'boat', skinId: string): Promise<GameStateEnvelope> {
  return apiFetch('/me/economy/skins/equip', { method: 'POST', body: { kind, skinId }, idempotencyKey });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/api/endpoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/endpoints.ts src/api/endpoints.test.ts
git commit -m "frontend: bootstrapGameState replaces putGameState; add equipSkin"
```

---

### Task 9: Frontend — simplify `useGameStateSync`

**Files:**
- Modify: `src/game/auth/gameStateSync.ts`
- Test: `src/game/auth/gameStateSync.test.ts`

**Interfaces:**
- Consumes: `bootstrapGameState` from Task 8.
- Produces: `useGameStateSync({ player, enabled, replace })` now returns `{ start, applyServerResult }` — `flushNow` no longer exists.

- [ ] **Step 1: Update the test file's mocks and delete the obsolete describe blocks**

In `src/game/auth/gameStateSync.test.ts`:

Replace the `beforeEach` mock:

```ts
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(endpoints, 'putGameState').mockResolvedValue({ version: 1 });
  vi.spyOn(endpoints, 'getGameState').mockResolvedValue({ state: null, updatedAt: null, version: null });
});
```

with:

```ts
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(endpoints, 'bootstrapGameState').mockResolvedValue({ version: 1 });
  vi.spyOn(endpoints, 'getGameState').mockResolvedValue({ state: null, updatedAt: null, version: null });
});
```

Delete these three `describe` blocks in full:
- `describe('useGameStateSync — debounced push', ...)` (the whole block, including all 7 of its `it`s).
- `describe('useGameStateSync — flushNow', ...)` (the whole block, all 3 `it`s).
- `describe('useGameStateSync — pagehide keepalive', ...)` (the whole block, both `it`s).

In `describe('useGameStateSync — start', ...)`:

Replace the first test:

```ts
  it('seeds the base version from a loaded hydrate', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'loaded', version: 7 });
    const { result, rerender } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    const kind = await result.current.start();
    expect(kind).toBe('loaded');
    rerender({ player: mkPlayer({ level: 2 }), enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoints.putGameState).toHaveBeenLastCalledWith(
      { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 2 }) },
      7,
    );
  });
```

with:

```ts
  it('seeds the base version from a loaded hydrate', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'loaded', version: 7 });
    const { result } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    const kind = await result.current.start();
    expect(kind).toBe('loaded');
    // The seeded version is exercised by the "periodic pull" tests below,
    // which observe it through poll()'s version comparison — there is no
    // more push to observe it through directly.
  });
```

Replace:

```ts
  it('adopts the local save with baseVersion null when the server is empty', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'empty', version: null });
    vi.mocked(endpoints.putGameState).mockResolvedValue({ version: 1 });
    const { result } = mount({ player: mkPlayer({ level: 4, coins: 90 }), enabled: true });
    const kind = await result.current.start();
    expect(kind).toBe('empty');
    expect(endpoints.putGameState).toHaveBeenCalledWith(
      { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 4, coins: 90 }) },
      null,
    );
  });
```

with:

```ts
  it('bootstraps the account with the local save when the server is empty', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'empty', version: null });
    vi.mocked(endpoints.bootstrapGameState).mockResolvedValue({ version: 1 });
    const { result } = mount({ player: mkPlayer({ level: 4, coins: 90 }), enabled: true });
    const kind = await result.current.start();
    expect(kind).toBe('empty');
    expect(endpoints.bootstrapGameState).toHaveBeenCalledWith(
      { schemaVersion: SAVE_SCHEMA_VERSION, player: mkPlayer({ level: 4, coins: 90 }) },
    );
  });
```

Replace:

```ts
  it('returns error and does not write when the hydrate fails', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'error', version: null });
    const { result } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    expect(await result.current.start()).toBe('error');
    expect(endpoints.putGameState).not.toHaveBeenCalled();
  });
```

with:

```ts
  it('returns error and does not write when the hydrate fails', async () => {
    vi.spyOn(hydrateModule, 'hydrateFromServer').mockResolvedValue({ kind: 'error', version: null });
    const { result } = mount({ player: mkPlayer({ level: 1 }), enabled: true });
    expect(await result.current.start()).toBe('error');
    expect(endpoints.bootstrapGameState).not.toHaveBeenCalled();
  });
```

In `describe('useGameStateSync — periodic pull', ...)`, delete the last test in the block, `'skips the poll while a push is in flight'` — there is no more push for a poll to race against. The rest of that `describe` block (the `seedVersion` helper and its other 6 tests) is unchanged — it only ever exercised `GET`.

In `describe('useGameStateSync — applyServerResult', ...)`, in the first test, replace:

```ts
    // a following debounce cycle must not push (dirty-check: the applied state is "already sent")
    rerender({ player: applied as never, enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoints.putGameState).not.toHaveBeenCalled();
```

with:

```ts
    rerender({ player: applied as never, enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoints.bootstrapGameState).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/game/auth/gameStateSync.test.ts`
Expected: FAIL — `endpoints.bootstrapGameState` does not exist as a mockable spy target until the implementation is updated in the next step (or the remaining `push`/`flushNow` references in the implementation make the now-deleted test expectations moot). Confirm the failure is about the implementation still having `flushNow`/push logic, not a typo in the test.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `src/game/auth/gameStateSync.ts` with:

```ts
import { useCallback, useEffect, useRef } from 'react';
import type { PlayerState } from '@/game/types';
import { SAVE_SCHEMA_VERSION, saveSchema } from '@/game/persistence';
import { getGameState, bootstrapGameState } from '@/api/endpoints';
import { hydrateFromServer, type HydrateResult } from './hydrate';

const POLL_MS = 45_000;

interface GameStateEnvelope {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  player: PlayerState;
}

/**
 * Keeps the client's optimistic-concurrency version in sync with the server
 * and adopts cross-device changes:
 * - `start()` (called by `afterAuth`) loads the server blob, replaces local
 *   state, and seeds the base version; on an empty server it bootstraps the
 *   account with the local save (a one-time, create-only write — see
 *   `POST /me/state/bootstrap`).
 * - a background `GET /me/state` every 45s (only while the tab is visible):
 *   if the server version is ahead of ours, another device saved — pull and
 *   replace. Still last-write-wins by blob; no field merge.
 *
 * There is no generic push any more: every mutation for an authenticated
 * user goes through its own validated server op (see `Index.tsx`'s
 * `runEconomyOp`/`runRewardOp`), which already returns the fresh
 * `{ state, version }` for `applyServerResult` to adopt. Nothing is ever
 * "local-only and unpushed," so there is nothing left to debounce, flush on
 * logout, or flush on tab hide.
 */
export function useGameStateSync({
  player,
  enabled,
  replace,
}: {
  player: PlayerState;
  enabled: boolean;
  replace: (updater: (prev: PlayerState) => Partial<PlayerState>) => void;
}): {
  start: () => Promise<HydrateResult['kind']>;
  applyServerResult: (result: { state: unknown; version: number | null }) => void;
} {
  const playerRef = useRef(player);
  playerRef.current = player;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const replaceRef = useRef(replace);
  replaceRef.current = replace;

  const baseVersion = useRef<number | null>(null);
  const busy = useRef(false);

  const envelope = useCallback(
    (): GameStateEnvelope => ({ schemaVersion: SAVE_SCHEMA_VERSION, player: playerRef.current }),
    [],
  );

  /**
   * Adopt a full server player blob as the new local truth: replace local
   * state and seed the optimistic-concurrency base version.
   */
  const adoptServerState = useCallback((player: PlayerState, version: number | null) => {
    replaceRef.current(() => player);
    baseVersion.current = version;
  }, []);

  const resync = useCallback(async () => {
    const res = await hydrateFromServer(replaceRef.current);
    if (res.kind === 'loaded' && res.player) {
      adoptServerState(res.player, res.version);
    } else if (res.kind === 'loaded') {
      baseVersion.current = res.version;
    }
    return res;
  }, [adoptServerState]);

  const applyServerResult = useCallback(
    (result: { state: unknown; version: number | null }) => {
      const parsed = saveSchema.safeParse(result.state);
      if (!parsed.success) {
        console.warn('server economy result failed validation; ignoring');
        return;
      }
      adoptServerState(parsed.data.player, result.version);
    },
    [adoptServerState],
  );

  /** Background check: if the server version is ahead of ours, another device saved. */
  const poll = useCallback(async () => {
    if (!enabledRef.current || busy.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    busy.current = true;
    try {
      const { version } = await getGameState();
      if (version != null && baseVersion.current != null && version > baseVersion.current) {
        console.warn('game state changed on another device; pulling the server state');
        await resync();
      }
    } catch {
      /* transient; the next tick retries */
    } finally {
      busy.current = false;
    }
  }, [resync]);

  const start = useCallback(async (): Promise<HydrateResult['kind']> => {
    const res = await resync();
    if (res.kind === 'empty') {
      try {
        const { version } = await bootstrapGameState(envelope());
        baseVersion.current = version;
      } catch {
        /* best-effort adopt */
      }
    }
    return res.kind;
  }, [envelope, resync]);

  // Background pull: every 45s while enabled and visible, plus one on becoming visible.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => { void poll(); }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, poll]);

  return { start, applyServerResult };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/game/auth/gameStateSync.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the frontend typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: FAIL at this point — `src/pages/Index.tsx` still destructures `flushNow` from `useGameStateSync(...)`, which no longer exists. This is expected; Task 10 fixes it. Do not attempt to fix `Index.tsx` here — keep this task's commit focused on `gameStateSync.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/game/auth/gameStateSync.ts src/game/auth/gameStateSync.test.ts
git commit -m "frontend: gameStateSync drops the generic push/debounce/pagehide machinery"
```

---

### Task 10: Frontend — wire `Index.tsx` to the equip op, drop `flushNow`

**Files:**
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: `useGameStateSync`'s new `{ start, applyServerResult }` return (Task 9), `equipSkin` from `src/api/endpoints.ts` (Task 8), `equipSkin` pure rule via `useGameState()`'s `equipSkin`/`equipBoatSkin` (Task 7 — unchanged call signatures).

- [ ] **Step 1: Import the new endpoint**

Add `equipSkin as equipSkinApi` to the `@/api/endpoints` import list:

```ts
import {
  sellWarehouse as sellWarehouseApi,
  purchaseNet as purchaseNetApi,
  purchaseMultiplier as purchaseMultiplierApi,
  purchaseSkin as purchaseSkinApi,
  equipSkin as equipSkinApi,
  spinRoulette as spinRouletteApi,
  spinSkinRoulette as spinSkinRouletteApi,
  claimDailyGift as claimDailyGiftApi,
  placeAquariumFish as placeAquariumFishApi,
  castLine as castLineApi,
  landCatch as landCatchApi,
  type RewardEnvelope,
} from '@/api/endpoints';
```

- [ ] **Step 2: Drop `flushNow` from the `useGameStateSync` destructure**

Replace:

```ts
  const { flushNow, start: startSync, applyServerResult } = useGameStateSync({ player, enabled: syncEnabled, replace: replaceFromServer });
```

with:

```ts
  const { start: startSync, applyServerResult } = useGameStateSync({ player, enabled: syncEnabled, replace: replaceFromServer });
```

- [ ] **Step 3: Widen `busyOp` and `runEconomyOp`'s op union, drop the flush**

Replace:

```ts
  const [busyOp, setBusyOp] = useState<null | 'sell' | 'net' | 'multiplier' | 'skin' | 'roulette' | 'skinRoulette' | 'dailyGift' | 'aquariumPlace' | 'cast' | 'land'>(null);
```

with:

```ts
  const [busyOp, setBusyOp] = useState<null | 'sell' | 'net' | 'multiplier' | 'skin' | 'equipSkin' | 'roulette' | 'skinRoulette' | 'dailyGift' | 'aquariumPlace' | 'cast' | 'land'>(null);
```

Replace:

```ts
  // A value-granting economy op: anonymous / degraded → the local pure rule;
  // authenticated → flush any pending local mutation FIRST (else the server runs
  // the op on a stale blob and `applyServerResult` overwrites the un-pushed
  // change), then the server op, then adopt its authoritative result. Failure is
  // silent (no toast surface) and leaves local state untouched.
  const runEconomyOp = useCallback(async (
    op: 'sell' | 'net' | 'multiplier' | 'skin' | 'aquariumPlace',
    local: () => void,
    api: (idempotencyKey: string) => Promise<GameStateEnvelope>,
  ) => {
    if (!syncEnabled) { local(); return; }
    setBusyOp(op);
    try {
      await flushNow();
      applyServerResult(await api(crypto.randomUUID()));
    } catch {
      console.warn(`economy op "${op}" failed; state unchanged`);
    } finally {
      setBusyOp(null);
    }
  }, [syncEnabled, flushNow, applyServerResult]);
```

with:

```ts
  // A value-granting economy op: anonymous / degraded → the local pure rule;
  // authenticated → the server op, then adopt its authoritative result. Every
  // authenticated mutation (including cosmetic equip) is its own op, so there
  // is never a pending local-only change to flush first. Failure is silent
  // (no toast surface) and leaves local state untouched.
  const runEconomyOp = useCallback(async (
    op: 'sell' | 'net' | 'multiplier' | 'skin' | 'equipSkin' | 'aquariumPlace',
    local: () => void,
    api: (idempotencyKey: string) => Promise<GameStateEnvelope>,
  ) => {
    if (!syncEnabled) { local(); return; }
    setBusyOp(op);
    try {
      applyServerResult(await api(crypto.randomUUID()));
    } catch {
      console.warn(`economy op "${op}" failed; state unchanged`);
    } finally {
      setBusyOp(null);
    }
  }, [syncEnabled, applyServerResult]);
```

- [ ] **Step 4: Add the equip handlers**

Add these two handlers right after `handleBuyBoatSkin`:

```ts
  const handleEquipSkin = useCallback(
    (skinId: string) => runEconomyOp('equipSkin', () => equipSkin(skinId), key => equipSkinApi(key, 'rod', skinId)),
    [runEconomyOp, equipSkin],
  );
  const handleEquipBoatSkin = useCallback(
    (skinId: string) => runEconomyOp('equipSkin', () => equipBoatSkin(skinId), key => equipSkinApi(key, 'boat', skinId)),
    [runEconomyOp, equipBoatSkin],
  );
```

- [ ] **Step 5: Wire the new handlers into the screen JSX**

Replace:

```ts
    content = <SkinsShop player={player} onBuy={handleBuySkin} buying={busyOp === 'skin'} onEquip={equipSkin} onBack={() => setScreen('menu')} onOpenBoatVisuals={() => setScreen('boatSkins')} />;
```

with:

```ts
    content = <SkinsShop player={player} onBuy={handleBuySkin} buying={busyOp === 'skin'} onEquip={handleEquipSkin} onBack={() => setScreen('menu')} onOpenBoatVisuals={() => setScreen('boatSkins')} />;
```

Replace:

```ts
    content = <BoatSkinsShop player={player} onBuy={handleBuyBoatSkin} buying={busyOp === 'skin'} onEquip={equipBoatSkin} onBack={() => setScreen('skins')} />;
```

with:

```ts
    content = <BoatSkinsShop player={player} onBuy={handleBuyBoatSkin} buying={busyOp === 'skin'} onEquip={handleEquipBoatSkin} onBack={() => setScreen('skins')} />;
```

- [ ] **Step 6: Drop the flush from `runRewardOp`**

Replace:

```ts
  const runRewardOp = useCallback(async (
    op: 'roulette' | 'skinRoulette' | 'dailyGift',
    local: () => RewardGrant,
    api: (idempotencyKey: string) => Promise<RewardEnvelope>,
  ): Promise<RewardGrant | null> => {
    if (!syncEnabled) {
      try { return local(); } catch { return null; }
    }
    setBusyOp(op);
    try {
      await flushNow();
      const res = await api(crypto.randomUUID());
      applyServerResult(res);
      return res.reward;
    } catch {
      console.warn(`reward op "${op}" failed; state unchanged`);
      return null;
    } finally {
      setBusyOp(null);
    }
  }, [syncEnabled, flushNow, applyServerResult]);
```

with:

```ts
  const runRewardOp = useCallback(async (
    op: 'roulette' | 'skinRoulette' | 'dailyGift',
    local: () => RewardGrant,
    api: (idempotencyKey: string) => Promise<RewardEnvelope>,
  ): Promise<RewardGrant | null> => {
    if (!syncEnabled) {
      try { return local(); } catch { return null; }
    }
    setBusyOp(op);
    try {
      const res = await api(crypto.randomUUID());
      applyServerResult(res);
      return res.reward;
    } catch {
      console.warn(`reward op "${op}" failed; state unchanged`);
      return null;
    } finally {
      setBusyOp(null);
    }
  }, [syncEnabled, applyServerResult]);
```

- [ ] **Step 7: Drop the flush from `handleCast`**

Replace:

```ts
    if (syncEnabled) {
      setBusyOp('cast');
      try {
        await flushNow();
        const r = await castLineApi(crypto.randomUUID(), locationId, mode);
```

with:

```ts
    if (syncEnabled) {
      setBusyOp('cast');
      try {
        const r = await castLineApi(crypto.randomUUID(), locationId, mode);
```

And remove `flushNow` from `handleCast`'s dependency array:

```ts
  }, [syncEnabled, flushNow, applyServerResult, player, replaceFromServer]);
```

becomes:

```ts
  }, [syncEnabled, applyServerResult, player, replaceFromServer]);
```

- [ ] **Step 8: Remove the `onBeforeLogout` prop**

Replace:

```ts
    <AuthProvider onAuthenticated={afterAuth} onBeforeLogout={flushNow} onLoggedOut={handleLoggedOut}>
```

with:

```ts
    <AuthProvider onAuthenticated={afterAuth} onLoggedOut={handleLoggedOut}>
```

- [ ] **Step 9: Run the frontend typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS.

- [ ] **Step 10: Run the frontend lint**

Run: `npm run lint`
Expected: 0 errors (same pre-existing warnings as before this task).

- [ ] **Step 11: Run the full frontend test suite**

Run: `npx vitest run src/`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "frontend: wire skin/boat-skin equip through runEconomyOp; drop flushNow"
```

---

### Task 11: Frontend — hide "Resetar Progresso" while authenticated

**Files:**
- Modify: `src/components/game/MainMenu.tsx`
- Modify: `src/test/MainMenu.test.tsx`

**Interfaces:**
- Consumes: `status` from `useAuth()` (already destructured in `MainMenu.tsx`).

- [ ] **Step 1: Make the auth mock in `MainMenu.test.tsx` overridable**

Replace:

```ts
// MainMenu only needs useAuth() to not throw and to report a status. Stub the
// module so these nav/world/chip tests stay fully synchronous — no getMe() on
// mount, no async status transition mid-assertion. AuthProvider has its own suite.
vi.mock('@/game/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    status: 'anonymous' as const,
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));
```

with:

```ts
// MainMenu only needs useAuth() to not throw and to report a status. Stub the
// module so these nav/world/chip tests stay fully synchronous — no getMe() on
// mount, no async status transition mid-assertion. AuthProvider has its own suite.
// `authState` is mutable so individual tests can switch to 'authenticated'.
const authState = vi.hoisted(() => ({
  status: 'anonymous' as 'anonymous' | 'authenticated' | 'loading',
}));

vi.mock('@/game/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    status: authState.status,
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));
```

Add a reset to the existing `beforeEach`:

```ts
beforeEach(() => {
  localStorage.clear();
  cleanup();
  authState.status = 'anonymous';
});
```

- [ ] **Step 2: Write the failing test**

Add this test inside `describe('MainMenu progress reset', ...)`, after the existing `'shows and fires the reset control past level 1'` test:

```ts
  it('hides the reset control while authenticated, even past level 1', () => {
    authState.status = 'authenticated';
    renderMenu({ level: 3 });

    expect(screen.queryByRole('button', { name: /resetar/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/test/MainMenu.test.tsx`
Expected: FAIL — the reset button is still shown at level 3 regardless of `status`.

- [ ] **Step 4: Update `MainMenu.tsx`**

Replace:

```tsx
            {player.level > 1 && (
              <Button onClick={onReset} variant="ghost" size="sm" className="text-muted-foreground">
                {t('menu.reset')}
              </Button>
            )}
```

with:

```tsx
            {player.level > 1 && status !== 'authenticated' && (
              <Button onClick={onReset} variant="ghost" size="sm" className="text-muted-foreground">
                {t('menu.reset')}
              </Button>
            )}
```

(`status` is already destructured from `useAuth()` earlier in this component — it is used one line above for the account-chip label.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/test/MainMenu.test.tsx`
Expected: PASS — all tests in the file, including the pre-existing ones (confirms the mutable mock did not break the anonymous-path tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/game/MainMenu.tsx src/test/MainMenu.test.tsx
git commit -m "frontend: hide the reset-progress control while authenticated"
```

---

### Task 12: Full gate + integration tests + browser smoke

**Files:** none (verification only).

- [ ] **Step 1: Frontend typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS.

- [ ] **Step 2: Backend typecheck**

Run: `npm run backend:typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Full unit test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Integration tests against a real Postgres**

Requires the project's `docker compose up` stack (or any reachable Postgres) with `DATABASE_URL`/`TEST_DATABASE_URL` set, and migrations applied (`npm run backend:db:migrate` — expect "No pending migrations," since this plan makes no schema change).

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 7: Restart the Docker stack's frontend/backend containers**

The dev containers bind-mount the source but do not reliably pick up changes via file-watching on this host.

Run: `docker compose restart frontend backend`

- [ ] **Step 8: Browser smoke (manual, via the running Docker stack)**

Using a fresh account (the dev Postgres is shared with the integration-test run above, which truncates between runs):

1. Register a new account. Confirm in the network trace that the app calls `POST /api/v1/me/state/bootstrap` (not `PUT /api/v1/me/state` — that route no longer exists and would 404).
2. Buy a rod skin, then equip a different owned rod skin from the Skins screen. Confirm `POST /api/v1/me/economy/skins/equip` fires and the equipped skin persists across a page reload (a fresh `GET /api/v1/me/state` shows the new `activeSkin`).
3. Repeat for a boat skin via the Boat Visuals screen.
4. Confirm the "Resetar Progresso" button is **absent** from the main menu while logged in, at any level.
5. Log out, then register a second fresh account and confirm "Resetar Progresso" **is** visible once anonymous progress reaches level 2+.
6. Check the browser console and network trace for the whole session: no errors, and no request to `/api/v1/me/state` with method `PUT` anywhere.

- [ ] **Step 9: Report the gate results and smoke findings before opening a PR**

Per this project's standing rule (`CLAUDE.md`): present the diff/summary and risks, and confirm the branch is ready for `commit-push-pr`, before declaring the task done.
