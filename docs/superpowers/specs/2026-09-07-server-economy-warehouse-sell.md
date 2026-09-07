# Server-authoritative economy — warehouse sell (Task 10.3, slice 1) — design

## Context

The frontend computes all economy locally (`src/game/stateRules.ts`) and persists the
whole `PlayerState` as a JSON blob in `player_game_state` (Task 10.2). The backend has
economy endpoints (`/api/v1/economy/*`, `/api/v1/inventory/*`) but they operate on
separate structured tables (`wallets`, `warehouse_fish`, …) that are disconnected from
the blob, and the client never calls them.

Task 10.3 makes the economy **server-authoritative**. Direction chosen (user, 2026-09-07):
**Direction 1 — economy operations mutate the blob transactionally server-side**, keeping
the blob as the single source of truth and reusing the Task 10.2 version guard. The
existing table-based `/economy/*` and `/inventory/*` endpoints stay dormant (like the
`/migration/local/*` endpoints) and are removed in a later cleanup.

This slice does **one** operation end-to-end — **sell the whole warehouse** — and fixes
the pattern every later economy slice follows.

## The pattern

```
Client (authenticated)                       Server
─────────────────────                        ──────
POST /api/v1/me/economy/<op>      ─────▶      requireAuth + CSRF + Idempotency-Key
  header: Idempotency-Key                     ├─ replay? → return the recorded result
  (no body for parameterless ops)             ├─ load player_game_state row FOR UPDATE
                                              ├─ saveSchema.parse(row.state)
                                              ├─ run the pure rule from src/game/stateRules.ts
                                              ├─ domain guard fails → 4xx, nothing written
                                              ├─ write blob + version = version + 1
                                              ├─ record the operation (idempotency)
                                              └─ commit
              ◀─────  200 { state, version }
applyServerResult({ state, version }):
  saveSchema.parse → replace local state → reseed baseVersion → mark as already-sent
```

Anonymous users keep the local pure-rule path unchanged (`useGameState.sellWarehouse`).

## A — Backend

### A1. Migration + schema

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

Mirror in `backend/src/db/schema.ts` as `gameStateOperations` (composite PK via
`primaryKey({ columns: [...] })`), added to the `schema` export object.

`result` holds `{ state: <envelope>, version: <int> }` — the exact 200 body, so a replay
returns byte-for-byte what the first call returned.

### A2. `backend/src/gamestate/economyService.ts`

```ts
export interface GameStateEconomyService {
  sellWarehouse(userId: string, idempotencyKey: string): Promise<{ state: SaveEnvelope; version: number }>;
}
export function createMemoryGameStateEconomyService(store: MemoryGameStateStore): GameStateEconomyService;
export function createPgGameStateEconomyService(db: Database): GameStateEconomyService;
```

- Consumes: `saveSchema` / `SaveEnvelope` from `src/game/persistence`; `sellWarehouse`
  from `src/game/stateRules`; `LOCATIONS` from `src/game/data`.
- **PG** — one `db.transaction`:
  1. `SELECT result FROM game_state_operations WHERE user_id = $1 AND idempotency_key = $2` → if found, return it (no work).
  2. `SELECT * FROM player_game_state WHERE user_id = $1 FOR UPDATE`. No row → `throw new Error('GAME_STATE_NOT_FOUND')` (new code → 409; the client always has a row after `afterAuth`).
  3. `const parsed = saveSchema.parse(row.state)`.
  4. `parsed.player.warehouse.length === 0` → `throw new Error('WAREHOUSE_EMPTY')` (422, already mapped).
  5. `const nextPlayer = sellWarehouse(parsed.player, LOCATIONS);`
  6. `const nextVersion = row.version + 1;`
  7. `UPDATE player_game_state SET state = $newEnvelope, version = $nextVersion, updated_at = now() WHERE user_id = $1`.
  8. `const result = { state: { schemaVersion: SAVE_SCHEMA_VERSION, player: nextPlayer }, version: nextVersion };`
  9. `INSERT INTO game_state_operations (user_id, idempotency_key, operation, result) VALUES ($1, $2, 'warehouse_sell', $result)` — PK collision (concurrent same key) → surfaces as `IDEMPOTENCY_CONFLICT` (409, already mapped in `http/errors.ts` via `pgConstraint`).
  10. commit, return `result`.
