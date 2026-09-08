# Server-authoritative submarine catch (Task 10.3, slice 6b-2) — design

## Context

Slices 6a (rod) and 6b-1 (net) made those catch modes server-authoritative on the
`player_game_state` blob: `POST /api/v1/me/fishing/cast` rolls the fish/batch and
(rod/net) writes a lucky window + spends a net; `POST /api/v1/me/fishing/land`
applies `applyCatch` transactionally (op `fishing_land`, idempotent by key **and**
session status). The client minigame win/lose stays client-side.

**Submarine** (`SubmarineFishing`) is the last catch mode still 100% client-side,
and it works differently: fish swim across a canvas, the player harpoons one per
click, **continuously** — many catches per visit, no cast gesture, no cost, no
limit, no miss. Its catches persist `location: 'submarine'`, which is **not** in
`LOCATIONS`; `caughtFishSchema` (`src/game/persistence.ts:36`) rejects it, so the
next `saveSchema.parse` (a `PUT /me/state` flush, or a local reload) discards the
whole blob. This is a latent save-corruption bug; 6b-2 fixes it.

6b-2 brings submarine onto the same `cast` / `land` pair, but as a **server-rolled
roster** harvested one fish at a time.

### Decisions (user, 2026-09-08)

1. **Roster model:** `cast { mode: 'submarine' }` rolls a fixed roster of
   `SUBMARINE_ROSTER_SIZE = 24` fish into the session; the client spawns them
   gradually and, when ~4 unharvested remain, calls `cast` again (a fresh session)
   and merges — no visible "diving…" pause.
2. **`land` identifies the harvested fish by a synthetic `catchId`** (a uuid per
   roster entry), not by `fishId` (the FISH pool is small; a roster has duplicate
   `fishId`s with different weights) and not by index (client-side filtering
   shifts indices).
3. **`submarine` is an allowlist constant, not a `LOCATIONS` entry.** A
   `SUBMARINE_LOCATION_ID = 'submarine'` constant; `caughtFishSchema` accepts it as
   a special case. `LOCATIONS` stays untouched (it drives the location picker and
   `unlockedLocations`; a pseudo-entry there leaks into both).
4. **Lucky mode is neutral for submarine.** The submarine roll has its own rarity
   table and ignores lucky mode, so `cast { mode: 'submarine' }` does **not** call
   `resolveLuckyMode` and does **not** write the blob or bump `version`. Only
   harvests (`land`) write the blob. Fewer version bumps; opening the submarine
   never burns the shared lucky window / cooldown.

### Non-goals

- Retiring the free-form `PUT /me/state` blob write — that follows 6c + slice 7 +
  slice 8. 6b-2 only completes "every catch mode is server-authoritative" and
  removes the last `onCatch` wiring from `src/pages/Index.tsx`.
- A cost or daily limit on submarine fishing — matches current behaviour; a known
  economy hole, deferred (like the client-side minigame outcome).
- Audited / seeded fishing RNG — deferred (same as slices 5, 6a, 6b-1).
- Server-side minigame outcome — the submarine has no miss; every harpoon lands.
- A background sweep for orphaned `open` submarine sessions — the 5-min TTL check
  on the next `land` attempt is enough; `created_at` is renewed per harvest so a
  long visit on one roster does not expire mid-use.

---

## A. The flow

