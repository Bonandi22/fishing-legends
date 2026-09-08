# Server-authoritative submarine catch (Task 10.3, slice 6b-2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make submarine fishing server-authoritative — the server rolls a 24-fish roster per `cast`, the client harvests one fish per click by synthetic `catchId`, and each harvest applies `applyCatch` to the `player_game_state` blob transactionally.

**Architecture:** Extend the existing `cast` / `land` fishing pair (slices 6a rod, 6b-1 net) with a `mode: 'submarine'` branch. Submarine `cast` is lucky-neutral: it rolls `rollSubmarineBatch(24)` into a new `fishing_sessions` row (`mode = 'submarine'`, `result_catches` = `[{ id, fishId, weight }]`), **without** touching the blob or bumping `version`. `land { sessionId, catchId }` applies exactly the roster entry with that `id` (`fromNet: false`), removes it from `result_catches`, renews `created_at`, and marks the session `completed` when the roster is drained. A `SUBMARINE_LOCATION_ID = 'submarine'` allowlist constant makes `caughtFishSchema` accept `location: 'submarine'`, fixing a latent save-corruption bug. A real `mode` column on `fishing_sessions` replaces the `result_catches != null ⇒ net` inference (submarine also uses `result_catches`).

**Tech Stack:** TypeScript (strict), React 18, Fastify 5, Drizzle ORM + PostgreSQL, Zod, Vitest. Backend ESM with `.js` import suffixes (NodeNext). Hand-written SQL migrations in `backend/migrations/` mirrored in `backend/src/db/schema.ts`.

**Spec:** `docs/superpowers/specs/2026-09-08-server-fishing-catch-6b2-submarine.md` — read it alongside this plan.

## Global Constraints

- **Backend ESM imports use `.js` suffixes** even for `.ts` files (`./service.js`, `../../../src/game/data.js`). NodeNext resolution.
- **Zod validation on every route body/param.** Never trust client input.
- **Value mutations happen in a DB transaction.** API responses never leak SQL / tokens / internal detail — throw `Error(<SNAKE_CASE_CODE>)` mapped in `backend/src/http/errors.ts`, or `AppError`.
- **Idempotency:** value-granting ops need an `Idempotency-Key` (16–128 chars) and must be atomic. `land` replays via `game_state_operations` keyed `(user_id, 'fishing_land', idempotency_key)`.
- **Migrations:** add `backend/migrations/NNNN_name.sql`, mirror in `db/schema.ts` (checks, uniques, `$type`), run `npm run backend:db:generate` to confirm no unexpected drift. The runner records each version in `schema_migrations`.
- **`applyCatch` must stay a verbatim behavioural match of `useGameState.catchFishBatch`** — the client's only catch path. The server calls the same pure rule from `src/game/stateRules.ts`.
- **Shared domain lives in `src/game/`** and is imported by both the frontend and the backend. Changing a rule means checking both sides.
- **No new `any`.** TypeScript strict everywhere.
- **RNG:** the server uses `const random = () => randomInt(1_000_000) / 1_000_000;` (`randomInt` from `node:crypto`). Not audited this slice.
- **Commits:** conventional-commit style subject; end the body with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
  ```
- **Gate before the PR:** `npx tsc --noEmit -p tsconfig.app.json`, `npm run backend:typecheck`, `npm run lint` (0 errors), `npm test`, `npm run build`, then with Postgres up `npm run backend:db:migrate && npm run test:integration`.
- **One PR** for the whole slice (branch `feature/task-10-3-fishing-catch-6b2`, already created).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/game/data.ts` | Fish + location catalog | **add** `SUBMARINE_LOCATION_ID` |
| `src/game/persistence.ts` | Versioned save envelope + Zod validation | `caughtFishSchema` accepts `SUBMARINE_LOCATION_ID` |
| `src/game/fishingLogic.ts` | Fish/weight rolls (injectable RNG) | **add** `SUBMARINE_ROSTER_SIZE`, `SUBMARINE_ROSTER_REFILL_AT`, `rollSubmarineFish`, `rollSubmarineBatch` |
| `src/game/fishing.ts` | Client "hooked" discriminated union | **add** `SubmarineCatch`, `SubmarineHooked`; widen `Hooked` |
| `backend/migrations/0021_fishing_sessions_mode.sql` | **new** | `mode` column + backfill + check |
| `backend/src/db/schema.ts` | Drizzle schema mirroring the SQL | `fishingSessions.mode`; `result_catches` `$type` gains `id?`; mode check |
| `backend/src/fishing/service.ts` | Roll + apply logic; memory `FishingService` | submarine `CastRoll`/`CastResult`/`FishingSessionRow`; `rollCast`/`castPlayerPatch`/`sessionRowFor`/`castResultFor`/`applyLand` branches; `land` gains `catchId?`; memory `cast`/`land` submarine paths |
| `backend/src/fishing/pgRepository.ts` | PostgreSQL `FishingService` | drop `modeOf`; `cast`/`land` submarine paths |
| `backend/src/fishing/routes.ts` | Fastify routes + Zod bodies | `land` body `catchId?: uuid` |
| `src/api/endpoints.ts` | Typed HTTP client | `SubmarineCast`, `CastResult` union; `landCatch` gains `catchId?` |
| `src/pages/Index.tsx` | Screen router + auth/anon fork | `handleCast`/`handleLand` submarine; `handleLand` return shape; delete `handleCatch` |
| `src/components/game/FishingScreen.tsx` | Rod screen | read `onLand(...).outcome` |
| `src/components/game/NetFishing.tsx` | Net screen | read `onLand(...).outcome` |
| `src/components/game/SubmarineFishing.tsx` | Submarine screen | props `onCast`/`onLand`; roster spawn + refill; delete `spawnFish` |

---

## Task 1: Shared domain — `SUBMARINE_LOCATION_ID`, save-schema fix, submarine rolls, `SubmarineHooked`

**Files:**
- Modify: `src/game/data.ts` (add one export near `FISH` / `LOCATIONS`)
- Modify: `src/game/persistence.ts:3` (import) and `src/game/persistence.ts:36-38` (location check)
- Modify: `src/game/fishingLogic.ts` (add constants + two functions; keep `getWaitTime` untouched)
- Modify: `src/game/fishing.ts` (add types, widen `Hooked`)
- Test: `src/test/persistence.test.ts`, `src/test/fishingLogic.test.ts`, `src/game/stateRules.test.ts`

**Interfaces:**
- Produces:
  - `SUBMARINE_LOCATION_ID: 'submarine'` (from `src/game/data.ts`)
  - `SUBMARINE_ROSTER_SIZE = 24`, `SUBMARINE_ROSTER_REFILL_AT = 4` (from `src/game/fishingLogic.ts`)
  - `rollSubmarineFish(playerLevel: number, random?: () => number): Fish`
  - `rollSubmarineBatch(size: number, playerLevel: number, random?: () => number): Fish[]`
  - `SubmarineCatch = { id: string; fish: Fish; weight: number }`
  - `SubmarineHooked = { kind: 'submarine'; catches: SubmarineCatch[]; sessionId: string }`
  - `Hooked = RodHooked | NetHooked | SubmarineHooked`

- [ ] **Step 1: Write the failing test — save schema accepts `location: 'submarine'`**

Add to `src/test/persistence.test.ts` inside `describe("save persistence", ...)`:

```ts
it("accepts catches whose location is the submarine pseudo-location", () => {
  const tilapia = {
    fish: { id: "tilapia", name: "Tilápia", rarity: "common", waterType: "freshwater",
            minWeight: 0.3, maxWeight: 2.5, xp: 10, description: "", emoji: "🐟" },
    weight: 1, location: "submarine", timestamp: 1,
  };
  const loaded = parseSavedState(JSON.stringify({ ...fallback, warehouse: [tilapia] }), fallback);
  expect(loaded.warehouse).toHaveLength(1);
  expect(loaded.warehouse[0].location).toBe("submarine");
});

it("still rejects catches with an unknown location", () => {
  const tilapia = {
    fish: { id: "tilapia", name: "Tilápia", rarity: "common", waterType: "freshwater",
            minWeight: 0.3, maxWeight: 2.5, xp: 10, description: "", emoji: "🐟" },
    weight: 1, location: "atlantis", timestamp: 1,
  };
  expect(parseSavedState(JSON.stringify({ ...fallback, warehouse: [tilapia] }), fallback)).toEqual(fallback);
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `npx vitest run src/test/persistence.test.ts`
Expected: the "accepts … submarine" test FAILS (returns `fallback` because `caughtFishSchema` rejects `location: "submarine"`); the "still rejects … unknown" test passes.

- [ ] **Step 3: Add `SUBMARINE_LOCATION_ID` to `src/game/data.ts`**

Directly after the `FISH` array declaration ends (before `export const LOCATIONS`), or next to `getFishForLocation` — anywhere top-level. Add:

```ts
/** Pseudo-location for submarine catches. Not in LOCATIONS (it is a mode, not a
 *  place you travel to) — the save schema allowlists it explicitly. */
