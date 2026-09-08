# Server-authoritative catch (Task 10.3, slice 6) — design

## Context

Slices 1–5 made the value-granting economy server-authoritative over the
`player_game_state` blob (`POST /api/v1/me/economy/<op>` + `Idempotency-Key` → a
pure rule from `src/game/stateRules.ts` runs on the blob in a transaction,
`game_state_operations` replay table, `{ state, version }` or `{ state, version,
reward }` back; client `flush → call → applyServerResult`; anonymous keeps the
local pure rule).

Catching a fish is the last value-granting flow still 100 % client-side, and the
biggest: the client rolls the fish (`rollFish` — rarity by `RARITY_CONFIG` + level
bonus, plus a "lucky mode" 7-min/50 %/1-min buff and the purchased luck
multiplier), rolls the weight, runs a skill minigame (`PullMinigame`, the strength
multiplier eases it), and on a win applies XP / level / world unlock / collection /
warehouse (overflow → aquarium) via `useGameState.catchFishBatch`.

The backend has a **dormant** fishing module (`POST /api/v1/fishing/sessions` +
`/complete`) built against the old structured tables (`player_progress`,
`warehouse_fish`), rolling only the non-lucky path (`backend/src/fishing/roll.ts`,
its own `RollableFish` type). It is rewritten here, not reused.

### Decisions (user, 2026-09-08)

1. **Server owns fish / weight / rewards; the minigame win-or-lose stays on the
   client.** A cheating client can still "always win" the minigame, but can no
   longer fabricate an arbitrary fish, rarity or weight. This is today's trust hole,
   minimised — not widened.
2. **A dedicated `fishing_sessions` table** holds the pending roll between "cast"
   and "land"; `land` applies the result to the blob transactionally. Sessions are
   transient, not part of `PlayerState`.
3. **The server declares "lucky mode"** in the `cast` response — server-side RNG +
   a time window persisted in the blob (like `lastRouletteDate`).
4. **Three sub-slices, one PR each:** 6a rod catch, 6b net (batch) + submarine,
   6c aquarium place.

This document specifies **6a** in full; **6b / 6c** are sketched at the end (same
pattern).

---

## 6a — Rod catch

### A. The flow

```
Client (authenticated)                         Server
click water → casting / waiting (client timers, cosmetic)
  wait ends →
POST /api/v1/me/fishing/cast      ─────▶  requireAuth + CSRF + Idempotency-Key
  { locationId }                          ├─ locationId in LOCATIONS? level >= requiredLevel (from the blob)? else 4xx
                                          ├─ resolveLuckyMode(player, now, random) → { lucky, luckyUntil, luckyCooldownUntil }
                                          ├─ rollFish(location, level, lucky, luckPower, random) + rollWeight(fish, random)
                                          │    luckPower = active purchased luck multiplier's power, else 2
                                          ├─ txn: UPDATE blob { luckyUntil, luckyCooldownUntil }, version + 1
                                          │        INSERT fishing_sessions (result_fish_id, result_weight, result_xp, result_lucky, status 'open')
                                          └─ 200 { sessionId, fishId, weight, xp, lucky, state, version }
  client: applyServerResult(state, version); show "hooked" with that fish
  → PullMinigame (client skill; strength multiplier from the blob eases it)
  win →
POST /api/v1/me/fishing/land       ─────▶  requireAuth + CSRF + Idempotency-Key
  { sessionId }                            ├─ replay (game_state_operations, op 'fishing_land') → return the recorded { state, version, caught }
                                           ├─ txn: SELECT fishing_sessions FOR UPDATE
                                           │       status 'completed' → return its recorded result
                                           │       status not 'open', or open+past TTL → mark 'expired', throw FISHING_SESSION_EXPIRED (410)
                                           │       userId mismatch / no row → INVALID_FISHING_SESSION (422)
                                           ├─ SELECT player_game_state FOR UPDATE; saveSchema.parse
                                           ├─ caught = { fish: FISH.find(result_fish_id), weight: result_weight, location: session.location_id, timestamp: now }
                                           ├─ nextPlayer = applyCatch(player, [caught], { fromNet: false })
                                           ├─ UPDATE blob (nextPlayer), version + 1
                                           ├─ UPDATE fishing_sessions status 'completed', completed_at = now
                                           ├─ INSERT game_state_operations (op 'fishing_land', result = { state, version, caught })
                                           └─ 200 { state, version, caught: { fishId, weight, location } }
  client: applyServerResult(state, version); show the "caught" reveal
  minigame lost → client does nothing; the session is left 'open' and expires on the next land attempt / a future sweep
```