```
SubmarineFishing (authenticated)              Server
  screen mounts →
POST /api/v1/me/fishing/cast      ─────▶  requireAuth + CSRF + Idempotency-Key
  { locationId: 'submarine', mode: 'submarine' }
                                           ├─ SELECT player_game_state FOR UPDATE (uniform with rod/net; no write follows for submarine)
                                           │    no row → GAME_STATE_NOT_FOUND
                                           ├─ dedupe by (user_id, idempotency_key): existing session → re-return it
                                           ├─ roll = rollSubmarineBatch(24, player.level, random)
                                           │    → catches: [{ id: uuid, fishId, weight }] × 24
                                           ├─ INSERT fishing_sessions
                                           │    { mode: 'submarine', status: 'open', result_catches: catches,
                                           │      result_lucky: false, result_fish_id/weight/xp: null }
                                           │    (NO blob write, NO version bump)
                                           └─ 200 { sessionId, mode: 'submarine', catches, lucky: false,
                                                    state: <current envelope>, version: <current> }
  client: applyServerResult (a no-op for state/version here); spawn the 24 fish
          gradually on the existing 1500ms timer; each SwimmingFish carries its `id`
  player clicks a fish → harpoon animation →
POST /api/v1/me/fishing/land       ─────▶  requireAuth + CSRF + Idempotency-Key (fresh per click)
  { sessionId, catchId }
                                           ├─ readRecordedResult(tx, userId, 'fishing_land', key) → return it (replay)
                                           ├─ SELECT fishing_sessions WHERE id = sessionId FOR UPDATE
                                           │    no row / userId mismatch → INVALID_FISHING_SESSION (422)
                                           │    status 'completed' → return recorded result (from the op row; see below)
                                           │    status 'expired', or 'open' && isSessionExpired(created_at)
                                           │        → UPDATE status 'expired', throw FISHING_SESSION_EXPIRED (410)
                                           ├─ post-lock replay re-check → return it
                                           ├─ entry = result_catches.find(e => e.id === catchId)
                                           │    not found → INVALID_FISHING_SESSION (422)
                                           ├─ SELECT player_game_state FOR UPDATE; saveSchema.parse
                                           ├─ caught = { fish: FISH.find(entry.fishId), weight: entry.weight,
                                           │             location: 'submarine', timestamp: now }
                                           │    fish missing → INVALID_FISHING_SESSION (422)
                                           ├─ nextPlayer = applyCatch(player, [caught], { fromNet: false }, LOCATIONS)
                                           ├─ remaining = result_catches without `entry`
                                           ├─ UPDATE player_game_state (nextPlayer), version + 1
                                           ├─ UPDATE fishing_sessions SET result_catches = remaining, created_at = now
                                           │    , (remaining.length === 0 ? status 'completed', completed_at = now : —)
                                           ├─ result = { state: newEnvelope, version, caught: [{ fishId, weight, location }] }
                                           ├─ INSERT game_state_operations { op 'fishing_land', result }
                                           └─ 200 result
  client: applyServerResult; show the "caught" reveal overlay; remove that fish
  when local unharvested count ≤ 4 → POST cast again (new session), merge the roster
```

**Anonymous / degraded:** `src/pages/Index.tsx` `handleCast` anon branch rolls a
local roster with `rollSubmarineFish` × 24, assigns `crypto.randomUUID()` ids,
returns the same `SubmarineHooked` shape with `sessionId: ''`. `handleLand` anon
branch calls `catchFish(fish, weight, SUBMARINE_LOCATION_ID, false)` (unchanged
local rule). No session, no server call.

### Idempotency

- **Same key retried:** the `game_state_operations` row keyed
  `(user_id, 'fishing_land', key)` returns the recorded single-fish result.
- **New key, same `catchId`, session still open:** the entry was already removed
  from `result_catches` → `INVALID_FISHING_SESSION` (422). This is the "different
  key retry" guard, analogous to 6a/6b-1's `status === 'completed'` check.
- **New key on a `completed` submarine session:** returns the recorded result of
  whichever `fishing_land` op the client is retrying (by key). A `catchId` for an
  already-harvested fish with a genuinely new key that was never used →
  `INVALID_FISHING_SESSION`.

---

## B. Shared domain (`src/game/`)

### B1. `src/game/data.ts` — `SUBMARINE_LOCATION_ID`

```ts
export const SUBMARINE_LOCATION_ID = 'submarine';
```

`LOCATIONS` is **not** changed. `getFishForLocation` is never called with it (the
submarine roll uses its own pool).

### B2. `src/game/persistence.ts` — accept the submarine pseudo-location

`caughtFishSchema`'s `superRefine`, the location check (currently line ~36):

```ts
if (caught.location !== SUBMARINE_LOCATION_ID
    && !LOCATIONS.some(location => location.id === caught.location)) {
  context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown location id: ${caught.location}`, path: ['location'] });
}
```

Import `SUBMARINE_LOCATION_ID` from `./data.js`. This is the save-corruption fix:
existing blobs that already contain `location: 'submarine'` catches now validate.

### B3. `src/game/fishingLogic.ts` — submarine roll

Port the rarity-weighted pick currently inline in `SubmarineFishing.spawnFish`
(`src/components/game/SubmarineFishing.tsx:30-43`). **No odds change.**

```ts
export const SUBMARINE_ROSTER_SIZE = 24;
export const SUBMARINE_ROSTER_REFILL_AT = 4;   // client re-casts when this many unharvested remain

/** Rarity-weighted pick from the whole FISH catalog. `playerLevel` is unused today
 *  (kept for signature parity with rollFish). Verbatim port of SubmarineFishing.spawnFish. */
