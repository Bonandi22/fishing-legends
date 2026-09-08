# Server-authoritative net catch (Task 10.3 slice 6b-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make **net** fishing server-authoritative on the same `cast` / `land` pair as slice 6a — the server rolls the net grade and its batch of fish, spends a net, and applies the whole haul on land.

**Architecture:** `cast` gains `{ mode: 'rod' | 'net' | 'submarine' }` (default `'rod'`). For `net` the server checks `player.nets`, decrements it, rolls a `NetType` + `fishCount` fish into a new `result_catches jsonb` session column, and returns the net params for the client minigame + the pre-rolled batch. `land` (no `fishId`) applies the batch via `applyCatch(..., { fromNet: true })`. `NetFishing` drops its local roll and runs the minigame off the server's net params.

**Tech Stack:** TypeScript strict, Fastify + Zod + Drizzle (ESM `.js` suffixes), Vitest, React + Vite, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-09-08-server-fishing-catch-6b.md` (M1–M5, section 6b-1).

## Global Constraints

- **TypeScript strict. No new `any`.**
- **Backend ESM** `.js` suffixes; cross-package `../../../src/game/<x>.js`.
- **Zod**: `cast` body `{ locationId: string(1..120), mode: enum(['rod','net','submarine']).default('rod') }`; `land` body `{ sessionId: uuid, fishId: string.optional() }` (`fishId` is accepted but unused until 6b-2).
- **Idempotency**: `cast` + `land` require an `Idempotency-Key`. `land` replay returns the recorded `{ state, version, caught }`.
- **Domain errors** (`Error('SNAKE_CASE')`, mapped in `http/errors.ts`): existing `LOCATION_LOCKED`/`INVALID_FISHING_REQUEST`/`INVALID_FISHING_SESSION`/`FISHING_SESSION_EXPIRED`/`NO_FISH_AVAILABLE`, plus **new** `NO_NETS` (409).
- **No balance change**: `NET_TYPES` (rarity → fishCount / greenZoneSize / speed), the per-fish weight roll, `applyCatch`'s `fromNet` XP ×0.3 — all unchanged.
- **`LandResult.caught` becomes `Array<{ fishId; weight; location }>`** (rod land returns a 1-element array). 6a `fishing_land` op rows are historical; no back-compat shim.
- **The net is spent on `cast`** (server). `Index` stops calling `consumeNet` when entering the net screen; `NetFishing` stops calling `onUseNet`.
- Per-slice gate before the PR: `npx tsc --noEmit -p tsconfig.app.json`, `npm run backend:typecheck`, `npm run lint` (0 errors), `npm test`, `npm run build`, then (Postgres up) `npm run backend:db:migrate && npm run test:integration`, then a browser smoke on the Docker stack (**`docker compose restart frontend backend` first**, Playwright MCP).

---

### Task 1: `netTypes` → `src/game/`, add `rollNet(random)`

**Files:**
- Create: `src/game/netTypes.ts`
- Rewrite: `src/components/game/netfishing/netTypes.ts` → re-export from the new module
- Test: `src/test/netTypes.test.ts` (create)

**Interfaces:**
- Produces: `src/game/netTypes.ts` exports `interface NetType`, `const NET_TYPES: NetType[]` (the 9 grades, verbatim from the current file), `rollNet(random?: () => number): NetType`.
- `src/components/game/netfishing/netTypes.ts` re-exports `NetType`, `NET_TYPES`, and keeps `randomNet = () => rollNet()` so existing imports (`NetFishing.tsx`) keep compiling until Task 9.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/netTypes.test.ts
import { describe, expect, it } from 'vitest';
import { NET_TYPES, rollNet } from '@/game/netTypes';

describe('netTypes', () => {
  it('has 9 grades, one per rarity, fishCount 20..1', () => {
    expect(NET_TYPES).toHaveLength(9);
    expect(NET_TYPES[0]).toMatchObject({ rarity: 'common', fishCount: 20 });
    expect(NET_TYPES.at(-1)!.fishCount).toBe(1);
  });

  it('rollNet is deterministic with an injected random', () => {
    expect(rollNet(() => 0).id).toBe(NET_TYPES[0].id);
    expect(rollNet(() => 0.999).id).toBe(NET_TYPES[8].id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/netTypes.test.ts` → FAIL — `@/game/netTypes` missing.