- **Memory** — a `Map<userId, Map<key, result>>` for replay + the shared in-memory blob
  store; same guard order; no real atomicity needed for dev/test.

The memory blob store is currently private to `createMemoryGameStateService`. Refactor
`backend/src/gamestate/memoryService.ts` to export the `Map` (or a small store object
with `get`/`set`) so both services share it, wired once in `app.ts`.

### A3. `backend/src/gamestate/economyRoutes.ts`

```ts
export function registerGameStateEconomyRoutes(app: FastifyInstance, service: GameStateEconomyService): void
```

- `POST /api/v1/me/economy/warehouse/sell`
  - `schema: { tags: ['gamestate'], summary: 'Sell the whole warehouse (needs Idempotency-Key)' }`
  - `preHandler: app.requireAuth`
  - handler: `service.sellWarehouse(request.userId, idempotencyKey(request.headers['idempotency-key']))`
  - `idempotencyKey(value)` — same local helper as `inventory/routes.ts` (string, 16–128 chars, else `throw new Error('INVALID_IDEMPOTENCY_KEY')` → 400).
- CSRF: it is a `POST` under `/api/v1/` and not in the exempt list → `X-CSRF-Token` required automatically.
- Response: `200 { state, version }`.

### A4. `backend/src/app.ts`

- import `registerGameStateEconomyRoutes`, `createMemoryGameStateEconomyService`, `createPgGameStateEconomyService`.
- Build alongside `gameStateService` (share the memory store), register after `registerGameStateRoutes`.

### A5. New error code

`http/errors.ts` — add `GAME_STATE_NOT_FOUND: { status: 409, message: 'No saved game state for this account yet' }`.

### A6. Backend tests

`backend/src/gamestate/economyRoutes.test.ts` (memory path, under `npm test`):
- register+auth, seed a blob via `PUT /me/state` with a non-empty `warehouse`, then:
  - sell → `200`; `body.state.player.warehouse` is `[]`; `body.state.player.coins` increased by `Σ FISH_COIN_VALUE`; `body.version` is the seeded version + 1.
  - replay the same `Idempotency-Key` → identical `body`; coins did **not** move again.
  - a *different* key after the first sell (warehouse now empty) → `422 WAREHOUSE_EMPTY`.
  - no `Idempotency-Key` header → `400 INVALID_IDEMPOTENCY_KEY`.
  - no `X-CSRF-Token` → `403 CSRF_FAILED`.
  - no session → `401`.

`backend/src/gamestate/economyService.integration.test.ts` (real Postgres):
- seed a user + a `player_game_state` row (non-empty warehouse) via the pg gamestate
  service; `sellWarehouse` → warehouse cleared, coins up, `version` +1, one
  `game_state_operations` row; replay → same result, still one row, blob unchanged;
  deleting the user cascades both tables.

## B — Frontend

### B1. `src/api/endpoints.ts`

```ts
export function sellWarehouse(idempotencyKey: string): Promise<GameStateEnvelope> {
  return apiFetch('/me/economy/warehouse/sell', { method: 'POST', idempotencyKey });
}
```

`apiFetch` already sends `Idempotency-Key` for non-GET when `idempotencyKey` is passed,
and does **not** set `Content-Type` when there is no body (so the empty POST is fine).

### B2. `src/game/auth/gameStateSync.ts` — `applyServerResult`

```ts
applyServerResult(result: { state: unknown; version: number | null }): void
```