export function rollSubmarineFish(playerLevel: number, random: () => number = Math.random): Fish {
  const available = FISH.filter(f => {
    const r = random();
    if (f.rarity === 'cosmic')    return r < 0.002;
    if (f.rarity === 'legends')   return r < 0.005;
    if (f.rarity === 'platinum')  return r < 0.01;
    if (f.rarity === 'volcanic')  return r < 0.02;
    if (f.rarity === 'abyssal')   return r < 0.03;
    if (f.rarity === 'legendary') return r < 0.08;
    if (f.rarity === 'mythic')    return r < 0.15;
    if (f.rarity === 'uncommon')  return r < 0.3;
    return true;
  });
  return available[Math.floor(random() * available.length)] ?? FISH[0];
}

export function rollSubmarineBatch(size: number, playerLevel: number, random: () => number = Math.random): Fish[] {
  return Array.from({ length: size }, () => rollSubmarineFish(playerLevel, random));
}
```

`SubmarineFishing.spawnFish` is rewritten to call `rollSubmarineFish` (anon path)
or consume from the `onCast` roster (server path) — see D3.

### B4. `src/game/fishing.ts` — `SubmarineHooked`

```ts
export type SubmarineCatch = { id: string; fish: Fish; weight: number };
export type SubmarineHooked = {
  kind: 'submarine';
  catches: SubmarineCatch[];
  sessionId: string;   // '' for the anonymous roll
};
export type Hooked = RodHooked | NetHooked | SubmarineHooked;
```

---

## C. Backend (`backend/src/`)

### C1. Migration `backend/migrations/0021_fishing_sessions_mode.sql`

```sql
ALTER TABLE fishing_sessions ADD COLUMN mode varchar(16) NOT NULL DEFAULT 'rod';
UPDATE fishing_sessions SET mode = 'net' WHERE result_catches IS NOT NULL;
ALTER TABLE fishing_sessions ADD CONSTRAINT fishing_sessions_mode_check
  CHECK (mode IN ('rod', 'net', 'submarine'));
```

(The `UPDATE` is cleanup only — all pre-existing rows are past their 5-min TTL.)

`db/schema.ts` `fishingSessions`:

```ts
mode: varchar('mode', { length: 16 }).notNull().default('rod'),
// ...
resultCatches: jsonb('result_catches').$type<Array<{ id?: string; fishId: string; weight: number }>>(),
// table extras:
modeCheck: check('fishing_sessions_mode_check', sql`${table.mode} IN ('rod', 'net', 'submarine')`),
```

`id?` is optional on the `result_catches` element type: net writes
`{ fishId, weight }`, submarine writes `{ id, fishId, weight }`.

Run `npm run backend:db:generate` after — confirm the only diff is this column +
check.

### C2. `backend/src/fishing/service.ts`

**Types:**

```ts
export type FishingSessionRow = {
  // ...existing fields...
  mode: 'rod' | 'net' | 'submarine';
  resultCatches: Array<{ id?: string; fishId: string; weight: number }> | null;
};

type SubmarineRoll = {
  mode: 'submarine';
  catches: Array<{ id: string; fishId: string; weight: number }>;
};
export type CastRoll = RodRoll | NetRoll | SubmarineRoll;

export type CastResult =
  | (CastBase & { mode: 'rod'; fishId: string; weight: number; xp: number })
  | (CastBase & { mode: 'net'; net: NetInfo; catches: BatchEntry[] })
  | (CastBase & { mode: 'submarine'; catches: Array<{ id: string; fishId: string; weight: number }> });
```

`CastBase` still `{ sessionId, lucky, state, version }`. `SubmarineRoll` has **no**
`lucky` field, so `castResultFor` sets `base.lucky = roll.mode === 'submarine' ? false : roll.lucky`.
Submarine also passes the **unchanged** `state` / `version` (from the current
blob row, not `+ 1`).

`sessionRowFor`: build the shared `common` object **without** `resultLucky`, then
each branch adds it — `rod`/`net` from `roll.lucky`, `submarine` as `false` — so
the NOT NULL `result_lucky` column never sees `undefined`.

**`rollCast`** — new branch, placed before the final `throw`:

```ts
if (mode === 'submarine') {
  const batch = rollSubmarineBatch(SUBMARINE_ROSTER_SIZE, player.level, random);
  return {
    mode: 'submarine',
    catches: batch.map(f => ({ id: randomUUID(), fishId: f.id, weight: rollWeight(f, random) })),
  };
}
```

Note: **no `resolveLuckyMode`, no location lookup, no level gate** for submarine.
`rollCast` still takes `locationId` but ignores it in this branch.

**`castPlayerPatch`** — unchanged for `rod`/`net`; for `submarine` returns
`player` as-is (no lucky window, no net spent). Add:

```ts
if (roll.mode === 'submarine') return player;
```

**`sessionRowFor`** — submarine branch:

```ts
roll.mode === 'submarine'
  ? { ...common, mode: 'submarine', resultLucky: false,
      resultFishId: null, resultWeight: null, resultXp: null, resultCatches: roll.catches }
  : /* net / rod as today */
