# Server-authoritative Warehouse Sell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selling the whole warehouse becomes a server-authoritative operation: an authenticated client `POST`s an intent, the server runs the pure `sellWarehouse` rule on its copy of the game-state blob, persists it (version + 1), and returns the new blob; the client adopts it.

**Architecture:** Direction 1 of Task 10.3 — economy operations mutate the `player_game_state` JSON blob transactionally server-side, reusing the Task 10.2 version column and the pure domain rules from `src/game/stateRules.ts` (the backend already imports `src/game/*`). A new `game_state_operations` table records each operation's result keyed by `(user_id, idempotency_key)` for replay. Anonymous users keep the local pure-rule path. This slice does one operation and fixes the pattern for later slices.

**Tech Stack:** Fastify 5 + Drizzle + hand-written SQL migrations; Zod; `@/game/stateRules` + `@/game/data` shared domain; React 18 + `useGameState` / `useGameStateSync`; Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-server-economy-warehouse-sell.md`

## Global Constraints

- **TypeScript strict everywhere. No new `any`.**
- **Backend ESM:** relative imports carry a `.js` suffix even for `.ts` files (`./service.js`). `moduleResolution: NodeNext`. Imports of `src/game/*` from `backend/` match the style already used in `backend/src/catalog/` / `backend/src/fishing/` (verify the exact form in Task 2 Step 3).
- **Zod validation** for every body/query/param on the backend. This endpoint has **no body**; the only input is the `Idempotency-Key` header, validated by a local helper.
- **Backend errors:** `throw new Error('<SNAKE_CASE_CODE>')` for mapped codes, or `AppError`. Body shape always `{ error: { code, message } }`. New code this slice: `GAME_STATE_NOT_FOUND` (409). Reused: `WAREHOUSE_EMPTY` (422), `INVALID_IDEMPOTENCY_KEY` (400), `IDEMPOTENCY_CONFLICT` (409, via `pgConstraint`), `CSRF_FAILED` (403).
- **Migrations:** hand-written `backend/migrations/NNNN_name.sql` are the source of truth; mirror in `backend/src/db/schema.ts`. Run `npm run backend:db:generate` to confirm no unexpected drift. The runner records each applied version in `schema_migrations`.
- **CSRF:** `POST /api/v1/me/economy/warehouse/sell` is a mutation under `/api/v1/` and is NOT exempt — it requires `X-CSRF-Token`.
- **Route auth:** `preHandler: app.requireAuth`; everything scoped to `request.userId` (no id in params/body).
- **Idempotency:** value-granting operations require an `Idempotency-Key` header (16–128 chars) and must be atomic. Replay returns the recorded result without repeating the effect.
- **Frontend:** `@/` alias, no `.js` suffix. API base is the literal `/api/v1`.
- **Commit** at the end of every task. Branch: `feature/task-10-3-economy-warehouse-sell` (current). Only push / open a PR when the user asks.
- **Verification per task:** the task's own tests, plus `npm run backend:typecheck` / `npx tsc --noEmit -p tsconfig.app.json` where the task touches that side. Full `npm test` + `npm run lint` + `npm run build` at the end (Task 7). Integration tests where the task touches them.

---

## File Structure

**Backend — create:**
- `backend/migrations/0017_game_state_operations.sql` — the replay table.
- `backend/src/gamestate/economyService.ts` — memory + pg services for blob economy ops (this slice: `sellWarehouse`).
- `backend/src/gamestate/economyRoutes.ts` — `POST /api/v1/me/economy/warehouse/sell`, thin.
- `backend/src/gamestate/economyRoutes.test.ts` — memory-path route tests (`npm test`).
- `backend/src/gamestate/economyService.integration.test.ts` — real-Postgres transactional + replay + cascade.

**Backend — modify:**
- `backend/src/gamestate/memoryService.ts` — extract a shareable store so the economy memory service mutates the same blobs.
- `backend/src/db/schema.ts` — add `gameStateOperations`.
- `backend/src/http/errors.ts` — add `GAME_STATE_NOT_FOUND`.
- `backend/src/app.ts` — build + wire the economy service (share the memory store).

**Frontend — modify:**
- `src/api/endpoints.ts` — `sellWarehouse(idempotencyKey)`.
- `src/api/endpoints.test.ts` — the wrapper.
- `src/game/auth/gameStateSync.ts` — `applyServerResult`; factor `adoptServerState`.
- `src/game/auth/gameStateSync.test.ts` — `applyServerResult`.
- `src/pages/Index.tsx` — `handleSellWarehouse` + `selling` state, branch on `syncEnabled`.
- `src/components/game/Warehouse.tsx` — `selling?` prop, disable + pending label.
- `src/components/game/Warehouse.test.tsx` — disabled-while-selling (create if absent).
- `PROJECT_MEMORY.md` — record the slice + the pattern.

---

## Task 1: `game_state_operations` table + schema mirror + shareable memory store

**Files:**
- Create: `backend/migrations/0017_game_state_operations.sql`
- Modify: `backend/src/db/schema.ts` (add `gameStateOperations`, add to `schema` export), `backend/src/gamestate/memoryService.ts` (export a store)

**Interfaces:**
- Produces:
  - Drizzle `gameStateOperations` — table `game_state_operations(user_id uuid FK→users ON DELETE CASCADE, idempotency_key text, operation text, result jsonb NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY(user_id, idempotency_key))`.
  - `backend/src/gamestate/memoryService.ts`:
    ```ts
    export type MemoryGameStateEntry = { state: unknown; updatedAt: string; version: number };
    export type MemoryGameStateStore = Map<string, MemoryGameStateEntry>;
    export function createMemoryGameStateStore(): MemoryGameStateStore;
    export function createMemoryGameStateService(store?: MemoryGameStateStore): { get; put };
    ```
    `createMemoryGameStateService()` with no arg still works (creates its own store) so existing callers/tests are unaffected.

- [ ] **Step 1: Write the migration**

`backend/migrations/0017_game_state_operations.sql`:

```sql
CREATE TABLE IF NOT EXISTS game_state_operations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);
```

- [ ] **Step 2: Mirror in `backend/src/db/schema.ts`**

Find the `playerGameState` block (around line 143) and the imports at the top. `primaryKey` and `text` are needed — check they are in the `drizzle-orm/pg-core` import list; add whichever is missing (alphabetical). After the `playerGameState` block add:

```ts
export const gameStateOperations = pgTable('game_state_operations', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  operation: text('operation').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.idempotencyKey] }),
}));
```

Add `gameStateOperations,` to the `schema` export object, after `playerGameState`.

- [ ] **Step 3: Refactor `memoryService.ts` to a shareable store**

Replace the file with:

```ts
export type MemoryGameStateEntry = { state: unknown; updatedAt: string; version: number };
export type MemoryGameStateStore = Map<string, MemoryGameStateEntry>;

export function createMemoryGameStateStore(): MemoryGameStateStore {
  return new Map();
}

/**
 * In-memory game-state store (dev/test without DATABASE_URL). Mirrors the
 * PostgreSQL optimistic-concurrency contract: `put` only writes when
 * `baseVersion` matches the stored version (or is `null` and no row exists),
 * otherwise it throws `STATE_VERSION_CONFLICT`.
 */
