# Server-authoritative net + submarine catch (Task 10.3, slice 6b) — design

## Context

Slice 6a made **rod** fishing server-authoritative: `POST /api/v1/me/fishing/cast`
rolls the fish and writes the lucky window to the blob + a `fishing_sessions` row;
`POST /api/v1/me/fishing/land` validates the session and applies `applyCatch` to
the blob transactionally (op `fishing_land`, idempotent by key **and** session
status). The minigame win/lose stays on the client.

6b brings the other two catch modes onto the same `cast` / `land` pair:

- **Net** (`NetFishing`) — one pull of the net minigame lands a **batch** of
  `fishCount` fish, all of the net's rolled rarity. `fishCount` is 20 (common) down
  to 1 (cosmic). A net is spent per cast.
- **Submarine** (`SubmarineFishing`) — fish swim across the screen; clicking one
  harvests it. **Continuous**: many catches per visit, one per click, weighted
  toward rares by its own table. Its catches currently persist
  `location: 'submarine'`, which is **not** in `LOCATIONS` — `caughtFishSchema`
  rejects it, so a submarine catch corrupts the save on the next load. 6b fixes
  this.

### Decisions (user, 2026-09-08)

1. **6b covers both** net and submarine, shipped as **two PRs** — 6b-1 net, 6b-2
   submarine.
2. The session stores the batch in a **`result_catches jsonb`** column
   (`[{ fishId, weight }]`); 6a's `result_fish_id` / `result_weight` / `result_xp`
   / `result_lucky` stay for `mode: 'rod'` only.
3. **The net is consumed on `cast`** (server), not on the client.
4. Submarine's per-harvest `land` **renews the session `created_at`** so a long
   visit does not hit the 5-min TTL mid-session.

---

## Shared model changes

### M1. `cast` gains `mode`

`POST /api/v1/me/fishing/cast` body → `{ locationId: string, mode: 'rod' | 'net' | 'submarine' }`.
`mode` defaults to `'rod'` (Zod `.default('rod')`) so 6a clients keep working.

### M2. `land` gains an optional `fishId`

`POST /api/v1/me/fishing/land` body → `{ sessionId: uuid, fishId?: string }`.
- **absent** → land the whole session (rod: 1 fish; net: the batch) and mark it
  `completed`.
- **present** → harvest one fish from a submarine session; the session stays
  `open` (or flips to `completed` when its last fish is taken).

### M3. Migration `0020_fishing_sessions_result_catches`

```sql
ALTER TABLE fishing_sessions ADD COLUMN result_catches jsonb;
```

`db/schema.ts` `fishingSessions` gains `resultCatches: jsonb('result_catches')`
(nullable — rod sessions leave it null). No drift check surprises.

### M4. `LandResult.caught` becomes an array

`{ caught: Array<{ fishId: string; weight: number; location: string }> }`. A rod
land returns a one-element array. The op-row `result` shape changes accordingly;
6a's `fishing_land` rows are historical and never re-read after this ships, so no
back-compat shim.

### M5. `src/game/` gains the roll tables (per sub-slice)

- **6b-1:** `src/game/netTypes.ts` (moved from
  `src/components/game/netfishing/netTypes.ts`) — `NET_TYPES` + `rollNet(random)`.
  The old path re-exports from the new one so component imports keep working.
  Backend imports from `src/game/`.
- **6b-2:** `src/game/fishingLogic.ts` gains `rollSubmarineFish(playerLevel, random): Fish`
  and `rollSubmarineBatch(playerLevel, size, random): Fish[]` — the weighted-rarity
  spawn logic currently inline in `SubmarineFishing.spawnFish`. No weight change.
- **6b-2:** `LOCATIONS` (in `src/game/data.ts`) gains a `submarine` entry
  (`id: 'submarine'`, `type: 'ocean'`, `waterType: 'saltwater'`, `requiredLevel: 1`,
  `fishIds: []`). This makes `caughtFishSchema` accept `location: 'submarine'` — old
  saves with submarine catches re-validate. `getFishForLocation` on it returns `[]`
  (the submarine roll uses its own pool, not `fishIds`).

---

## 6b-1 — Net

### A. Flow

```
NetFishing screen (authenticated)              Server
  screen mounts (nets > 0) →
POST /api/v1/me/fishing/cast      ─────▶  requireAuth + CSRF + Idempotency-Key
  { locationId, mode: 'net' }              ├─ player_game_state FOR UPDATE
                                           ├─ (player.nets ?? 0) < 1 → NO_NETS (409)
                                           ├─ resolveLuckyMode → lucky window
                                           ├─ net = rollNet(random)
                                           ├─ catches = fishCount × { fish of net.rarity (or pool fallback), rollWeight }
                                           ├─ UPDATE blob { …player, nets: nets-1, luckyUntil, luckyCooldownUntil }, version+1
                                           ├─ INSERT fishing_sessions { status 'open', result_catches: catches }
                                           └─ 200 { sessionId, net: { rarity, fishCount, greenZoneSize, speed }, catches, lucky, state, version }
  client: applyServerResult; run the net minigame with net.{greenZoneSize,speed}
  pull in the green →
POST /api/v1/me/fishing/land       ─────▶  { sessionId }  (no fishId)
                                           ├─ replay (game_state_operations 'fishing_land') → recorded { state, version, caught[] }
                                           ├─ fishing_sessions FOR UPDATE; guards (6a): completed → return; expired/not-open → 410/422
                                           ├─ player_game_state FOR UPDATE
                                           ├─ catches = result_catches.map(c => ({ fish: FISH.find(c.fishId), weight: c.weight, location: locationId, timestamp: now }))
                                           ├─ applyCatch(player, catches, { fromNet: true })
                                           ├─ UPDATE blob version+1 · UPDATE session 'completed' · INSERT op row
                                           └─ 200 { state, version, caught: catches.map(...) }
  pull in the red → the client shows "empty net", never calls land; session expires on TTL
```

