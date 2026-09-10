# Retire the free-form `PUT /me/state` write — design

Task 10.3, final item. Security checklist #8. Branch:
`feature/task-10-3-retire-state-write` (to be created off `main` at `14125d0`).

## Context

`PUT /api/v1/me/state` lets an authenticated client replace the *entire*
`player_game_state` blob with any content that passes `saveSchema` (shape and
bounds only — level 1-30, coins ≥ 0, etc.), as long as the client supplies the
row's current `version` as `baseVersion` (optimistic concurrency). The server
never checks that the new content is *reachable* from the old content through
legitimate play. A client that knows its own current version — which it
always does — can set its own coins, level, collection, owned skins, anything
within schema bounds, to whatever it wants. That is the hole security
checklist item #8 refers to.

The route is not one thing, though — it currently serves four different
purposes, established during investigation (see chat history 2026-09-10/11):

1. **Bootstrap.** `useGameStateSync.start()` calls `PUT` with
   `baseVersion: null` the first time an authenticated session finds the
   server blob empty (`GET` returns `state: null`). This is what turns
   anonymous local progress into the account's starting state on first
   login/registration. The server already refuses this when a row exists
   (`onConflictDoNothing` in PG, an explicit check in memory) — it is
   inherently create-only and cannot overwrite real progress. **Not the
   security hole** — keep this capability, just narrow its shape.
2. **Cosmetic equip.** `equipSkin`/`equipBoatSkin` in `useGameState.ts` set
   `activeSkin`/`activeBoatSkin` with no dedicated server op; for an
   authenticated user this persists *only* because `useGameStateSync`'s
   generic debounced push picks up the diff.
3. **The autosave machinery itself.** A 4s-debounced push on any `player`
   change, a 45s/visibility-triggered `GET` poll for cross-device pulls, and a
   `pagehide` keepalive `PUT`. All the push-side machinery exists to serve (2)
   — once (2) has a real op, there is nothing left that needs a generic push.
4. **Reset progress.** `resetProgress()` also relies on the generic push today.
   **Decision (user, 2026-09-10): drop this for authenticated accounts** —
   hide the "Resetar Progresso" button while `status === 'authenticated'`.
   Anonymous play keeps it unchanged. No new server endpoint for reset.

## Goals

- Close the security hole: no authenticated request can set the blob's
  content to anything other than what a validated server op computes.
- Preserve the bootstrap behavior (anonymous progress → new account) exactly
  as it works today, just under a narrower, explicitly-named contract.
- Give cosmetic equip a real, validated server op, on the same footing as
  every other mutation.
- Simplify `useGameStateSync` by deleting the machinery that only existed to
  support the generic push, now that nothing needs it.

## Non-goals

- The `migration` module (local-save import into an *existing* account) is
  untouched — it already writes through its own transaction, not through
  `PUT /me/state`, and its independent bug (writes to dormant tables, never
  the blob) was explicitly deferred in Task 10.3 slice 8.
- No change to `GET /api/v1/me/state`, to any existing `/me/economy/*` or
  `/me/fishing/*` op, or to the leaderboard/season work from slice 7.
- No new "reset progress" capability for authenticated accounts.

## Design

### Backend — bootstrap replaces PUT's create branch

- `backend/src/gamestate/memoryService.ts`: `createMemoryGameStateService`'s
  `put(userId, state, baseVersion)` loses its update branch. Rename to
  `bootstrap(userId, state)`: if `store.has(userId)`, throw
  `STATE_VERSION_CONFLICT`; else `store.set(userId, { state, updatedAt, version: 1 })`
  and return `{ version: 1 }`.
- `backend/src/gamestate/pgRepository.ts`: `createPgGameStateService`'s `put`
  loses its `baseVersion !== null` (`update`) branch entirely. The
  `baseVersion === null` branch (the existing `insert().onConflictDoNothing()`)
  becomes `bootstrap(userId, state)` — same body, just renamed and no longer
  branches on a `baseVersion` parameter it no longer accepts.
- `backend/src/gamestate/routes.ts`: `PUT /api/v1/me/state` is deleted.
  New route `POST /api/v1/me/state/bootstrap`, body `{ state: saveSchema }`
  (no `baseVersion` field — there is nothing to branch on any more), calls
  `service.bootstrap(request.userId, request.body.state)`. `GET` is untouched.
  Keep the existing `STATE_BODY_LIMIT` (2 MiB) on the new route.
- Both service factories' return type narrows from `{ get, put }` to
  `{ get, bootstrap }`.

### Backend — skin/boat-skin equip op

New pure rule in `src/game/stateRules.ts`, next to `buyOwnedItem`:

```ts
export function equipSkin(state: PlayerState, kind: 'rod' | 'boat', id: string): PlayerState {
  const owned = kind === 'rod' ? state.ownedSkins : state.ownedBoatSkins;
  if (!owned.includes(id)) return state;
  return kind === 'rod' ? { ...state, activeSkin: id } : { ...state, activeBoatSkin: id };
}
```