export function createMemoryGameStateService(store: MemoryGameStateStore = createMemoryGameStateStore()) {
  return {
    async get(userId: string): Promise<MemoryGameStateEntry | null> {
      return store.get(userId) ?? null;
    },
    async put(userId: string, state: unknown, baseVersion: number | null): Promise<{ version: number }> {
      const current = store.get(userId);
      const expected = current ? current.version : null;
      if (baseVersion !== expected) throw new Error('STATE_VERSION_CONFLICT');
      const version = (current?.version ?? 0) + 1;
      store.set(userId, { state, updatedAt: new Date().toISOString(), version });
      return { version };
    },
  };
}
```

- [ ] **Step 4: Typecheck + drift check**

Run: `npm run backend:typecheck`
Expected: clean (no consumer of the new table yet; `createMemoryGameStateService()` callers unchanged).

Run (needs a Postgres — `docker compose up -d postgres` then `DATABASE_URL=postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure`): `npm run backend:db:migrate && npm run backend:db:generate`
Expected: `Applied 1 migration(s): 0017_game_state_operations`; the generated diff shows only the new table. If no Postgres available, note it — Task 4 + CI apply it.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/0017_game_state_operations.sql backend/src/db/schema.ts backend/src/gamestate/memoryService.ts
git commit -m "backend: game_state_operations table + shareable in-memory game-state store"
```

---

## Task 2: `economyService.ts` — memory + pg `sellWarehouse`

**Files:**
- Create: `backend/src/gamestate/economyService.ts`
- Modify: `backend/src/http/errors.ts` (add `GAME_STATE_NOT_FOUND`)

**Interfaces:**
- Consumes: `MemoryGameStateStore` (Task 1); `Database` from `../db/client.js`; `playerGameState`, `gameStateOperations` from `../db/schema.js`; `saveSchema`, `SAVE_SCHEMA_VERSION`, `SaveEnvelope` from `src/game/persistence`; `sellWarehouse` from `src/game/stateRules`; `LOCATIONS` from `src/game/data`.
- Produces:
  ```ts
  export interface GameStateEconomyService {
    sellWarehouse(userId: string, idempotencyKey: string): Promise<{ state: SaveEnvelope; version: number }>;
  }
  export function createMemoryGameStateEconomyService(store: MemoryGameStateStore): GameStateEconomyService;
  export function createPgGameStateEconomyService(db: Database): GameStateEconomyService;
  ```

- [ ] **Step 1: Add the error code**

`backend/src/http/errors.ts` — in the domain error map (near `STATE_VERSION_CONFLICT`), add:

```ts
GAME_STATE_NOT_FOUND: { status: 409, message: 'No saved game state for this account yet' },
```

- [ ] **Step 2: Write the failing memory-service unit test**