- [ ] **Step 3: Implement**

`src/game/netTypes.ts` — copy `NetType` + `NET_TYPES` verbatim from
`src/components/game/netfishing/netTypes.ts` (change the `Rarity` import to
`./types.js`), then:
```ts
export function rollNet(random: () => number = Math.random): NetType {
  return NET_TYPES[Math.floor(random() * NET_TYPES.length)];
}
```

`src/components/game/netfishing/netTypes.ts` — replace the whole file with:
```ts
export type { NetType } from '@/game/netTypes';
export { NET_TYPES, rollNet } from '@/game/netTypes';
import { rollNet } from '@/game/netTypes';
export const randomNet = () => rollNet();
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/netTypes.test.ts` → PASS. `npx tsc --noEmit -p tsconfig.app.json` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/netTypes.ts src/components/game/netfishing/netTypes.ts src/test/netTypes.test.ts
git commit -m "game: move netTypes to src/game + rollNet(random)"
```

---

### Task 2: Migration `0020` + `result_catches` column

**Files:**
- Create: `backend/migrations/0020_fishing_sessions_result_catches.sql`
- Modify: `backend/src/db/schema.ts` (`fishingSessions`)

- [ ] **Step 1: Write the migration**

```sql
-- Net / submarine casts roll a batch. Rod sessions leave this null and keep using
-- result_fish_id / result_weight / result_xp.
ALTER TABLE fishing_sessions ADD COLUMN result_catches jsonb;
```

- [ ] **Step 2: Schema**

`backend/src/db/schema.ts` `fishingSessions` — after `resultLucky`:
```ts
  resultCatches: jsonb('result_catches').$type<Array<{ fishId: string; weight: number }>>(),
```
(`jsonb` is already imported.)

- [ ] **Step 3: Verify**

Run (Postgres up): `set DATABASE_URL=… && npm run backend:db:migrate` → applies `0020`.
Run: `npm run backend:db:generate` → no unexpected diff.
Run: `set TEST_DATABASE_URL=… && npx vitest run -c vitest.integration.config.ts backend/src/db/migrate.integration.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/0020_fishing_sessions_result_catches.sql backend/src/db/schema.ts
git commit -m "backend: migration 0020 — fishing_sessions.result_catches"
```

---

### Task 3: `rollCast` gains `mode`; `NO_NETS`

**Files:**
- Modify: `backend/src/fishing/service.ts` (`rollCast`, types)
- Modify: `backend/src/http/errors.ts`
- Test: `backend/src/fishing/service.test.ts`

**Interfaces:**
- Consumes: `rollNet` from `../../../src/game/netTypes.js`; `getFishForLocation` from `../../../src/game/data.js` (net batch draws from the location pool filtered by the net's rarity, fallback to the whole pool — mirrors `NetFishing.handlePull`).
- Produces: `rollCast(player, locationId, mode, now)` returns a discriminated union:
  ```ts
  type RodRoll = { mode: 'rod'; fishId: string; weight: number; xp: number; lucky: boolean; luckyUntil: number | null; luckyCooldownUntil: number | null };
  type NetRoll = { mode: 'net'; net: { id: string; rarity: string; fishCount: number; greenZoneSize: number; speed: number }; catches: Array<{ fishId: string; weight: number }>; netsAfter: number; lucky: boolean; luckyUntil: number | null; luckyCooldownUntil: number | null };
  export type CastRoll = RodRoll | NetRoll;
  ```
  (`submarine` mode is added in 6b-2; here `rollCast` throws `INVALID_FISHING_REQUEST` for it or leaves it unhandled — pin: **throw `INVALID_FISHING_REQUEST`** so an early client can't reach an unimplemented path.)

- [ ] **Step 1: Write the failing test**

Add to `backend/src/fishing/service.test.ts` (the `blob` helper is there; give the player `nets`):

```ts
describe('memory fishing service — net mode', () => {
  it('cast net: decrements nets, rolls a full batch, writes lucky window, version +1', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);

    const res = await svc.cast('u1', 'cast-net-aaaaaaaaaaaa', 'titicaca', 'net');
    expect(res.version).toBe(2);
    expect(res.net).toBeDefined();
    expect(res.catches).toHaveLength(res.net!.fishCount);
    expect((store.get('u1')!.state as { player: { nets: number } }).player.nets).toBe(2);
  });

  it('cast net with no nets -> NO_NETS, nothing written', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 0, level: 8, unlockedLocations: ['titicaca'] }), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    await expect(svc.cast('u1', 'cast-net-bbbbbbbbbbbb', 'titicaca', 'net')).rejects.toThrow('NO_NETS');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('cast net still honours the location level gate', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: blob({ nets: 3, level: 1 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryFishingService(store);
    await expect(svc.cast('u1', 'cast-net-cccccccccccc', 'abyss-trench', 'net')).rejects.toThrow('LOCATION_LOCKED');
  });
});
```

> **Note:** the `cast` signature grows a `mode` param. Update the memory service's
> `cast(userId, key, locationId)` → `cast(userId, key, locationId, mode = 'rod')`,
> and the `FishingService` interface. The 6a rod tests call `cast(u, k, loc)` — the
> default keeps them green.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run backend/src/fishing/service.test.ts -t "net mode"` → FAIL — `mode` arg ignored / `NO_NETS` not thrown.