export const SUBMARINE_LOCATION_ID = 'submarine';
```

- [ ] **Step 4: Make `caughtFishSchema` accept it in `src/game/persistence.ts`**

Change the import on line 3:

```ts
import { FISH, LOCATIONS, SUBMARINE_LOCATION_ID } from './data.js';
```

Change the location check (currently lines ~36-38):

```ts
  if (caught.location !== SUBMARINE_LOCATION_ID
      && !LOCATIONS.some((location) => location.id === caught.location)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown location id: ${caught.location}`, path: ['location'] });
  }
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `npx vitest run src/test/persistence.test.ts`
Expected: PASS (both new tests + all existing).

- [ ] **Step 6: Write the failing test — `rollSubmarineFish` / `rollSubmarineBatch`**

Add to `src/test/fishingLogic.test.ts` (new `describe`):

```ts
import { rollSubmarineFish, rollSubmarineBatch, SUBMARINE_ROSTER_SIZE } from '@/game/fishingLogic';
import { FISH } from '@/game/data';

describe('submarine roll', () => {
  it('rollSubmarineFish returns a catalog fish; a high random keeps only commons eligible', () => {
    // random() sequence: first call is the per-fish filter roll, then the index pick.
    let calls = 0;
    const random = () => (calls++ === 0 ? 0.5 : 0); // 0.5 → only `common` passes the filter; 0 → index 0
    const fish = rollSubmarineFish(1, random);
    expect(fish.rarity).toBe('common');
    expect(FISH.some(f => f.id === fish.id)).toBe(true);
  });

  it('rollSubmarineBatch returns `size` catalog fish', () => {
    const batch = rollSubmarineBatch(SUBMARINE_ROSTER_SIZE, 1, () => 0);
    expect(batch).toHaveLength(SUBMARINE_ROSTER_SIZE);
    expect(batch.every(f => FISH.some(c => c.id === f.id))).toBe(true);
  });
});
```

> Note on the stub: `rollSubmarineFish` calls `random()` once **per fish** in the `FISH.filter` callback, then once more for the index. With `random` returning `0.5` on the first call and `0` after, only `common` fish pass the filter (`0.5 < 0.3` is false for uncommon and rarer), and `Math.floor(0 * n)` picks index 0. Keep the implementation's `random()` call order matching this: filter first, then pick.

- [ ] **Step 7: Run the test — verify it fails**

Run: `npx vitest run src/test/fishingLogic.test.ts`
Expected: FAIL — `rollSubmarineFish` / `rollSubmarineBatch` / `SUBMARINE_ROSTER_SIZE` are not exported.

- [ ] **Step 8: Implement in `src/game/fishingLogic.ts`**

Add near the top-level exports (after `rollWeight`, before or after `getWaitTime` — do **not** modify `getWaitTime`):

```ts
export const SUBMARINE_ROSTER_SIZE = 24;
/** Client re-casts a fresh roster when this many unharvested fish remain. */
export const SUBMARINE_ROSTER_REFILL_AT = 4;

/**
 * Rarity-weighted pick from the whole FISH catalog. Verbatim port of the inline
 * logic in the old `SubmarineFishing.spawnFish`. `playerLevel` is unused today
 * (kept for signature parity with `rollFish`). No odds change.
 */
export function rollSubmarineFish(playerLevel: number, random: () => number = Math.random): Fish {
  const available = FISH.filter(f => {
    const r = random();
    if (f.rarity === 'cosmic') return r < 0.002;
    if (f.rarity === 'legends') return r < 0.005;
    if (f.rarity === 'platinum') return r < 0.01;
    if (f.rarity === 'volcanic') return r < 0.02;
    if (f.rarity === 'abyssal') return r < 0.03;
    if (f.rarity === 'legendary') return r < 0.08;
    if (f.rarity === 'mythic') return r < 0.15;
    if (f.rarity === 'uncommon') return r < 0.3;
    return true;
  });
  return available[Math.floor(random() * available.length)] ?? FISH[0];
}

export function rollSubmarineBatch(size: number, playerLevel: number, random: () => number = Math.random): Fish[] {
  return Array.from({ length: size }, () => rollSubmarineFish(playerLevel, random));
}
```

Confirm `FISH` and `Fish` are already imported in `fishingLogic.ts` (they are — used by `rollFish` / `rollWeight`).

- [ ] **Step 9: Run the test — verify it passes**

Run: `npx vitest run src/test/fishingLogic.test.ts`
Expected: PASS.

- [ ] **Step 10: Add the `applyCatch` submarine-location test**

Add to `src/game/stateRules.test.ts` in the `applyCatch` describe block (find an existing single-catch test to model it on):

```ts
it('applies a single submarine catch (location "submarine", not fromNet)', () => {
  const state = makeState({ xp: 0, xpToNextLevel: 100000, warehouse: [], collection: [] });
  const cod = FISH.find(f => f.id === 'tilapia')!;
  const next = applyCatch(state, [{ fish: cod, weight: 1, location: 'submarine', timestamp: 1 }], { fromNet: false }, LOCATIONS);
  expect(next.warehouse).toHaveLength(1);
  expect(next.warehouse[0].location).toBe('submarine');
  expect(next.totalFishCaught).toBe(1);
  expect(next.xp).toBe(cod.xp);
});
```

Adjust `makeState` / `FISH` import to whatever helpers `stateRules.test.ts` already uses (check the file header).

- [ ] **Step 11: Run the test — verify it passes**

Run: `npx vitest run src/game/stateRules.test.ts`
Expected: PASS (this is a no-behaviour-change assertion — `applyCatch` never validated `location`; it exercises the pseudo-location end-to-end through the pure rule).

- [ ] **Step 12: Add the `SubmarineHooked` type in `src/game/fishing.ts`**

Replace the file's last two constructs:

```ts
/** One roster entry the server (or the local roll) produced for the submarine. */
export type SubmarineCatch = { id: string; fish: Fish; weight: number };

/** A server-rolled submarine roster, harvested one fish per click by `id`. */
export type SubmarineHooked = {
  kind: 'submarine';
  catches: SubmarineCatch[];
  sessionId: string;   // '' for the anonymous local roll
};

export type Hooked = RodHooked | NetHooked | SubmarineHooked;
```

- [ ] **Step 13: Typecheck + full frontend test run**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx vitest run src/`
Expected: no type errors; all tests pass (widening `Hooked` does not break `Index` / `FishingScreen` / `NetFishing` yet — they narrow on `kind`).

- [ ] **Step 14: Commit**

```bash
git add src/game/data.ts src/game/persistence.ts src/game/fishingLogic.ts src/game/fishing.ts \
        src/test/persistence.test.ts src/test/fishingLogic.test.ts src/game/stateRules.test.ts
git commit -m "$(cat <<'EOF'
game: submarine roll + SUBMARINE_LOCATION_ID (fixes save corruption)

caughtFishSchema now allowlists location:'submarine' — a submarine catch no
longer fails saveSchema.parse and discards the blob. rollSubmarineFish /
rollSubmarineBatch port SubmarineFishing.spawnFish's rarity logic verbatim.
SubmarineHooked joins the Hooked union.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
EOF
)"
```

---

## Task 2: Migration `0021` — `fishing_sessions.mode` column

**Files:**
- Create: `backend/migrations/0021_fishing_sessions_mode.sql`
- Modify: `backend/src/db/schema.ts` (`fishingSessions` table: `mode` column, `result_catches` `$type`, mode check)
- Test: `backend/src/db/migrate.integration.test.ts` already asserts "all migrations apply cleanly" — no new test needed, but run it.

**Interfaces:**
- Produces: `fishing_sessions.mode` (`varchar(16) NOT NULL DEFAULT 'rod'`, check `IN ('rod','net','submarine')`); `fishingSessions.mode` Drizzle column; `resultCatches` `$type<Array<{ id?: string; fishId: string; weight: number }>>`.

- [ ] **Step 1: Write the migration**

Create `backend/migrations/0021_fishing_sessions_mode.sql`:

```sql
-- 6b-2: submarine sessions also use result_catches, so the net/rod inference
-- (result_catches != null => net) breaks. A real mode column replaces it.
ALTER TABLE fishing_sessions ADD COLUMN mode varchar(16) NOT NULL DEFAULT 'rod';

-- Cleanup: existing rows are all past their 5-min TTL, but keep them consistent.
UPDATE fishing_sessions SET mode = 'net' WHERE result_catches IS NOT NULL;

ALTER TABLE fishing_sessions ADD CONSTRAINT fishing_sessions_mode_check
  CHECK (mode IN ('rod', 'net', 'submarine'));
```

- [ ] **Step 2: Mirror in `backend/src/db/schema.ts`**

In the `fishingSessions` `pgTable` column list, add after `status`:

```ts
  mode: varchar('mode', { length: 16 }).notNull().default('rod'),
```

Change the `resultCatches` column's `$type`:

```ts
  resultCatches: jsonb('result_catches').$type<Array<{ id?: string; fishId: string; weight: number }>>(),
```

In the table's second-arg extras object, add alongside `statusCheck`:

```ts
  modeCheck: check('fishing_sessions_mode_check', sql`${table.mode} IN ('rod', 'net', 'submarine')`),
```

Confirm `varchar`, `check`, `sql` are already imported at the top of `schema.ts` (they are — used elsewhere).

- [ ] **Step 3: Apply the migration and check for drift**

Run (Postgres must be up — `docker compose up -d postgres` or the compose stack):

```bash
DATABASE_URL="postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure" npm run backend:db:migrate
npm run backend:db:generate
```

Expected: migrate applies `0021`; `backend:db:generate` reports **no** schema diff (or only the expected `mode` column + check if it had not been mirrored — it has). If drift is reported, reconcile `schema.ts` with the SQL until clean. `backend/migrations/generated/` is git-ignored — do not commit it.

- [ ] **Step 4: Run the migration integration test + backend typecheck**

Run:

```bash
npm run backend:typecheck
DATABASE_URL="postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure" npx vitest run -c vitest.integration.config.ts backend/src/db/migrate.integration.test.ts
```

Expected: typecheck clean; migration test green.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/0021_fishing_sessions_mode.sql backend/src/db/schema.ts
git commit -m "$(cat <<'EOF'
db: fishing_sessions.mode column (0021)

Submarine sessions also carry result_catches, so `result_catches != null =>
net` no longer identifies the mode. Adds an explicit mode column
(rod|net|submarine), backfills existing net rows, and widens the
result_catches element type with an optional `id` (submarine roster entries).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
EOF
)"
```

---

## Task 3: Backend `service.ts` — submarine `rollCast` + memory `cast`

**Files:**
- Modify: `backend/src/fishing/service.ts` (types; `rollCast`; `castPlayerPatch`; `sessionRowFor`; `castResultFor`; `createMemoryFishingService.cast`)
- Test: `backend/src/fishing/service.test.ts`

**Interfaces:**
- Consumes: `rollSubmarineBatch`, `SUBMARINE_ROSTER_SIZE` (Task 1); `SUBMARINE_LOCATION_ID` (Task 1); `fishing_sessions.mode` (Task 2).
- Produces:
  - `SubmarineRoll = { mode: 'submarine'; catches: Array<{ id: string; fishId: string; weight: number }> }`
  - `CastRoll = RodRoll | NetRoll | SubmarineRoll`
  - `CastResult` gains `(CastBase & { mode: 'submarine'; catches: Array<{ id: string; fishId: string; weight: number }> })`
  - `FishingSessionRow.mode: 'rod' | 'net' | 'submarine'`
  - `rollCast(player, locationId, mode, now)` returns a `SubmarineRoll` for `mode === 'submarine'` (no lucky, no location lookup, no level gate)
  - `createMemoryFishingService().cast(userId, key, locationId, 'submarine')` → creates a session, **does not** write the blob, `version` unchanged

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/fishing/service.test.ts` a new `describe`:

```ts
import { SUBMARINE_ROSTER_SIZE } from '../../../src/game/fishingLogic.js';

describe('memory fishing service — submarine mode', () => {
  it('cast submarine: 24 roster entries with ids, blob + version untouched, session mode submarine', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ level: 6 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);

    const res = await svc.cast('u1', 'cast-sub-aaaaaaaaaaaa', 'submarine', 'submarine');
    if (res.mode !== 'submarine') throw new Error('expected a submarine cast');
    expect(res.catches).toHaveLength(SUBMARINE_ROSTER_SIZE);
    expect(res.catches.every(c => typeof c.id === 'string' && c.id.length > 0)).toBe(true);
    expect(res.catches.every(c => typeof c.fishId === 'string' && c.weight > 0)).toBe(true);
    expect(res.version).toBe(1);                       // no bump
    expect(res.lucky).toBe(false);
    const p = (store.get('u1')!.state as { player: Record<string, unknown> }).player;
    expect(p.luckyUntil).toBeUndefined();              // cast did not write the lucky window
    expect(store.get('u1')!.version).toBe(1);
  });

  it('cast submarine dedupes on the idempotency key', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    const a = await svc.cast('u1', 'cast-sub-bbbbbbbbbbbb', 'submarine', 'submarine');
    const b = await svc.cast('u1', 'cast-sub-bbbbbbbbbbbb', 'submarine', 'submarine');
    if (a.mode !== 'submarine' || b.mode !== 'submarine') throw new Error('expected submarine casts');
    expect(b.sessionId).toBe(a.sessionId);
    expect(b.catches).toEqual(a.catches);
  });

  it('cast submarine with no blob -> GAME_STATE_NOT_FOUND', async () => {
    const svc = createMemoryFishingService(createMemoryGameStateStore());
    await expect(svc.cast('u1', 'cast-sub-cccccccccccc', 'submarine', 'submarine'))
      .rejects.toThrow('GAME_STATE_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run backend/src/fishing/service.test.ts`
Expected: FAIL — `rollCast` throws `INVALID_FISHING_REQUEST` for `submarine` (the current final `throw`), so `cast` rejects.

- [ ] **Step 3: Add the submarine types in `service.ts`**

Update the type block near the top:

```ts
export type BatchEntry = { fishId: string; weight: number };
export type SubmarineEntry = { id: string; fishId: string; weight: number };

export type FishingSessionRow = {
  id: string;
  userId: string;
  locationId: string;
  idempotencyKey: string;
  mode: 'rod' | 'net' | 'submarine';
  status: 'open' | 'completed' | 'expired';
  createdAt: Date;
  resultFishId: string | null;
  resultWeight: number | null;
  resultXp: number | null;
  resultLucky: boolean;
  resultCatches: Array<{ id?: string; fishId: string; weight: number }> | null;
};

type CastBase = { sessionId: string; lucky: boolean; state: SaveEnvelope; version: number };
export type CastResult =
  | (CastBase & { mode: 'rod'; fishId: string; weight: number; xp: number })
  | (CastBase & { mode: 'net'; net: NetInfo; catches: BatchEntry[] })
  | (CastBase & { mode: 'submarine'; catches: SubmarineEntry[] });
```

Add the roll variant:

```ts
type SubmarineRoll = { mode: 'submarine'; catches: SubmarineEntry[] };
export type CastRoll = RodRoll | NetRoll | SubmarineRoll;
```

- [ ] **Step 4: Add the `rollCast` submarine branch**

In `rollCast`, **before** the final `throw new Error('INVALID_FISHING_REQUEST')`, and note the location lookup at the top still runs — restructure so submarine skips it:

```ts
export function rollCast(
  player: SaveEnvelope['player'],
  locationId: string,
  mode: CastMode,
  now: number,
): CastRoll {
  if (mode === 'submarine') {
    const batch = rollSubmarineBatch(SUBMARINE_ROSTER_SIZE, player.level, random);
    return {
      mode: 'submarine',
      catches: batch.map(f => ({ id: randomUUID(), fishId: f.id, weight: rollWeight(f, random) })),
    };
  }

  const location = LOCATIONS.find(l => l.id === locationId);
  if (!location) throw new Error('INVALID_FISHING_REQUEST');
  if (player.level < location.requiredLevel) throw new Error('LOCATION_LOCKED');

  const luck = resolveLuckyMode(player, now, random);
  // ... rest unchanged (rod / net branches, final throw) ...
}
```

Add imports at the top of `service.ts`:

```ts
import { rollFish, rollWeight, rollSubmarineBatch, SUBMARINE_ROSTER_SIZE } from '../../../src/game/fishingLogic.js';
```

(`rollFish` / `rollWeight` are already imported — extend the same line.) `randomUUID` is already imported from `node:crypto`.

- [ ] **Step 5: `castPlayerPatch` — submarine is a no-op**

```ts
export function castPlayerPatch(player: SaveEnvelope['player'], roll: CastRoll): SaveEnvelope['player'] {
  if (roll.mode === 'submarine') return player;
  const next = { ...player, luckyUntil: roll.luckyUntil, luckyCooldownUntil: roll.luckyCooldownUntil };
  if (roll.mode === 'net') next.nets = roll.netsAfter;
  return next;
}
```

- [ ] **Step 6: `sessionRowFor` — build `common` without `resultLucky`, add per branch**

```ts
function sessionRowFor(roll: CastRoll, id: string, userId: string, locationId: string, idempotencyKey: string): FishingSessionRow {
  const common = {
    id, userId, locationId, idempotencyKey, status: 'open' as const, createdAt: new Date(),
  };
  if (roll.mode === 'submarine') {
    return { ...common, mode: 'submarine', resultLucky: false, resultFishId: null, resultWeight: null, resultXp: null, resultCatches: roll.catches };
  }
  if (roll.mode === 'net') {
    return { ...common, mode: 'net', resultLucky: roll.lucky, resultFishId: null, resultWeight: null, resultXp: null, resultCatches: roll.catches };
  }
  return { ...common, mode: 'rod', resultLucky: roll.lucky, resultFishId: roll.fishId, resultWeight: roll.weight, resultXp: roll.xp, resultCatches: null };
}
```

- [ ] **Step 7: `castResultFor` — submarine branch, `base.lucky` guard**

```ts
function castResultFor(roll: CastRoll, sessionId: string, state: SaveEnvelope, version: number): CastResult {
  const base: CastBase = { sessionId, lucky: roll.mode === 'submarine' ? false : roll.lucky, state, version };
  if (roll.mode === 'submarine') return { ...base, mode: 'submarine', catches: roll.catches };
  if (roll.mode === 'net') return { ...base, mode: 'net', net: roll.net, catches: roll.catches };
  return { ...base, mode: 'rod', fishId: roll.fishId, weight: roll.weight, xp: roll.xp };
}
```

- [ ] **Step 8: Memory `cast` — submarine skips the blob write**

In `createMemoryFishingService`'s `cast`, after `const roll = rollCast(player, locationId, mode, now);`:

```ts
      const isSubmarine = roll.mode === 'submarine';
      const version = isSubmarine ? entry.version : entry.version + 1;
      const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: castPlayerPatch(player, roll) };
      if (!isSubmarine) {
        store.set(userId, { state, updatedAt: new Date().toISOString(), version });
      }

      const session = sessionRowFor(roll, randomUUID(), userId, locationId, idempotencyKey);
      sessions.set(session.id, session);
      castByKey.set(dedupeKey, session.id);

      return castResultFor(roll, session.id, state, version);
```

(For submarine, `castPlayerPatch` returns `player` unchanged, so `state` is the current envelope and `version` is `entry.version`.)

Update the **dedupe re-return** block at the top of `cast` to handle `mode === 'submarine'`:

```ts
      if (existingId) {
        const s = sessions.get(existingId)!;
        const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: envelopeOf(entry.state).player };
        if (s.mode === 'submarine') {
          return { sessionId: s.id, mode: 'submarine', lucky: false, state, version: entry.version, catches: s.resultCatches as SubmarineEntry[] };
        }
        return s.mode === 'net'
          ? { /* unchanged net re-return */ }
          : { /* unchanged rod re-return */ };
      }
```

- [ ] **Step 9: Run — verify it passes**

Run: `npx vitest run backend/src/fishing/service.test.ts`
Expected: PASS (new submarine describe + all existing rod/net tests).

- [ ] **Step 10: Backend typecheck**

Run: `npm run backend:typecheck`
Expected: clean. (If `pgRepository.ts` errors on `modeOf` / `CastResult` — that's Task 5's job; if the errors block, temporarily add `// @ts-expect-error 6b-2 Task 5` at the offending `pgRepository` lines and remove them in Task 5. Prefer to just do Task 5 next.)

- [ ] **Step 11: Commit**