`backend/src/gamestate/economyService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryGameStateStore } from './memoryService.js';
import { createMemoryGameStateEconomyService } from './economyService.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';
import { FISH } from '../../../src/game/data.js';

const withFish = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 3, xp: 0, xpToNextLevel: 300, totalFishCaught: 2,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null,
    warehouse: [
      { fish: FISH[0], weight: 2, location: 'atlantic', timestamp: 1 },
      { fish: FISH[0], weight: 3, location: 'atlantic', timestamp: 2 },
    ],
    coins: 100, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
    ...over,
  },
});

describe('memory game-state economy service — sellWarehouse', () => {
  it('sells: clears the warehouse, adds coins, bumps the version', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withFish(), updatedAt: 'now', version: 4 });
    const svc = createMemoryGameStateEconomyService(store);

    const res = await svc.sellWarehouse('u1', 'idem-key-aaaaaaaaaaaa');

    expect(res.version).toBe(5);
    expect(res.state.player.warehouse).toEqual([]);
    expect(res.state.player.coins).toBeGreaterThan(100);
    expect(store.get('u1')!.version).toBe(5);
  });

  it('replays the same key without moving coins again', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withFish(), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const first = await svc.sellWarehouse('u1', 'idem-key-bbbbbbbbbbbb');
    const replay = await svc.sellWarehouse('u1', 'idem-key-bbbbbbbbbbbb');

    expect(replay).toEqual(first);
    expect(store.get('u1')!.version).toBe(2); // still 2, not 3
  });

  it('rejects an empty warehouse with WAREHOUSE_EMPTY', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withFish({ warehouse: [] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    await expect(svc.sellWarehouse('u1', 'idem-key-cccccccccccc')).rejects.toThrow('WAREHOUSE_EMPTY');
  });

  it('rejects a user with no blob with GAME_STATE_NOT_FOUND', async () => {
    const svc = createMemoryGameStateEconomyService(createMemoryGameStateStore());
    await expect(svc.sellWarehouse('ghost', 'idem-key-dddddddddddd')).rejects.toThrow('GAME_STATE_NOT_FOUND');
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run backend/src/gamestate/economyService.test.ts`
Expected: FAIL — `economyService.js` not found.

First, confirm the `src/game/*` import form: `grep -rn "src/game" backend/src/catalog backend/src/fishing`. Match that exact style (relative `../../../src/game/...js` or a tsconfig path alias) in the test import above and in Step 4.

- [ ] **Step 4: Implement `backend/src/gamestate/economyService.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { gameStateOperations, playerGameState } from '../db/schema.js';
import { SAVE_SCHEMA_VERSION, saveSchema, type SaveEnvelope } from '../../../src/game/persistence.js';
import { sellWarehouse as applyWarehouseSale } from '../../../src/game/stateRules.js';
import { LOCATIONS } from '../../../src/game/data.js';
import type { MemoryGameStateStore } from './memoryService.js';

const OP = 'warehouse_sell';

export interface GameStateEconomyService {
  sellWarehouse(userId: string, idempotencyKey: string): Promise<{ state: SaveEnvelope; version: number }>;
}

type Result = { state: SaveEnvelope; version: number };

/** Runs the pure `sellWarehouse` rule on `envelope.player`. Throws WAREHOUSE_EMPTY. */
function computeSale(envelope: SaveEnvelope): SaveEnvelope['player'] {
  if (envelope.player.warehouse.length === 0) throw new Error('WAREHOUSE_EMPTY');
  return applyWarehouseSale(envelope.player, LOCATIONS);
}

export function createMemoryGameStateEconomyService(store: MemoryGameStateStore): GameStateEconomyService {
  const ops = new Map<string, Result>(); // key: `${userId}:${idempotencyKey}`
  return {
    async sellWarehouse(userId, idempotencyKey) {
      const opKey = `${userId}:${idempotencyKey}`;
      const seen = ops.get(opKey);
      if (seen) return seen;

      const entry = store.get(userId);
      if (!entry) throw new Error('GAME_STATE_NOT_FOUND');
      const envelope = saveSchema.parse(entry.state);
      const nextPlayer = computeSale(envelope);
      const version = entry.version + 1;
      const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: nextPlayer };
      store.set(userId, { state, updatedAt: new Date().toISOString(), version });
      const result: Result = { state, version };
      ops.set(opKey, result);
      return result;
    },
  };
}

export function createPgGameStateEconomyService(db: Database): GameStateEconomyService {
  return {
    async sellWarehouse(userId, idempotencyKey) {
      return db.transaction(async (tx) => {
        const prior = await tx.select({ result: gameStateOperations.result })
          .from(gameStateOperations)
          .where(and(eq(gameStateOperations.userId, userId), eq(gameStateOperations.idempotencyKey, idempotencyKey)))
          .limit(1);
        if (prior[0]) return prior[0].result as Result;

        const rows = await tx.select().from(playerGameState)
          .where(eq(playerGameState.userId, userId)).limit(1).for('update');
        const row = rows[0];
        if (!row) throw new Error('GAME_STATE_NOT_FOUND');

        const envelope = saveSchema.parse(row.state);
        const nextPlayer = computeSale(envelope);
        const version = row.version + 1;
        const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: nextPlayer };

        await tx.update(playerGameState)
          .set({ state, version, updatedAt: new Date() })
          .where(eq(playerGameState.userId, userId));

        const result: Result = { state, version };
        await tx.insert(gameStateOperations).values({ userId, idempotencyKey, operation: OP, result });
        return result;
      });
    },
  };
}
```