- [ ] **Step 3: Implement**

`backend/src/http/errors.ts` — add to `DOMAIN_ERRORS`:
```ts
  NO_NETS: { status: 409, message: 'No fishing nets left' },
```

`backend/src/fishing/service.ts`:
- `rollCast(player, locationId, mode: 'rod' | 'net' | 'submarine', now): CastRoll` —
  location + level guards first (shared). Then:
  - `mode === 'rod'` → existing body, wrapped as `{ mode: 'rod', … }`.
  - `mode === 'net'` → `if ((player.nets ?? 0) < 1) throw new Error('NO_NETS');`
    `const net = rollNet(random);`
    `const pool = getFishForLocation(location); const tier = pool.filter(f => f.rarity === net.rarity); const draw = tier.length ? tier : pool;`
    `if (draw.length === 0) throw new Error('NO_FISH_AVAILABLE');`
    `const catches = Array.from({ length: net.fishCount }, () => { const f = draw[Math.floor(random() * draw.length)]; return { fishId: f.id, weight: rollWeight(f, random) }; });`
    `const luck = resolveLuckyMode(player, now, random);`
    `return { mode: 'net', net: { id: net.id, rarity: net.rarity, fishCount: net.fishCount, greenZoneSize: net.greenZoneSize, speed: net.speed }, catches, netsAfter: (player.nets ?? 0) - 1, lucky: luck.lucky, luckyUntil: luck.luckyUntil, luckyCooldownUntil: luck.luckyCooldownUntil };`
  - `mode === 'submarine'` → `throw new Error('INVALID_FISHING_REQUEST');`

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run backend/src/fishing/service.test.ts` → all PASS (6a + new).
Run: `npm run backend:typecheck` → **fails** in `pgRepository.ts` / `routes.ts` / `Index` type imports (Tasks 4, 5, 8). Confirm confined.

- [ ] **Step 5: Commit**

```bash
git add backend/src/fishing/service.ts backend/src/http/errors.ts backend/src/fishing/service.test.ts
git commit -m "backend: rollCast gains net mode (NO_NETS, batch roll, net spend)"
```

---

### Task 4: Memory + PG `cast`/`land` handle the net batch

**Files:**
- Modify: `backend/src/fishing/service.ts` (memory `cast`/`land`, `applyLand`, `FishingSessionRow`, `LandResult`)
- Modify: `backend/src/fishing/pgRepository.ts` (PG `cast`/`land`)
- Test: `backend/src/fishing/service.test.ts`

**Interfaces:**
- `LandResult.caught: Array<{ fishId: string; weight: number; location: string }>`.
- `applyLand(player, session, now)` — `session` now carries either `{ resultFishId, resultWeight, locationId }` (rod) **or** `{ resultCatches: Array<{fishId,weight}>, locationId }` (net). Returns `{ player, caught: Array<…> }`.
- Memory `FishingSessionRow` gains `resultCatches?: Array<{ fishId: string; weight: number }> | null` and `mode: 'rod' | 'net' | 'submarine'`.
- `CastResult` (memory + PG return) gains optional `net` + `catches` (net) — the rod fields stay optional too; document it as `{ sessionId; state; version; lucky } & ({ mode:'rod'; fishId; weight; xp } | { mode:'net'; net; catches })`.

- [ ] **Step 1: Write the failing test**

```ts
it('land a net session applies the whole batch with fromNet xp, one op row', async () => {
  const store = createMemoryGameStateStore();
  store.set('u1', { state: blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'], xp: 0, xpToNextLevel: 100000 }), updatedAt: 'now', version: 1 });
  const svc = createMemoryFishingService(store);
  const cast = await svc.cast('u1', 'cast-net-dddddddddddd', 'titicaca', 'net');
  const land = await svc.land('u1', 'land-net-dddddddddddd', cast.sessionId);
  expect(Array.isArray(land.caught)).toBe(true);
  expect(land.caught).toHaveLength(cast.catches!.length);
  expect(land.state.player.warehouse.length + land.state.player.aquariumWarehouse.length).toBe(cast.catches!.length);
  expect(land.state.player.totalFishCaught).toBe(cast.catches!.length);
});

it('net land replays: identical body, batch not doubled', async () => {
  const store = createMemoryGameStateStore();
  store.set('u1', { state: blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }), updatedAt: 'now', version: 1 });
  const svc = createMemoryFishingService(store);
  const cast = await svc.cast('u1', 'cast-net-eeeeeeeeeeee', 'titicaca', 'net');
  const a = await svc.land('u1', 'land-net-eeeeeeeeeeee', cast.sessionId);
  const b = await svc.land('u1', 'land-net-eeeeeeeeeeee', cast.sessionId);
  expect(b).toEqual(a);
});
```

Also update the 6a rod tests that assert `land.caught.fishId` / `land.caught.location`
→ `land.caught[0].fishId` etc.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run backend/src/fishing/service.test.ts` → FAIL (net land not implemented; rod `caught` shape).