Anonymous: `NetFishing` keeps `rollNet` + roll + `catchFishBatch(fromNet:true)` +
`consumeNet` locally.

### B. Backend

- **`backend/src/fishing/service.ts` — `rollCast`** grows a `mode` param. For
  `'net'`: check `player.nets`, decrement it in the returned player patch, roll the
  net + batch, return `{ mode: 'net', net, catches, luckyUntil, luckyCooldownUntil }`.
  For `'rod'`: unchanged (returns the single-fish shape).
  A discriminated return; `cast` in both memory + PG services branches on it to
  build the session row (rod → `result_*`; net → `result_catches`) and the
  response.
- **`applyLand`** grows to read `result_catches` when present (net) and pass the
  whole array to `applyCatch` with `fromNet: true`; falls back to the single
  `result_*` (rod). Returns `caught: Array<…>`.
- **`http/errors.ts`** — add `NO_NETS: { status: 409, message: 'No fishing nets left' }`.
- No other route changes (the `mode` / `fishId` are body fields on the existing
  routes).

### C. Frontend

- **`endpoints.castLine(idempotencyKey, locationId, mode = 'rod')`** → body
  `{ locationId, mode }`. `CastResult` gains an optional `net` + `catches` (a
  discriminated type: `RodCast | NetCast`).
- **`Index.handleCast(locationId, mode)`** — passes `mode`; for `net` the returned
  `Hooked`-equivalent carries `net` + `catches` (a `NetHooked` type). Anonymous
  branch rolls locally. **`consumeNet` on entry is removed** from
  `onCastNet` in the render tree — the server (or the local roll) spends the net.
- **`NetFishing`** — drop `rollNet` / the batch roll / `onUseNet` / `onCatch` /
  `onCatchBatch`. New props `{ location, player, onCast, onLand, onBack, onOpenShop }`.
  On mount (or on the first "cast net" action) call `onCast(location.id, 'net')`;
  `null` → "no nets" / error state. Use `net.{greenZoneSize,speed}` for the
  minigame; on a green pull `await onLand(hooked)` → `'landed'` shows the haul
  reveal from `catches`, `'failed'` shows "empty net". `reset()` (next net) →
  another `onCast`.
- **`Index`** stops passing `onCatch` to `NetFishing`; `handleCatch` /
  `handleNetCatch` shrink to the anon path only (or move into `handleLand`'s anon
  branch).

### D. Tests

- `fishingLogic.test.ts` / a new `netTypes.test.ts` — `rollNet` deterministic with
  a stub; `rollSubmarineBatch` size + pool.
- `stateRules.test.ts` — `applyCatch` with a `fromNet` batch of 20 (already partly
  covered; add a full-batch overflow case).
- `fishing/service.test.ts` — `cast` mode `'net'`: `NO_NETS` when `nets === 0`;
  decrements `nets`; `result_catches` length = `net.fishCount`. `land` a net
  session applies the whole batch; replay; batch that overflows the warehouse.
- `fishing/routes.test.ts` — `cast { mode: 'net' }` 200 shape (`net`, `catches`);
  `land` 200 `caught` array; `NO_NETS` 409.
- `fishing/pgRepository.integration.test.ts` — net cast+land txn, one session, one
  op row, `nets` decremented, warehouse += batch.
- `endpoints.test.ts` — `castLine(key, loc, 'net')` body.
- `NetFishing.test.tsx` — (check it exists) cast on mount, haul reveal, empty-net
  on a red pull.

### E. Non-goals (6b-1)

- Submarine → 6b-2.
- The net minigame outcome stays client-side (same trust posture as 6a).

---

## 6b-2 — Submarine (sketch)

- `cast { mode: 'submarine' }` → server rolls `rollSubmarineBatch(level, ~10, random)`
  into `result_catches`, session `open`, writes the lucky window (version +1). No
  net consumed. `location` on the catch is `'submarine'` (now a valid `LOCATIONS`
  id, added in M5 — land 6b-2's data change with 6b-2 or fold the `LOCATIONS`
  entry into 6b-1 if simpler).
- `land { sessionId, fishId }` → the fish must be in `result_catches` and not yet
  harvested. `applyCatch(player, [thatFish], { fromNet: false })`; remove it from
  `result_catches`; **renew `created_at`**; if `result_catches` is now empty →
  `status 'completed'`. Op `fishing_land`, idempotency key **per harvest** (the
  client generates a fresh key per click). Version +1 per harvest.
- **`SubmarineFishing`** — the swimming fish come from `onCast(_, 'submarine')`'s
  `catches`; clicking one → `onLand(hooked, 'submarine', fish.id)`. When the local
  list empties, `onCast` again. Anonymous → `rollSubmarineFish` + `catchFish`
  locally.
- Errors: reuse `INVALID_FISHING_SESSION` when `fishId` isn't in the session /
  already harvested.
- Tests mirror 6b-1 + the "harvest one, session stays open, harvest the rest,
  session completes" sequence, and the `created_at` renewal.

## After slice 6

Ranking + season (read), then the dormant-endpoint cleanup (slice 8):
`/api/v1/economy/*`, `/api/v1/inventory/*`, `/api/v1/rewards/daily/claim`, and the
now-unused `player_progress` / `wallet` / `warehouse_fish` code.