```

**`castResultFor`** — submarine branch returns
`{ ...base, mode: 'submarine', catches: roll.catches }`.

**`applyLand`** — grows an options arg:

```ts
export function applyLand(
  player: SaveEnvelope['player'],
  session: Pick<FishingSessionRow, 'mode' | 'locationId' | 'resultFishId' | 'resultWeight' | 'resultCatches'>,
  now: number,
  opts: { catchId?: string } = {},
): { player: SaveEnvelope['player']; caught: Caught[]; remaining: Array<{ id?: string; fishId: string; weight: number }> | null } {
  if (session.mode === 'submarine') {
    const all = session.resultCatches ?? [];
    const entry = all.find(e => e.id === opts.catchId);
    if (!opts.catchId || !entry) throw new Error('INVALID_FISHING_SESSION');
    const fish = FISH.find(f => f.id === entry.fishId);
    if (!fish) throw new Error('INVALID_FISHING_SESSION');
    const caught = { fish, weight: entry.weight, location: SUBMARINE_LOCATION_ID, timestamp: now };
    return {
      player: applyCatch(player, [caught], { fromNet: false }, LOCATIONS),
      caught: [{ fishId: fish.id, weight: entry.weight, location: SUBMARINE_LOCATION_ID }],
      remaining: all.filter(e => e.id !== opts.catchId),
    };
  }
  // rod / net: unchanged body, returns `remaining: null`
}
```

`session.locationId` for a submarine session is `'submarine'` (the client always
sends `locationId: 'submarine'` with `mode: 'submarine'`); `applyLand` uses
`SUBMARINE_LOCATION_ID` directly for clarity regardless.

**`FishingService` interface** — `land` gains an optional `catchId`:

```ts
land(userId: string, idempotencyKey: string, sessionId: string, catchId?: string): Promise<LandResult>;
```

**`createMemoryFishingService`**:

- `cast` — submarine branch: skip the `store.set` (no blob write); `version` stays
  `entry.version`; still create the session and `castByKey` entry; return
  `castResultFor` with the current envelope + version. The dedupe re-return path
  handles `mode === 'submarine'` (re-return `catches` + current state/version).
- `land(userId, key, sessionId, catchId)` — after the existing guards, when
  `session.mode === 'submarine'`:
  - `applied = applyLand(player, session, now, { catchId })`.
  - `store.set` the new player, `version + 1`.
  - `session.resultCatches = applied.remaining`; `session.createdAt = new Date(now)`;
    if `applied.remaining!.length === 0` → `session.status = 'completed'`.
  - record + return `{ state, version, caught: applied.caught }` keyed by `key`.
  - The `status === 'completed'` early-return path (a same-key retry after the
    session finished) returns the **recorded op result**, not `recordedCaught` of
    the whole (now-empty) session — the memory service already keys replays by
    `key` in `landByKey`, so this is automatic.

### C3. `backend/src/fishing/pgRepository.ts`

- `RULESET_VERSION` unchanged (`'blob-1'`).
- **`modeOf`** — deleted; read `session.mode` directly everywhere it was used.
- **`recordedCaught`** — only reached for rod/net completed sessions now; for a
  completed **submarine** session a same-key retry is served by the
  `readRecordedResult` op-row lookup (keyed by `key`), which happens *before* the
  session `status` check. So `recordedCaught` never runs for submarine. Leave it
  for rod/net; guard: if `session.mode === 'submarine'` and we somehow reach the
  `status === 'completed'` branch without an op-row hit (a new key on a finished
  session), throw `INVALID_FISHING_SESSION`.
- **`cast`** — submarine branch:
  - The `SELECT player_game_state` can drop `.for('update')` for submarine (no
    write) — but keeping `FOR UPDATE` for all modes is simpler and the cast path
    is not hot; **keep `FOR UPDATE`**, just skip the `tx.update(playerGameState)`
    and keep `version = row.version` (no `+ 1`).
  - `INSERT fishing_sessions` with `mode: 'submarine'`, `resultCatches: roll.catches`,
    `resultLucky: false`.
  - dedupe re-return: `mode === 'submarine'` → `{ sessionId, mode: 'submarine', catches: s.resultCatches!, lucky: false, state: currentEnvelope, version: row.version }`.
- **`land(userId, key, sessionId, catchId)`**:
  - Pass `catchId` through to `applyLand(..., { catchId })`.
  - When `session.mode === 'submarine'`:
    ```ts
    await tx.update(fishingSessions).set({
      resultCatches: applied.remaining,
      createdAt: new Date(now),
      ...(applied.remaining!.length === 0 ? { status: 'completed', completedAt: new Date(now) } : {}),
    }).where(eq(fishingSessions.id, sessionId));
    ```
    (rod/net keep the existing `status: 'completed', completedAt` update.)
  - Everything else (blob update `version + 1`, op-row insert) is unchanged.

### C4. `backend/src/fishing/routes.ts`

```ts
body: z.object({
  sessionId: z.string().uuid(),
  catchId: z.string().uuid().optional(),
}),
// ...
return service.land(request.userId, idempotencyKey(request.headers['idempotency-key']),
                    request.body.sessionId, request.body.catchId);