- [ ] **Step 3: Implement**

`backend/src/fishing/service.ts`:
- `FishingSessionRow` += `mode`, `resultCatches`.
- Memory `cast`: after `rollCast`, branch on `roll.mode` to build the session row
  (`rod` → `resultFishId/Weight/Xp/Lucky`, `resultCatches: null`; `net` →
  `resultCatches: roll.catches`, `resultFishId: null`) and the blob patch (`net` →
  `{ ...player, nets: roll.netsAfter, luckyUntil, luckyCooldownUntil }`). Return
  the discriminated `CastResult`.
- `applyLand(player, session, now)`:
  ```ts
  const rows = session.resultCatches ?? [{ fishId: session.resultFishId!, weight: Number(session.resultWeight) }];
  const catches = rows.map(r => {
    const fish = FISH.find(f => f.id === r.fishId);
    if (!fish) throw new Error('INVALID_FISHING_SESSION');
    return { fish, weight: r.weight, location: session.locationId, timestamp: now };
  });
  const fromNet = session.mode === 'net';
  return {
    player: applyCatch(player, catches, { fromNet }, LOCATIONS),
    caught: catches.map(c => ({ fishId: c.fish.id, weight: c.weight, location: session.locationId })),
  };
  ```
- Memory `land`: `caught` in the completed-session and replay branches becomes the
  array form (read from `resultCatches` or the single `result_*`).

`backend/src/fishing/pgRepository.ts`:
- `cast`: branch on `roll.mode` for the `fishingSessions` insert (`resultCatches`
  as jsonb for net; `mode` column? — **there is no `mode` column; infer mode from
  `resultCatches !== null`**) and the blob patch.
- `land`: `applyLand` gets `{ resultCatches: row.resultCatches, resultFishId: row.resultFishId, resultWeight: Number(row.resultWeight), locationId: row.locationId, mode: row.resultCatches ? 'net' : 'rod' }`.
- The dedupe / completed / expired / replay branches return `caught` as the array.

> **Decision (no `mode` column):** the session's mode is `resultCatches != null ? 'net' : 'rod'`. Submarine (6b-2) also uses `resultCatches` but needs to be distinguished — 6b-2 adds a `mode varchar` column then. For 6b-1, `resultCatches != null` ⇒ net is sufficient.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run backend/src/fishing/service.test.ts` → all PASS.
Run: `npm run backend:typecheck` → fails only in `routes.ts` (Task 5) + frontend imports (Tasks 7–8).

- [ ] **Step 5: Commit**