```bash
git add backend/src/fishing/service.ts backend/src/fishing/service.test.ts
git commit -m "$(cat <<'EOF'
fishing: rollCast submarine branch + memory cast (no blob write)

A submarine cast rolls a 24-fish roster (each entry gets a synthetic uuid),
creates an 'open' session with mode 'submarine', and returns the current
{state, version} unchanged — submarine is lucky-neutral, so cast touches
neither the lucky window nor the version.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
EOF
)"
```

---

## Task 4: Backend `service.ts` — `applyLand` `{ catchId }` + memory `land` harvest

**Files:**
- Modify: `backend/src/fishing/service.ts` (`applyLand`; `FishingService.land`; `createMemoryFishingService.land`)
- Test: `backend/src/fishing/service.test.ts`

**Interfaces:**
- Consumes: `SubmarineRoll` / `CastResult` submarine (Task 3); `FishingSessionRow.mode` (Task 3).
- Produces:
  - `applyLand(player, session, now, opts?: { catchId?: string })` returns `{ player, caught: Caught[], remaining: Array<{ id?: string; fishId: string; weight: number }> | null }` — `remaining` is `null` for rod/net, the post-harvest roster for submarine.
  - `FishingService.land(userId, idempotencyKey, sessionId, catchId?)`
  - Memory `land`: a submarine harvest applies one entry (`fromNet: false`), shrinks `session.resultCatches`, sets `session.createdAt = new Date(now)`, and flips `session.status = 'completed'` when the roster is empty; `version + 1`.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('memory fishing service — submarine mode', ...)` from Task 3:

```ts
it('land a submarine harvest: applies one, roster shrinks, session stays open, version +1', async () => {
  const store = createMemoryGameStateStore();
  store.set('u1', { state: blob({ level: 6, xp: 0, xpToNextLevel: 100000 }), updatedAt: 'now', version: 1 });
  const svc = createMemoryFishingService(store);
  const cast = await svc.cast('u1', 'cast-sub-dddddddddddd', 'submarine', 'submarine');
  if (cast.mode !== 'submarine') throw new Error('expected a submarine cast');

  const first = cast.catches[0];
  const land = await svc.land('u1', 'land-sub-dddddddddddd-1', cast.sessionId, first.id);
  expect(land.version).toBe(2);                       // cast was 1 (no bump), land bumps
  expect(land.caught).toEqual([{ fishId: first.fishId, weight: first.weight, location: 'submarine' }]);
  expect(land.state.player.warehouse).toHaveLength(1);
  expect(land.state.player.totalFishCaught).toBe(1);
});

it('harvest every roster entry -> session completes on the last one', async () => {
  const store = createMemoryGameStateStore();
  store.set('u1', { state: blob({ level: 6, xp: 0, xpToNextLevel: 999999 }), updatedAt: 'now', version: 1 });
  const svc = createMemoryFishingService(store);
  const cast = await svc.cast('u1', 'cast-sub-eeeeeeeeeeee', 'submarine', 'submarine');
  if (cast.mode !== 'submarine') throw new Error('expected a submarine cast');
  for (let i = 0; i < cast.catches.length; i++) {
    await svc.land('u1', `land-sub-eeeeeeeeeeee-${i}`, cast.sessionId, cast.catches[i].id);
  }
  await expect(svc.land('u1', 'land-sub-eeeeeeeeeeee-after', cast.sessionId, cast.catches[0].id))
    .rejects.toThrow('INVALID_FISHING_SESSION'); // session completed + entry gone
});

it('land a submarine session with no catchId -> INVALID_FISHING_SESSION', async () => {
  const store = createMemoryGameStateStore();
  store.set('u1', { state: blob({ level: 6 }), updatedAt: 'now', version: 1 });
  const svc = createMemoryFishingService(store);
  const cast = await svc.cast('u1', 'cast-sub-ffffffffffff', 'submarine', 'submarine');
  await expect(svc.land('u1', 'land-sub-ffffffffffff', cast.sessionId))
    .rejects.toThrow('INVALID_FISHING_SESSION');
});

it('land a submarine harvest with an unknown catchId -> INVALID_FISHING_SESSION', async () => {
  const store = createMemoryGameStateStore();
  store.set('u1', { state: blob({ level: 6 }), updatedAt: 'now', version: 1 });
  const svc = createMemoryFishingService(store);
  const cast = await svc.cast('u1', 'cast-sub-gggggggggggg', 'submarine', 'submarine');
  await expect(svc.land('u1', 'land-sub-gggggggggggg', cast.sessionId, '00000000-0000-0000-0000-000000000000'))
    .rejects.toThrow('INVALID_FISHING_SESSION');
});

