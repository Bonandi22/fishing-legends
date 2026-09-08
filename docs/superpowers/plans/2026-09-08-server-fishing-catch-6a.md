# Server-authoritative rod catch (Task 10.3 slice 6a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rod-fishing catch server-authoritative — the server rolls the fish, weight and "lucky mode"; the client keeps only the skill minigame.

**Architecture:** A pure `applyCatch` rule (ported from `useGameState.catchFishBatch`) and injectable-RNG `rollFish` / `rollWeight` / `resolveLuckyMode` in `src/game/`. A rewritten `backend/src/fishing/` module: `POST /api/v1/me/fishing/cast` rolls + creates a `fishing_sessions` row + writes the lucky window to the blob; `POST /api/v1/me/fishing/land` validates the session and applies the catch to the blob transactionally with a `game_state_operations` replay row. `FishingScreen` calls `onCast` at the end of the wait and `onLand` on a minigame win; Index routes authenticated → server, anonymous → the local rules.

**Tech Stack:** TypeScript (strict), Fastify + Zod + Drizzle (backend, ESM `.js` suffixes), Vitest, React + Vite, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-09-08-server-fishing-catch.md` (section 6a).

## Global Constraints

- **TypeScript strict. No new `any`.**
- **Backend ESM:** relative imports use `.js`; cross-package `../../../src/game/<x>.js`.
- **Zod** for every body/param. `cast` body `{ locationId: string(1..120) }`; `land` body `{ sessionId: uuid }`.
- **Idempotency:** `cast` and `land` both require an `Idempotency-Key` (16–128 chars). `land` replay returns the recorded `{ state, version, caught }`.
- **Domain errors** thrown as `Error('SNAKE_CASE')`, all already mapped in `backend/src/http/errors.ts`: `LOCATION_LOCKED` (403), `INVALID_FISHING_REQUEST` (422), `INVALID_FISHING_SESSION` (422), `FISHING_SESSION_EXPIRED` (410), `NO_FISH_AVAILABLE` (422). **No new error codes.**
- **No odds / balance change.** `rollFish` / `rollWeight` selection maths untouched — only a trailing `random` parameter added. Lucky-mode window: 60_000 ms active, 420_000 ms cooldown, 0.5 trigger (matches the client timer's cadence).
- **`fishing_sessions` TTL** = `FISHING_SESSION_TTL_MS` (5 min, already in `session.ts`).
- **Server RNG:** `const random = () => randomInt(1_000_000) / 1_000_000;` (`randomInt` from `node:crypto`). Not audited this slice.
- **Blob writes:** `cast` writes the lucky window (version +1); `land` writes the catch (version +1). The client `applyServerResult`s on **both**.
- Per-slice gate before the PR: `npx tsc --noEmit -p tsconfig.app.json`, `npm run backend:typecheck`, `npm run lint` (0 errors), `npm test`, `npm run build`, then (Postgres up) `npm run backend:db:migrate && npm run test:integration`, then a browser smoke on the Docker stack (**`docker compose restart frontend backend` first**, use Playwright MCP).

---

### Task 1: `PlayerState` gains `luckyUntil` / `luckyCooldownUntil`

**Files:**
- Modify: `src/game/types.ts` (`PlayerState` interface)
- Modify: `src/game/persistence.ts:41-66` (`playerSchema`)
- Test: `src/test/persistence.test.ts`

**Interfaces:**
- Produces: `PlayerState.luckyUntil?: number | null`, `PlayerState.luckyCooldownUntil?: number | null`.

- [ ] **Step 1: Write the failing test**

Add to `src/test/persistence.test.ts` (it already imports `saveSchema` / builds envelopes — match its existing helper style):

```ts
it('accepts a blob with the lucky-mode fields and one without them', () => {
  const base = validEnvelope(); // however the file builds a valid envelope
  expect(saveSchema.safeParse(base).success).toBe(true); // no fields → still valid
  const withLucky = { ...base, player: { ...base.player, luckyUntil: 1_000_000, luckyCooldownUntil: 1_400_000 } };
  expect(saveSchema.safeParse(withLucky).success).toBe(true);
  const nulled = { ...base, player: { ...base.player, luckyUntil: null, luckyCooldownUntil: null } };
  expect(saveSchema.safeParse(nulled).success).toBe(true);
});
```

(Read `src/test/persistence.test.ts` first to reuse its envelope builder.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/persistence.test.ts -t "lucky-mode fields"`
Expected: FAIL — `luckyUntil` / `luckyCooldownUntil` rejected as unknown keys (Zod strips unknown by default, so more likely the test's own assertion about round-tripping fails; if `playerSchema` is `.strict()` it errors). If it already passes, the fields need to be *stored*, not just accepted — add an assertion that a parsed result keeps them.

- [ ] **Step 3: Implement**

`src/game/types.ts` — in `PlayerState`, after `strengthMultiplierPower?`:
```ts
  luckyUntil?: number | null;
  luckyCooldownUntil?: number | null;
```

`src/game/persistence.ts` `playerSchema` — after `strengthMultiplierPower`:
```ts
  luckyUntil: z.number().finite().nullable().optional(),
  luckyCooldownUntil: z.number().finite().nullable().optional(),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/persistence.test.ts` → PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/types.ts src/game/persistence.ts src/test/persistence.test.ts
git commit -m "game: PlayerState + saveSchema gain luckyUntil / luckyCooldownUntil"
```

---

### Task 2: `applyCatch` pure rule

**Files:**
- Modify: `src/game/stateRules.ts`
- Test: `src/test/stateRules.test.ts`

**Interfaces:**
- Consumes: `applyXp`, `getUnlockedLocationIds`, `addToWarehouse` (already in the file), `LOCATIONS` from `./data.js` (already used? — `sellWarehouse`/`placeAquariumFish` take `locations` as a param; `applyCatch` takes it too for symmetry), `CaughtFish` / `PlayerState` from `./types.js`.
- Produces: `applyCatch(state: PlayerState, catches: CaughtFish[], opts: { fromNet: boolean }, locations: FishingLocation[]): PlayerState`.

Reference: the body of `useGameState.catchFishBatch` (`src/game/useGameState.ts:69-99`). Port it verbatim; the only change is `locations` comes in as a param (not the imported `LOCATIONS`), matching `sellWarehouse` / `placeAquariumFish`, and the timestamps are already on the incoming `catches` (the caller assigns them).

- [ ] **Step 1: Write the failing test**

Add to `src/test/stateRules.test.ts` (imports: `applyCatch`; `FISH` / `LOCATIONS` already imported):

```ts
describe('applyCatch', () => {
  const c = (over: Partial<{ fish: typeof FISH[number]; weight: number; location: string; timestamp: number }> = {}) => ({
    fish: FISH[0], weight: 2, location: 'atlantic', timestamp: 1, ...over,
  });
  const base = { ...player, level: 3, xp: 0, xpToNextLevel: 300, warehouse: [], collection: [], aquariumWarehouse: [], heaviestFish: null, totalFishCaught: 0, unlockedLocations: [] };

  it('adds the catch to warehouse + collection, applies XP, bumps totalFishCaught', () => {
    const r = applyCatch(base, [c()], { fromNet: false }, LOCATIONS);
    expect(r.warehouse).toHaveLength(1);
    expect(r.collection).toHaveLength(1);
    expect(r.totalFishCaught).toBe(1);
    expect(r.xp).toBe(FISH[0].xp);
  });

  it('overflows to the aquarium warehouse when the warehouse is full (15)', () => {
    const full = { ...base, warehouse: Array.from({ length: 15 }, (_, i) => c({ timestamp: i + 100 })) };
    const r = applyCatch(full, [c({ timestamp: 999 })], { fromNet: false }, LOCATIONS);
    expect(r.warehouse).toHaveLength(15);
    expect(r.aquariumWarehouse).toHaveLength(1);
  });

  it('net catches give floor(xp * 0.3)', () => {
    const r = applyCatch(base, [c()], { fromNet: true }, LOCATIONS);
    expect(r.xp).toBe(Math.floor(FISH[0].xp * 0.3));
  });

  it('updates heaviestFish only on a heavier fish', () => {
    const withHeavy = { ...base, heaviestFish: c({ weight: 10 }) };
    expect(applyCatch(withHeavy, [c({ weight: 3 })], { fromNet: false }, LOCATIONS).heaviestFish!.weight).toBe(10);
    expect(applyCatch(withHeavy, [c({ weight: 20 })], { fromNet: false }, LOCATIONS).heaviestFish!.weight).toBe(20);
  });

  it('unlocks locations when a catch crosses a level threshold', () => {
    const almost = { ...base, level: 1, xp: 0, xpToNextLevel: 1 };
    const r = applyCatch(almost, [c()], { fromNet: false }, LOCATIONS);
    expect(r.level).toBeGreaterThan(1);
    expect(r.unlockedLocations.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/stateRules.test.ts -t applyCatch`
Expected: FAIL — `applyCatch` is not exported.

- [ ] **Step 3: Implement**

`src/game/stateRules.ts` — new export, adapting `catchFishBatch`'s body:

```ts
export function applyCatch(
  state: PlayerState,
  catches: CaughtFish[],
  opts: { fromNet: boolean },
  locations: FishingLocation[],
): PlayerState {
  if (catches.length === 0) return state;
  const xpGain = catches.reduce((sum, c) => sum + (opts.fromNet ? Math.floor(c.fish.xp * 0.3) : c.fish.xp), 0);
  const progression = applyXp(state.xp, state.level, state.xpToNextLevel, xpGain);
  const collection = [...state.collection, ...catches];
  const heaviestFish = catches.reduce<CaughtFish | null>(
    (cur, c) => (!cur || c.weight > cur.weight ? c : cur),
    state.heaviestFish,
  );
  const unlockedLocations = getUnlockedLocationIds(progression.level, locations);
  const inventory = catches.reduce(
    (inv, c) => addToWarehouse(inv.warehouse, inv.aquariumWarehouse, c),
    { warehouse: state.warehouse, aquariumWarehouse: state.aquariumWarehouse || [] },
  );
  return {
    ...state,
    ...progression,
    totalFishCaught: state.totalFishCaught + catches.length,
    collection,
    unlockedLocations,
    heaviestFish,
    ...inventory,
  };
}
```

Add `CaughtFish` to the `./types.js` import if not present.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/stateRules.test.ts` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/stateRules.ts src/test/stateRules.test.ts
git commit -m "game: applyCatch pure rule (ported from catchFishBatch)"
```

---

### Task 3: `resolveLuckyMode` pure rule

**Files:**
- Modify: `src/game/stateRules.ts`
- Test: `src/test/stateRules.test.ts`

**Interfaces:**
- Produces: `resolveLuckyMode(state: PlayerState, now: number, random?: () => number): { lucky: boolean; luckyUntil: number | null; luckyCooldownUntil: number | null }`.

Rule (spec B2): active window → stay lucky; past cooldown → roll `random() < 0.5`
(hit → 60 s window + 7 min cooldown; miss → 7 min cooldown, not lucky); in cooldown
with no window → not lucky, fields unchanged.

- [ ] **Step 1: Write the failing test**

```ts
describe('resolveLuckyMode', () => {
  const s = (over: Partial<{ luckyUntil: number | null; luckyCooldownUntil: number | null }> = {}) =>
    ({ ...player, luckyUntil: null, luckyCooldownUntil: null, ...over });

  it('fresh state, roll < 0.5 → lucky for 60s, 7min cooldown', () => {
    const r = resolveLuckyMode(s(), 1_000_000, () => 0.4);
    expect(r).toEqual({ lucky: true, luckyUntil: 1_060_000, luckyCooldownUntil: 1_420_000 });
  });

  it('fresh state, roll >= 0.5 → not lucky, still starts the cooldown', () => {
    const r = resolveLuckyMode(s(), 1_000_000, () => 0.6);
    expect(r).toEqual({ lucky: false, luckyUntil: null, luckyCooldownUntil: 1_420_000 });
  });

  it('inside an active window → stays lucky without re-rolling', () => {
    const r = resolveLuckyMode(s({ luckyUntil: 2_000_000, luckyCooldownUntil: 2_360_000 }), 1_999_000, () => 0.99);
    expect(r).toEqual({ lucky: true, luckyUntil: 2_000_000, luckyCooldownUntil: 2_360_000 });
  });

  it('inside cooldown, no active window → not lucky, fields unchanged', () => {
    const r = resolveLuckyMode(s({ luckyUntil: 500_000, luckyCooldownUntil: 1_400_000 }), 1_000_000, () => 0.1);
    expect(r).toEqual({ lucky: false, luckyUntil: 500_000, luckyCooldownUntil: 1_400_000 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/stateRules.test.ts -t resolveLuckyMode` → FAIL, not exported.

- [ ] **Step 3: Implement**

```ts
const LUCKY_WINDOW_MS = 60_000;
const LUCKY_COOLDOWN_MS = 7 * 60_000;

export function resolveLuckyMode(
  state: PlayerState,
  now: number,
  random: () => number = Math.random,
): { lucky: boolean; luckyUntil: number | null; luckyCooldownUntil: number | null } {
  const until = state.luckyUntil ?? null;
  const cooldown = state.luckyCooldownUntil ?? null;
  if (until && now < until) return { lucky: true, luckyUntil: until, luckyCooldownUntil: cooldown };
  if (!cooldown || now >= cooldown) {
    if (random() < 0.5) {
      return { lucky: true, luckyUntil: now + LUCKY_WINDOW_MS, luckyCooldownUntil: now + LUCKY_COOLDOWN_MS };
    }
    return { lucky: false, luckyUntil: null, luckyCooldownUntil: now + LUCKY_COOLDOWN_MS };
  }
  return { lucky: false, luckyUntil: until, luckyCooldownUntil: cooldown };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/stateRules.test.ts` → PASS. `npx tsc --noEmit -p tsconfig.app.json` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/stateRules.ts src/test/stateRules.test.ts
git commit -m "game: resolveLuckyMode pure rule (server owns the lucky window)"
```

---

### Task 4: `rollFish` / `rollWeight` take an injectable `random`

**Files:**
- Modify: `src/game/fishingLogic.ts`
- Test: `src/test/fishingLogic.test.ts`

**Interfaces:**
- Produces: `rollFish(location, playerLevel, luckyMode?, luckPower?, random?: () => number): Fish`, `rollWeight(fish, random?: () => number): number` — trailing optional param, default `Math.random`. **Every `Math.random()` inside is replaced with `random()`.**

- [ ] **Step 1: Write the failing test**

Read `src/test/fishingLogic.test.ts` first. Add:

```ts
it('rollWeight is deterministic with an injected random and stays within bounds', () => {
  const fish = FISH[0];
  expect(rollWeight(fish, () => 0)).toBe(fish.minWeight);
  const mid = rollWeight(fish, () => 0.5);
  expect(mid).toBeGreaterThanOrEqual(fish.minWeight);
  expect(mid).toBeLessThanOrEqual(fish.maxWeight);
});

it('rollFish is deterministic with an injected random', () => {
  const loc = LOCATIONS.find(l => l.id === 'atlantic')!;
  const a = rollFish(loc, 5, false, 2, () => 0.0);
  const b = rollFish(loc, 5, false, 2, () => 0.0);
  expect(a.id).toBe(b.id);
});

it('rollFish 4x lucky returns only abyssal+ when available', () => {
  const loc = LOCATIONS.find(l => l.id === 'atlantic')!;
  const f = rollFish(loc, 5, true, 4, () => 0.01);
  expect(['abyssal', 'volcanic', 'platinum', 'legends', 'cosmic']).toContain(f.rarity);
});
```

(Pick a location known to have the relevant rarities; adjust ids to real data.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/fishingLogic.test.ts` → FAIL (extra arg ignored → non-deterministic, or the 4x assertion flakes).

- [ ] **Step 3: Implement**

In `src/game/fishingLogic.ts`: add `random: () => number = Math.random` as the last
param of `rollFish` and `rollWeight`; replace every `Math.random()` in both bodies
with `random()`. Do **not** touch `getWaitTime` or `getNormalizedRarityWeights`.

- [ ] **Step 4: Run + verify no caller broke**

Run: `npx vitest run src/test/fishingLogic.test.ts` → PASS.
Run: `grep -rn "rollFish\|rollWeight" src --include=*.tsx --include=*.ts | grep -v test` — confirm every call site still compiles (they pass ≤4 args; the 5th defaults). `npx tsc --noEmit -p tsconfig.app.json` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/fishingLogic.ts src/test/fishingLogic.test.ts
git commit -m "game: rollFish / rollWeight accept an injectable random"
```

---

### Task 5: `useGameState.catchFishBatch` uses `applyCatch`

**Files:**
- Modify: `src/game/useGameState.ts:69-104`
- Test: existing `src/test/*` (no new test; existing catch coverage must stay green)

**Interfaces:**
- Consumes: `applyCatch` from `./stateRules` (Task 2).

- [ ] **Step 1: Confirm current coverage**

Run: `npx vitest run src/test/ -t "catch"` and note which tests exercise `catchFishBatch` / `catchFish` (e.g. via `useGameState` or `Index`). If none directly assert warehouse/xp after a catch, add one to `src/test/useGameState.rewards.test.tsx` (rename intent aside) or a new `useGameState.catch.test.tsx`:

```ts
it('catchFish adds to warehouse and applies xp', () => {
  const { result } = renderHook(() => useGameState());
  act(() => { result.current.catchFish(FISH[0], 2, 'atlantic', false); });
  expect(result.current.player.warehouse).toHaveLength(1);
  expect(result.current.player.totalFishCaught).toBe(1);
});
```

- [ ] **Step 2: Run to verify it passes (pre-refactor)**

Run the test — it passes against the current inline implementation. This is the safety net.

- [ ] **Step 3: Refactor**

`src/game/useGameState.ts` — replace the body of `catchFishBatch`'s `setPlayer(prev => { … })` with:

```ts
const catchFishBatch = useCallback((catches: Array<Pick<CaughtFish, 'fish' | 'weight' | 'location'>>, fromNet = false) => {
  if (catches.length === 0) return;
  const base = Date.now();
  const withTs: CaughtFish[] = catches.map((c, i) => ({ ...c, timestamp: base + i }));
  setPlayer(prev => applyCatch(prev, withTs, { fromNet }, LOCATIONS));
}, []);
```

Add `applyCatch` to the `./stateRules` import; `LOCATIONS` is already imported.

- [ ] **Step 4: Run to verify it still passes**

Run: `npx vitest run src/test/` (the catch tests + any `Index`/`FishingScreen` tests). All green.

- [ ] **Step 5: Commit**

```bash
git add src/game/useGameState.ts src/test/
git commit -m "game: catchFishBatch delegates to applyCatch"
```

---

### Task 6: Migration `0019_fishing_sessions_result_lucky` + schema

**Files:**
- Create: `backend/migrations/0019_fishing_sessions_result_lucky.sql`
- Modify: `backend/src/db/schema.ts` (`fishingSessions`)
- Test: `backend/src/db/migrate.integration.test.ts` (existing — should still pass; it applies all migrations)

- [ ] **Step 1: Write the migration**

`backend/migrations/0019_fishing_sessions_result_lucky.sql`:
```sql
-- The cast now rolls the fish, so the session stores the roll (result_fish_id /
-- result_weight / result_xp already exist). result_lucky records whether the
-- server's lucky-mode window was active for this cast.
ALTER TABLE fishing_sessions ADD COLUMN result_lucky boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Mirror in schema**

`backend/src/db/schema.ts` `fishingSessions` — after `resultXp`:
```ts
  resultLucky: boolean('result_lucky').notNull().default(false),
```
(import `boolean` from `drizzle-orm/pg-core` if not already.)

- [ ] **Step 3: Verify no drift + migrations apply**

Run (Postgres up): `npm run backend:db:migrate` then `npm run backend:db:generate` — confirm `backend/migrations/generated/` shows no unexpected diff.
Run: `set TEST_DATABASE_URL=… && npx vitest run -c vitest.integration.config.ts backend/src/db/migrate.integration.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/0019_fishing_sessions_result_lucky.sql backend/src/db/schema.ts
git commit -m "backend: migration 0019 — fishing_sessions.result_lucky"
```

---

### Task 7: Extract `readRecordedResult` into `backend/src/gamestate/opReplay.ts`

**Files:**
- Create: `backend/src/gamestate/opReplay.ts`
- Modify: `backend/src/gamestate/economyService.ts` (`runPgOp` uses the shared helper)
- Test: `backend/src/gamestate/economyService.test.ts` + `.integration.test.ts` (existing — must stay green, no behaviour change)

**Interfaces:**
- Produces: `readRecordedResult<T>(tx: TxLike, userId: string, operation: string, idempotencyKey: string): Promise<T | null>` — the `SELECT result FROM game_state_operations WHERE user_id = ? AND operation = ? AND idempotency_key = ? LIMIT 1` currently inline in `economyService.runPgOp`.

- [ ] **Step 1: Write it**

`backend/src/gamestate/opReplay.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { gameStateOperations } from '../db/schema.js';

// A minimal structural type for both `db` and a transaction handle.
type Selector = Pick<typeof import('../db/client.js')['Database'] extends never ? never : never, never>;

export async function readRecordedResult<T>(
  tx: { select: (...a: never[]) => never } | any, // drizzle tx/db — see note
  userId: string,
  operation: string,
  idempotencyKey: string,
): Promise<T | null> {
  const found = await (tx as any).select({ result: gameStateOperations.result })
    .from(gameStateOperations)
    .where(and(
      eq(gameStateOperations.userId, userId),
      eq(gameStateOperations.operation, operation),
      eq(gameStateOperations.idempotencyKey, idempotencyKey),
    ))
    .limit(1);
  return found[0] ? (found[0].result as T) : null;
}
```

> Note for the implementer: type `tx` with the actual drizzle transaction type used
> in `economyService.runPgOp` (look at `db.transaction(async (tx) => …)`), not
> `any`. Copy the exact typing from there so there is no `any`.

- [ ] **Step 2: Use it in `economyService.runPgOp`**

Replace the local `readRecordedResult` closure in `runPgOp` with
`import { readRecordedResult } from './opReplay.js'` and
`readRecordedResult<Result>(tx, userId, operation, idempotencyKey)`.

- [ ] **Step 3: Verify no behaviour change**

Run: `npx vitest run backend/src/gamestate/economyService.test.ts` → PASS.
Run (Postgres up): `npx vitest run -c vitest.integration.config.ts backend/src/gamestate/economyService.integration.test.ts` → PASS.
Run: `npm run backend:typecheck` → clean, no `any`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/gamestate/opReplay.ts backend/src/gamestate/economyService.ts
git commit -m "backend: extract readRecordedResult (shared by economy + fishing land)"
```

---

### Task 8: Fishing service — memory implementation

**Files:**
- Delete: `backend/src/fishing/roll.ts`, `backend/src/fishing/roll.test.ts`, `backend/src/fishing/service.test.ts`
- Rewrite: `backend/src/fishing/service.ts`
- Keep: `backend/src/fishing/session.ts`
- Test: `backend/src/fishing/service.test.ts` (new content)

**Interfaces:**
- Consumes: `MemoryGameStateStore` from `../gamestate/memoryService.js`; `rollFish` / `rollWeight` from `../../../src/game/fishingLogic.js`; `applyCatch` / `resolveLuckyMode` from `../../../src/game/stateRules.js`; `LOCATIONS` / `getFishForLocation` / `FISH` from `../../../src/game/data.js`; `saveSchema` / `SAVE_SCHEMA_VERSION` / `SaveEnvelope` from `../../../src/game/persistence.js`; `isSessionExpired` from `./session.js`; `randomInt` from `node:crypto`.
- Produces:
  ```ts
  export interface FishingService {
    cast(userId: string, idempotencyKey: string, locationId: string):
      Promise<{ sessionId: string; fishId: string; weight: number; xp: number; lucky: boolean; state: SaveEnvelope; version: number }>;
    land(userId: string, idempotencyKey: string, sessionId: string):
      Promise<{ state: SaveEnvelope; version: number; caught: { fishId: string; weight: number; location: string } }>;
  }
  export function createMemoryFishingService(store: MemoryGameStateStore): FishingService;
  ```
  Internal session shape: `{ id, userId, locationId, idempotencyKey, status: 'open'|'completed'|'expired', createdAt: Date, resultFishId, resultWeight, resultXp, resultLucky }`.

Implementation follows spec §C2 `cast` / `land` steps. Memory: `Map<sessionId, Session>` + `Map<userId:key, sessionId>` for cast dedupe + `Map<userId:fishing_land:key, LandResult>` for land replay + the shared `store`.

- [ ] **Step 1: Write the failing test**

`backend/src/fishing/service.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createMemoryGameStateStore } from '../gamestate/memoryService.js';
import { createMemoryFishingService } from './service.js';
import { SAVE_SCHEMA_VERSION } from '../../../src/game/persistence.js';

const blob = (over: Record<string, unknown> = {}) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  player: {
    level: 6, xp: 0, xpToNextLevel: 600, totalFishCaught: 0, collection: [],
    unlockedLocations: ['atlantic'], heaviestFish: null, warehouse: [], coins: 100,
    activeSkin: 'default', ownedSkins: ['default'], activeBoatSkin: 'classic', ownedBoatSkins: ['classic'],
    luckMultiplierEnd: null, strengthMultiplierEnd: null, lastRouletteDate: null,
    aquariumWarehouse: [], aquariumSectors: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1, nets: 0,
    ...over,
  },
});

describe('memory fishing service', () => {
  it('cast rolls a fish for the location, writes the lucky window, bumps version, creates a session', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);

    const res = await svc.cast('u1', 'cast-key-aaaaaaaaaaaa', 'atlantic');
    expect(res.version).toBe(2);
    expect(typeof res.fishId).toBe('string');
    expect(res.weight).toBeGreaterThan(0);
    expect(typeof res.lucky).toBe('boolean');
    // lucky-window fields were written to the blob
    expect('luckyCooldownUntil' in (store.get('u1')!.state as any).player).toBe(true);
  });

  it('cast on a locked location -> LOCATION_LOCKED', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ level: 1, unlockedLocations: [] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    // pick a location with requiredLevel > 1
    await expect(svc.cast('u1', 'cast-key-bbbbbbbbbbbb', 'astral-lake')).rejects.toThrow('LOCATION_LOCKED');
  });

  it('cast on an unknown location -> INVALID_FISHING_REQUEST', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    await expect(svc.cast('u1', 'cast-key-cccccccccccc', 'nonesuch')).rejects.toThrow('INVALID_FISHING_REQUEST');
  });

  it('cast dedupes on the idempotency key', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    const a = await svc.cast('u1', 'cast-key-dddddddddddd', 'atlantic');
    const b = await svc.cast('u1', 'cast-key-dddddddddddd', 'atlantic');
    expect(b.sessionId).toBe(a.sessionId);
    expect(store.get('u1')!.version).toBe(2); // not 3
  });

  it('land applies the catch, bumps version, completes the session', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    const cast = await svc.cast('u1', 'cast-key-eeeeeeeeeeee', 'atlantic');
    const land = await svc.land('u1', 'land-key-eeeeeeeeeeee', cast.sessionId);
    expect(land.version).toBe(3); // cast -> 2, land -> 3
    expect(land.caught.fishId).toBe(cast.fishId);
    expect((land.state.player.warehouse as unknown[]).length).toBe(1);
    expect(land.state.player.totalFishCaught).toBe(1);
  });

  it('land replays the same key: identical body, warehouse still +1', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    const cast = await svc.cast('u1', 'cast-key-ffffffffffff', 'atlantic');
    const first = await svc.land('u1', 'land-key-ffffffffffff', cast.sessionId);
    const replay = await svc.land('u1', 'land-key-ffffffffffff', cast.sessionId);
    expect(replay).toEqual(first);
    expect(store.get('u1')!.version).toBe(3);
  });

  it('land on a completed session with a NEW key does not double-apply', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob(), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    const cast = await svc.cast('u1', 'cast-key-gggggggggggg', 'atlantic');
    await svc.land('u1', 'land-key-gggggggggggg-1', cast.sessionId);
    const again = await svc.land('u1', 'land-key-gggggggggggg-2', cast.sessionId);
    expect((again.state.player.warehouse as unknown[]).length).toBe(1); // still 1
    expect(store.get('u1')!.version).toBe(3);
  });

  it('land on an unknown session -> INVALID_FISHING_SESSION', async () => {
    const svc = createMemoryFishingService(createMemoryGameStateStore());
    await expect(svc.land('u1', 'land-key-hhhhhhhhhhhh', '00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow('INVALID_FISHING_SESSION');
  });
});
```

(Adjust `astral-lake` to a real high-level location id from `src/game/data.ts`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run backend/src/fishing/service.test.ts` → FAIL, `createMemoryFishingService` not exported.

- [ ] **Step 3: Implement** `backend/src/fishing/service.ts` per spec §C2 (memory branch). Delete `roll.ts` + `roll.test.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run backend/src/fishing/service.test.ts` → PASS.
Run: `npm run backend:typecheck` → **expected to fail** in `app.ts` / `pgService.ts` / old integration tests (Tasks 9–10 fix). Confirm the failures are confined there.

- [ ] **Step 5: Commit**

```bash
git add backend/src/fishing/service.ts backend/src/fishing/service.test.ts
git rm backend/src/fishing/roll.ts backend/src/fishing/roll.test.ts
git commit -m "backend: fishing service (memory) — cast + land over the blob"
```

---

### Task 9: Fishing service — PostgreSQL implementation

**Files:**
- Rewrite: `backend/src/fishing/pgService.ts` → rename to `backend/src/fishing/pgRepository.ts` (match economy/gamestate naming)
- Delete: `backend/src/fishing/pgService.integration.test.ts` (replaced in Task 11)
- Test: covered in Task 11 (integration)

**Interfaces:**
- Consumes: everything Task 8 consumes + `Database` from `../db/client.js`; `fishingSessions` / `playerGameState` / `gameStateOperations` from `../db/schema.js`; `readRecordedResult` from `../gamestate/opReplay.js` (Task 7); `and` / `eq` from `drizzle-orm`.
- Produces: `createPgFishingService(db: Database): FishingService` (same interface as Task 8).

Implementation follows spec §C2 exactly:
- `cast` — one `db.transaction`: dedupe by `(userId, idempotencyKey)` on `fishing_sessions`; `SELECT player_game_state FOR UPDATE`; location + level guards; `resolveLuckyMode`; `rollFish` + `rollWeight` with the `crypto` `random`; `UPDATE` blob `{ …player, luckyUntil, luckyCooldownUntil }` version +1; `INSERT fishing_sessions` with the roll; return.
- `land` — one `db.transaction` mirroring `runPgOp` (spec §C2 `land` steps 1–8): `readRecordedResult` pre-check → `SELECT fishing_sessions FOR UPDATE` (guards) → post-lock `readRecordedResult` → `SELECT player_game_state FOR UPDATE` → `applyCatch` → `UPDATE` blob → `UPDATE` session → `INSERT game_state_operations` → return.

- [ ] **Step 1–3:** No standalone unit test (integration in Task 11). Write `pgRepository.ts`; `git rm pgService.ts pgService.integration.test.ts`.

- [ ] **Step 4: Typecheck**

Run: `npm run backend:typecheck` → still fails only in `app.ts` (Task 10) and until Task 8's `service.ts` typechecks clean alongside.

- [ ] **Step 5: Commit**

```bash
git add backend/src/fishing/pgRepository.ts
git rm backend/src/fishing/pgService.ts backend/src/fishing/pgService.integration.test.ts
git commit -m "backend: fishing pgRepository — cast + land transactional over the blob"
```

---

### Task 10: Routes + `app.ts` wiring + OpenAPI

**Files:**
- Rewrite: `backend/src/fishing/routes.ts`
- Modify: `backend/src/app.ts` (fishing wiring; remove old routes)
- Modify: `backend/src/http/openapi.test.ts` (expected paths)
- Delete: `backend/src/fishing/session.test.ts` **only if** it tested removed behaviour — check; keep the TTL tests if present, move them under a keep-name.
- Test: `backend/src/fishing/routes.test.ts` (new)

**Interfaces:**
- Consumes: `createMemoryFishingService` / `createPgFishingService` (Tasks 8–9); `idempotencyKey` from `../http/idempotency.js`.
- Produces: `POST /api/v1/me/fishing/cast`, `POST /api/v1/me/fishing/land`.

- [ ] **Step 1: Write the failing test**

`backend/src/fishing/routes.test.ts` — model on `backend/src/gamestate/economyRoutes.test.ts` (its `app()` / `registerAndAuth` / `seedBlob` helpers):
```ts
describe('POST /api/v1/me/fishing/cast + land', () => {
  it('cast -> 200 { sessionId, fishId, weight, xp, lucky, state, version }', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seedBlob(client, blob({ level: 6, unlockedLocations: ['atlantic'] }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'atlantic' } });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof b.fishId).toBe('string');
    expect(b.version).toBe(2);
  });

  it('cast + land -> catch applied, version 1 -> 3', async () => {
    const a = await app(); const client = await registerAndAuth(a);
    await seedBlob(client, blob({ level: 6, unlockedLocations: ['atlantic'] }));
    const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'atlantic' } })).json();
    const land = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land', payload: { sessionId: cast.sessionId } });
    expect(land.statusCode).toBe(200);
    const b = land.json();
    expect(b.version).toBe(3);
    expect(b.caught.fishId).toBe(cast.fishId);
    expect(b.state.player.warehouse).toHaveLength(1);
  });

  it('land replay -> identical body', async () => { /* same key twice */ });
  it('cast on a locked location -> 403 LOCATION_LOCKED', async () => { /* level 1, requiredLevel>1 loc */ });
  it('land on an unknown session -> 422 INVALID_FISHING_SESSION', async () => { /* random uuid */ });
  it('no session -> 401', async () => { const a = await app(); expect((await a.inject({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'atlantic' } })).statusCode).toBe(401); });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run backend/src/fishing/routes.test.ts` → FAIL (routes 404 / old routes).

- [ ] **Step 3: Implement**

- `backend/src/fishing/routes.ts` — per spec §C3. `registerFishingRoutes(app, service: FishingService)`.
- `backend/src/app.ts` — per spec §C4:
  - imports: drop `createFishingService` (old), `createPgFishingService` (old path); add `createMemoryFishingService` from `./fishing/service.js`, `createPgFishingService` from `./fishing/pgRepository.js`.
  - `const fishingService = database ? createPgFishingService(database) : createMemoryFishingService(memoryGameStateStore!);`
  - `registerFishingRoutes(app, fishingService);` stays after `registerGameStateEconomyRoutes`.
  - the old fishing service no longer needs `catalogService` / `playerRepository` / `inventoryService.addCatch` — leave those for their other consumers.
- `backend/src/http/openapi.test.ts` — in the `expected` array replace
  `'/api/v1/fishing/sessions'`, `'/api/v1/fishing/sessions/{sessionId}/complete'`
  with `'/api/v1/me/fishing/cast'`, `'/api/v1/me/fishing/land'`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run backend/src/fishing/routes.test.ts backend/src/http/openapi.test.ts backend/src/app.test.ts` → PASS.
Run: `npm run backend:typecheck` → **clean now**.
Run: `npm test` → full unit suite green (frontend still on the old FishingScreen props — Tasks 12–14; but `npm test` includes backend + frontend — the frontend `FishingScreen.test.tsx` still passes because the component is unchanged so far).

- [ ] **Step 5: Commit**

```bash
git add backend/src/fishing/routes.ts backend/src/app.ts backend/src/http/openapi.test.ts backend/src/fishing/routes.test.ts
git rm backend/src/fishing/session.test.ts   # only if it covered removed behaviour; otherwise keep + adapt
git commit -m "backend: POST /me/fishing/{cast,land} + wire the blob fishing service; drop /fishing/sessions"
```

---

### Task 11: Fishing PG integration tests

**Files:**
- Create: `backend/src/fishing/pgRepository.integration.test.ts`

**Interfaces:**
- Consumes: `createTestDatabase` from `../testing/pgHarness.js`; `createPgFishingService` (Task 9); `createPgAuthRepository` + `createPgGameStateService` to seed a user + blob (model on `backend/src/gamestate/economyService.integration.test.ts`); `fishingSessions` / `gameStateOperations` / `users` from `../db/schema.js`.

- [ ] **Step 1: Write the tests**

```ts
describe('pg fishing service (integration)', () => {
  it('cast + land transactionally: one session row, one fishing_land op row, blob updated, version +2', async () => { /* … */ });
  it('cast dedupes on the idempotency key: one session, version +1', async () => { /* … */ });
  it('land replays the same key: identical result, one op row, warehouse still +1', async () => { /* … */ });
  it('concurrent same-key land: both resolve identically, one op row', async () => {
    // Promise.all([land(key), land(key)]) — mirrors the economy concurrent test
  });
  it('land on an expired session -> FISHING_SESSION_EXPIRED (manually backdate created_at)', async () => {
    // UPDATE fishing_sessions SET created_at = now() - interval '10 minutes'
  });
  it('deleting the user cascades fishing_sessions', async () => { /* … */ });
});
```

Fill each in following the economy integration test's structure.

- [ ] **Step 2: Run to verify it fails, then passes**

Run (Postgres up, migrated): `npx vitest run -c vitest.integration.config.ts backend/src/fishing/pgRepository.integration.test.ts`
Expected: FAIL first if any assertion is wrong; then PASS once tests match the (already-correct) Task 9 implementation. Fix tests, not the impl, unless a real bug surfaces.

- [ ] **Step 3: Commit**

```bash
git add backend/src/fishing/pgRepository.integration.test.ts
git commit -m "backend: fishing pg integration tests (txn, replay, concurrent, expiry, cascade)"
```

---

### Task 12: Frontend endpoints

**Files:**
- Modify: `src/api/endpoints.ts`
- Test: `src/api/endpoints.test.ts`

**Interfaces:**
- Produces: `castLine(idempotencyKey, locationId): Promise<CastResult>`, `landCatch(idempotencyKey, sessionId): Promise<LandResult>` (types per spec §D1).

- [ ] **Step 1: Write the failing test**

```ts
it('castLine POSTs /me/fishing/cast with the locationId + key', async () => {
  const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
  await castLine('idem-key-castcast0001', 'atlantic');
  expect(spy).toHaveBeenCalledWith('/me/fishing/cast', { method: 'POST', body: { locationId: 'atlantic' }, idempotencyKey: 'idem-key-castcast0001' });
});
it('landCatch POSTs /me/fishing/land with the sessionId + key', async () => {
  const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
  await landCatch('idem-key-landland0001', 'sess-1');
  expect(spy).toHaveBeenCalledWith('/me/fishing/land', { method: 'POST', body: { sessionId: 'sess-1' }, idempotencyKey: 'idem-key-landland0001' });
});
```

- [ ] **Step 2–4:** RED → add the two functions + `CastResult`/`LandResult` types per spec §D1 → GREEN → `npx tsc --noEmit -p tsconfig.app.json` clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/endpoints.ts src/api/endpoints.test.ts
git commit -m "frontend: endpoints castLine / landCatch"
```

---

### Task 13: Index wiring — `handleCast` / `handleLand`

**Files:**
- Modify: `src/pages/Index.tsx`
- Test: none directly (verified by Task 14's `FishingScreen.test.tsx` + typecheck + smoke)

**Interfaces:**
- Consumes: `castLine as castLineApi` / `landCatch as landCatchApi` from `@/api/endpoints`; `rollFish` / `rollWeight` from `@/game/fishingLogic`; `resolveLuckyMode` from `@/game/stateRules`; `FISH` / `LOCATIONS` from `@/game/data`.
- Produces: `handleCast(locationId): Promise<Hooked | null>`, `handleLand(hooked: Hooked, locationId: string): Promise<'landed' | 'failed'>`; `busyOp` union gains `'cast' | 'land'`. `type Hooked = { fish: Fish; weight: number; lucky: boolean; sessionId: string }` (export from Index or a shared `src/game/fishing.ts`).

- [ ] **Step 1: Implement** per spec §D2. Both handlers as `useCallback`. Authenticated branch mirrors `runRewardOp` (flush → api → applyServerResult); anonymous branch uses the local rules. Update the `screen === 'fishing'` render site: `onCast={handleCast} onLand={handleLand}` (drop `onCatch`). Leave `SubmarineFishing` / `NetFishing` render sites on `onCatch`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json` → **expected to fail** only in `FishingScreen.tsx` (still declares `onCatch`) — Task 14. Confirm confined.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "frontend: Index handleCast / handleLand (server when synced, local rules when anon)"
```

---

### Task 14: `FishingScreen` — cast on wait-end, land on win

**Files:**
- Modify: `src/components/game/FishingScreen.tsx`
- Test: `src/test/FishingScreen.test.tsx`

**Interfaces:**
- Consumes: `onCast` / `onLand` (Task 13).
- Produces: `FishingScreen` props `{ location, player, onCast, onLand, onBack, onCastNet?, onOpenNetShop? }` (no `onCatch`).

- [ ] **Step 1: Update the tests**

`src/test/FishingScreen.test.tsx` — the 3 existing tests pass `onCatch={vi.fn()}`;
change to `onCast={vi.fn().mockResolvedValue(null)} onLand={vi.fn()}`. Add:
```ts
it('casts at the end of the wait and shows the hooked fish', async () => {
  vi.useFakeTimers();
  const onCast = vi.fn().mockResolvedValue({ fish: FISH_SAMPLE, weight: 3, lucky: false, sessionId: 's1' });
  render(<I18nProvider><FishingScreen location={ocean} player={makePlayer()} onCast={onCast} onLand={vi.fn()} onBack={vi.fn()} /></I18nProvider>);
  // simulate the water click → advance casting + wait timers
  // (drive via the exposed water-click handler or fireEvent on the scene mock; the
  //  existing suite mocks FishingScene3D to null, so expose an onWaterClick test hook
  //  OR assert onCast fires after advancing timers if the component auto-progresses)
  await vi.advanceTimersByTimeAsync(15000);
  expect(onCast).toHaveBeenCalledWith(ocean.id);
  vi.useRealTimers();
});
```
> The scene mock returns `null`, so the water click can't be fired through the 3D
> canvas. Implementer: give `FishingScreen` a tiny testable seam — e.g. keep the
> `handleWaterClick` logic but also accept an optional `__testCast` prop, OR (better)
> mock `FishingScene3D` to render a `<button data-testid="water" onClick={() => props.onWaterClick(new THREE.Vector3())}/>`
> in this test file. Prefer the mock approach — no production change.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/FishingScreen.test.tsx` → FAIL (prop type / `onCast` not called).

- [ ] **Step 3: Implement** per spec §D3:
- Props: drop `onCatch`, add `onCast` / `onLand`. `Hooked` type imported.
- State: `const [hooked, setHooked] = useState<Hooked | null>(null)`.
- Delete the `luckyMode` 7-min `useEffect` timer + the `luckyTimerRef`. `luckyMode`
  becomes plain state set from `onCast`'s result.
- In `handleWaterClick`'s inner `setTimeout` (the wait-end): replace the `rollFish` /
  `rollWeight` block with `const h = await onCast(location.id); if (!h) { setPhase('idle'); setMessage(t('fish.castPrompt')); return; } setHooked(h); setCurrentFish(h.fish); setCurrentWeight(h.weight); setLuckyMode(h.lucky); setPhase('hooked'); setMessage(t('fish.hooked'));`
  (make the callback `async`).
- `handleWin`: `if (!hooked) return; const outcome = await onLand(hooked, location.id); setPhase(outcome === 'landed' ? 'caught' : 'lost');`
- `handleReset`: also `setHooked(null)`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/FishingScreen.test.tsx` → PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json` → **clean**.
Run: `npm test` → full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/FishingScreen.tsx src/test/FishingScreen.test.tsx
git commit -m "frontend: FishingScreen casts server-side, lands on a minigame win"
```

---

### Task 15: Gate, browser smoke, PROJECT_MEMORY, PR

**Files:**
- Modify: `PROJECT_MEMORY.md`

- [ ] **Step 1: Static gate**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run backend:typecheck
npm run lint          # 0 errors
npm test
npm run build
```

- [ ] **Step 2: Integration**

```bash
docker compose up -d postgres
export TEST_DATABASE_URL="postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure"
npm run backend:db:migrate
npm run test:integration
```
All PASS (prior count + fishing integration).

- [ ] **Step 3: Browser smoke (Playwright MCP)**

`docker compose up -d` then **`docker compose restart frontend backend`** (Vite/tsx
don't reliably HMR bind-mounts on this host — verify with
`curl -s http://localhost:8080/src/pages/Index.tsx | grep handleCast`).

Register a fresh account. Fish at an ocean location:
1. Cast → `POST /api/v1/me/fishing/cast` 200 (`sessionId`, `fishId`), the hooked
   screen shows a fish, blob version bumped.
2. Win the minigame → `POST /api/v1/me/fishing/land` 200, the "caught" reveal shows
   that fish, `warehouse`/`collection`/`totalFishCaught` updated, XP up.
3. Lose the minigame once → "escapou", no `land` call, no state change.
4. DB: one `fishing_sessions` row per cast (status `completed` / `open`), one
   `game_state_operations` `fishing_land` row per landed fish, no duplicates.
5. Console: `[DBG]`-free; network shows cast then land, no stray `PUT /me/state`
   between them beyond the cast/land responses.
6. Anonymous: log out, fish, confirm the local roll + catch still works.

Capture a GIF (`fishing-catch-6a-smoke.gif`).

- [ ] **Step 4: Record + PR**

Add a `### Task 10.3 fatia 6a — captura à vara server-autoritativa — 2026-09-08`
section to `PROJECT_MEMORY.md` mirroring slice 5's structure; leave the stopping
point pointing at **6b (rede + submarino)**.

```bash
git add PROJECT_MEMORY.md
git commit -m "docs: record Task 10.3 slice 6a (server-authoritative rod catch)"
git push -u origin feature/task-10-3-fishing-catch-6a
gh pr create --base main --title "Task 10.3 (slice 6a): server-authoritative rod catch" --body "<summary; verification table; smoke>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Watch CI; merge when green with no review comments; `docs:` merge record on `main`.

---

## Self-Review

**1. Spec coverage:**
- B1 `applyCatch` → Task 2. ✅
- B2 `rollFish`/`rollWeight` injectable + `resolveLuckyMode` → Tasks 4, 3. ✅
- B3 `PlayerState` + `saveSchema` fields → Task 1. ✅
- C1 migration → Task 6. ✅
- C2 fishing service (memory + PG) → Tasks 8, 9; `opReplay` extraction → Task 7. ✅
- C3 routes → Task 10. ✅
- C4 app.ts + remove old routes + openapi → Task 10. ✅
- C5 errors — none, stated in constraints. ✅
- C6 tests → Tasks 2–4 (rules), 8 (memory service), 10 (routes), 11 (integration). ✅
- D1 endpoints → Task 12. ✅
- D2 Index wiring → Task 13. ✅
- D3 FishingScreen → Task 14. ✅
- D4 tests → Tasks 12, 14, 5. ✅
- E non-goals (net/submarine/aquarium, server minigame, audited RNG, cosmetic timers, sweep) → not implemented. ✅
- F risks → covered: `applyCatch` port + tests (Task 2), two blob writes (client applyServerResult on both — Task 13), orphaned sessions (TTL — Task 8/9), `rollFish` callers grep (Task 4 step 4), land dual idempotency (Tasks 8/11), anon path in Index (Task 13), saveSchema optional (Task 1), world auto-revert (no code — existing effect). ✅

**2. Placeholder scan:** Task 7's `opReplay.ts` code block has an `any` with an explicit implementer note to type it from the real drizzle tx type — that is a genuine "copy the exact type from `runPgOp`" instruction, not a placeholder (a literal `any` would fail `npm run backend:typecheck` in step 3's "no `any`" check). Task 10/11/14 have a few `/* … */` inside test skeletons where the *pattern* is named and pointed at a concrete reference test to copy — acceptable for a plan (the reference test is exact). Task 14 step 1 has a real seam decision spelled out (mock `FishingScene3D` to a button). No "TBD" / "handle errors" / "similar to Task N".

**3. Type consistency:**
- `FishingService` interface identical in Tasks 8 & 9. ✅
- `Hooked` type: `{ fish, weight, lucky, sessionId }` in spec D2, Tasks 13 & 14. ✅
- `CastResult` / `LandResult` (Task 12) vs the service return (Tasks 8/9): service returns `{ sessionId, fishId, weight, xp, lucky, state, version }` / `{ state, version, caught }`; `CastResult = GameStateEnvelope & { sessionId, fishId, weight, xp, lucky }` — `GameStateEnvelope` is `{ state, version }`, so they line up. ✅
- op string `'fishing_land'` identical in Tasks 8, 9, 11. ✅
- `applyCatch(state, catches, opts, locations)` — 4 args, identical in Tasks 2, 5, 8, 9. ✅
- endpoint paths `/me/fishing/cast` `/me/fishing/land` identical in Tasks 10, 12, 15. ✅