```bash
git add backend/src/fishing/service.ts backend/src/fishing/pgRepository.ts backend/src/fishing/service.test.ts
git commit -m "backend: net cast/land — batch in result_catches, caught[] result"
```

---

### Task 5: Routes — `mode` + `fishId` body fields

**Files:**
- Modify: `backend/src/fishing/routes.ts`
- Test: `backend/src/fishing/routes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `backend/src/fishing/routes.test.ts`:
```ts
it('cast { mode: net } -> 200 with net + catches; land -> caught array', async () => {
  const a = await app(); const client = await registerAndAuth(a);
  await seed(client, blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'] }));
  const cast = (await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'titicaca', mode: 'net' } })).json();
  expect(cast.net.fishCount).toBeGreaterThan(0);
  expect(cast.catches).toHaveLength(cast.net.fishCount);
  const land = await client.request({ method: 'POST', url: '/api/v1/me/fishing/land', payload: { sessionId: cast.sessionId } });
  expect(land.statusCode).toBe(200);
  expect(Array.isArray(land.json().caught)).toBe(true);
});

it('cast net with no nets -> 409 NO_NETS', async () => {
  const a = await app(); const client = await registerAndAuth(a);
  await seed(client, blob({ nets: 0, level: 8, unlockedLocations: ['titicaca'] }));
  const res = await client.request({ method: 'POST', url: '/api/v1/me/fishing/cast', payload: { locationId: 'titicaca', mode: 'net' } });
  expect(res.statusCode).toBe(409);
  expect(res.json().error.code).toBe('NO_NETS');
});
```

Update the 6a rod route test's `land.json().caught.fishId` → `.caught[0].fishId`.

- [ ] **Step 2–4:** RED → `routes.ts`: `cast` body `z.object({ locationId: …, mode: z.enum(['rod','net','submarine']).default('rod') })`, pass `request.body.mode` to `service.cast(userId, key, locationId, mode)`; `land` body `z.object({ sessionId: z.string().uuid(), fishId: z.string().min(1).max(120).optional() })` (fishId unused this slice) → GREEN → `npm run backend:typecheck` clean → `npm test` (backend green; frontend `FishingScreen`/`NetFishing` tests still on old props but components unchanged so far — Tasks 8–9).

- [ ] **Step 5: Commit**

```bash
git add backend/src/fishing/routes.ts backend/src/fishing/routes.test.ts
git commit -m "backend: fishing cast body +mode, land body +fishId; net route tests"
```

---

### Task 6: Net PG integration tests

**Files:**
- Modify: `backend/src/fishing/pgRepository.integration.test.ts`

- [ ] **Step 1: Write the tests**

```ts
it('net cast + land transactionally: nets decremented, warehouse += batch, one op row', async () => {
  const userId = await seedUser();
  await gameState.put(userId, blob({ nets: 3, level: 8, unlockedLocations: ['titicaca'], xp: 0, xpToNextLevel: 999999 }), null);
  const cast = await fishing.cast(userId, 'cast-net-int-aa', 'titicaca', 'net');
  expect(cast.version).toBe(2);
  const land = await fishing.land(userId, 'land-net-int-aa', cast.sessionId);
  const blobRow = await gameState.get(userId);
  expect((blobRow!.state as any).player.nets).toBe(2);
  const total = land.state.player.warehouse.length + land.state.player.aquariumWarehouse.length;
  expect(total).toBe(cast.catches!.length);
  const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
  expect(ops).toHaveLength(1);
});