it('submarine harvest replays on the same key: identical body, roster shrank by one', async () => {
  const store = createMemoryGameStateStore();
  store.set('u1', { state: blob({ level: 6 }), updatedAt: 'now', version: 1 });
  const svc = createMemoryFishingService(store);
  const cast = await svc.cast('u1', 'cast-sub-hhhhhhhhhhhh', 'submarine', 'submarine');
  if (cast.mode !== 'submarine') throw new Error('expected a submarine cast');
  const a = await svc.land('u1', 'land-sub-hhhhhhhhhhhh', cast.sessionId, cast.catches[0].id);
  const b = await svc.land('u1', 'land-sub-hhhhhhhhhhhh', cast.sessionId, cast.catches[0].id);
  expect(b).toEqual(a);
  expect(store.get('u1')!.version).toBe(2);
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run backend/src/fishing/service.test.ts`
Expected: FAIL — `svc.land` has no `catchId` param; the submarine session hits the rod/net `applyLand` path and mis-applies (or the 4-arg call is a type error surfaced at test compile).

- [ ] **Step 3: `applyLand` grows `opts` + `remaining`**

```ts
export function applyLand(
  player: SaveEnvelope['player'],
  session: Pick<FishingSessionRow, 'mode' | 'locationId' | 'resultFishId' | 'resultWeight' | 'resultCatches'>,
  now: number,
  opts: { catchId?: string } = {},
): { player: SaveEnvelope['player']; caught: Caught[]; remaining: Array<{ id?: string; fishId: string; weight: number }> | null } {
  if (session.mode === 'submarine') {
    const roster = session.resultCatches ?? [];
    const entry = opts.catchId ? roster.find(e => e.id === opts.catchId) : undefined;
    if (!entry) throw new Error('INVALID_FISHING_SESSION');
    const fish = FISH.find(f => f.id === entry.fishId);
    if (!fish) throw new Error('INVALID_FISHING_SESSION');
    const caught = { fish, weight: entry.weight, location: SUBMARINE_LOCATION_ID, timestamp: now };
    return {
      player: applyCatch(player, [caught], { fromNet: false }, LOCATIONS),
      caught: [{ fishId: fish.id, weight: entry.weight, location: SUBMARINE_LOCATION_ID }],
      remaining: roster.filter(e => e.id !== opts.catchId),
    };
  }

  // rod / net — unchanged body, plus `remaining: null`
  const rows: Array<{ fishId: string; weight: number }> = session.resultCatches
    ?? [{ fishId: session.resultFishId!, weight: Number(session.resultWeight) }];
  const catches = rows.map(r => {
    const fish = FISH.find(f => f.id === r.fishId);
    if (!fish) throw new Error('INVALID_FISHING_SESSION');
    return { fish, weight: r.weight, location: session.locationId, timestamp: now };
  });
  return {
    player: applyCatch(player, catches, { fromNet: session.mode === 'net' }, LOCATIONS),
    caught: catches.map(c => ({ fishId: c.fish.id, weight: c.weight, location: session.locationId })),
    remaining: null,
  };
}
```

Add `SUBMARINE_LOCATION_ID` to the `data.js` import in `service.ts`:

```ts
import { FISH, LOCATIONS, getFishForLocation, SUBMARINE_LOCATION_ID } from '../../../src/game/data.js';
```

- [ ] **Step 4: `FishingService.land` signature**

```ts
export interface FishingService {
  cast(userId: string, idempotencyKey: string, locationId: string, mode?: CastMode): Promise<CastResult>;
  land(userId: string, idempotencyKey: string, sessionId: string, catchId?: string): Promise<LandResult>;
}
```

- [ ] **Step 5: Memory `land` — submarine harvest path**

In `createMemoryFishingService`'s `land(userId, idempotencyKey, sessionId, catchId)`:

After the `landByKey` replay check and the session/`GAME_STATE_NOT_FOUND` guards, and the `status === 'completed'` / expired guards, replace the single apply block with:

```ts
      const now = Date.now();
      const applied = applyLand(envelopeOf(entry.state).player, session, now, { catchId });
      const version = entry.version + 1;
      const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: applied.player };
      store.set(userId, { state, updatedAt: new Date().toISOString(), version });

      if (session.mode === 'submarine') {
        session.resultCatches = applied.remaining;
        session.createdAt = new Date(now);
        if ((applied.remaining ?? []).length === 0) session.status = 'completed';
      } else {
        session.status = 'completed';
      }

      const result: LandResult = { state, version, caught: applied.caught };
      landByKey.set(replayKey, result);
      return result;
```

The `status === 'completed'` early-return (a same-key retry after the roster drained) is already handled by the `landByKey` map — the memory service keys replays by `idempotencyKey`, so a same-key retry returns the stored `result` before the session state is consulted.

The `recordedCaught()` helper inside memory `land` (used by the `status === 'completed'` branch for a *different*-key retry) — for a submarine session that path should throw, since a new key on a finished roster is not a valid harvest:

```ts
      if (session.status === 'completed') {
        if (session.mode === 'submarine') throw new Error('INVALID_FISHING_SESSION');
        const result: LandResult = { /* unchanged rod/net completed re-return */ };
        landByKey.set(replayKey, result);
        return result;
      }
```

- [ ] **Step 6: Run — verify it passes**

Run: `npx vitest run backend/src/fishing/service.test.ts`
Expected: PASS (submarine describe complete + rod/net unchanged).

- [ ] **Step 7: Backend typecheck**

Run: `npm run backend:typecheck`
Expected: `pgRepository.ts` will now have errors (`modeOf` return type, `applyLand` arity, `land` signature). That is Task 5 — proceed directly.

- [ ] **Step 8: Commit**

```bash
git add backend/src/fishing/service.ts backend/src/fishing/service.test.ts
git commit -m "$(cat <<'EOF'
fishing: applyLand { catchId } + memory land submarine harvest

A submarine land applies exactly the roster entry whose synthetic id matches
catchId (fromNet: false), returns the shrunk roster as `remaining`, renews
the session created_at, and completes the session when the roster empties.
Missing / unknown / already-harvested catchId -> INVALID_FISHING_SESSION.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
EOF
)"
```

---

## Task 5: Backend `pgRepository.ts` — submarine `cast` + `land`

**Files:**
- Modify: `backend/src/fishing/pgRepository.ts`
- Test: `backend/src/fishing/pgRepository.integration.test.ts`

**Interfaces:**
- Consumes: `applyLand` `{ catchId }` + `remaining` (Task 4); `FishingSessionRow.mode` (Task 3); `fishing_sessions.mode` column (Task 2).
- Produces: `createPgFishingService(db)` handles `mode: 'submarine'` — `cast` inserts the session with `mode: 'submarine'` and **no** blob write / version bump; `land` passes `catchId` to `applyLand` and writes the shrunk `result_catches` + renewed `created_at` (+ conditional `completed`).

- [ ] **Step 1: Write the failing integration test**

Add to `backend/src/fishing/pgRepository.integration.test.ts` (match the file's existing harness/imports — it uses the pg test harness that migrates + truncates):

```ts
it('submarine: cast writes no blob/op, harvests bump version and shrink the roster, drain completes', async () => {
  const svc = createPgFishingService(db);
  const userId = await seedUser(db);          // whatever the file's helper is
  await seedBlob(db, userId, { level: 6, xp: 0, xpToNextLevel: 999999 });

  const cast = await svc.cast(userId, 'cast-sub-int-aaaaaaaa', 'submarine', 'submarine');
  if (cast.mode !== 'submarine') throw new Error('expected a submarine cast');
  expect(cast.catches).toHaveLength(24);
  expect(cast.version).toBe(1);

  const sessionRow = (await db.select().from(fishingSessions).where(eq(fishingSessions.userId, userId)))[0];
  expect(sessionRow.mode).toBe('submarine');
  expect(sessionRow.resultCatches).toHaveLength(24);
  const opsAfterCast = await db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
  expect(opsAfterCast).toHaveLength(0);        // cast writes no op row

  for (let i = 0; i < 3; i++) {
    await svc.land(userId, `land-sub-int-aaaaaaaa-${i}`, cast.sessionId, cast.catches[i].id);
  }
  const blobRow = (await db.select().from(playerGameState).where(eq(playerGameState.userId, userId)))[0];
  expect(blobRow.version).toBe(4);            // 1 + 3 harvests
  const sessionAfter = (await db.select().from(fishingSessions).where(eq(fishingSessions.id, cast.sessionId)))[0];
  expect(sessionAfter.resultCatches).toHaveLength(21);
  expect(sessionAfter.status).toBe('open');

  for (let i = 3; i < 24; i++) {
    await svc.land(userId, `land-sub-int-aaaaaaaa-${i}`, cast.sessionId, cast.catches[i].id);
  }
  const drained = (await db.select().from(fishingSessions).where(eq(fishingSessions.id, cast.sessionId)))[0];
  expect(drained.status).toBe('completed');
});
```

Adapt helper names (`seedUser`, `seedBlob`, imports of `fishingSessions` / `playerGameState` / `gameStateOperations` / `eq`) to the file's existing conventions.

- [ ] **Step 2: Run — verify it fails**

Run: `DATABASE_URL="postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure" npx vitest run -c vitest.integration.config.ts backend/src/fishing/pgRepository.integration.test.ts`
Expected: FAIL / compile error — `modeOf` returns `'rod' | 'net'`, `land` has no `catchId` param.

- [ ] **Step 3: Drop `modeOf`, read `session.mode`**

Delete the `modeOf` function. Everywhere it was called (`modeOf(session)` / `modeOf(s)`), use `session.mode` / `s.mode` directly (now a real column, typed by `typeof fishingSessions.$inferSelect`).

- [ ] **Step 4: `cast` — submarine branch (no blob write)**

In `cast`, after `const roll = rollCast(currentPlayer, locationId, mode, now);`:

```ts
        const isSubmarine = roll.mode === 'submarine';
        const version = isSubmarine ? row.version : row.version + 1;
        const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: castPlayerPatch(currentPlayer, roll) };
        if (!isSubmarine) {
          await tx.update(playerGameState).set({ state, version, updatedAt: new Date() })
            .where(eq(playerGameState.userId, userId));
        }

        const [session] = await tx.insert(fishingSessions).values({
          id: randomUUID(), userId, locationId, rulesetVersion: RULESET_VERSION, idempotencyKey, status: 'open',
          mode: roll.mode,
          resultLucky: roll.mode === 'submarine' ? false : roll.lucky,
          ...(roll.mode === 'submarine'
            ? { resultCatches: roll.catches }
            : roll.mode === 'net'
              ? { resultCatches: roll.catches }
              : { resultFishId: roll.fishId, resultWeight: roll.weight.toFixed(2), resultXp: roll.xp }),
        }).returning();

        return roll.mode === 'submarine'
          ? { sessionId: session.id, mode: 'submarine', catches: roll.catches, lucky: false, state, version }
          : roll.mode === 'net'
            ? { sessionId: session.id, mode: 'net', net: roll.net, catches: roll.catches, lucky: roll.lucky, state, version }
            : { sessionId: session.id, mode: 'rod', fishId: roll.fishId, weight: roll.weight, xp: roll.xp, lucky: roll.lucky, state, version };
```

Update the **dedupe re-return** (`if (dupe[0])`) to add a submarine branch:

```ts
        if (dupe[0]) {
          const s = dupe[0];
          const state: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, player: currentPlayer };
          if (s.mode === 'submarine') {
            return { sessionId: s.id, mode: 'submarine', lucky: false, state, version: row.version,
                     catches: (s.resultCatches ?? []) as Array<{ id: string; fishId: string; weight: number }> };
          }
          return s.mode === 'net'
            ? { /* unchanged */ }
            : { /* unchanged */ };
        }
```

Keep the `SELECT player_game_state ... FOR UPDATE` for all modes (uniform; cast is not a hot path).

- [ ] **Step 5: `land` — pass `catchId`, submarine session update**

Signature: `async land(userId, idempotencyKey, sessionId, catchId)`.

`applyLand` call gains the opts:

```ts
        const applied = applyLand(saveSchema.parse(blob.state).player, {
          mode: session.mode,
          locationId: session.locationId,
          resultFishId: session.resultFishId,
          resultWeight: session.resultWeight === null ? null : Number(session.resultWeight),
          resultCatches: session.resultCatches,
        }, now, { catchId });
```

The session update after the blob update:

```ts
        if (session.mode === 'submarine') {
          const remaining = applied.remaining ?? [];
          await tx.update(fishingSessions).set({
            resultCatches: remaining,
            createdAt: new Date(now),
            ...(remaining.length === 0 ? { status: 'completed', completedAt: new Date(now) } : {}),
          }).where(eq(fishingSessions.id, sessionId));
        } else {
          await tx.update(fishingSessions).set({ status: 'completed', completedAt: new Date() })
            .where(eq(fishingSessions.id, sessionId));
        }
```

The `status === 'completed'` early-return branch: guard submarine —

```ts
        if (session.status === 'completed') {
          if (session.mode === 'submarine') throw new Error('INVALID_FISHING_SESSION');
          return { state: ..., version: blob.version, caught: recordedCaught(session) };
        }
```

`recordedCaught` is now only reached for rod/net; leave it as-is (or narrow its param type — optional).

`now` is already `const now = Date.now();` in the `land` transaction.

- [ ] **Step 6: Run — verify it passes**

Run: `DATABASE_URL="postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure" npx vitest run -c vitest.integration.config.ts backend/src/fishing/pgRepository.integration.test.ts`
Expected: PASS (new submarine test + existing rod/net integration tests).

- [ ] **Step 7: Backend typecheck + full backend unit run**

Run: `npm run backend:typecheck && npx vitest run backend/src`
Expected: clean typecheck; all backend unit tests pass. (`routes.test.ts` / `app.test.ts` may still pass since `land`'s new param is optional and `cast` body already allows `mode: 'submarine'`.)

- [ ] **Step 8: Commit**

```bash
git add backend/src/fishing/pgRepository.ts backend/src/fishing/pgRepository.integration.test.ts
git commit -m "$(cat <<'EOF'
fishing: PG cast/land submarine paths; drop modeOf inference

Reads the new fishing_sessions.mode column instead of inferring from
result_catches. A submarine cast inserts the session without touching the
blob or version; a submarine land applies one roster entry, rewrites
result_catches without it, renews created_at, and completes the session on
drain.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
EOF
)"
```

---

## Task 6: Route + typed HTTP client — `land` `catchId`

**Files:**
- Modify: `backend/src/fishing/routes.ts` (`land` body schema + pass-through)
- Modify: `src/api/endpoints.ts` (`SubmarineCast`, `CastResult` union, `landCatch` param)
- Test: `backend/src/fishing/routes.test.ts`, `backend/src/http/openapi.test.ts`, `src/api/endpoints.test.ts`

**Interfaces:**
- Consumes: `FishingService.land(userId, key, sessionId, catchId?)` (Task 4); `CastResult` submarine (Task 3).
- Produces:
  - `POST /api/v1/me/fishing/land` body `{ sessionId: uuid, catchId?: uuid }`
  - `endpoints.landCatch(idempotencyKey, sessionId, catchId?)` → body `{ sessionId, ...(catchId ? { catchId } : {}) }`
  - `endpoints.SubmarineCast = GameStateEnvelope & { sessionId: string; mode: 'submarine'; catches: Array<{ id: string; fishId: string; weight: number }>; lucky: boolean }`
  - `endpoints.CastResult = RodCast | NetCast | SubmarineCast`

- [ ] **Step 1: Write the failing route tests**

Add to `backend/src/fishing/routes.test.ts`:

```ts
it('cast submarine -> 200 { sessionId, mode: "submarine", catches: [{id,fishId,weight}], version unchanged }', async () => {
  const a = await app(); const client = await registerAndAuth(a);
  await seed(client, blob());
  const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast',
    payload: { locationId: 'submarine', mode: 'submarine' } });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.mode).toBe('submarine');
  expect(body.catches).toHaveLength(24);
  expect(typeof body.catches[0].id).toBe('string');
});