```

The `cast` body already accepts `mode: z.enum(['rod', 'net', 'submarine'])`.

### C5. `backend/src/gamestate/opReplay.ts` — no change.

### C6. `backend/src/http/errors.ts` — no change.

`INVALID_FISHING_SESSION` (422), `FISHING_SESSION_EXPIRED` (410),
`GAME_STATE_NOT_FOUND` (409) are all already mapped.

---

## D. Frontend (`src/`)

### D1. `src/api/endpoints.ts`

```ts
export type SubmarineCast = GameStateEnvelope & {
  sessionId: string; mode: 'submarine';
  catches: Array<{ id: string; fishId: string; weight: number }>;
  lucky: boolean;
};
export type CastResult = RodCast | NetCast | SubmarineCast;

export function landCatch(idempotencyKey: string, sessionId: string, catchId?: string): Promise<LandResult> {
  return apiFetch('/me/fishing/land', {
    method: 'POST', idempotencyKey,
    body: { sessionId, ...(catchId ? { catchId } : {}) },
  });
}
```

`castLine(idempotencyKey, locationId, mode)` already exists and sends
`{ locationId, mode }`.

### D2. `src/pages/Index.tsx`

- **`handleCast(locationId, mode)`** — new `mode === 'submarine'` handling:
  - authenticated (`syncEnabled`): `await flushNow()`;
    `const r = await castLineApi(crypto.randomUUID(), 'submarine', 'submarine')`;
    `applyServerResult(r)` (state/version unchanged, harmless);
    build `SubmarineHooked` — `catches: r.catches.map(c => ({ id: c.id, fish: FISH.find(f => f.id === c.fishId)!, weight: c.weight })).filter(c => c.fish)`;
    `sessionId: r.sessionId`. Any failure → `null`.
  - anonymous: `const batch = rollSubmarineBatch(SUBMARINE_ROSTER_SIZE, player.level)`;
    `catches: batch.map(f => ({ id: crypto.randomUUID(), fish: f, weight: rollWeight(f) }))`;
    `sessionId: ''`. No `replaceFromServer` (submarine doesn't touch the blob on cast).
- **`handleLand(hooked, locationId, catchId?)`** — signature gains `catchId?`; new
  `hooked.kind === 'submarine'` branch:
  - authenticated: `const r = await landCatchApi(crypto.randomUUID(), hooked.sessionId, catchId)`;
    `applyServerResult(r)` → return `{ outcome: 'landed', caught: r.caught[0] }`
    (the component needs the landed fish for the reveal — see D3 for the exact
    return shape). Failure → `{ outcome: 'failed' }`.
  - anonymous: find the roster entry by `catchId`;
    `catchFish(entry.fish, entry.weight, SUBMARINE_LOCATION_ID, false)`;
    return `{ outcome: 'landed', caught: { fishId: entry.fish.id, weight: entry.weight, location: SUBMARINE_LOCATION_ID } }`.
- **`handleCatch` is deleted**; the `screen === 'submarine'` render becomes
  `<SubmarineFishing player={player} onCast={handleCast} onLand={handleLand} onBack={...} />`.
  After this, **grep confirms `Index.tsx` has no `onCatch` prop anywhere**.
- `busyOp` union unchanged (`'cast' | 'land'` already present); submarine cast/land
  set `busyOp` the same way rod/net do.
- Imports: `rollSubmarineBatch`, `SUBMARINE_ROSTER_SIZE` from `@/game/fishingLogic`;
  `SUBMARINE_LOCATION_ID` from `@/game/data`; `rollWeight` already imported.

**`handleLand` return shape change:** today `handleLand` returns
`'landed' | 'failed'`. Rod (`FishingScreen`) and net (`NetFishing`) only need the
outcome. Submarine needs the caught fish for its reveal overlay. Two options —
pick **(a)**: `handleLand` returns `{ outcome: 'landed' | 'failed'; caught?: { fishId; weight; location } }`;
`FishingScreen` / `NetFishing` read `.outcome` (one-line change each), submarine
reads `.caught`. (Option (b), a separate `onHarvest` callback, duplicates the
auth/anon fork — rejected.)

### D3. `src/components/game/SubmarineFishing.tsx`

Keep the entire canvas scene, harpoon SVGs, projectile animation, HUD, and caught
overlay. Change the **fish source** and the **catch call**.

- **Props:** `{ player, onCast, onLand, onBack }` (was `{ player, onCatch, onBack }`).
  - `onCast: (locationId: string, mode: 'submarine') => Promise<Hooked | null>`
  - `onLand: (hooked: Hooked, locationId: string, catchId: string) => Promise<{ outcome: 'landed' | 'failed'; caught?: { fishId: string; weight: number; location: string } }>`
- **State:** add `hooked: SubmarineHooked | null` (the current roster) and a
  `harvested: Set<string>` of consumed `catchId`s. `SwimmingFish` gains
  `catchId: string` and `fish: Fish` comes from the roster entry.
- **On mount:** `const h = await onCast('submarine', 'submarine')`.
  `h?.kind !== 'submarine'` → error/empty state ("mergulho indisponível", a back
  button). Else `setHooked(h)`.
- **Spawn effect:** the existing 1500ms interval, instead of calling `spawnFish`,
  pulls the **next unspawned, unharvested** roster entry (`hooked.catches` minus
  already-spawned minus `harvested`) and makes a `SwimmingFish` from it (random x
  entry side / y / speed / size as today). Cap 8 on screen as today.
- **Roster refill:** when the unspawned-and-unharvested count drops to
  `SUBMARINE_ROSTER_REFILL_AT` (4), call `onCast('submarine', 'submarine')` again
  (guard against firing twice with an `in-flight` ref); on success **merge**:
  `setHooked(prev => ({ ...next, sessionId: next.sessionId, catches: [...prev.catches.filter(unharvested), ...next.catches] }))`.
  Track `sessionId` per fish is unnecessary — a `SwimmingFish` also stores the
  `sessionId` it came from, so `handleFishClick` lands against the right session.
  (Simplest: `SwimmingFish` carries `{ catchId, sessionId, fish }`.)
- **`handleFishClick(sf)`** — unchanged harpoon animation; on impact:
  `const res = await onLand(hooked, 'submarine', sf.catchId)`.
  `res.outcome === 'landed'` → `setHarvested(s => new Set(s).add(sf.catchId))`,
  remove `sf` from `fishes`, `setCaughtFish({ fish: FISH.find(res.caught!.fishId)!, weight: res.caught!.weight })`.
  `res.outcome === 'failed'` → just remove `sf`, no reveal (rare; a stale session).
- `spawnFish` (the standalone function) and its inline rarity logic are **deleted**
  (moved to `fishingLogic.rollSubmarineFish` in B3); the component no longer
  imports `rollWeight` / `FISH` for rolling (it still imports `FISH` to resolve
  `fishId → Fish` for the reveal, and `FISH_IMAGES`).

### D4. Tests

- **`src/test/fishingLogic.test.ts`** — `rollSubmarineFish` with a stubbed
  `random`: `r = 0.001` → a cosmic is eligible; `r = 0.5` → only common eligible;
  pick index via the second `random()`. `rollSubmarineBatch(24, …)` → length 24,
  every element in `FISH`.
- **`src/test/persistence.test.ts`** (or wherever `saveSchema` is tested) — a save
  whose `warehouse` / `collection` contains a catch with `location: 'submarine'`
  **passes** `saveSchema.parse` (regression for the corruption bug); an unknown
  location like `'atlantis'` still fails.
- **`src/game/stateRules.test.ts`** — `applyCatch(state, [{…, location: 'submarine'}], { fromNet: false }, LOCATIONS)` adds to warehouse + collection + full XP.
- **`backend/src/fishing/service.test.ts`** (memory):
  - `cast({ mode: 'submarine' })` → `catches.length === 24`, every entry has a
    `id` (uuid) + `fishId` + `weight`; the blob `version` is **unchanged**; the
    blob `player` is **unchanged** (no `luckyUntil`); a session row exists with
    `mode: 'submarine'`, `status: 'open'`.
  - `land({ sessionId, catchId })` for a submarine session: XP up, warehouse +1,
    coins unchanged, `version + 1`; the session's `result_catches` now has 23
    entries and `created_at` moved forward; `status` still `'open'`.
  - harvest all 24 → after the 24th, `status: 'completed'`.
  - `land` with a `catchId` not in the roster → `INVALID_FISHING_SESSION`.
  - `land` with **no** `catchId` on a submarine session → `INVALID_FISHING_SESSION`.
  - replay same key → identical body, roster still shrank by exactly one.
  - `land` with a *new* key re-using an already-harvested `catchId` →
    `INVALID_FISHING_SESSION`.
  - `cast` dedupe: same key twice → same session id, same 24 `catches`.
- **`backend/src/fishing/routes.test.ts`** — `cast { mode: 'submarine' }` 200
  shape (`catches` with ids); `land { sessionId, catchId }` 200 → `caught` array
  of length 1; `land` without `catchId` on a submarine session → 422.
- **`backend/src/fishing/pgRepository.integration.test.ts`** — submarine cast
  (session row `mode = 'submarine'`, `result_catches` length 24, blob `version`
  unchanged, **no** `game_state_operations` row) + 3 harvests (`version` +3, 3
  `fishing_land` op rows, `result_catches` down to 21, `created_at` advanced);
  harvest the remaining 21 → `status = 'completed'`; deleting the user cascades
  the session.
- **`backend/src/app.test.ts`** — extend/keep the fishing flow test if it
  references modes; a submarine cast + harvest against the seeded blob.
- **`backend/src/http/openapi.test.ts`** — `land` body now lists `catchId`; the
  expected-paths list is unchanged (same two routes).
- **`src/api/endpoints.test.ts`** — `landCatch(key, sid, catchId)` posts
  `{ sessionId, catchId }`; `castLine(key, 'submarine', 'submarine')` body.
- **`src/test/SubmarineFishing.test.tsx`** — mock `onCast` to resolve a 3-entry
  `SubmarineHooked`; assert `onCast` called with `('submarine', 'submarine')` on
  mount; a fish becomes clickable and clicking it calls `onLand` with that
  entry's `catchId`; the caught overlay shows after `onLand` resolves `'landed'`;
  the back button calls `onBack`. (The canvas/rAF scene is not asserted — mock
  `requestAnimationFrame` / the canvas context as the existing test does, or
  render with the spawn interval faked.)
- **`src/test/*`** for `FishingScreen` / `NetFishing` — update the `onLand` mock
  return to `{ outcome: 'landed' }` (from `'landed'`); assert `.outcome` is read.

---

## E. File-by-file summary

| File | Change |
|---|---|
| `backend/migrations/0021_fishing_sessions_mode.sql` | **new** — `mode` column + backfill + check |
| `backend/src/db/schema.ts` | `fishingSessions.mode`; `result_catches` `$type` gains `id?`; mode check |
| `backend/src/fishing/service.ts` | `CastRoll`/`CastResult`/`FishingSessionRow` gain submarine; `rollCast` submarine branch (no lucky/location); `castPlayerPatch`/`sessionRowFor`/`castResultFor` submarine; `applyLand` `{ catchId }` + `remaining`; `FishingService.land` gains `catchId?`; memory `cast`/`land` submarine paths |
| `backend/src/fishing/pgRepository.ts` | drop `modeOf` (read `session.mode`); `cast` submarine (no blob write, no version bump); `land` passes `catchId`, submarine session update writes `result_catches`/`created_at`/conditional `completed` |
| `backend/src/fishing/routes.ts` | `land` body `catchId?: uuid`; pass through |
| `src/game/data.ts` | `SUBMARINE_LOCATION_ID` |
| `src/game/persistence.ts` | `caughtFishSchema` accepts `SUBMARINE_LOCATION_ID` |
| `src/game/fishingLogic.ts` | `SUBMARINE_ROSTER_SIZE`, `rollSubmarineFish`, `rollSubmarineBatch` |
| `src/game/fishing.ts` | `SubmarineCatch`, `SubmarineHooked`, `Hooked` union |
| `src/api/endpoints.ts` | `SubmarineCast`, `CastResult` union; `landCatch` gains `catchId?` |
| `src/pages/Index.tsx` | `handleCast` submarine (server + anon); `handleLand` `catchId?` + submarine branch + return `{ outcome, caught? }`; delete `handleCatch`; render `<SubmarineFishing onCast onLand>` |
| `src/components/game/SubmarineFishing.tsx` | props `onCast`/`onLand`; roster-sourced spawn + refill; `handleFishClick` → `onLand(_, _, catchId)`; delete `spawnFish` |
| `src/components/game/FishingScreen.tsx` | read `onLand(...).outcome` |
| `src/components/game/NetFishing.tsx` | read `onLand(...).outcome` |
| tests | as in D4 |

---

## F. Risks

- **`applyLand` now returns `remaining`** and callers must write it back for
  submarine. A rod/net caller ignoring `remaining` (it's `null`) is unaffected.
  Both PG and memory `land` must apply the session update for submarine or the
  roster never shrinks (infinite free fish from one cast). Integration test the
  roster shrink explicitly.
- **`mode` column default `'rod'` + backfill.** A net session created by a
  6b-1-era code path in the same deploy window would get `mode = 'rod'` from the
  default if the insert doesn't set `mode`. Mitigation: 6b-2 makes **every**
  `INSERT fishing_sessions` set `mode` explicitly (rod/net/submarine), and the
  backfill catches any pre-migration net rows. Verify the `sessionRowFor` /
  `tx.insert` paths always include `mode`.
- **Two `random()` draws per roster entry** in `rollSubmarineFish` (filter, then
  pick) × 24 = 48 `randomInt` calls per cast. Trivial cost; noted so the RNG
  audit (later) knows the call count.
- **Client roster / session bookkeeping.** The client tracks `(catchId →
  sessionId)` because a refill creates a new session while old fish still swim.
  The `SwimmingFish` carrying its own `sessionId` keeps this local and simple; a
  stale harvest (old session expired) returns `INVALID_FISHING_SESSION` → the
  component drops that fish silently (`outcome: 'failed'`).
- **`created_at` renewal on every harvest** means a submarine session on an active
  player effectively never expires. Acceptable: the roster is bounded (24), the
  session is `completed` once drained, and an abandoned session (player leaves
  mid-roster) still expires 5 min after the *last* harvest.
- **`applyCatch` per harvest = one blob write + version bump per click.** A fast
  clicker generates many versions and many `game_state_operations` rows. Same
  shape as the economy ops; the periodic pull and `applyServerResult` handle it.
  The op-row table grows one row per submarine fish caught — consistent with
  "one op row per value-granting action" already established.
- **`SubmarineFishing` is a large `@ts-nocheck`-adjacent component** with a hand-
  rolled rAF scene. The change is deliberately narrow (fish source + catch call);
  the canvas draw loop, harpoon animation, and HUD are untouched. Keep the diff
  reviewable by not reformatting the scene code.
- **Anonymous submarine save now validates** (the whole point) — but any anon
  player who *already* corrupted their local save before this ships still has an
  unparseable blob. `normalizePlayer` / the load path already discards an invalid
  save to a fresh one; 6b-2 doesn't add recovery for pre-existing corruption
  (out of scope, and the data is local-only).

---

## G. Verification

Gate: `npx tsc --noEmit -p tsconfig.app.json`, `npm run backend:typecheck`,
`npm run lint` (0 errors), `npm test`, `npm run build`, then with Postgres up
`npm run backend:db:migrate && npm run test:integration`.

Browser smoke (Docker stack, fresh account, `docker compose restart frontend
backend` first): open the submarine, confirm `POST /me/fishing/cast { mode:
'submarine' }` returns 24 `catches` and **no** `version` bump; harpoon several
fish, confirm each fires `POST /me/fishing/land { sessionId, catchId }` 200 with
`version + 1` and the reveal shows the server's fish; drain past ~20 to see the
background refill with no pause; check the DB: one `fishing_sessions` row per
cast with `mode = 'submarine'`, `game_state_operations` rows `fishing_land` one
per fish, `player_game_state.state` warehouse/collection grew, no
`STATE_VERSION_CONFLICT` beyond the known optimistic-concurrency retry. Reload
the page and confirm the save still parses (the `location: 'submarine'` fix).