it('net land replays: one op row, batch not doubled', async () => { /* … */ });
```

(model on the 6a fishing integration tests already in the file)

- [ ] **Step 2–3:** Run (Postgres up) → PASS → commit.

```bash
git add backend/src/fishing/pgRepository.integration.test.ts
git commit -m "backend: net cast/land pg integration tests"
```

---

### Task 7: Frontend endpoints — `castLine(mode)`, `landCatch(fishId?)`

**Files:**
- Modify: `src/api/endpoints.ts`
- Test: `src/api/endpoints.test.ts`

**Interfaces:**
- `castLine(idempotencyKey: string, locationId: string, mode: 'rod' | 'net' | 'submarine' = 'rod'): Promise<CastResult>` — body `{ locationId, mode }`.
- `landCatch(idempotencyKey: string, sessionId: string, fishId?: string): Promise<LandResult>` — body `{ sessionId, ...(fishId ? { fishId } : {}) }`.
- `CastResult` → `GameStateEnvelope & { sessionId: string; lucky: boolean } & ({ mode: 'rod'; fishId: string; weight: number; xp: number } | { mode: 'net'; net: NetInfo; catches: Array<{ fishId: string; weight: number }> })` where `NetInfo = { id: string; rarity: string; fishCount: number; greenZoneSize: number; speed: number }`.
- `LandResult` → `GameStateEnvelope & { caught: Array<{ fishId: string; weight: number; location: string }> }`.

> **Server response has no top-level `mode`** in 6a (rod). Add one:
> Task 4's `cast` return includes `mode` for both — confirm the rod `CastResult`
> also carries `mode: 'rod'`. If not, discriminate on `'net' in res`.

- [ ] **Step 1: Write the failing test**

```ts
it('castLine passes mode', async () => {
  const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
  await castLine('k-castnet00000001', 'titicaca', 'net');
  expect(spy).toHaveBeenCalledWith('/me/fishing/cast', { method: 'POST', body: { locationId: 'titicaca', mode: 'net' }, idempotencyKey: 'k-castnet00000001' });
});
it('landCatch omits fishId when not given, includes it when given', async () => {
  const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
  await landCatch('k-land0000000001', 's1');
  expect(spy).toHaveBeenCalledWith('/me/fishing/land', { method: 'POST', body: { sessionId: 's1' }, idempotencyKey: 'k-land0000000001' });
  await landCatch('k-land0000000002', 's1', 'atum');
  expect(spy).toHaveBeenLastCalledWith('/me/fishing/land', { method: 'POST', body: { sessionId: 's1', fishId: 'atum' }, idempotencyKey: 'k-land0000000002' });
});
```

Update the 6a `castLine` test to `castLine('…', 'atlantic')` → body `{ locationId: 'atlantic', mode: 'rod' }`.

- [ ] **Step 2–4:** RED → implement the signatures + widen the types → GREEN → `tsc app` clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/endpoints.ts src/api/endpoints.test.ts
git commit -m "frontend: castLine(mode) + landCatch(fishId?); CastResult/LandResult widened"
```

---

### Task 8: Index — `handleCast(mode)`, array-aware `handleLand`, drop `consumeNet` on entry

**Files:**
- Modify: `src/pages/Index.tsx`
- Modify: `src/game/fishing.ts` (`Hooked` → add a net variant)

**Interfaces:**
- `src/game/fishing.ts`:
  ```ts
  export type RodHooked = { kind: 'rod'; fish: Fish; weight: number; lucky: boolean; sessionId: string };
  export type NetHooked = { kind: 'net'; net: { greenZoneSize: number; speed: number; rarity: string; fishCount: number }; catches: Array<{ fish: Fish; weight: number }>; lucky: boolean; sessionId: string };
  export type Hooked = RodHooked | NetHooked;
  ```
- `Index.handleCast(locationId: string, mode: 'rod' | 'net' | 'submarine'): Promise<Hooked | null>`.
- `Index.handleLand(hooked: Hooked, locationId: string): Promise<'landed' | 'failed'>` — unchanged signature; server branch does `landCatchApi(key, hooked.sessionId)`.