Anonymous / degraded: `FishingScreen` keeps calling `rollFish` + `rollWeight` +
`catchFishBatch` locally (unchanged).

### B. Shared domain

#### B1. `src/game/stateRules.ts` — `applyCatch`

```ts
export function applyCatch(
  state: PlayerState,
  catches: CaughtFish[],          // full { fish, weight, location, timestamp }
  opts: { fromNet: boolean },
): PlayerState;
```

Verbatim port of the body of `useGameState.catchFishBatch` (lines ~69–99):
- `xpGain = Σ (opts.fromNet ? floor(fish.xp * 0.3) : fish.xp)`
- `{ xp, level, xpToNextLevel } = applyXp(...)`
- `collection = [...state.collection, ...catches]`
- `heaviestFish` = the heaviest of `catches` vs `state.heaviestFish`
- `unlockedLocations = getUnlockedLocationIds(level, LOCATIONS)`
- fold `catches` through `addToWarehouse` (warehouse cap 15 → overflow to `aquariumWarehouse`)
- `totalFishCaught += catches.length`

`useGameState.catchFishBatch` becomes: `setPlayer(prev => applyCatch(prev, prev-built
catches, { fromNet }))` — the timestamp assignment (`Date.now() + index`) stays in
the hook (client) / is done by the caller on the server.

#### B2. `src/game/fishingLogic.ts` — injectable RNG + lucky mode

- `rollFish(location, playerLevel, luckyMode?, luckPower?, random = Math.random)` —
  add a trailing `random` parameter; replace every `Math.random()` call inside
  (there are ~8) with `random()`. Same for `rollWeight(fish, random = Math.random)`.
  Frontend callers pass nothing (default `Math.random`); the server passes its own;
  tests pass a stub. **No odds change.**