Notes:
- `tx.select().for('update')` is Drizzle's row lock (`FOR UPDATE`). If the installed Drizzle version rejects `.for('update')` on the query type, use `tx.execute(sql\`SELECT ... FOR UPDATE\`)` — check how another module locks a row (`grep -rn "for('update')\|FOR UPDATE" backend/src`), match it.
- If `db.insert(...).values({ result })` types reject `result: Result` for the `jsonb` column, cast `result as typeof gameStateOperations.$inferInsert['result']`.
- The `gameStateOperations` PK makes a concurrent same-key insert fail; `http/errors.ts` `pgConstraint` maps a unique/PK violation whose constraint name contains `idempotency`… — the PK is named `game_state_operations_pkey`, which does **not** contain "idempotency". Add `'game_state_operations_pkey'` to the idempotency check in `http/errors.ts` (near line 89, the `idempotency` test) OR name the PK explicitly in the migration: `CONSTRAINT game_state_operations_idempotency_pk PRIMARY KEY (user_id, idempotency_key)` and mirror that name in `schema.ts` (`primaryKey({ name: 'game_state_operations_idempotency_pk', columns: [...] })`). Prefer the explicit constraint name — do it in Task 1 if revisiting, else here.

- [ ] **Step 5: Run the unit test, verify it passes**

Run: `npx vitest run backend/src/gamestate/economyService.test.ts`
Expected: PASS (4).

- [ ] **Step 6: Typecheck**

Run: `npm run backend:typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add backend/src/gamestate/economyService.ts backend/src/gamestate/economyService.test.ts backend/src/http/errors.ts backend/migrations/0017_game_state_operations.sql backend/src/db/schema.ts
git commit -m "backend: blob economy service — transactional warehouse sell with replay"
```

(The migration/schema files re-appear here only if Step 4's note made you rename the PK constraint; otherwise they were committed in Task 1 and `git add` is a no-op for them.)

---

## Task 3: `economyRoutes.ts` + app wiring + route tests

**Files:**
- Create: `backend/src/gamestate/economyRoutes.ts`, `backend/src/gamestate/economyRoutes.test.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `GameStateEconomyService` (Task 2); `app.requireAuth`; `createMemoryGameStateStore` (Task 1).
- Produces: `export function registerGameStateEconomyRoutes(app: FastifyInstance, service: GameStateEconomyService): void`.
  - `POST /api/v1/me/economy/warehouse/sell` → `200 { state, version }`; no `Idempotency-Key` → `400 INVALID_IDEMPOTENCY_KEY`; no cookie → `401`; no `X-CSRF-Token` → `403 CSRF_FAILED`; empty warehouse → `422 WAREHOUSE_EMPTY`.

- [ ] **Step 1: Write the failing route test**

`backend/src/gamestate/economyRoutes.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { registerAndAuth } from '../testing/authClient.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';
import { FISH } from '../../../src/game/data.js';

const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 8090,
  accessTokenSecret: Buffer.from('test-secret-that-is-at-least-32-bytes-long'),
  logLevel: 'silent', accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
  corsOrigins: [], rateLimitMax: 1000, rateLimitWindowMs: 60_000, trustProxy: false, cookieSecure: false,
};
const apps = new Set<Awaited<ReturnType<typeof createApp>>>();
afterEach(async () => { await Promise.all([...apps].map(a => a.close())); apps.clear(); });
async function app() { const a = await createApp({ config }); apps.add(a); return a; }

const blob = (warehouse: unknown[]) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 3, xp: 0, xpToNextLevel: 300, totalFishCaught: warehouse.length,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse,
    coins: 100, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
  },
});
const oneFish = [{ fish: FISH[0], weight: 2, location: 'atlantic', timestamp: 1 }];

async function seed(client: Awaited<ReturnType<typeof registerAndAuth>>, warehouse: unknown[]) {
  const put = await client.request({ method: 'PUT', url: '/api/v1/me/state', payload: { state: blob(warehouse), baseVersion: null } });
  expect(put.statusCode).toBe(200);
}

describe('POST /api/v1/me/economy/warehouse/sell', () => {
  it('sells: warehouse cleared, coins up, version 1 -> 2', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seed(client, oneFish);
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.state.player.warehouse).toEqual([]);
    expect(body.state.player.coins).toBeGreaterThan(100);
  });

  it('replay with the same Idempotency-Key returns the same body, no double credit', async () => {
    const a = await app();
    const client = await registerAndAuth(a); // registerAndAuth sends a fixed Idempotency-Key on mutations
    await seed(client, oneFish);
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell' });
    expect(replay.json()).toEqual(first.json());
    const get = await client.request({ method: 'GET', url: '/api/v1/me/state' });
    expect(get.json().version).toBe(2);
  });

  it('empty warehouse -> 422 WAREHOUSE_EMPTY', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seed(client, []);
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('WAREHOUSE_EMPTY');
  });

  it('no session -> 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/economy/warehouse/sell' });
    expect(res.statusCode).toBe(401);
  });

  it('no X-CSRF-Token -> 403 CSRF_FAILED', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'e@example.com', password: 'a-very-strong-password', username: 'econ_user', country: 'br' } });
    const jar: Record<string, string> = {};
    for (const c of ([] as string[]).concat(reg.headers['set-cookie'] as string[])) {
      const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1);
    }
    const res = await a.inject({
      method: 'POST', url: '/api/v1/me/economy/warehouse/sell',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'idempotency-key': 'idem-key-eeeeeeeeeeee' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');
  });

  it('no Idempotency-Key -> 400 INVALID_IDEMPOTENCY_KEY', async () => {
    const a = await app();
    const reg = await a.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'e2@example.com', password: 'a-very-strong-password', username: 'econ_user2', country: 'br' } });
    const jar: Record<string, string> = {};
    for (const c of ([] as string[]).concat(reg.headers['set-cookie'] as string[])) {
      const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1);
    }
    const res = await a.inject({
      method: 'POST', url: '/api/v1/me/economy/warehouse/sell',
      cookies: { dbl_at: jar.dbl_at, dbl_csrf: jar.dbl_csrf },
      headers: { 'x-csrf-token': jar.dbl_csrf },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });
});
```

Before running: open `backend/src/testing/authClient.ts` and confirm `registerAndAuth`'s client sends an `Idempotency-Key` on `POST`/`PUT` automatically (it was built for exactly this in Task 10.1). If it only sends on some verbs, the "sells" and "replay" tests need `headers: { 'idempotency-key': 'idem-key-...' }` added to the `client.request` calls — and for "replay", the **same** key both times.

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run backend/src/gamestate/economyRoutes.test.ts`
Expected: FAIL — route not registered (404).