it('land a submarine harvest -> 200 caught[] of length 1', async () => {
  const a = await app(); const client = await registerAndAuth(a);
  await seed(client, blob());
  const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast',
    payload: { locationId: 'submarine', mode: 'submarine' } })).json();
  const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land',
    payload: { sessionId: cast.sessionId, catchId: cast.catches[0].id },
    headers: { 'idempotency-key': 'land-sub-route-aaaaaaaa' } });
  expect(res.statusCode).toBe(200);
  expect(res.json().caught).toHaveLength(1);
});

it('land a submarine session with no catchId -> 422', async () => {
  const a = await app(); const client = await registerAndAuth(a);
  await seed(client, blob());
  const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast',
    payload: { locationId: 'submarine', mode: 'submarine' } })).json();
  const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land',
    payload: { sessionId: cast.sessionId },
    headers: { 'idempotency-key': 'land-sub-route-bbbbbbbb' } });
  expect(res.statusCode).toBe(422);
  expect(res.json().error.code).toBe('INVALID_FISHING_SESSION');
});
```

(Check whether `routes.test.ts` sets the `idempotency-key` header via a helper — if `client.request` already injects one, drop the explicit headers. Match the existing rod/net tests in the file.)

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run backend/src/fishing/routes.test.ts`
Expected: FAIL — `catchId` is stripped by the Zod body schema (currently `{ sessionId, fishId? }`), so the submarine `land` throws `INVALID_FISHING_SESSION` even with a valid id → the "200 caught[]" test fails; the "no catchId → 422" test may already pass.

- [ ] **Step 3: Update the route body + pass-through in `backend/src/fishing/routes.ts`**

```ts
  r.post('/api/v1/me/fishing/land', {
    schema: {
      tags: ['gamestate'],
      summary: 'Land the fish/batch the cast rolled, or harvest one submarine fish (needs Idempotency-Key)',
      body: z.object({ sessionId: z.string().uuid(), catchId: z.string().uuid().optional() }),
    },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.land(
      request.userId,
      idempotencyKey(request.headers['idempotency-key']),
      request.body.sessionId,
      request.body.catchId,
    );
  });
```

- [ ] **Step 4: Run — verify it passes**

Run: `npx vitest run backend/src/fishing/routes.test.ts backend/src/http/openapi.test.ts`
Expected: PASS. `openapi.test.ts` asserts the path list (`/api/v1/me/fishing/cast`, `/api/v1/me/fishing/land`) — unchanged, still green. If it also snapshots the body schema, update the snapshot.

- [ ] **Step 5: Write the failing `endpoints.test.ts` cases**

Add to `src/api/endpoints.test.ts` (match the file's `apiFetch` mock style):

```ts
it('castLine posts the submarine mode', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ /* minimal SubmarineCast */ }));
  await castLine('idem-key-submarine-1', 'submarine', 'submarine');
  expect(lastBody()).toEqual({ locationId: 'submarine', mode: 'submarine' });
});

it('landCatch posts sessionId + catchId when given', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ version: 5, updatedAt: 'x', caught: [] }));
  await landCatch('idem-key-land-1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
  expect(lastBody()).toEqual({
    sessionId: '00000000-0000-0000-0000-000000000001',
    catchId: '00000000-0000-0000-0000-000000000002',
  });
});

it('landCatch omits catchId when not given', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ version: 5, updatedAt: 'x', caught: [] }));
  await landCatch('idem-key-land-2', '00000000-0000-0000-0000-000000000001');
  expect(lastBody()).toEqual({ sessionId: '00000000-0000-0000-0000-000000000001' });
});
```

Adapt `fetchMock` / `jsonResponse` / `lastBody` to the file's actual helpers.

- [ ] **Step 6: Run — verify it fails**

Run: `npx vitest run src/api/endpoints.test.ts`
Expected: FAIL — `landCatch`'s third param is named `fishId` and the body key is `fishId`, not `catchId`.

- [ ] **Step 7: Update `src/api/endpoints.ts`**

```ts
type CastBase = GameStateEnvelope & { sessionId: string; lucky: boolean };
export type RodCast = CastBase & { mode: 'rod'; fishId: string; weight: number; xp: number };
export type NetCast = CastBase & { mode: 'net'; net: NetInfo; catches: BatchEntry[] };
export type SubmarineCast = CastBase & { mode: 'submarine'; catches: Array<{ id: string; fishId: string; weight: number }> };
export type CastResult = RodCast | NetCast | SubmarineCast;

export function landCatch(idempotencyKey: string, sessionId: string, catchId?: string): Promise<LandResult> {
  return apiFetch('/me/fishing/land', {
    method: 'POST',
    body: { sessionId, ...(catchId ? { catchId } : {}) },
    idempotencyKey,
  });
}
```

(`castLine` already sends `{ locationId, mode }` — no change. If `CastResult` was previously an inline union without the `RodCast`/`NetCast` aliases, introduce the aliases so `Index` can narrow; keep names `RodCast` / `NetCast` / `SubmarineCast`.)

- [ ] **Step 8: Run — verify it passes**

Run: `npx vitest run src/api/endpoints.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: endpoints tests pass. `tsc` will now flag `src/pages/Index.tsx` (`landCatchApi` third arg, `CastResult` narrowing) — that is Task 7.

- [ ] **Step 9: Commit**

```bash
git add backend/src/fishing/routes.ts backend/src/fishing/routes.test.ts \
        backend/src/http/openapi.test.ts src/api/endpoints.ts src/api/endpoints.test.ts
git commit -m "$(cat <<'EOF'
fishing: land route + client take catchId (submarine harvest)

POST /me/fishing/land body is { sessionId, catchId? }; a submarine session
requires catchId. endpoints.landCatch(key, sessionId, catchId?) and the
SubmarineCast result type follow.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
EOF
)"
```

---

## Task 7: `Index.tsx` + `SubmarineFishing.tsx` — full submarine wiring

> Task 7 folds the `Index` changes and the `SubmarineFishing` rewrite together:
> `SubmarineFishing`'s prop change (`onCatch` → `onCast`/`onLand`) and `Index`'s
> render change are the same compile unit — neither typechecks without the other,
> so they share one test cycle.

**Files:**
- Modify: `src/pages/Index.tsx`
- Modify: `src/components/game/FishingScreen.tsx` (`onLand` return shape)
- Modify: `src/components/game/NetFishing.tsx` (`onLand` return shape)
- Rewrite: `src/components/game/SubmarineFishing.tsx`
- Test: `src/test/FishingScreen.test.tsx`, `src/test/NetFishing.test.tsx`, `src/test/SubmarineFishing.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1 + 6.
- Produces: `Index` has **no `onCatch` prop anywhere**; `SubmarineFishing` takes `{ player, onCast, onLand, onBack }`.

- [ ] **Step 1: Update `onLand` return shape in the two existing consumers + their tests**

The prop `onLand` changes from `Promise<'landed' | 'failed'>` to
`Promise<{ outcome: 'landed' | 'failed'; caught?: { fishId: string; weight: number; location: string } }>`.
Rod/net only read `.outcome`; submarine reads `.caught`.

- `src/components/game/FishingScreen.tsx` `handleWin`:
  `const res = await onLand(hooked, location.id); setPhase(res.outcome === 'landed' ? 'caught' : 'lost');`
  and update the prop type on the component's `Props` interface.
- `src/components/game/NetFishing.tsx` `handlePull`:
  `const res = await onLand(hooked, location.id); setPhase(res.outcome === 'landed' ? 'pulled' : 'lost');`
  and update the prop type on `Props`.
- `src/test/FishingScreen.test.tsx`: `const noLand = () => Promise.resolve({ outcome: 'landed' as const });`
- `src/test/NetFishing.test.tsx`: `renderNet`'s default `onLand = vi.fn().mockResolvedValue({ outcome: 'landed' })`;
  the green-pull test asserts `onLand` was called (unchanged) — keep it.

- [ ] **Step 2: Run the two component tests**

Run: `npx vitest run src/test/FishingScreen.test.tsx src/test/NetFishing.test.tsx`
Expected: PASS.

- [ ] **Step 3: Write the failing `SubmarineFishing` test**

Rewrite `src/test/SubmarineFishing.test.tsx`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import SubmarineFishing from '@/components/game/SubmarineFishing';
import { I18nProvider } from '@/game/i18n';
import { FISH } from '@/game/data';
import { getXpForLevel, PlayerState } from '@/game/types';
import type { SubmarineHooked } from '@/game/fishing';

// Canvas + rAF are not available in jsdom; stub them.
beforeEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { return 0; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    level: 6, xp: 20, xpToNextLevel: getXpForLevel(6), totalFishCaught: 0,
    collection: [], unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [],
    coins: 0, activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic',
    ownedBoatSkins: ['classic'], luckMultiplierEnd: null, strengthMultiplierEnd: null,
    lastRouletteDate: null, aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 5,
    ...over,
  };
}

const roster = (n = 6): SubmarineHooked => ({
  kind: 'submarine',
  sessionId: 's1',
  catches: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, fish: FISH[0], weight: 1 + i })),
});