No-op-on-invalid-input, matching `buyOwnedItem`'s style — the *validating*
throw happens in the backend `compute` wrapper, same split as every other op.

`backend/src/gamestate/economyService.ts`:
- `OPS.skinEquip = 'skin_equip'`.
- `computeSkinEquip(envelope, kind, skinId)`: the owned-array check the pure
  rule already has, but throwing `SKIN_NOT_OWNED` before calling
  `equipSkin` — same shape as `computeSkinPurchase`.
- `GameStateEconomyService` gains `equipSkin(userId, idempotencyKey, kind, skinId): Promise<Result>`.
- Both `createMemoryGameStateEconomyService` and `createPgGameStateEconomyService`
  wire it through the existing `runMemoryOp`/`runPgOp`, identically to
  `purchaseSkin` — same replay-row treatment as every other op, no special
  casing, even though equip is naturally idempotent and grants no value.

`backend/src/gamestate/economyRoutes.ts`: new route
`POST /api/v1/me/economy/skins/equip`, reusing the existing `skinBody`
Zod schema (`{ kind, skinId }` — already exactly this shape), `preHandler: app.requireAuth`,
calls `service.equipSkin(request.userId, idempotencyKey(...), kind, skinId)`.

`backend/src/http/errors.ts`: new domain code
`SKIN_NOT_OWNED: { status: 404, message: 'You do not own that skin' }`.

### Frontend — `src/game/useGameState.ts`

`equipSkin`/`equipBoatSkin`'s inline ownership-check-then-set logic is
replaced by calls to the new shared `equipSkin` pure rule from
`stateRules.ts` (kept as two thin wrappers with the same names/signatures the
rest of the app already calls, so no caller besides `Index.tsx`'s server-op
wiring changes).

### Frontend — `src/api/endpoints.ts`

- `putGameState(state, baseVersion)` → `bootstrapGameState(state)` (drops the
  `baseVersion` parameter — the endpoint no longer accepts one). Calls
  `apiFetch('/me/state/bootstrap', { method: 'POST', body: { state } })`.
- New `equipSkin(idempotencyKey, kind, skinId)` →
  `apiFetch('/me/economy/skins/equip', { method: 'POST', body: { kind, skinId }, idempotencyKey })`.

### Frontend — `src/game/auth/gameStateSync.ts`

Deleted entirely: `push`, the debounce `useEffect`, the `pagehide`/
`visibilitychange` keepalive-PUT `useEffect`, `stableStringify`, `lastSent`,
`flushNow`, the `Opts`/return-type entries for `flushNow`.

Kept, adjusted:
- `start()`: on `resync()` returning `kind: 'empty'`, call
  `bootstrapGameState(envelope())` instead of `putGameState(envelope(), null)`;
  seed `baseVersion.current` from the returned version. Best-effort (same
  try/catch-and-ignore as today).
- The 45s/visibility `poll()` → `resync()` cross-device pull path: unchanged,
  it only ever called `GET`.
- `applyServerResult`: unchanged — every op call (existing and the two new
  ones) already goes through this to adopt `{ state, version }`.
- `busy` ref: still guards `poll()` against racing a bootstrap/resync; no
  push to race against any more, but keeping the guard costs nothing and
  avoids a second special case.

Return type shrinks to `{ start, applyServerResult }` — `flushNow` is gone.

### Frontend — `src/pages/Index.tsx`

- `runEconomyOp`'s `await flushNow();` call is deleted — nothing pending to
  flush once equip is a real op. Its doc comment (currently explaining *why*
  the flush exists) is rewritten to say local mutations no longer exist for
  authenticated users; every mutation calls its own op directly.
- `runEconomyOp`'s `op` union gains `'equipSkin'`.
- `busyOp` state's union gains `'equipSkin'`.
- Two new handlers, same pattern as `handleBuySkin`/`handleBuyBoatSkin`:
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
  `SkinsShop`'s `onEquip={equipSkin}` → `onEquip={handleEquipSkin}`;
  `BoatSkinsShop`'s `onEquip={equipBoatSkin}` → `onEquip={handleEquipBoatSkin}`.
- `AuthProvider`'s `onBeforeLogout={flushNow}` prop is removed (the prop no
  longer exists on the hook's return value; nothing to flush on logout since
  every mutation already lives on the server the moment it happens).

### Frontend — `src/components/game/MainMenu.tsx`

Line ~185: `{player.level > 1 && (` → `{player.level > 1 && status !== 'authenticated' && (`
— `status` is already destructured from `useAuth()` in this component (used
one line above for the account button label).

## Error handling

- `POST /me/state/bootstrap` on an existing row → `409 STATE_VERSION_CONFLICT`
  (same code already used for this case; no new code needed).