- [ ] **Step 3: Implement `backend/src/gamestate/economyRoutes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { GameStateEconomyService } from './economyService.js';

function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.length < 16 || value.length > 128) {
    throw new Error('INVALID_IDEMPOTENCY_KEY');
  }
  return value;
}

export function registerGameStateEconomyRoutes(app: FastifyInstance, service: GameStateEconomyService): void {
  app.post('/api/v1/me/economy/warehouse/sell', {
    schema: { tags: ['gamestate'], summary: 'Sell the whole warehouse (needs Idempotency-Key)' },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.sellWarehouse(request.userId, idempotencyKey(request.headers['idempotency-key']));
  });
}
```

- [ ] **Step 4: Wire into `backend/src/app.ts`**

- Imports (near the other gamestate imports, ~line 37-39):
  ```ts
  import { registerGameStateEconomyRoutes } from './gamestate/economyRoutes.js';
  import { createMemoryGameStateEconomyService, createPgGameStateEconomyService } from './gamestate/economyService.js';
  ```
  Also add `createMemoryGameStateStore` to the existing `import { ... } from './gamestate/memoryService.js'`.
- Replace the `gameStateService` line (~113) so the memory store is shared:
  ```ts
  const memoryGameStateStore = database ? undefined : createMemoryGameStateStore();
  const gameStateService = database
    ? createPgGameStateService(database)
    : createMemoryGameStateService(memoryGameStateStore);
  const gameStateEconomyService = database
    ? createPgGameStateEconomyService(database)
    : createMemoryGameStateEconomyService(memoryGameStateStore!);
  ```
- Register after `registerGameStateRoutes(app, gameStateService);` (~line 120):
  ```ts
  registerGameStateEconomyRoutes(app, gameStateEconomyService);
  ```

- [ ] **Step 5: Run the route test, verify it passes**

Run: `npx vitest run backend/src/gamestate/economyRoutes.test.ts`
Expected: PASS (6).

- [ ] **Step 6: Full backend unit suite + typecheck**

Run: `npm run backend:typecheck && npx vitest run backend/`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/gamestate/economyRoutes.ts backend/src/gamestate/economyRoutes.test.ts backend/src/app.ts
git commit -m "backend: POST /api/v1/me/economy/warehouse/sell"
```

---

## Task 4: Integration test (real Postgres)

**Files:**
- Create: `backend/src/gamestate/economyService.integration.test.ts`

**Interfaces:**
- Consumes: `createPgGameStateEconomyService` (Task 2); `createPgGameStateService` (to seed a blob row); the pg harness (`backend/src/testing/pgHarness.ts`); `createPgAuthRepository` (to create a user).

- [ ] **Step 1: Write the integration test**

Follow the shape of `backend/src/gamestate/pgRepository.integration.test.ts` (same harness import, `beforeAll` creates `createTestDatabase()`, `afterEach` truncates, a `seedUser()` helper via `createPgAuthRepository`). Cover:

```ts
it('sells transactionally: warehouse cleared, coins up, version +1, one operation row', async () => {
  const userId = await seedUser();
  await gameState.put(userId, blob(oneFish), null);           // version 1
  const res = await economy.sellWarehouse(userId, 'idem-key-int-aaaaaaaa');
  expect(res.version).toBe(2);
  expect(res.state.player.warehouse).toEqual([]);
  expect(res.state.player.coins).toBeGreaterThan(100);
  const got = await gameState.get(userId);
  expect(got!.version).toBe(2);
  const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
  expect(ops).toHaveLength(1);
});

it('replays the same key: identical result, still one row, blob untouched by the replay', async () => {
  const userId = await seedUser();
  await gameState.put(userId, blob(oneFish), null);
  const first = await economy.sellWarehouse(userId, 'idem-key-int-bbbbbbbb');
  const replay = await economy.sellWarehouse(userId, 'idem-key-int-bbbbbbbb');
  expect(replay).toEqual(first);
  const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
  expect(ops).toHaveLength(1);
  expect((await gameState.get(userId))!.version).toBe(2);
});