- `saveSchema.safeParse(result.state)`; on failure `console.warn` and return (leave local state).
- `replaceRef.current(() => parsed.player)`.
- `baseVersion.current = result.version`.
- `lastSent.current = stableStringify({ schemaVersion: SAVE_SCHEMA_VERSION, player: parsed.player })`.
- No PUT — the server already persisted. (Same body the `resync`-on-`loaded` path writes;
  factor a private `adoptServerState(player, version)` helper used by both.)

Hook return becomes `{ flushNow, start, applyServerResult }`.

### B3. Wiring — `src/pages/Index.tsx`

`IndexInner` is the component that *renders* `<AuthProvider>` (the provider wraps
`content`), so `IndexInner` itself cannot call `useAuth()`. It does not need to: it
already owns `syncEnabled` local state, set `true` only after `afterAuth`'s `startSync()`
succeeds. `syncEnabled` **is** the "the server is the authority right now" signal — the
sell branches on it, not on auth status:

```ts
const [selling, setSelling] = useState(false);
const handleSellWarehouse = async () => {
  if (!syncEnabled) { sellWarehouse(); return; }        // anonymous or degraded → local pure rule
  setSelling(true);
  try {
    const res = await endpoints.sellWarehouse(crypto.randomUUID());
    applyServerResult(res);
  } catch {
    console.warn('warehouse sell failed; state unchanged');   // no toast surface yet
  } finally {
    setSelling(false);
  }
};
```

- Pass `onSell={handleSellWarehouse}` and `selling={selling}` to `<Warehouse>`.
- `crypto.randomUUID()` is already used elsewhere in the client (was in `importFlow`); available in all target browsers.

### B4. `src/components/game/Warehouse.tsx`

- New optional prop `selling?: boolean`. The sell button is `disabled={selling || player.warehouse.length === 0}` and shows a pending label while `selling`.

### B5. Frontend tests

- `src/api/endpoints.test.ts` — `sellWarehouse('key…')` calls `apiFetch('/me/economy/warehouse/sell', { method: 'POST', idempotencyKey: 'key…' })`.
- `src/game/auth/gameStateSync.test.ts` — `applyServerResult({ state: <valid envelope>, version: 9 })` → calls `replace`, sets base version to 9, and a following debounce does **not** PUT (dirty-check); an invalid envelope → no `replace`, `console.warn`.
- `src/components/game/Warehouse.test.tsx` — the sell button is disabled while `selling`.

## Non-goals (this slice)

- Other economy ops (nets / multipliers / skins / boat skins purchases, roulettes,
  daily gifts, catch→warehouse, aquarium moves) — same pattern, later slices.
- Removing the dormant `/api/v1/economy/*` and `/api/v1/inventory/*` endpoints and their
  tables — a later cleanup once every op is migrated.
- Optimistic UI with rollback — this slice awaits then replaces.
- Wallet-transaction ledger / spend history surfaced to the client.

## Risks

- **`stateRules.sellWarehouse` drift** — the backend now runs it. Changing warehouse
  economics means re-checking the server too (it already imports `src/game/*`). A unit
  test on `FISH_COIN_VALUE` sums guards the arithmetic.
- **Blob size in `result`** — `game_state_operations.result` stores a full envelope per
  op (~1–2 KB). Acceptable; a retention job can prune old rows later (out of scope).
- **`syncEnabled` as the branch** — a sell during the brief post-auth window before
  `afterAuth` resolves, or while sync is disabled after a failed initial GET, falls back
  to the local pure rule. Transient/degenerate; the local result is reconciled by the
  next `PUT` or the next `start()`. Acceptable for this slice.
- **Anonymous → authenticated mid-session** — after login `afterAuth` runs `start()`
  which replaces local state; a sell done before login on the local path is superseded.
  No special handling.
- **`sellWarehouse` also grants XP / unlocks** — the pure rule bumps `xp`/`level`/
  `unlockedLocations` too, not just coins. That is intended (same as the local path) and
  the server persists all of it in the one blob write.
