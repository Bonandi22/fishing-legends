# Server-authoritative roulettes + daily gifts (Task 10.3, slice 5) — design

## Context

Slices 1–4 made the value-granting economy server-authoritative over the
`player_game_state` blob (`POST /api/v1/me/economy/<op>` + `Idempotency-Key` → the
pure rule from `src/game/stateRules.ts` runs on the blob in a transaction,
`game_state_operations` replay table keyed `(user_id, idempotency_key, operation)`,
returns `{ state, version }`; client does `flush → call → applyServerResult`;
anonymous keeps the local pure rule).

This slice does the three **reward** features, which today run **entirely in the
components** with client-side RNG:

- **Daily gift** (`DailyGifts.tsx` / `useGameState.claimDailyGift`) — deterministic,
  once per day (`dailyGiftsLastClaim === today`, UTC date string). Reward from
  `getDailyGiftsForWeek(week)[day-1]`; advances `dailyGiftsDay` (7→1) and
  `dailyGiftsWeek` (++ on wrap). Duplicate skin → **+1000 coins**.
- **Daily roulette** (`Roulette.tsx`) — free, once per day
  (`lastRouletteDate === today`). 8 uniform slots: fixed coin amounts
  (100/250/500/1000/1000/150), 2× luck multiplier, 2× strength multiplier, and 2
  slots that are "a random **unowned** skin, else a coin fallback". `Math.random`
  picks the slot; the granted prize is read back from the final animation angle.
- **Skin roulette** (`SkinRoulette.tsx`) — costs **1500 coins** per spin, **no daily
  limit** (repeatable). Pool = `ROD_SKINS` (`price > 0 || exclusive`) +
  `BOAT_SKINS` (`price > 0`). `Math.random` picks; duplicate → **+500 coins** (via
  `grantOwnedItem`).

None of the three has a pure rule in `stateRules.ts`.

### Decisions (user, 2026-09-08)

1. **One PR, three endpoints** — all three features in one branch/slice.
2. **Decorative wheel + reveal** — the server returns only the resolved `reward`;
   the client plays a generic spin animation and reveals it. The wheel no longer
   maps 1:1 to slots. Slight UX change, much simpler contract.
3. **Simple server RNG** — `crypto.randomInt` server-side; the resolved reward is
   stored in the `game_state_operations` row (replay returns the same reward). A
   seed-based auditable scheme is deferred (championship anti-fraud, own task).

## The pattern

Same as slice 1 (`2026-09-07-server-economy-warehouse-sell.md`), with one addition:
the operation result — and therefore the 200 body and the replay payload — is
`{ state, version, reward }` instead of `{ state, version }`.

```
Client (authenticated)                        Server
POST /api/v1/me/economy/<op>       ─────▶      requireAuth + CSRF + Idempotency-Key
  (no body)                                    ├─ replay? → return recorded { state, version, reward }
                                               ├─ player_game_state row FOR UPDATE
                                               ├─ saveSchema.parse(row.state)
                                               ├─ pure rule (roll = crypto.randomInt) → { player, reward }
                                               │    domain guard fails → 4xx, nothing written
                                               ├─ write blob + version+1
                                               ├─ record operation (result includes reward)
                                               └─ commit
              ◀─────  200 { state, version, reward }
applyServerResult({ state, version }) → replace local, reseed baseVersion, mark sent
component reveals `reward`
```

Anonymous users call the same new pure rules locally with a `Math.random` roll and
reveal the returned reward.

---

## D — Shared domain

### D1. `src/game/rewards.ts` (new)