- [ ] **Step 1: Implement** per spec 6b-1 §C:
  - `handleCast` — authenticated: `await flushNow()`; `const r = await castLineApi(crypto.randomUUID(), locationId, mode)`; `applyServerResult(r)`; if `r.mode === 'net'` → map `r.catches` to `{ fish: FISH.find(...), weight }` (drop any whose fish is missing), return `{ kind: 'net', net: { greenZoneSize: r.net.greenZoneSize, speed: r.net.speed, rarity: r.net.rarity, fishCount: r.net.fishCount }, catches, lucky: r.lucky, sessionId: r.sessionId }`; else rod as in 6a with `kind: 'rod'`. Anonymous: `mode === 'net'` → `rollNet()` + roll `fishCount` fish locally + `replaceFromServer(() => ({ nets: (player.nets ?? 0) - 1, luckyUntil, luckyCooldownUntil }))`; rod as in 6a.
  - `handleLand` — authenticated: `landCatchApi(key, hooked.sessionId)` → `applyServerResult` → `'landed'`; catch → `'failed'`. Anonymous: `hooked.kind === 'net'` → `catchFishBatch(hooked.catches.map(c => ({ fish: c.fish, weight: c.weight, location: locationId })), true)`; rod → `catchFishBatch([{ fish, weight, location }], false)`. Return `'landed'`.
  - The `screen === 'fishing'` render: `handleCast` is called with `'rod'` inside `FishingScreen` (Task 14 of 6a passes `onCast(location.id)` — update `FishingScreen` to `onCast(location.id, 'rod')`, or default the param). **Pin: `handleCast` defaults `mode` to `'rod'`** so `FishingScreen` needs no change.
  - `onCastNet` in the `FishingScreen` render site: drop the `consumeNet()` call — `() => { if ((player.nets ?? 0) > 0) setScreen('net'); }`.
  - `screen === 'net'` render: `<NetFishing location={selectedLocation} player={player} onCast={handleCast} onLand={handleLand} onBack={() => setScreen('locations')} onOpenShop={() => setScreen('netShop')} />` (drop `onCatch` / `onCatchBatch` / `onUseNet`).
  - `handleCatch` / `handleNetCatch` — `handleNetCatch` is now unused (delete it); `handleCatch` stays for `SubmarineFishing` only (6b-2 removes it).

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit -p tsconfig.app.json` → fails only in `NetFishing.tsx` (Task 9). Confirm.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Index.tsx src/game/fishing.ts
git commit -m "frontend: Index net cast/land; net spent on cast not on entry"
```

---

### Task 9: `NetFishing` — server-driven net minigame

**Files:**
- Modify: `src/components/game/NetFishing.tsx`
- Test: `src/test/NetFishing.test.tsx`

**Interfaces:**
- Props: `{ location: FishingLocation; player: PlayerState; onCast: (locationId: string, mode: 'net') => Promise<Hooked | null>; onLand: (hooked: Hooked, locationId: string) => Promise<'landed' | 'failed'>; onBack: () => void; onOpenShop?: () => void }` (drop `onCatch` / `onCatchBatch` / `onUseNet`).

- [ ] **Step 1: Update the tests**

`src/test/NetFishing.test.tsx` — `renderNet` passes `onCast: vi.fn().mockResolvedValue({ kind: 'net', net: { greenZoneSize: 0.5, speed: 1, rarity: 'common', fishCount: 3 }, catches: [], lucky: false, sessionId: 's1' })` and `onLand: vi.fn()`; drop the other props. Keep the "opens on pull phase" / "goes back" tests; the "names the drawn net after a rarity" test now reads the net name from `onCast`'s result — assert it after the cast resolves (`await screen.findByText(...)`). Add: `onCast` is called with `(location.id, 'net')` on mount; a green pull calls `onLand`; a `null` cast shows the no-nets/"sem redes" state.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/NetFishing.test.tsx` → FAIL (prop types).

- [ ] **Step 3: Implement** per spec 6b-1 §C:
  - State: `const [hooked, setHooked] = useState<NetHooked | null>(null)`. On mount
    (`useEffect`, once) `const h = await onCast(location.id, 'net')` → `null` →
    `setPhase('empty')` (reuse the existing `'empty'` phase for "no nets"); else
    `setHooked(h)` and start the pull phase using `h.net.greenZoneSize` / `h.net.speed`.
  - Drop `randomNet` / `rollWeight` / `pool` / `net` state / `haul` state / `startNet`.
  - `handlePull`: green → `const outcome = await onLand(hooked!, location.id)` →
    `outcome === 'landed'` → `setPhase('pulled')` and show the haul from
    `hooked.catches`; `'failed'` or red pull → `setPhase('lost')`.
  - `handleOpenNet` → `setPhase('opened')` (just the reveal; no callback — the land
    already applied).
  - `reset()` → guard `player.nets` (client hint; server re-checks), `const h = await onCast(location.id, 'net')`, restart.
  - The "haul" list renders `hooked.catches` (`{ fish, weight }`), same UI.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/NetFishing.test.tsx` → PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json` → **clean**. `npm test` → full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/NetFishing.tsx src/test/NetFishing.test.tsx