- `resolveLuckyMode(state, now, random = Math.random): { lucky: boolean; luckyUntil: number | null; luckyCooldownUntil: number | null }`
  - `if (state.luckyUntil && now < state.luckyUntil)` → already in a window:
    `{ lucky: true, luckyUntil: state.luckyUntil, luckyCooldownUntil: state.luckyCooldownUntil ?? null }`
  - `else if (!state.luckyCooldownUntil || now >= state.luckyCooldownUntil)` →
    roll: `random() < 0.5` → `{ lucky: true, luckyUntil: now + 60_000, luckyCooldownUntil: now + 420_000 }`;
    miss → `{ lucky: false, luckyUntil: null, luckyCooldownUntil: now + 420_000 }`
    (a miss still starts the 7-min cooldown, matching the client's "every 7 min" cadence)
  - `else` (in cooldown, no active window) → `{ lucky: false, luckyUntil: state.luckyUntil ?? null, luckyCooldownUntil: state.luckyCooldownUntil }`

  Live in `stateRules.ts` (it reads/writes `PlayerState`), not `fishingLogic.ts`.

#### B3. `src/game/types.ts` + `src/game/persistence.ts`

`PlayerState` gains `luckyUntil?: number | null` and `luckyCooldownUntil?: number |
null`. `saveSchema` (`persistence.ts`) adds them as `z.number().nullable().optional()`;
`normalizePlayer` leaves them untouched (or coerces to `null`).

### C. Backend

#### C1. Migration `backend/migrations/0019_fishing_sessions_result_lucky.sql`

```sql
ALTER TABLE fishing_sessions ADD COLUMN result_lucky boolean NOT NULL DEFAULT false;
```

(`result_fish_id` / `result_weight` / `result_xp` already exist in `db/schema.ts`
and the applied schema.) Mirror the column in `db/schema.ts` `fishingSessions`.
Run `npm run backend:db:generate` to confirm no drift.

#### C2. `backend/src/fishing/` — rewrite for the blob

Delete `roll.ts` + `roll.test.ts` + the old `service.ts` / `pgService.ts` /
`service.test.ts` / `pgService.integration.test.ts` / `session.test.ts` bodies
(keep `session.ts` — `FISHING_SESSION_TTL_MS`, `isSessionExpired`).

New `backend/src/fishing/service.ts` (memory) + `pgRepository.ts` (PG), one
contract:

```ts
export interface FishingService {
  cast(userId: string, idempotencyKey: string, locationId: string):
    Promise<{ sessionId: string; fishId: string; weight: number; xp: number; lucky: boolean; state: SaveEnvelope; version: number }>;
  land(userId: string, idempotencyKey: string, sessionId: string):
    Promise<{ state: SaveEnvelope; version: number; caught: { fishId: string; weight: number; location: string } }>;
}
export function createMemoryFishingService(store: MemoryGameStateStore): FishingService;
export function createPgFishingService(db: Database): FishingService;
```

- Consumes: `rollFish` / `rollWeight` from `../../../src/game/fishingLogic.js`;
  `applyCatch` / `resolveLuckyMode` from `../../../src/game/stateRules.js`;
  `LOCATIONS` + `getFishForLocation` + `FISH` from `../../../src/game/data.js`;
  `saveSchema` / `SAVE_SCHEMA_VERSION` from `../../../src/game/persistence.js`.
  Server `random`: `const random = () => randomInt(1_000_000) / 1_000_000;`
  (`randomInt` from `node:crypto`, matching slice 5; RNG is not audited this slice).
- **`cast`** — one transaction:
  1. dedupe: `SELECT fishing_sessions WHERE user_id, idempotency_key` → if found, re-read the blob and return `{ session fields, state, version }`.
  2. `SELECT player_game_state FOR UPDATE`; `saveSchema.parse`.
  3. `location = LOCATIONS.find(locationId)` → not found → `INVALID_FISHING_REQUEST` (422).
  4. `player.level < location.requiredLevel` → `LOCATION_LOCKED` (403).
  5. `now = Date.now()`; `{ lucky, luckyUntil, luckyCooldownUntil } = resolveLuckyMode(player, now, random)`.
  6. `luckActive = !!player.luckMultiplierEnd && player.luckMultiplierEnd > now`;
     `luckPower = luckActive ? (player.luckMultiplierPower ?? 2) : 2`.
  7. `fish = rollFish(location, player.level, lucky || luckActive, luckPower, random)`;
     `weight = rollWeight(fish, random)`; empty pool → `NO_FISH_AVAILABLE` (422).
  8. `nextPlayer = { ...player, luckyUntil, luckyCooldownUntil }`; write blob, version + 1.
  9. `INSERT fishing_sessions { id, userId, locationId, rulesetVersion: 'blob-1', idempotencyKey, status: 'open', resultFishId: fish.id, resultWeight: weight.toFixed(2), resultXp: fish.xp, resultLucky: lucky }`.
  10. return `{ sessionId, fishId: fish.id, weight, xp: fish.xp, lucky, state: newEnvelope, version }`.
- **`land`** — its **own** transaction (it locks two tables, which `economyService`'s
  `runPgOp` can't express — `runPgOp`'s `compute` only sees the parsed envelope, not
  `tx`). Mirrors `runPgOp`'s structure so the guarantees match:
  1. pre-lock replay check: `SELECT result FROM game_state_operations WHERE (user_id, operation='fishing_land', idempotency_key)` → if found, return it.
  2. `SELECT fishing_sessions WHERE id = sessionId FOR UPDATE`.
     - no row / `userId` mismatch → `INVALID_FISHING_SESSION` (422).
     - `status === 'completed'` → return `{ state: re-read blob, version: its version, caught: from the session row }` (a land retried with a *new* key on an already-landed session must not double-apply).
     - `status !== 'open'`, or `open` && `isSessionExpired(createdAt)` → `UPDATE status 'expired'`, throw `FISHING_SESSION_EXPIRED` (410).
  3. post-lock replay re-check (a concurrent same-key land committed while we waited on the session lock) → return it.
  4. `SELECT player_game_state FOR UPDATE`; `saveSchema.parse`.
  5. `fish = FISH.find(row.resultFishId)` (→ `INVALID_FISHING_SESSION` if gone); `caught = { fish, weight: Number(row.resultWeight), location: row.locationId, timestamp: Date.now() }`.
  6. `nextPlayer = applyCatch(player, [caught], { fromNet: false })`; `UPDATE` blob, version + 1.
  7. `UPDATE fishing_sessions SET status 'completed', completed_at = now`.
  8. `result = { state: newEnvelope, version, caught: { fishId: fish.id, weight, location: row.locationId } }`; `INSERT game_state_operations { userId, idempotencyKey, operation: 'fishing_land', result }`; commit; return `result`.

  Extract the pre/post-lock replay-check helper from `economyService.ts`'s `runPgOp`
  into `backend/src/gamestate/opReplay.ts` (a `readRecordedResult(tx, userId, op, key)`)
  and use it in both — no behaviour change to the economy path, just a shared reader.

  Memory service: a `Map<sessionId, sessionRow>` + the shared memory blob store +
  a shared `ops` `Map<string, unknown>` keyed `${userId}:fishing_land:${key}`; same
  guard order, no real atomicity.

`game_state_operations.result` for `fishing_land` is `{ state, version, caught }` —
the fishing service builds this itself, so `Compute` / `Result` in
`economyService.ts` are **not** touched.

#### C3. `backend/src/fishing/routes.ts`

```ts
r.post('/api/v1/me/fishing/cast', {
  schema: { tags: ['gamestate'], summary: 'Cast — the server rolls the fish (needs Idempotency-Key)',
            body: z.object({ locationId: z.string().min(1).max(120) }) },
  preHandler: app.requireAuth,
}, async (req) => service.cast(req.userId, idempotencyKey(req.headers['idempotency-key']), req.body.locationId));

r.post('/api/v1/me/fishing/land', {
  schema: { tags: ['gamestate'], summary: 'Land the fish the cast rolled (needs Idempotency-Key)',
            body: z.object({ sessionId: z.string().uuid() }) },
  preHandler: app.requireAuth,
}, async (req) => service.land(req.userId, idempotencyKey(req.headers['idempotency-key']), req.body.sessionId));
```

#### C4. `backend/src/app.ts`

Replace the old fishing wiring (`createFishingService` / `createPgFishingService`
with `catalog`, `players`, `inventoryService.addCatch`) with the new
`createMemoryFishingService(memoryGameStateStore!)` / `createPgFishingService(database)`,
sharing the blob store like the economy service. The old
`/api/v1/fishing/sessions*` routes are **removed** (nothing consumes them; the old
`fishing/service.ts` pulled in `inventory`, which slice 8 deletes anyway).
`openapi.test.ts` expected-paths list: swap `/api/v1/fishing/sessions` /
`.../{sessionId}/complete` for `/api/v1/me/fishing/cast` / `.../land`.

#### C5. `http/errors.ts`

No change — `LOCATION_LOCKED` (403), `INVALID_FISHING_REQUEST` (422),
`INVALID_FISHING_SESSION` (422), `FISHING_SESSION_EXPIRED` (410),
`NO_FISH_AVAILABLE` (422) are all already mapped.

#### C6. Tests

- `stateRules.test.ts` — `applyCatch`: single catch adds to warehouse + collection
  + XP; a catch that fills the warehouse (15) overflows to `aquariumWarehouse`; a
  catch that crosses a level threshold unlocks a location; `fromNet: true` gives
  `floor(xp*0.3)`; `heaviestFish` updates only on a heavier fish.
- `fishingLogic.test.ts` — `rollFish` / `rollWeight` with a stubbed `random`
  covering: non-lucky rarity pick, lucky (2×) rare-only pick, lucky (4×) top-only
  pick, weight within `[min,max]`. `resolveLuckyMode`: fresh state → 50 % boundary
  (`random` 0.4 → lucky, 0.6 → miss + cooldown); inside a window → stays lucky
  without re-rolling; inside cooldown → not lucky.
- `backend/src/fishing/service.test.ts` (memory) — `cast` returns a fish for the
  location, writes `luckyUntil` to the blob, bumps version, creates a session; a
  locked location → `LOCATION_LOCKED`; unknown location → `INVALID_FISHING_REQUEST`.
  `land` applies the catch (coins unchanged, XP up, warehouse +1), bumps version,
  marks the session completed; replay same key → identical body, session still one
  row, warehouse still +1; a second land with a *new* key on a completed session →
  same result, no double-apply; land on an unknown session → `INVALID_FISHING_SESSION`;
  land on an expired session → `FISHING_SESSION_EXPIRED`.
- `backend/src/fishing/routes.test.ts` — the two routes: cast 200 shape, land 200
  shape incl. `caught`, replay, 401 no session, 403 locked, 410 expired.
- `backend/src/fishing/pgRepository.integration.test.ts` — cast + land transactional
  against real PG: one `fishing_sessions` row, one `game_state_operations` row
  (`fishing_land`), blob `collection`/`warehouse` updated, version +2 total (cast
  +1, land +1); replay land; concurrent same-key land → identical, one op row;
  deleting the user cascades `fishing_sessions`.

### D. Frontend

#### D1. `src/api/endpoints.ts`

```ts
export type CastResult = GameStateEnvelope & { sessionId: string; fishId: string; weight: number; xp: number; lucky: boolean };
export type LandResult = GameStateEnvelope & { caught: { fishId: string; weight: number; location: string } };
export function castLine(idempotencyKey: string, locationId: string): Promise<CastResult> {
  return apiFetch('/me/fishing/cast', { method: 'POST', body: { locationId }, idempotencyKey });
}
export function landCatch(idempotencyKey: string, sessionId: string): Promise<LandResult> {
  return apiFetch('/me/fishing/land', { method: 'POST', body: { sessionId }, idempotencyKey });
}
```

#### D2. `src/pages/Index.tsx`

- `busyOp` union gains `'cast' | 'land'`.
- The screen deals in two callbacks; Index routes auth vs anon:

  ```ts
  type Hooked = { fish: Fish; weight: number; lucky: boolean; sessionId: string };
  handleCast(locationId: string): Promise<Hooked | null>
  handleLand(hooked: Hooked, locationId: string): Promise<'landed' | 'failed'>
  ```

- `handleCast` — authenticated (`syncEnabled`): `await flushNow()`;
  `const r = await castLine(crypto.randomUUID(), locationId)`; `applyServerResult(r)`;
  `fish = FISH.find(r.fishId)` (→ `null` if missing); return
  `{ fish, weight: r.weight, lucky: r.lucky, sessionId: r.sessionId }`. Anonymous:
  `now = Date.now()`; `{ lucky, luckyUntil, luckyCooldownUntil } = resolveLuckyMode(player, now)`;
  `replaceFromServer(() => ({ luckyUntil, luckyCooldownUntil }))`;
  `luckActive = player.luckMultiplierEnd > now`; `fish = rollFish(location, player.level, lucky || luckActive, luckPower)`;
  `weight = rollWeight(fish)`; return `{ fish, weight, lucky, sessionId: '' }`.
  Any failure → `null`. (`rollFish` / `rollWeight` / `resolveLuckyMode` import into
  `Index`, not `FishingScreen`.)
- `handleLand` — authenticated: `await landCatch(crypto.randomUUID(), hooked.sessionId)` →
  `applyServerResult` → `'landed'`; failure → `'failed'` (no local mutation).
  Anonymous: `catchFishBatch([{ fish: hooked.fish, weight: hooked.weight, location: locationId }], false)` → `'landed'`.
- The `screen === 'fishing'` render passes `onCast={handleCast}` + `onLand={handleLand}`
  (replacing `onCatch`). `SubmarineFishing` / `NetFishing` keep `onCatch` (→ `catchFish`
  / `catchFishBatch`, unchanged) until 6b.

#### D3. `src/components/game/FishingScreen.tsx`

- Drop the local `luckyMode` 7-min timer and the `rollFish` / `rollWeight` import
  for the **catch decision** (keep them only if the anon path lives in the screen —
  prefer routing anon through Index so the screen is uniform).
- New prop shape: `{ location, player, onCast, onLand, onBack, onCastNet?, onOpenNetShop? }`
  (drop `onCatch`). Local state gains `hooked: Hooked | null`.
- On `waiting` end: `const h = await onCast(location.id)`. `h === null` → soft
  "tenta de novo", back to `idle`. Else `setHooked(h)`, `setCurrentFish(h.fish)`,
  `setCurrentWeight(h.weight)`, `setLuckyMode(h.lucky)` (the banner shows from
  `h.lucky` — the 7-min local timer is deleted), `setPhase('hooked')`.
- `handleWin`: `const outcome = await onLand(hooked, location.id)`;
  `outcome === 'landed'` → `setPhase('caught')`; `outcome === 'failed'` →
  `setPhase('lost')` (**a land failure = the fish escaped**, so local and server
  state never diverge on a caught fish).
- `SubmarineFishing` / `NetFishing` are untouched in 6a (still `onCatch`); Index
  keeps `onCatch` wired for them until 6b.

#### D4. Tests

- `endpoints.test.ts` — `castLine` / `landCatch` POST the right paths + bodies.
- `FishingScreen.test.tsx` (if it exists — check; there's `FishingScreen.test.tsx`
  in `src/test/`) — cast is called on the wait end; the returned fish shows in the
  "hooked"/"caught" UI; a `null` cast returns to idle; a failed land shows "escapou".
- `useGameState` test — `catchFishBatch` still works via `applyCatch` (existing
  tests should pass unchanged; add one for the extracted rule if not covered).

### E. Non-goals (6a)

- Net (batch) + submarine catch → **6b**.
- Aquarium place (`placeAquariumFish`) → **6c**.
- Server-side minigame outcome — the win/lose stays on the client.
- Audited / seeded fishing RNG — deferred (same as slice 5's roulette RNG).
- Cosmetic cast / wait / reel timers — stay client-side.
- A background sweep for orphaned `open` sessions — a later ops task; the TTL check
  on the next land is enough.

### F. Risks

- **`applyCatch` must mirror `catchFishBatch` exactly** — verbatim port + the
  warehouse-overflow and level-up tests above. `catchFishBatch` is the client's
  only catch path; a divergence desyncs progression.
- **Two blob writes per fish** (cast: lucky window; land: the catch) → +2 versions
  per landed fish. Acceptable — economy already bumps per op. The client must
  `applyServerResult` on **both** cast and land.
- **Orphaned `open` sessions** on a lost minigame — harmless; `expired` on the next
  land attempt or a future sweep.
- **`rollFish` parametrisation** — adding `random` to a shared file used in ~4
  frontend call sites; defaults keep them working. Grep every caller.
- **`land` idempotency across two mechanisms** — the `game_state_operations` op key
  AND the `fishing_sessions.status` guard. Both are needed: the op key covers a
  same-key retry; the status guard covers a *different-key* retry on an already-landed
  session (client bug / double-fire). Integration test both.
- **Anon path placement** — routing the anonymous roll through `Index` (not the
  screen) keeps `FishingScreen` single-path but means Index holds `rollFish`. Small;
  the alternative (screen keeps a local branch) duplicates the "which fish" logic.
- **`saveSchema` gains two optional fields** — old saves without them parse fine
  (`.optional()`); `applyServerResult`'s `saveSchema.safeParse` on the cast/land
  response must accept them.
- **World auto-revert effect** in `Index` (`player.level < 12 && world > 1`) fires
  on the server-driven level change too — intended, already handles it.

---

## 6b — Net (batch) + submarine (sketch)

- `NetFishing` catches N fish per net. `cast` gains `{ mode: 'net' }` → the server
  rolls `NET_BATCH_SIZE` fish (check the client's current count), one session with
  a JSON array result (`result_fish_ids` / weights, or a `fishing_session_catches`
  child table). `land` applies `applyCatch(player, catches, { fromNet: true })`.
  Net consumption (`consumeNet`) folds into `cast` (the net is spent on the cast).
- `SubmarineFishing` — same `cast` / `land` as rod, `{ mode: 'submarine' }` (its own
  location pool / rules if any).
- Frontend: `NetFishing` / `SubmarineFishing` move off `onCatch` onto `onCast` /
  `onLand`; `Index` drops the last `onCatch` wiring; `useGameState.catchFish` /
  `catchFishBatch` / `consumeNet` stay only for the anon path.

## 6c — Aquarium place (sketch)

- `POST /api/v1/me/economy/aquarium/place` — body `{ timestamp, sector }` +
  `Idempotency-Key`. `compute` = `placeAquariumFish` (already a pure rule in
  `stateRules.ts`), op `aquarium_place`, grants `AQUARIUM_REWARDS` (coins + xp).
  Reuses the economy runner directly (no session needed — it operates on a fish
  already in `aquariumWarehouse`).
- Frontend: `Aquarium.onMoveToSector` → `runEconomyOp('aquariumPlace', …)`.
- Errors: `INVALID_AQUARIUM_SECTOR` (422, already mapped); a missing timestamp →
  the pure rule already returns state unchanged — make it throw a mapped code
  (`AQUARIUM_FISH_NOT_FOUND`, new, 404).

## After slice 6

Ranking + season (read), then the dormant-endpoint cleanup (slice 8):
`/api/v1/economy/*`, `/api/v1/inventory/*`, `/api/v1/rewards/daily/claim`, and the
now-unused `player_progress` / `wallet` / `warehouse_fish` code paths.