Holds the reward tables lifted out of the components. The backend imports this
module (consolidating toward CLAUDE.md's "prefer importing over duplicating").

```ts
export type RewardGrant =
  | { type: 'coins'; amount: number }
  | { type: 'multiplier'; kind: 'luck' | 'strength' }
  | { type: 'rodSkin'; skinId: string; duplicate?: boolean }
  | { type: 'boatSkin'; skinId: string; duplicate?: boolean };

// 8 uniform slots — mirrors the current Roulette.tsx table.
export type RouletteSlot =
  | { kind: 'coins'; amount: number }
  | { kind: 'multiplier'; mult: 'luck' | 'strength' }
  | { kind: 'skinOrCoins'; skin: 'rod' | 'boat'; fallbackCoins: number };

export const DAILY_ROULETTE_SLOTS: RouletteSlot[] = [
  { kind: 'coins', amount: 100 },
  { kind: 'multiplier', mult: 'luck' },
  { kind: 'coins', amount: 250 },
  { kind: 'multiplier', mult: 'strength' },
  { kind: 'skinOrCoins', skin: 'boat', fallbackCoins: 500 },
  { kind: 'skinOrCoins', skin: 'rod', fallbackCoins: 1000 },
  { kind: 'coins', amount: 1000 },
  { kind: 'coins', amount: 150 },
];

export const SKIN_ROULETTE_COST = 1500;
export const DAILY_GIFT_DUPLICATE_COINS = 1000;
export const ROULETTE_DUPLICATE_COINS = 500;   // daily + skin roulette
```

`DailyGiftReward` (in `types.ts`) stays; `RewardGrant` is a superset (adds the
`duplicate` flag). `resolveDailyGift` returns a `RewardGrant` built from the
`DailyGiftReward` table entry.

`roll` contract used by every rule below: `roll(n: number) => integer in [0, n)`.
- server: `crypto.randomInt(n)`
- anonymous client: `Math.floor(Math.random() * n)`
- tests: a stub, e.g. `makeRoll([0, 3])` returning queued values.

### D2. `src/game/stateRules.ts` — three pure rules

All three are pure: time comes in as `now: number` (server and client both pass
`Date.now()`, tests pass a fixed value — matching how slice 3's
`computeMultiplierPurchase` already threads `now`); randomness comes in as
`roll(n) => integer in [0, n)`. Multiplier grants are always power **2** for
`MULTIPLIER_DURATION` (unchanged).

```ts
export function resolveDailyGift(
  state: PlayerState,
  todayStr: string,            // 'YYYY-MM-DD'
  now: number,
): { next: PlayerState; reward: RewardGrant };
// throws Error('DAILY_GIFT_ALREADY_CLAIMED') when state.dailyGiftsLastClaim === todayStr
```

Direct port of `useGameState.claimDailyGift`: pick
`getDailyGiftsForWeek(week)[day-1]`, apply (coins / `now + MULTIPLIER_DURATION`
multiplier / grant skin, duplicate → `+DAILY_GIFT_DUPLICATE_COINS`), set
`dailyGiftsLastClaim = todayStr`, advance `dailyGiftsDay` (7→1) and `dailyGiftsWeek`
(++ on wrap). `reward` mirrors what was granted, `duplicate: true` when the skin was
already owned. No RNG — no `roll` parameter.

```ts
export function spinDailyRoulette(
  state: PlayerState,
  todayStr: string,
  now: number,
  roll: (n: number) => number,
): { next: PlayerState; reward: RewardGrant };
// throws Error('ROULETTE_ALREADY_USED') when state.lastRouletteDate === todayStr
```

- `slot = DAILY_ROULETTE_SLOTS[roll(8)]`.
- `coins` → add. `multiplier` → set that multiplier end to `now + MULTIPLIER_DURATION`.
- `skinOrCoins` → `pool = (skin==='rod' ? ROD_SKINS : BOAT_SKINS).filter(unowned && (price>0 || exclusive))`;
  **check `pool.length` first** — empty → grant `fallbackCoins`; else
  `pool[roll(pool.length)]`, add to owned (never a duplicate — pool is filtered
  unowned).
- Sets `lastRouletteDate = todayStr`.

```ts
export function spinSkinRoulette(
  state: PlayerState,
  roll: (n: number) => number,
): { next: PlayerState; reward: RewardGrant };
// throws Error('INSUFFICIENT_FUNDS') when state.coins < SKIN_ROULETTE_COST
```

- Charge `SKIN_ROULETTE_COST`.
- `kind = roll(2) === 0 ? 'rod' : 'boat'` — distributionally identical to the
  current "4 rod + 4 boat slots, pick one".
- `pool = (kind==='rod' ? ROD_SKINS : BOAT_SKINS).filter(price>0 || exclusive)` (NOT
  filtered by owned — a duplicate is possible, as today).
- `pick = pool[roll(pool.length)]`. Owned already → `+ROULETTE_DUPLICATE_COINS`,
  `reward.duplicate = true`, skin **not** re-added. Else add to owned.

---

## A — Backend

### A1. `backend/src/gamestate/economyService.ts`

Generalise the internal `Compute` type:

```ts
type Compute = (envelope: SaveEnvelope) => { player: Player; reward?: RewardGrant };
```

The four existing computes change from `return applyX(...)` to
`return { player: applyX(...) }` (trivial). `runMemoryOp` / `runPgOp` build
`result = { state, version, ...(reward ? { reward } : {}) }` and store the whole
`result` in the op row (unchanged mechanism — it already stores the full result).

`Result` type gains `reward?: RewardGrant`.

Three new service methods + operations. Each `compute` adapts the rule's
`{ next, reward }` to `Compute`'s `{ player, reward }`:

| method | operation | rule called in `compute` |
|---|---|---|
| `spinRoulette(userId, key)` | `roulette_spin` | `spinDailyRoulette(env.player, today, now, roll)` |
| `spinSkinRoulette(userId, key)` | `skin_roulette_spin` | `spinSkinRoulette(env.player, roll)` |
| `claimDailyGift(userId, key)` | `daily_gift_claim` | `resolveDailyGift(env.player, today, now)` |

where, per call: `today = new Date().toISOString().slice(0, 10)`,
`now = Date.now()` (both taken once and closed over so memory and PG behave
identically), `roll = (n) => crypto.randomInt(n)` from `node:crypto`. The `compute`
wrapper is `env => { const { next, reward } = <rule>; return { player: next, reward }; }`.

Both `createMemoryGameStateEconomyService` and `createPgGameStateEconomyService` get
the three methods.

### A2. `backend/src/gamestate/economyRoutes.ts`

Three routes, all `preHandler: app.requireAuth`, no body, CSRF automatic:

- `POST /api/v1/me/economy/roulette/spin`
- `POST /api/v1/me/economy/skin-roulette/spin`
- `POST /api/v1/me/economy/daily-gift/claim`

(`daily-gift/claim` under `/me/economy/` — keeps all blob ops in one registrar and
sidesteps the dormant `/api/v1/rewards/daily/claim`, which is removed in slice 8.)

Response `200 { state, version, reward }`.

### A3. `backend/src/http/errors.ts`

```ts
ROULETTE_ALREADY_USED:      { status: 409, message: 'The daily roulette was already used today' },
DAILY_GIFT_ALREADY_CLAIMED: { status: 409, message: 'The daily gift was already claimed today' },
```

`INSUFFICIENT_FUNDS` already mapped. No migration — the op PK is generic.

### A4. `backend/src/db/schema.ts`, migrations

None.

### A5. Backend tests

`economyService.test.ts` (memory) — per feature: happy path (state + reward +
version bump), replay same key → identical body incl. reward, second **distinct**
key same day → `ROULETTE_ALREADY_USED` / `DAILY_GIFT_ALREADY_CLAIMED`, skin roulette
insufficient funds, skin roulette duplicate → coins + `duplicate` flag,
`GAME_STATE_NOT_FOUND`, F2 cross-op (a roulette spin does not replay a daily claim
under the same key). RNG is made deterministic by seeding the blob so only one
outcome is possible (e.g. all skins owned → roulette skin slot always hits
fallback coins) — the service's `crypto` roll is not stubbed; the *rule* tests
below cover distribution.

`economyService.integration.test.ts` (real PG) — per feature: transactional apply +
one op row with the right `operation`, replay → same reward + one row, second spin
same day → 409 nothing written, concurrent same-key → identical result + one row.

`stateRules.test.ts` — the three pure rules with a stubbed `roll` covering every
slot / branch: each `DAILY_ROULETTE_SLOTS` entry, skin slot with empty pool →
fallback, `spinSkinRoulette` rod vs boat vs duplicate, `resolveDailyGift` day 7→1
and week increment, all three "already used/claimed" throws.

`economyRoutes.test.ts` — 200 shape incl. `reward`, replay, 409s, 401 no session.

---

## B — Frontend

### B1. `src/api/endpoints.ts`

```ts
type RewardEnvelope = GameStateEnvelope & { reward: RewardGrant };
export function spinRoulette(idempotencyKey: string): Promise<RewardEnvelope>;
export function spinSkinRoulette(idempotencyKey: string): Promise<RewardEnvelope>;
export function claimDailyGift(idempotencyKey: string): Promise<RewardEnvelope>;
```

All `{ method: 'POST', idempotencyKey }`, no body. `RewardGrant` imported from
`@/game/rewards`.

### B2. `src/game/useGameState.ts`

Replace the six reward callbacks (`addCoins`, `addSkin`, `addBoatSkin`,
`addMultiplier`, `setLastRouletteDate`, `claimDailyGift`) on the **public** hook
surface with three local reward helpers that call the new pure rules and **return
the granted reward**:

```ts
spinDailyRouletteLocal(): RewardGrant   // throws ROULETTE_ALREADY_USED
spinSkinRouletteLocal(): RewardGrant    // throws INSUFFICIENT_FUNDS
claimDailyGiftLocal(): RewardGrant      // throws DAILY_GIFT_ALREADY_CLAIMED
```

Each reads the latest player from a `playerRef` (added), computes
`{ next, reward }` via the pure rule with `n => Math.floor(Math.random() * n)` and
`Date.now()`, `setPlayer(next)`, returns `reward`.

`addCoins` is kept only if still referenced by `replaceFromServer.test.ts` — update
that test to dirty state via another mutation instead, and drop `addCoins`.
`spendCoins` stays (pure `applyCoinSpend` re-export is untouched; the hook wrapper
is removed if unused).

### B3. `src/pages/Index.tsx`

`busyOp` union gains `'roulette' | 'skinRoulette' | 'dailyGift'`. A reward-returning
variant of `runEconomyOp`:

```ts
const runRewardOp = useCallback(async (
  op, local: () => RewardGrant, api: (key: string) => Promise<RewardEnvelope>,
): Promise<RewardGrant | null> => {
  if (!syncEnabled) { try { return local(); } catch { return null; } }
  setBusyOp(op);
  try { await flushNow(); const res = await api(crypto.randomUUID()); applyServerResult(res); return res.reward; }
  catch { console.warn(`reward op "${op}" failed`); return null; }
  finally { setBusyOp(null); }
}, [syncEnabled, flushNow, applyServerResult]);
```

`handleSpinRoulette` / `handleSpinSkinRoulette` / `handleClaimDailyGift` wrap it.

### B4. Components

- **`Roulette.tsx`** — props: `player`, `onSpin: () => Promise<RewardGrant | null>`,
  `busy?: boolean`, `onBack`. Drop the five `on*` grant props and the internal
  prize/RNG logic. On click: guard on `player.lastRouletteDate` being today (UTC) and
  `busy`; play the existing ~4 s wheel animation (fixed extra turns, no computed
  target); when it settles, `const reward = await onSpin()`; `reward` → reveal it
  (reuse the result card, label from a small `rewardLabel(reward, t)` helper);
  `null` → soft "tenta de novo" message, no state change. The wheel face can keep
  showing the 8 static slot emojis for decoration.
- **`SkinRoulette.tsx`** — props: `player`, `onSpin`, `busy?`, `onBack`. Button
  disabled when `player.coins < SKIN_ROULETTE_COST || busy`. Same decorative spin +
  reveal. `SPIN_COST` constant replaced by `SKIN_ROULETTE_COST` from `@/game/rewards`.
- **`DailyGifts.tsx`** — prop `onClaim: () => Promise<RewardGrant | null>`. The tiles
  still render from `player` (server advances day/week via `applyServerResult`). On
  claim: `const reward = await onClaim()`; show the popup from the **returned**
  reward (not `gifts[currentDay-1]`), so a server-advanced day can't desync the
  popup. `null` → no popup, soft message.
- Shared: a `rewardLabel(reward: RewardGrant, t): string` helper (extend the
  existing `dailygifts/rewards.ts` `rewardLabel`, which already handles
  `DailyGiftReward`, to accept `RewardGrant` and its `duplicate` flag).

### B5. Frontend tests

- `endpoints.test.ts` — the three new functions POST the right path with the key
  (+3).
- `stateRules.test.ts` — covered in A5 (shared module).
- `Roulette.test.tsx` / `SkinRoulette.test.tsx` — `onSpin` is called on spin; the
  reward it resolves is revealed; button disabled while `busy`; roulette blocked
  when `player.lastRouletteDate` is today; skin roulette blocked below cost.
- `DailyGifts.test.tsx` — `onClaim` called; popup shows the resolved reward; button
  disabled when `claimedToday`.
- `useGameState` test — `spinDailyRouletteLocal` etc. apply the rule and return the
  reward; second call same day throws.

---

## Non-goals (this slice)

- Seed-based / auditable RNG — deferred (championship anti-fraud, own task).
- Faithful slice-accurate wheel (server returning the slot layout + win index).
- Any balance change: costs, cooldowns, prize tables, durations, duplicate refunds
  are all carried over as-is.
- A per-day limit on the **skin** roulette (stays cost-gated, repeatable).
- Removing the dormant `/api/v1/rewards/daily/claim` and its model — slice 8.
- Catch / aquarium / leaderboard — later slices.
- Optimistic UI: the spin animation covers the request latency; reveal awaits the
  result.

## Risks

- **Three animated screens change behaviour** — runtime-visible. Smoke all three on
  the Docker stack (fresh account), authenticated and a quick anonymous check.
- **`resolveDailyGift` must mirror the hook exactly** — day 7→1, `week++` on wrap,
  duplicate → 1000 (not 500). A direct port + a table-driven test over a full
  week guards it.
- **`crypto.randomInt` range** — `randomInt(n)` for `n === 0` throws; the
  `skinOrCoins` empty-pool branch must check length **before** calling `roll`.
- **Memory vs PG parity** — both must use the same `roll` contract and the same
  single `now` / today-string per call. The rule is shared; only the injected
  functions differ.
- **`playerRef` staleness** — the anon helpers read a ref so a rapid second click
  sees the just-applied state (the `lastRouletteDate` guard then rejects it).
- **`game_state_operations.result` grows** — now also carries `reward` (tiny). Same
  retention story as slice 1.
- **`addCoins` removal** — one test depends on it; update that test, don't keep the
  method for tests.