- `POST /me/economy/skins/equip` on an unowned skin → `404 SKIN_NOT_OWNED`
  (new code, mirrors `SKIN_NOT_FOUND`'s 404 for "not in the catalog").
- Both routes: standard `400 VALIDATION_ERROR` on a malformed body (existing
  Zod-driven behavior, no change).

## Testing

**Backend:**
- `backend/src/gamestate/routes.test.ts`: rewrite the `PUT`-overwrite tests
  (lines ~52-84 today) into bootstrap-only tests — keep "first bootstrap
  creates version 1 and GET round-trips", "bootstrap when a row already
  exists is 409", "bootstrap with an invalid shape is 400", "bootstrap
  without CSRF is 403"; delete "PUT with current baseVersion bumps version"
  and "PUT with a stale baseVersion is 409" (that capability no longer
  exists). Keep the two `GET` tests unchanged.
- `backend/src/gamestate/pgRepository.integration.test.ts`: same shape —
  rewrite `svc.put(userId, blob, baseVersion)` calls to
  `svc.bootstrap(userId, blob)`; delete the "upserts on a matching
  baseVersion" and "rejects a stale baseVersion" tests; keep "returns null
  for an unknown user", "bootstrap creates version 1", "rejects when a row
  already exists", "cascades on user deletion" (updated to call `bootstrap`).
- `backend/src/gamestate/economyService.test.ts` (memory) and
  `.integration.test.ts` (PG): new `describe('… — equipSkin')` blocks
  mirroring the existing `purchaseSkin` ones — equips an owned rod skin,
  equips an owned boat skin, replay returns the identical result, rejects an
  unowned skin with `SKIN_NOT_OWNED`, rejects an unknown user with
  `GAME_STATE_NOT_FOUND`.
- `backend/src/gamestate/economyRoutes.test.ts`: HTTP-level cases for the new
  route — 200 equip, replay, 404 not-owned, 401 no session, 400 invalid body
  (unknown `kind`) — mirroring the existing skin-purchase block.
- `backend/src/http/openapi.test.ts`: swap `/api/v1/me/state` PUT expectation
  — no path changes needed here since the doc lists paths, not methods, but
  double check whether `/api/v1/me/state/bootstrap` and
  `/api/v1/me/economy/skins/equip` need adding to the `expected` array
  (they do — new paths).
- `backend/src/app.test.ts`: the existing "casts and lands…" style
  HTTP-level smoke tests — add (or extend) one exercising bootstrap + equip
  end to end if not already adequately covered by the more focused test
  files above.

**Frontend:**
- `src/game/auth/gameStateSync.test.ts`: delete the `describe` blocks
  `'useGameStateSync — debounced push'`, `'useGameStateSync — flushNow'`,
  `'useGameStateSync — pagehide keepalive'` in full. Update
  `'useGameStateSync — start'`'s "adopts the local save…" test to assert a
  `bootstrapGameState` call instead of `putGameState`. Leave `'periodic
  pull'` and `'applyServerResult'` blocks unchanged (still GET-only).
- `src/api/endpoints.test.ts`: replace the `putGameState` cases with
  `bootstrapGameState` ones (no `baseVersion` arg); add a case for the new
  `equipSkin` endpoint call.
- `src/test/useGameState*.test.tsx` (if any assert on `equipSkin`/
  `equipBoatSkin` directly): confirm they still pass unchanged (behavior is
  identical, only the implementation moved into `stateRules.ts`).
- New `src/test/stateRules.test.ts` cases for the new `equipSkin` pure rule
  (owned → sets active field; not owned → no-op), alongside the existing
  `buyOwnedItem` cases.
- `src/test/MainMenu.test.tsx`: add a case asserting the reset button is
  absent when `status === 'authenticated'` (existing mock already lets a test
  override `status`).
- `src/pages/Index.tsx` has no direct unit test file today (confirm during
  implementation) — if none exists, the browser smoke covers it.

**Full gate + browser smoke** (per the project's standing rule): `tsc` (app +
backend), `lint`, `npm test`, `build`, `backend:db:migrate` (no schema change
expected — confirm no migration is actually needed, since this is app-layer
only, not a table change) `+ test:integration`, then a Playwright smoke on
the Docker stack: register a fresh account (bootstrap fires), buy and equip a
skin (new op fires), confirm no `PUT /api/v1/me/state` request ever appears
in the network trace, log out and back in (state persists via bootstrap only
having run once), confirm "Resetar Progresso" is absent while logged in and
present for anonymous play.

## Rollout

No database migration — `player_game_state`'s schema is unchanged, only the
application-layer contract around it. No data backfill needed: existing rows
are unaffected: `GET` keeps working, and no existing authenticated session
has a "pending offline PUT" to lose (the debounce is client-side and in
memory only).