it('empty warehouse -> WAREHOUSE_EMPTY, nothing written', async () => {
  const userId = await seedUser();
  await gameState.put(userId, blob([]), null);
  await expect(economy.sellWarehouse(userId, 'idem-key-int-cccccccc')).rejects.toThrow('WAREHOUSE_EMPTY');
  expect((await gameState.get(userId))!.version).toBe(1);
  const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
  expect(ops).toHaveLength(0);
});

it('deleting the user cascades game_state_operations', async () => {
  const userId = await seedUser();
  await gameState.put(userId, blob(oneFish), null);
  await economy.sellWarehouse(userId, 'idem-key-int-dddddddd');
  await harness.db.delete(users).where(eq(users.id, userId));
  const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
  expect(ops).toHaveLength(0);
});
```

Use the same `blob(warehouse)` / `oneFish` helpers as the route test (copy them in; small duplication across test files is fine here). Import `gameStateOperations`, `users` from `../db/schema.js`, `eq` from `drizzle-orm`.

- [ ] **Step 2: Run it (needs Postgres)**

Run: `npm run backend:db:migrate && npm run test:integration -- backend/src/gamestate/economyService.integration.test.ts`
Expected: PASS (4). If no Postgres in this environment, note it — CI's `integration` job runs it.

- [ ] **Step 3: Commit**

```bash
git add backend/src/gamestate/economyService.integration.test.ts
git commit -m "backend: integration test for the blob warehouse sell (txn, replay, cascade)"
```

---

## Task 5: Frontend endpoint wrapper

**Files:**
- Modify: `src/api/endpoints.ts`, `src/api/endpoints.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (existing); `GameStateEnvelope` from `./types`.
- Produces: `export function sellWarehouse(idempotencyKey: string): Promise<GameStateEnvelope>;`

- [ ] **Step 1: Write the failing test**

In `src/api/endpoints.test.ts`, add `sellWarehouse` to the import from `./endpoints` and:

```ts
it('sellWarehouse POSTs /me/economy/warehouse/sell with the idempotency key', async () => {
  const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({ state: {}, updatedAt: null, version: 2 } as never);
  await sellWarehouse('idem-key-0123456789');
  expect(spy).toHaveBeenCalledWith('/me/economy/warehouse/sell', { method: 'POST', idempotencyKey: 'idem-key-0123456789' });
  spy.mockRestore();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/api/endpoints.test.ts`
Expected: FAIL — `sellWarehouse` not exported.

- [ ] **Step 3: Implement**

`src/api/endpoints.ts` — after `putGameState`:

```ts
export function sellWarehouse(idempotencyKey: string): Promise<GameStateEnvelope> {
  return apiFetch('/me/economy/warehouse/sell', { method: 'POST', idempotencyKey });
}
```

- [ ] **Step 4: Run the test, verify it passes; typecheck**

Run: `npx vitest run src/api/endpoints.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/endpoints.ts src/api/endpoints.test.ts
git commit -m "frontend: sellWarehouse endpoint wrapper"
```

---

## Task 6: `applyServerResult` in `useGameStateSync`

**Files:**
- Modify: `src/game/auth/gameStateSync.ts`, `src/game/auth/gameStateSync.test.ts`

**Interfaces:**
- Consumes: `saveSchema`, `SAVE_SCHEMA_VERSION` from `@/game/persistence`; the existing `replaceRef`, `baseVersion`, `lastSent`, `stableStringify`.
- Produces: the hook return gains `applyServerResult(result: { state: unknown; version: number | null }): void`.

- [ ] **Step 1: Write the failing test**

In `src/game/auth/gameStateSync.test.ts`, add a block:

```ts
describe('useGameStateSync — applyServerResult', () => {
  const validEnvelope = (over: Record<string, unknown> = {}) => ({
    schemaVersion: SAVE_SCHEMA_VERSION,
    player: {
      level: 7, xp: 60, xpToNextLevel: 700, totalFishCaught: 20,
      collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
      coins: 900, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
      luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
      aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
      dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 10,
      ...over,
    },
  });

  it('replaces local state, seeds the base version, and does not trigger a PUT', async () => {
    const replace = vi.fn();
    const { result, rerender } = renderHook(
      ({ player, enabled }) => useGameStateSync({ player, enabled, replace }),
      { initialProps: { player: mkPlayer({ level: 1 }) as never, enabled: true } },
    );
    result.current.applyServerResult({ state: validEnvelope({ coins: 1234 }), version: 9 });
    expect(replace).toHaveBeenCalledTimes(1);
    const applied = replace.mock.calls[0][0]({ level: 1 });
    expect(applied).toMatchObject({ coins: 1234, level: 7 });

    // a following debounce cycle must not push (dirty-check: the applied state is "already sent")
    rerender({ player: applied as never, enabled: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoints.putGameState).not.toHaveBeenCalled();
  });

  it('ignores an invalid envelope', () => {
    const replace = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(
      ({ player, enabled }) => useGameStateSync({ player, enabled, replace }),
      { initialProps: { player: mkPlayer({ level: 1 }) as never, enabled: true } },
    );
    result.current.applyServerResult({ state: { schemaVersion: 1, player: { level: 0 } }, version: 3 });
    expect(replace).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/game/auth/gameStateSync.test.ts`
Expected: FAIL — `applyServerResult` is not a function.

- [ ] **Step 3: Implement**