git commit -m "frontend: NetFishing runs the server-rolled net + batch"
```

---

### Task 10: Gate, browser smoke, PROJECT_MEMORY, PR

**Files:**
- Modify: `PROJECT_MEMORY.md`

- [ ] **Step 1: Static gate** — `tsc app`, `backend:typecheck`, `lint` (0 errors), `npm test`, `npm run build`.

- [ ] **Step 2: Integration** — Postgres up, `npm run backend:db:migrate && npm run test:integration` all PASS.

- [ ] **Step 3: Browser smoke (Playwright)** — `docker compose up -d` then
  **`docker compose restart frontend backend`** (verify with
  `curl -s http://localhost:8080/src/pages/Index.tsx | grep "mode: 'net'"` or the
  NetFishing module). Fresh account, seed a lake unlock + a few nets
  (`update player_game_state set state = jsonb_set(jsonb_set(state,'{player,nets}','5'),'{player,level}','8')`).
  1. Enter a lake → "Rede" → `POST .../fishing/cast { mode: net }` 200, the net
     minigame shows the server's grade, `nets` −1 in the DB.
  2. Pull in the green → `POST .../fishing/land` 200, the haul reveal lists the
     batch, `warehouse` + `aquariumWarehouse` grew by `fishCount`, `totalFishCaught`
     up, no double-apply on a re-render.
  3. Pull in the red once → "rede vazia", no `land` call.
  4. Cast with 0 nets → the screen shows "sem redes" (client) / the server 409s.
  5. DB: one `fishing_sessions` row per cast (`result_catches` populated), one
     `game_state_operations` `fishing_land` row per landed haul.
  6. Anonymous: log out, net-fish, confirm the local roll + batch catch + `nets`
     decrement still work.

  Screenshot the haul reveal (`net-catch-6b1-smoke.png`).

- [ ] **Step 4: Record + PR**

`PROJECT_MEMORY.md` — `### Task 10.3 fatia 6b-1 — captura à rede server-autoritativa`
section mirroring 6a; stopping point → **6b-2 (submarino)**.

```bash
git add PROJECT_MEMORY.md
git commit -m "docs: record Task 10.3 slice 6b-1 (server-authoritative net catch)"
git push -u origin feature/task-10-3-fishing-catch-6b1
gh pr create --base main --title "Task 10.3 (slice 6b-1): server-authoritative net catch" --body "<summary; verification table; smoke>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Watch CI; merge when green with no review comments; `docs:` merge record on `main`.

---

## Self-Review

**1. Spec coverage:**
- M1 `cast` `mode` → Tasks 3, 5. ✅
- M2 `land` `fishId` (accepted, unused) → Task 5. ✅
- M3 migration `0020` + schema → Task 2. ✅
- M4 `LandResult.caught` array → Task 4 (+ 6a test updates in Tasks 4, 5, 7). ✅
- M5 (6b-1 part) `netTypes` → `src/game/` → Task 1. ✅
- 6b-1 §B backend (`rollCast` net, `NO_NETS`, `applyLand` batch, memory+PG) → Tasks 3, 4. ✅
- 6b-1 §C frontend (endpoints, Index, `NetFishing`, `consumeNet` removed from entry) → Tasks 7, 8, 9. ✅
- 6b-1 §D tests → Tasks 1, 3, 4, 5, 6, 7, 9. ✅
- 6b-1 §E non-goals (submarine, client minigame outcome) → not implemented. ✅

**2. Placeholder scan:** Task 6 has `/* … */` inside two test skeletons that name
the pattern and point at the concrete reference tests already in the same file —
acceptable for a plan. Task 4 spells out the `applyLand` body and the "no `mode`
column, infer from `resultCatches`" decision. No "TBD"/"add error handling".

**3. Type consistency:**
- `CastRoll` discriminated union (Task 3) → session build (Task 4) → `CastResult`
  (Task 7) → `Hooked` net variant (Task 8) → `NetFishing` props (Task 9): `net`
  carries `{ id, rarity, fishCount, greenZoneSize, speed }` from `rollCast`,
  narrowed to `{ greenZoneSize, speed, rarity, fishCount }` in `NetHooked`. ✅
- `LandResult.caught: Array<{ fishId; weight; location }>` identical in Tasks 4, 5,
  7. ✅
- `land` body `{ sessionId, fishId? }` identical in Task 5 (routes) and Task 7
  (endpoints). ✅
- `rollNet(random?)` identical in Tasks 1, 3, 8 (anon). ✅
- op string `'fishing_land'` unchanged from 6a; net reuses it (Tasks 4, 6). ✅