describe('SubmarineFishing', () => {
  it('casts a submarine roster on mount', async () => {
    const onCast = vi.fn().mockResolvedValue(roster());
    render(<I18nProvider><SubmarineFishing player={makePlayer()} onCast={onCast} onLand={vi.fn()} onBack={vi.fn()} /></I18nProvider>);
    await waitFor(() => expect(onCast).toHaveBeenCalledWith('submarine', 'submarine'));
  });

  it('goes back from the HUD control', async () => {
    const onBack = vi.fn();
    render(<I18nProvider><SubmarineFishing player={makePlayer()} onCast={vi.fn().mockResolvedValue(roster())} onLand={vi.fn()} onBack={onBack} /></I18nProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /voltar|back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when the cast returns null', async () => {
    render(<I18nProvider><SubmarineFishing player={makePlayer()} onCast={vi.fn().mockResolvedValue(null)} onLand={vi.fn()} onBack={vi.fn()} /></I18nProvider>);
    expect(await screen.findByText(/indispon|sem|no fish|unavailable/i)).toBeInTheDocument();
  });
});
```

> The click-to-harvest test needs the swimming-fish DOM, which depends on the spawn timer. Keep the spawn interval real but short in the component (`1500ms`); the test above covers mount/cast/back/empty. A harvest assertion can be added if the spawn loop is made test-friendly (e.g. spawn the first fish synchronously on roster set) — do that if cheap, otherwise leave it to the browser smoke.

- [ ] **Step 4: Run — verify it fails**

Run: `npx vitest run src/test/SubmarineFishing.test.tsx`
Expected: FAIL — `SubmarineFishing` still takes `onCatch`, not `onCast`/`onLand`.

- [ ] **Step 5: Rewrite `src/components/game/SubmarineFishing.tsx`**

Per spec §D3. Keep the canvas scene draw loop (`useEffect` that draws the underwater scene), the `HarpoonSVG` / `HarpoonProjectileSVG` components, the HUD, and the caught overlay **unchanged**. Change:

- **Props:** `{ player: PlayerState; onCast: (locationId: string, mode: 'submarine') => Promise<Hooked | null>; onLand: (hooked: Hooked, locationId: string, catchId: string) => Promise<{ outcome: 'landed' | 'failed'; caught?: { fishId: string; weight: number; location: string } }>; onBack: () => void }`.
- **State:** `hooked: SubmarineHooked | null`; `phase: 'casting' | 'active' | 'empty'`; `spawned: string[]` (catchIds already turned into `SwimmingFish`); `harvested: Set<string>`.
- `SwimmingFish` gains `catchId: string; sessionId: string; fish: Fish` (drop the internal `spawnFish` rarity roll).
- **On mount:** `useEffect(() => { void cast(); }, [])` where `cast()` sets `phase: 'casting'`, `const h = await onCast('submarine', 'submarine')`; `h?.kind !== 'submarine'` → `setPhase('empty')`; else `setHooked(h); setPhase('active')`.
- **Spawn interval** (the existing 1500ms `setInterval`): instead of `spawnFish(...)`, pick the next roster entry not in `spawned` and not in `harvested` (`hooked.catches.find(c => !spawned.includes(c.id) && !harvested.has(c.id))`); if none, skip; else build a `SwimmingFish` from it (`x`/`y`/`speed`/`size`/`direction` random as before) and `setSpawned(s => [...s, entry.id])`. Cap 8 concurrent as today.
- **Roster refill:** compute `unconsumed = hooked.catches.filter(c => !harvested.has(c.id) && !spawned.includes(c.id)).length`; when `unconsumed <= SUBMARINE_ROSTER_REFILL_AT` and no refill in flight (a `useRef` guard), `const next = await onCast('submarine', 'submarine')`; on `next?.kind === 'submarine'` → `setHooked(prev => ({ kind: 'submarine', sessionId: next.sessionId, catches: [...prev!.catches.filter(c => !harvested.has(c.id) && !spawned.includes(c.id) === false ? false : true), ...next.catches] }))` — simplest correct: keep still-relevant old entries (spawned-but-not-harvested) + all new; drop consumed. Because a spawned `SwimmingFish` already holds its own `catchId` + `sessionId`, the merge only needs to append `next.catches`; track the "current cast session for new spawns" via `hooked.sessionId`.
- **`handleFishClick(sf)`** — keep the harpoon animation; on impact:
  ```ts
  const res = await onLand({ kind: 'submarine', sessionId: sf.sessionId, catches: [] }, 'submarine', sf.catchId);
  setHarvested(h => new Set(h).add(sf.catchId));
  setFishes(prev => prev.filter(f => f.id !== sf.id));
  if (res.outcome === 'landed' && res.caught) {
    const fish = FISH.find(f => f.id === res.caught!.fishId) ?? sf.fish;
    setCaughtFish({ fish, weight: res.caught!.weight });
  }
  ```
  (`onLand` only needs `sessionId` + `catchId` from the hooked arg for the submarine branch — passing a minimal object is fine, or pass the real `hooked` and let `Index` use `catchId`.)
- Delete the standalone `spawnFish` function and the `rollWeight` import (the component no longer rolls). Keep `FISH` + `FISH_IMAGES` imports (used for the reveal + swimming sprites).
- The `'empty'` phase renders a short message (`t('sub.unavailable')` — add the i18n key, or reuse an existing "no fish" string; check `src/game/i18n.ts` for a `sub.*` group and add `unavailable` to every language) + a back button.

- [ ] **Step 6: Run — verify it passes**

Run: `npx vitest run src/test/SubmarineFishing.test.tsx`
Expected: PASS.

- [ ] **Step 7: Wire `Index.tsx`**

- **Imports:** add `rollSubmarineBatch`, `SUBMARINE_ROSTER_SIZE` to the `@/game/fishingLogic` import; add `SUBMARINE_LOCATION_ID` to the `@/game/data` import; `landCatch as landCatchApi` already imported.
- **`handleCast`** — add a `mode === 'submarine'` branch. Authenticated:
  ```ts
  if (mode === 'submarine') {
    setBusyOp('cast');
    try {
      await flushNow();
      const r = await castLineApi(crypto.randomUUID(), 'submarine', 'submarine');
      applyServerResult(r);
      if (r.mode !== 'submarine') return null;
      const catches = r.catches
        .map(c => ({ id: c.id, fish: FISH.find(f => f.id === c.fishId), weight: c.weight }))
        .filter((c): c is { id: string; fish: Fish; weight: number } => !!c.fish);
      return { kind: 'submarine', catches, sessionId: r.sessionId };
    } catch {
      return null;
    } finally {
      setBusyOp(null);
    }
  }
  ```
  Anonymous (after the `syncEnabled` block, in the anon body):
  ```ts
  if (mode === 'submarine') {
    const batch = rollSubmarineBatch(SUBMARINE_ROSTER_SIZE, player.level);
    const catches = batch.map(f => ({ id: crypto.randomUUID(), fish: f, weight: rollWeight(f) }));
    return { kind: 'submarine', catches, sessionId: '' };
  }
  ```
  (No `replaceFromServer` — submarine cast does not touch the blob.)
- **`handleLand`** — signature `async (hooked: Hooked, locationId: string, catchId?: string)`; return type `{ outcome: 'landed' | 'failed'; caught?: { fishId: string; weight: number; location: string } }`.
  - Authenticated `syncEnabled` block:
    ```ts
    setBusyOp('land');
    try {
      const r = await landCatchApi(crypto.randomUUID(), hooked.sessionId, catchId);
      applyServerResult(r);
      return { outcome: 'landed', caught: r.caught[0] };
    } catch {
      return { outcome: 'failed' };
    } finally {
      setBusyOp(null);
    }
    ```
    (`r.caught` is an array; rod/net have length 1, submarine has length 1 — `r.caught[0]` is always the landed fish.)
  - Anon block:
    ```ts
    if (hooked.kind === 'submarine') {
      const entry = hooked.catches.find(c => c.id === catchId);
      if (!entry) return { outcome: 'failed' };
      catchFish(entry.fish, entry.weight, SUBMARINE_LOCATION_ID, false);
      return { outcome: 'landed', caught: { fishId: entry.fish.id, weight: entry.weight, location: SUBMARINE_LOCATION_ID } };
    }
    if (hooked.kind === 'net') {
      catchFishBatch(hooked.catches.map(c => ({ fish: c.fish, weight: c.weight, location: locationId })), true);
    } else {
      catchFishBatch([{ fish: hooked.fish, weight: hooked.weight, location: locationId }], false);
    }
    return { outcome: 'landed' };
    ```
  - Add `catchFish` to the `useGameState()` destructure (line ~49) — it exists (`src/game/useGameState.ts:74`) but may have been dropped from the destructure in 6b-1; re-add it.
- **Delete `handleCatch`** (the `useCallback` at ~line 84) and its comment.
- **Render:** `else if (screen === 'submarine') { content = <SubmarineFishing player={player} onCast={handleCast} onLand={handleLand} onBack={() => setScreen('menu')} />; }`
- `handleCast` / `handleLand` dep arrays: add `catchFish` to `handleLand`'s deps; `handleCast`'s deps already include `player`.

- [ ] **Step 8: Grep for leftover `onCatch`**

Run: `grep -n "onCatch\|handleCatch\|handleNetCatch" src/pages/Index.tsx`
Expected: **no matches.** If any remain, remove them.

- [ ] **Step 9: Typecheck + full frontend tests**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx vitest run src/`
Expected: clean typecheck; all tests pass.

- [ ] **Step 10: Lint**

Run: `npm run lint`
Expected: 0 errors (warnings pre-existing OK).

- [ ] **Step 11: Commit**

```bash
git add src/pages/Index.tsx src/components/game/SubmarineFishing.tsx \
        src/components/game/FishingScreen.tsx src/components/game/NetFishing.tsx \
        src/test/SubmarineFishing.test.tsx src/test/FishingScreen.test.tsx src/test/NetFishing.test.tsx \
        src/game/i18n.ts
git commit -m "$(cat <<'EOF'
frontend: submarine runs the server-rolled roster; Index loses its last onCatch

SubmarineFishing casts a 24-fish roster via onCast, harpoons harvest one by
catchId via onLand, and it re-casts when the roster runs low. handleLand now
returns { outcome, caught? } so the submarine reveal has its fish. handleCatch
is deleted — every catch mode is server-authoritative now.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
EOF
)"
```

---

## Task 8: `app.test.ts` end-to-end + full gate

**Files:**
- Modify: `backend/src/app.test.ts` (add a submarine cast + harvest flow against the seeded blob, if the file has a fishing flow section)
- Test: the whole suite + integration + build

**Interfaces:**
- Consumes: everything.

- [ ] **Step 1: Add the app-level submarine flow test**

In `backend/src/app.test.ts`, near the existing fishing cast/land test:

```ts
it('submarine: cast a roster, harvest two fish, blob grows, no cast op row', async () => {
  const app = await createApp({ config: testConfig });
  const client = await registerAndAuth(app);
  await client.request({ method: 'PUT', url: '/api/v1/me/state',
    payload: { state: blob({ level: 6 }), baseVersion: null } });

  const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast',
    payload: { locationId: 'submarine', mode: 'submarine' } })).json();
  expect(cast.mode).toBe('submarine');
  expect(cast.catches).toHaveLength(24);

  for (let i = 0; i < 2; i++) {
    const r = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land',
      payload: { sessionId: cast.sessionId, catchId: cast.catches[i].id },
      headers: { 'idempotency-key': `sub-app-${i}-aaaaaaaaaaaa` } });
    expect(r.statusCode).toBe(200);
    expect(r.json().caught).toHaveLength(1);
  }

  const me = (await client.request({ method: 'GET', url: '/api/v1/me/state' })).json();
  expect(me.state.player.totalFishCaught).toBe(2);
});
```

Match `blob` / `testConfig` / `registerAndAuth` to the file's helpers.

- [ ] **Step 2: Run — verify it passes**

Run: `npx vitest run backend/src/app.test.ts`
Expected: PASS.

- [ ] **Step 3: Full gate**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run backend:typecheck
npm run lint
npm test -- --run
npm run build
DATABASE_URL="postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure" npm run backend:db:migrate
DATABASE_URL="postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure" npm run test:integration
```

Expected: all green. Note the test counts (unit ~430+, integration ~76+).

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.test.ts
git commit -m "$(cat <<'EOF'
test: app-level submarine cast + harvest flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
EOF
)"
```

---

## Task 9: Browser smoke + PROJECT_MEMORY + PR

**Files:**
- Modify: `PROJECT_MEMORY.md` (new `### Task 10.3 fatia 6b-2` section)

- [ ] **Step 1: Restart the Docker stack and verify fresh code is served**

```bash
docker compose up -d
docker compose restart frontend backend
curl -s http://localhost:8080/src/pages/Index.tsx | grep -c "submarine"
curl -s http://localhost:8080/src/components/game/SubmarineFishing.tsx | grep -c "onCast"
```

Expected: both `grep -c` > 0 (the container serves the new code, not a stale bind-mount).

- [ ] **Step 2: Browser smoke (Playwright MCP)**

Fresh account (register in the UI — integration truncation wipes prior accounts). Then:
1. Menu → **Pesca Submarina**.
2. Confirm `POST /api/v1/me/fishing/cast { mode: 'submarine' }` → 200, body has `catches` length 24, and `version` in the response equals the pre-cast `version` (no bump). Check via the network panel.
3. Harpoon 5–6 fish. Each fires `POST /api/v1/me/fishing/land { sessionId, catchId }` → 200, `version` increments by 1 each time, the reveal shows a fish.
4. Keep harpooning past ~20 to trigger the background re-cast — confirm a second `cast` fires and there is no visible "diving" stall.
5. DB check (`docker compose exec postgres psql -U deepbluelure -d deepbluelure`):
   - `SELECT mode, status, jsonb_array_length(result_catches) FROM fishing_sessions WHERE user_id = '<id>';` → rows with `mode = 'submarine'`, shrinking `result_catches`.
   - `SELECT count(*) FROM game_state_operations WHERE user_id = '<id>' AND operation = 'fishing_land';` → one per harvested fish.
   - `SELECT jsonb_array_length(state->'player'->'warehouse'), jsonb_array_length(state->'player'->'aquariumWarehouse') FROM player_game_state WHERE user_id = '<id>';` → grew.
6. Reload the page. Confirm the save still loads (no reset to level 1) — the `location: 'submarine'` fix.
7. Note any console errors (a single `STATE_VERSION_CONFLICT` retry during fast clicking is the known pre-existing optimistic-concurrency behaviour, not a blocker).

- [ ] **Step 3: Write the PROJECT_MEMORY section**

Append after the 6b-1 section (before the "Ponto de parada" for 6b-1), a new `### Task 10.3 fatia 6b-2 — captura no submarino server-autoritativa — 2026-09-08` section covering: the roster model (24 + refill at 4), `catchId` synthetic, `mode` column (migration 0021), `SUBMARINE_LOCATION_ID` allowlist (save-corruption fix), lucky-neutral cast (no blob write / version bump), `handleLand` return shape change, `Index` loses its last `onCatch`, the gate numbers, and the smoke result. Leave the "Integrado na `main`" line for the merge-record commit.

- [ ] **Step 4: Commit the memory section**

```bash
git add PROJECT_MEMORY.md
git commit -m "$(cat <<'EOF'
docs: record Task 10.3 slice 6b-2 (server-authoritative submarine catch)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ACpGpU2u4DRVKwyDuvZJqP
EOF
)"
```

- [ ] **Step 5: Push + open the PR**

```bash
git push -u origin feature/task-10-3-fishing-catch-6b2
gh pr create --base main --head feature/task-10-3-fishing-catch-6b2 \
  --title "Task 10.3 slice 6b-2: server-authoritative submarine catch" \
  --body "<summary: roster model, catchId, mode column + 0021 migration, SUBMARINE_LOCATION_ID save-corruption fix, lucky-neutral cast, Index loses its last onCatch; gate results; smoke result>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 6: Poll CI; when green with no review comments, stop and hand back to the user for the merge decision.**

---

## After this plan

Use **superpowers:finishing-a-development-branch** after the PR is green. Then the
merge-record commit on `main` (`docs: record slice 6b-2 merge (PR #NN -> main, <sha>)`)
+ the "Integrado na `main`" line in the 6b-2 PROJECT_MEMORY section + memory-file
updates (`deep-blue-lure-task-10.md`, `MEMORY.md`).

Next slice: **6c — aquarium place** (`POST /api/v1/me/economy/aquarium/place`, op
`aquarium_place`, `placeAquariumFish` already a pure rule — reuses the economy
runner, no session). Then slice 7 (ranking + season read), slice 8 (dormant
endpoint cleanup), and finally retiring the free-form `PUT /me/state` blob write.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| A. flow (cast roster / land by catchId / idempotency) | 3, 4, 5, 6 |
| B1 `SUBMARINE_LOCATION_ID` | 1 |
| B2 `caughtFishSchema` accepts it (save-corruption fix) | 1 |
| B3 `rollSubmarineFish` / `rollSubmarineBatch` / constants | 1 |
| B4 `SubmarineCatch` / `SubmarineHooked` / `Hooked` union | 1 |
| C1 migration 0021 + `db/schema.ts` (`mode`, `result_catches` `$type`, check) | 2 |
| C2 `service.ts` types / `rollCast` / `castPlayerPatch` / `sessionRowFor` / `castResultFor` / `applyLand` / memory cast + land | 3, 4 |
| C3 `pgRepository.ts` (drop `modeOf`, cast + land submarine) | 5 |
| C4 route body `catchId` | 6 |
| C5 / C6 no error-map change | (noted; no task) |
| D1 `endpoints.ts` (`SubmarineCast`, `landCatch`) | 6 |
| D2 `Index.tsx` (`handleCast` / `handleLand` / delete `handleCatch` / render) | 7 |
| D3 `SubmarineFishing.tsx` rewrite | 7 |
| D4 tests | 1, 3, 4, 5, 6, 7, 8 |
| E file-by-file | covered across 1–7 |
| G verification (gate + smoke) | 8, 9 |

No gaps.

**2. Placeholder scan:** No "TBD"/"implement later". All code steps carry real code. The `app.test.ts` and `*.integration.test.ts` helper identifiers (`seedUser`, `seedBlob`, `registerAndAuth`, `testConfig`, `blob`) are flagged "match the file's helpers" because those specific test files were not read line-by-line while planning — the executor adapts the 2–3 helper names; the test bodies and assertions are complete. Task 7's `SubmarineFishing` step describes the rewrite prose-style (spec §D3) rather than pasting the full ~550-line component — the canvas draw loop, harpoon SVGs, HUD and overlay are explicitly "keep unchanged", and the changed parts (props, state, mount cast, spawn source, refill, `handleFishClick`) each have concrete code.

**3. Type consistency:**
- `SubmarineEntry` / `{ id: string; fishId: string; weight: number }` — used consistently in `service.ts` (Task 3), `endpoints.ts` `SubmarineCast` (Task 6), `Index` `handleCast` (Task 7).
- `applyLand` return `{ player, caught, remaining }` — Task 4 defines it, Task 5 consumes `applied.remaining`.
- `land(userId, key, sessionId, catchId?)` — Task 4 (interface + memory), Task 5 (pg), Task 6 (route pass-through), Task 6 (`endpoints.landCatch`).
- `handleLand` return `{ outcome: 'landed' | 'failed'; caught? }` — Task 7 Step 1 (consumers), Step 7 (`Index`).
- `mode: 'rod' | 'net' | 'submarine'` — `FishingSessionRow` (Task 3), DB check (Task 2), `pgRepository` reads `session.mode` (Task 5).
- `SUBMARINE_ROSTER_SIZE` (24), `SUBMARINE_ROSTER_REFILL_AT` (4) — Task 1 defines, Task 3/7 consume.

Consistent.