In `src/game/auth/gameStateSync.ts`:

- Factor the reseed used by `resync`'s `loaded` branch into a helper (place it near `resync`):
  ```ts
  const adoptServerState = useCallback((player: PlayerState, version: number | null) => {
    replaceRef.current(() => player);
    baseVersion.current = version;
    lastSent.current = stableStringify({ schemaVersion: SAVE_SCHEMA_VERSION, player });
  }, []);
  ```
- Rewrite `resync`'s `loaded` branch to call it:
  ```ts
  if (res.kind === 'loaded' && res.player) {
    adoptServerState(res.player, res.version);
  } else if (res.kind === 'loaded') {
    baseVersion.current = res.version;
    lastSent.current = null;
  }
  ```
  (`hydrateFromServer` already called `replace` itself; calling `replaceRef.current` again with the same player is idempotent for `replaceFromServer`'s merge. If double-applying is a concern, have `resync` skip the `replace` inside `adoptServerState` — but the merge of an identical full player is a no-op, so leave it.)
- Add `applyServerResult`:
  ```ts
  const applyServerResult = useCallback((result: { state: unknown; version: number | null }) => {
    const parsed = saveSchema.safeParse(result.state);
    if (!parsed.success) {
      console.warn('server economy result failed validation; ignoring');
      return;
    }
    adoptServerState(parsed.data.player, result.version);
  }, [adoptServerState]);
  ```
- Add `applyServerResult` to the returned object and the return type.

- [ ] **Step 4: Run the test + the whole file, verify green; typecheck**

Run: `npx vitest run src/game/auth/gameStateSync.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS (all), clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/auth/gameStateSync.ts src/game/auth/gameStateSync.test.ts
git commit -m "frontend: useGameStateSync.applyServerResult (adopt a server economy result)"
```

---

## Task 7: Wire the sell + `Warehouse` pending state + full verification

**Files:**
- Modify: `src/pages/Index.tsx`, `src/components/game/Warehouse.tsx`
- Create/Modify: `src/components/game/Warehouse.test.tsx`
- Modify: `PROJECT_MEMORY.md`

**Interfaces:**
- Consumes: `sellWarehouse` from `@/api/endpoints` (Task 5); `applyServerResult` from `useGameStateSync` (Task 6); the existing `syncEnabled` state and local `sellWarehouse` from `useGameState`.

- [ ] **Step 1: `Warehouse.tsx` — add the `selling` prop (write the failing test first)**

`src/components/game/Warehouse.test.tsx` — if the file exists, add the test; if not, create it following the shape of another component test (e.g. `src/components/game/Aquarium.test.tsx` — same render helpers, i18n wrapper):

```ts
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/game/i18n';
import Warehouse from './Warehouse';

const player = { warehouse: [{ fish: { rarity: 'common', xp: 10 }, weight: 1, location: 'atlantic', timestamp: 1 }] } as never;

it('disables the sell button while a sale is in flight', () => {
  render(<I18nProvider><Warehouse player={player} selling onSell={() => {}} onBack={() => {}} /></I18nProvider>);
  const btn = screen.getByRole('button', { name: /XP/ });   // the sell-all button carries "· +N XP · 💰 +N"
  expect(btn).toBeDisabled();
});

it('enables the sell button when not selling and the warehouse has fish', () => {
  render(<I18nProvider><Warehouse player={player} onSell={() => {}} onBack={() => {}} /></I18nProvider>);
  expect(screen.getByRole('button', { name: /XP/ })).toBeEnabled();
});
```

Run: `npx vitest run src/components/game/Warehouse.test.tsx`
Expected: FAIL — `selling` prop does nothing yet (button not disabled).

- [ ] **Step 2: Implement the `selling` prop**

`src/components/game/Warehouse.tsx`:
- Add `selling?: boolean;` to `Props`.
- On the sell-all button: `disabled={selling || player.warehouse.length === 0}`.
- While `selling`, render a pending label (reuse an existing i18n key if there is one for "a processar…"/"…"; otherwise keep the existing label — the disabled state is the required behavior, the label is cosmetic and must not add an untranslated string. If you add a key, add it to all 6 locales in `src/game/i18n.tsx`).

Run: `npx vitest run src/components/game/Warehouse.test.tsx`
Expected: PASS (2).

- [ ] **Step 3: Wire `handleSellWarehouse` in `Index.tsx`**

- Add to the imports: `import { sellWarehouse as sellWarehouseApi } from '@/api/endpoints';` (alias to avoid clashing with the `useGameState` `sellWarehouse`).
- Get `applyServerResult` from the hook: change `const { flushNow, start: startSync } = useGameStateSync(...)` to also destructure `applyServerResult`.
- Add state + handler (near the other handlers, before `content` is built):
  ```ts
  const [selling, setSelling] = useState(false);
  const handleSellWarehouse = useCallback(async () => {
    if (!syncEnabled) { sellWarehouse(); return; }
    setSelling(true);
    try {
      applyServerResult(await sellWarehouseApi(crypto.randomUUID()));
    } catch {
      console.warn('warehouse sell failed; state unchanged');
    } finally {
      setSelling(false);
    }
  }, [syncEnabled, sellWarehouse, applyServerResult]);
  ```
- In the `screen === 'warehouse'` branch, change `onSell={sellWarehouse}` to `onSell={handleSellWarehouse}` and add `selling={selling}`.

- [ ] **Step 4: Typecheck + lint + full frontend suite**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npx vitest run src/`
Expected: clean, 0 lint errors, all green.

- [ ] **Step 5: Full verification**

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

- [ ] **Step 6: Container smoke test**

`docker compose up -d --build` (backend image rebuilds — new module, no new deps). In the browser at `http://localhost:8080`:
1. Log in. Fish or use an existing account with warehouse fish (or `PUT` a blob with a `warehouse` via DevTools console using the `/api/v1/me/state` shape).
2. Open the warehouse, click "sell all". DevTools → Network: `POST /api/v1/me/economy/warehouse/sell` → `200`. The button is briefly disabled. Coins jump, warehouse empties, **no** `PUT /api/v1/me/state` fires afterwards (dirty-check).
3. `POST` the same endpoint again from the console with the **same** `Idempotency-Key` → identical body, coins unchanged.
4. Log out → the account keeps the sold state on next login.
5. As an anonymous user (log out, clear the session), selling still works locally.

- [ ] **Step 7: Update `PROJECT_MEMORY.md`**

Append a `### Task 10.3 fatia 1 — venda do armazém server-autoritativa — 2026-09-07` section: the `game_state_operations` replay table, `POST /api/v1/me/economy/warehouse/sell` (server runs `stateRules.sellWarehouse` on the blob in a txn, version + 1, returns `{ state, version }`), `useGameStateSync.applyServerResult`, `Index.tsx` branches on `syncEnabled` (server) vs local pure rule (anonymous). State the **pattern** for later economy slices (nets/multipliers/skins/roulettes/gifts/catch/aquarium). Note the spec + plan paths. Note that the dormant `/api/v1/economy/*` + `/api/v1/inventory/*` endpoints and tables are now superseded for the logged-in path and pending a later cleanup.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Index.tsx src/components/game/Warehouse.tsx src/components/game/Warehouse.test.tsx PROJECT_MEMORY.md
git commit -m "frontend: warehouse sell goes through the server when authenticated"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| A1 — `game_state_operations` migration + schema mirror | 1 |
| A1 — shareable memory store | 1 |
| A2 — `economyService` memory + pg `sellWarehouse` (replay, FOR UPDATE, txn) | 2 |
| A3 — `POST /api/v1/me/economy/warehouse/sell` (requireAuth, CSRF, Idempotency-Key) | 3 |
| A4 — `app.ts` wiring, shared memory store | 3 |
| A5 — `GAME_STATE_NOT_FOUND` error code | 2 |
| A6 — route tests (sell, replay, empty, 401, 403, 400) | 3 |
| A6 — integration test (txn, replay, empty, cascade) | 4 |
| B1 — `sellWarehouse` endpoint wrapper | 5 |
| B2 — `applyServerResult` (parse, replace, reseed, no PUT) + `adoptServerState` factor | 6 |
| B3 — `Index.tsx` `handleSellWarehouse`, branch on `syncEnabled` | 7 |
| B4 — `Warehouse.tsx` `selling` prop | 7 |
| B5 — frontend tests (endpoint, applyServerResult, Warehouse disabled) | 5, 6, 7 |
| Pattern documented | 7 (PROJECT_MEMORY) |

No gaps.

**2. Placeholder scan**

- Task 2 Step 4 and Task 3 Step 1 name concrete verification checks ("confirm the `src/game/*` import form", "confirm `registerAndAuth` sends `Idempotency-Key`") with a concrete fallback each — real checks the implementer resolves in one grep / one file open, not deferred work.
- Task 2 Step 4 leaves the PK-constraint-name decision with a stated default ("prefer the explicit constraint name") and both paths spelled out — a decision, not a TODO.
- Task 7 Step 2 leaves the pending *label* cosmetic ("must not add an untranslated string; if you add a key, add all 6 locales") — the required behavior (disabled button) is fully specified and tested.
- No "TODO" / "similar to Task N" / bare "add error handling".

**3. Type consistency**

- `GameStateEconomyService.sellWarehouse` → `Promise<{ state: SaveEnvelope; version: number }>` — Task 2 defines it; Task 3 route returns it verbatim; Task 5 wrapper types it as `Promise<GameStateEnvelope>` (`{ state: unknown; updatedAt: string | null; version: number | null }` — the route omits `updatedAt`, which is fine: `GameStateEnvelope.updatedAt` is nullable and unused by `applyServerResult`). Consistent.
- `applyServerResult(result: { state: unknown; version: number | null })` — Task 6 defines; Task 7 passes the Task 5 wrapper's resolved value (`GameStateEnvelope`, whose `state: unknown` and `version: number | null` match). Consistent.
- `MemoryGameStateStore` — Task 1 produces (`Map<string, MemoryGameStateEntry>`), Task 2 consumes, Task 3 wires via `createMemoryGameStateStore()`. Consistent.
- `adoptServerState(player: PlayerState, version: number | null)` — Task 6 internal; used by both `resync` and `applyServerResult`. Consistent.
- `createMemoryGameStateService(store?)` — Task 1 makes `store` optional so existing zero-arg callers (other tests, and the `database ?` ternary when it takes the store) keep working. Task 3 passes the shared store. Consistent.

Fixes applied inline: none needed.
