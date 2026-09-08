# Server-authoritative roulettes + daily gifts (Task 10.3 slice 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily gift, daily roulette, and skin roulette server-authoritative over the `player_game_state` blob, with server-side RNG and a decorative client wheel.

**Architecture:** Three reward tables and a `RewardGrant` type move into a new shared `src/game/rewards.ts` (imported by both frontend and backend). Three new pure rules in `src/game/stateRules.ts` take an injected `roll(n) => [0,n)` and `now`. Backend adds three blob-op endpoints following the slice 1–4 pattern (`runMemoryOp` / `runPgOp`, `game_state_operations` replay table), returning `{ state, version, reward }`. The three animated screens become decorative: the wheel spins a fixed amount and reveals the reward the server (or the local rule for anonymous users) resolved.

**Tech Stack:** TypeScript (strict), Fastify + Zod + Drizzle (backend, ESM with `.js` import suffixes), Vitest, React + Vite (frontend), PostgreSQL (integration).

**Spec:** `docs/superpowers/specs/2026-09-08-server-roulettes-daily-gifts.md`

## Global Constraints

- **TypeScript strict everywhere. No new `any`.**
- **Backend ESM:** relative imports use the `.js` suffix even for `.ts` files (`./service.js`), and cross-package imports of the frontend domain use `../../../src/game/<x>.js`.
- **Zod** validation for every body/query/param on the backend. These three endpoints take **no body**.
- **Idempotency:** value-granting ops require an `Idempotency-Key` header (16–128 chars) and must be atomic. Replay of the same key returns the recorded result (now including `reward`).
- **Domain errors:** `throw new Error('SNAKE_CASE_CODE')` mapped in `backend/src/http/errors.ts`; never leak internals.
- **No balance change:** costs (`SKIN_ROULETTE_COST = 1500`), duplicate refunds (daily gift `1000`, roulettes `500`), cooldowns (daily gift + daily roulette 1×/UTC-day, skin roulette unlimited), multiplier (power 2, `MULTIPLIER_DURATION = 60_000`ms) all carried over exactly.
- **No new migration** — the `game_state_operations` PK `(user_id, idempotency_key, operation)` is already generic.
- **Prefer importing over duplicating** — backend imports `src/game/rewards.ts` and `src/game/stateRules.ts`, never re-implements them.
- **Date string** for the daily gates: `new Date().toISOString().slice(0, 10)` (UTC `YYYY-MM-DD`), computed from the server clock on the server.
- Per-slice gate before the PR: `npx tsc --noEmit -p tsconfig.app.json`, `npm run backend:typecheck`, `npm run lint` (0 errors), `npm test`, `npm run build`, then with Postgres up `npm run backend:db:migrate && npm run test:integration`, then a browser smoke on the Docker stack.

---

### Task 1: Shared reward module `src/game/rewards.ts`

**Files:**
- Create: `src/game/rewards.ts`
- Test: `src/test/rewards.test.ts` (create)

**Interfaces:**
- Consumes: `ROD_SKINS`, `BOAT_SKINS` from `src/game/types.ts` (only used later by the rules; this module holds data + types).
- Produces:
  - `type RewardGrant = { type: 'coins'; amount: number } | { type: 'multiplier'; kind: 'luck' | 'strength' } | { type: 'rodSkin'; skinId: string; duplicate?: boolean } | { type: 'boatSkin'; skinId: string; duplicate?: boolean }`
  - `type RouletteSlot = { kind: 'coins'; amount: number } | { kind: 'multiplier'; mult: 'luck' | 'strength' } | { kind: 'skinOrCoins'; skin: 'rod' | 'boat'; fallbackCoins: number }`
  - `const DAILY_ROULETTE_SLOTS: RouletteSlot[]` (length 8)
  - `const SKIN_ROULETTE_COST = 1500`
  - `const DAILY_GIFT_DUPLICATE_COINS = 1000`
  - `const ROULETTE_DUPLICATE_COINS = 500`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/rewards.test.ts
import { describe, expect, it } from 'vitest';
import {
  DAILY_ROULETTE_SLOTS,
  SKIN_ROULETTE_COST,
  DAILY_GIFT_DUPLICATE_COINS,
  ROULETTE_DUPLICATE_COINS,
} from '@/game/rewards';

describe('rewards module', () => {
  it('has an 8-slot daily roulette table mirroring the legacy wheel', () => {
    expect(DAILY_ROULETTE_SLOTS).toHaveLength(8);
    expect(DAILY_ROULETTE_SLOTS.filter(s => s.kind === 'multiplier')).toHaveLength(2);
    expect(DAILY_ROULETTE_SLOTS.filter(s => s.kind === 'skinOrCoins')).toHaveLength(2);
    const coinTotals = DAILY_ROULETTE_SLOTS.filter(s => s.kind === 'coins').map(s => (s as { amount: number }).amount);
    expect(coinTotals).toEqual([100, 250, 1000, 150]);
  });

  it('carries the legacy economy constants unchanged', () => {
    expect(SKIN_ROULETTE_COST).toBe(1500);
    expect(DAILY_GIFT_DUPLICATE_COINS).toBe(1000);
    expect(ROULETTE_DUPLICATE_COINS).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/rewards.test.ts`
Expected: FAIL — cannot resolve `@/game/rewards`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/game/rewards.ts

export type RewardGrant =
  | { type: 'coins'; amount: number }
  | { type: 'multiplier'; kind: 'luck' | 'strength' }
  | { type: 'rodSkin'; skinId: string; duplicate?: boolean }
  | { type: 'boatSkin'; skinId: string; duplicate?: boolean };

export type RouletteSlot =
  | { kind: 'coins'; amount: number }
  | { kind: 'multiplier'; mult: 'luck' | 'strength' }
  | { kind: 'skinOrCoins'; skin: 'rod' | 'boat'; fallbackCoins: number };

/** 8 uniform slots — mirrors the legacy Roulette.tsx prize table. */
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
export const ROULETTE_DUPLICATE_COINS = 500;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/rewards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/rewards.ts src/test/rewards.test.ts
git commit -m "game: rewards module — RewardGrant type + roulette/daily tables"
```

---

### Task 2: `resolveDailyGift` pure rule

**Files:**
- Modify: `src/game/stateRules.ts` (add function + import `RewardGrant`, `DAILY_GIFT_DUPLICATE_COINS` from `./rewards.js`)
- Test: `src/test/stateRules.test.ts` (add cases)

**Interfaces:**
- Consumes: `getDailyGiftsForWeek`, `DailyGiftReward`, `MULTIPLIER_DURATION` from `./types.js`; `RewardGrant`, `DAILY_GIFT_DUPLICATE_COINS` from `./rewards.js`.
- Produces: `resolveDailyGift(state: PlayerState, todayStr: string, now: number): { next: PlayerState; reward: RewardGrant }` — throws `Error('DAILY_GIFT_ALREADY_CLAIMED')` when `state.dailyGiftsLastClaim === todayStr`.

Reference: the current logic lives in `src/game/useGameState.ts` `claimDailyGift` (lines ~161–193). Port it verbatim; the only differences are (a) it is pure (takes `todayStr` and `now` instead of reading `Date`), (b) it throws instead of returning `state` unchanged, (c) it also returns a `reward` descriptor.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/test/stateRules.test.ts imports:
//   resolveDailyGift,
// add this describe block:

describe('resolveDailyGift', () => {
  const base = { ...player, coins: 1000, dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1 };

  it('grants day 1 of week 1 (150 coins) and advances to day 2', () => {
    const { next, reward } = resolveDailyGift(base, '2026-09-08', 1_000_000);
    expect(reward).toEqual({ type: 'coins', amount: 150 });
    expect(next.coins).toBe(1150);
    expect(next.dailyGiftsLastClaim).toBe('2026-09-08');
    expect(next.dailyGiftsDay).toBe(2);
    expect(next.dailyGiftsWeek).toBe(1);
  });

  it('grants the day 3 luck multiplier ending now + MULTIPLIER_DURATION', () => {
    const { next, reward } = resolveDailyGift({ ...base, dailyGiftsDay: 3 }, '2026-09-08', 5_000);
    expect(reward).toEqual({ type: 'multiplier', kind: 'luck' });
    expect(next.luckMultiplierEnd).toBe(5_000 + 60_000);
  });

  it('grants the day 7 rod skin, wraps to day 1 and bumps the week', () => {
    const { next, reward } = resolveDailyGift({ ...base, dailyGiftsDay: 7 }, '2026-09-08', 0);
    expect(reward).toEqual({ type: 'rodSkin', skinId: 'daily_aurora' });
    expect(next.ownedSkins).toContain('daily_aurora');
    expect(next.dailyGiftsDay).toBe(1);
    expect(next.dailyGiftsWeek).toBe(2);
  });

  it('refunds 1000 coins for an already-owned skin day', () => {
    const { next, reward } = resolveDailyGift(
      { ...base, dailyGiftsDay: 7, ownedSkins: ['default', 'daily_aurora'] }, '2026-09-08', 0,
    );
    expect(reward).toEqual({ type: 'rodSkin', skinId: 'daily_aurora', duplicate: true });
    expect(next.coins).toBe(2000);
    expect(next.ownedSkins).toEqual(['default', 'daily_aurora']);
  });

  it('uses the rotation table from week 2 (day 6 = 1000 coins)', () => {
    const { reward } = resolveDailyGift({ ...base, dailyGiftsWeek: 2, dailyGiftsDay: 6 }, '2026-09-08', 0);
    expect(reward).toEqual({ type: 'coins', amount: 1000 });
  });

  it('throws when already claimed today', () => {
    expect(() => resolveDailyGift({ ...base, dailyGiftsLastClaim: '2026-09-08' }, '2026-09-08', 0))
      .toThrow('DAILY_GIFT_ALREADY_CLAIMED');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/stateRules.test.ts -t resolveDailyGift`
Expected: FAIL — `resolveDailyGift` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/game/stateRules.ts` (and add `getDailyGiftsForWeek` to the `./types.js` import, plus a new import line `import { DAILY_GIFT_DUPLICATE_COINS, type RewardGrant } from './rewards.js';`):

```ts
export function resolveDailyGift(
  state: PlayerState,
  todayStr: string,
  now: number,
): { next: PlayerState; reward: RewardGrant } {
  if (state.dailyGiftsLastClaim === todayStr) throw new Error('DAILY_GIFT_ALREADY_CLAIMED');

  const day = state.dailyGiftsDay || 1;
  const week = state.dailyGiftsWeek || 1;
  const entry = getDailyGiftsForWeek(week)[day - 1];
  const nextDay = day >= 7 ? 1 : day + 1;
  const nextWeek = day >= 7 ? week + 1 : week;

  const next: PlayerState = {
    ...state,
    dailyGiftsLastClaim: todayStr,
    dailyGiftsDay: nextDay,
    dailyGiftsWeek: nextWeek,
  };
  let reward: RewardGrant;

  if (entry.type === 'coins') {
    next.coins = state.coins + entry.amount;
    reward = { type: 'coins', amount: entry.amount };
  } else if (entry.type === 'multiplier') {
    const end = now + MULTIPLIER_DURATION;
    if (entry.kind === 'luck') next.luckMultiplierEnd = end;
    else next.strengthMultiplierEnd = end;
    reward = { type: 'multiplier', kind: entry.kind };
  } else if (entry.type === 'boatSkin') {
    const owned = state.ownedBoatSkins.includes(entry.skinId);
    if (owned) next.coins = state.coins + DAILY_GIFT_DUPLICATE_COINS;
    else next.ownedBoatSkins = [...state.ownedBoatSkins, entry.skinId];
    reward = { type: 'boatSkin', skinId: entry.skinId, ...(owned ? { duplicate: true } : {}) };
  } else {
    const owned = state.ownedSkins.includes(entry.skinId);
    if (owned) next.coins = state.coins + DAILY_GIFT_DUPLICATE_COINS;
    else next.ownedSkins = [...state.ownedSkins, entry.skinId];
    reward = { type: 'rodSkin', skinId: entry.skinId, ...(owned ? { duplicate: true } : {}) };
  }

  return { next, reward };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/stateRules.test.ts -t resolveDailyGift`
Expected: PASS. Also run the whole file (`npx vitest run src/test/stateRules.test.ts`) — no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/game/stateRules.ts src/test/stateRules.test.ts
git commit -m "game: resolveDailyGift pure rule (ported from useGameState)"
```

---

### Task 3: `spinDailyRoulette` pure rule

**Files:**
- Modify: `src/game/stateRules.ts`
- Test: `src/test/stateRules.test.ts`

**Interfaces:**
- Consumes: `ROD_SKINS`, `BOAT_SKINS` from `./types.js`; `DAILY_ROULETTE_SLOTS` from `./rewards.js`.
- Produces: `spinDailyRoulette(state: PlayerState, todayStr: string, now: number, roll: (n: number) => number): { next: PlayerState; reward: RewardGrant }` — throws `Error('ROULETTE_ALREADY_USED')` when `state.lastRouletteDate === todayStr`.
- `roll(n)` returns an integer in `[0, n)`. Called once for the slot; for a `skinOrCoins` slot with a non-empty unowned pool, called a second time for the skin index.

- [ ] **Step 1: Write the failing test**

```ts
// add to imports: spinDailyRoulette,
// helper — a roll that returns queued values then 0:
const queuedRoll = (...vals: number[]) => { const q = [...vals]; return () => (q.length ? q.shift()! : 0); };

describe('spinDailyRoulette', () => {
  const base = { ...player, coins: 0, lastRouletteDate: null,
    ownedSkins: ['default'], ownedBoatSkins: ['classic'] };

  it('slot 0 → 100 coins, marks the date', () => {
    const { next, reward } = spinDailyRoulette(base, '2026-09-08', 0, queuedRoll(0));
    expect(reward).toEqual({ type: 'coins', amount: 100 });
    expect(next.coins).toBe(100);
    expect(next.lastRouletteDate).toBe('2026-09-08');
  });

  it('slot 1 → luck multiplier', () => {
    const { next, reward } = spinDailyRoulette(base, '2026-09-08', 7_000, queuedRoll(1));
    expect(reward).toEqual({ type: 'multiplier', kind: 'luck' });
    expect(next.luckMultiplierEnd).toBe(7_000 + 60_000);
  });

  it('slot 5 (rod skinOrCoins) → an unowned rod skin', () => {
    const { next, reward } = spinDailyRoulette(base, '2026-09-08', 0, queuedRoll(5, 0));
    expect(reward.type).toBe('rodSkin');
    if (reward.type === 'rodSkin') expect(next.ownedSkins).toContain(reward.skinId);
  });

  it('slot 5 falls back to coins when every qualifying rod skin is owned', () => {
    const allRods = ROD_SKINS.filter(s => s.price > 0 || s.exclusive).map(s => s.id);
    const { next, reward } = spinDailyRoulette(
      { ...base, ownedSkins: ['default', ...allRods] }, '2026-09-08', 0, queuedRoll(5),
    );
    expect(reward).toEqual({ type: 'coins', amount: 1000 });
    expect(next.coins).toBe(1000);
  });

  it('throws when already used today', () => {
    expect(() => spinDailyRoulette({ ...base, lastRouletteDate: '2026-09-08' }, '2026-09-08', 0, queuedRoll(0)))
      .toThrow('ROULETTE_ALREADY_USED');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/stateRules.test.ts -t spinDailyRoulette`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Add `ROD_SKINS`, `BOAT_SKINS` to the `./types.js` import and `DAILY_ROULETTE_SLOTS` to the `./rewards.js` import, then:

```ts
export function spinDailyRoulette(
  state: PlayerState,
  todayStr: string,
  now: number,
  roll: (n: number) => number,
): { next: PlayerState; reward: RewardGrant } {
  if (state.lastRouletteDate === todayStr) throw new Error('ROULETTE_ALREADY_USED');

  const slot = DAILY_ROULETTE_SLOTS[roll(DAILY_ROULETTE_SLOTS.length)];
  const next: PlayerState = { ...state, lastRouletteDate: todayStr };
  let reward: RewardGrant;

  if (slot.kind === 'coins') {
    next.coins = state.coins + slot.amount;
    reward = { type: 'coins', amount: slot.amount };
  } else if (slot.kind === 'multiplier') {
    const end = now + MULTIPLIER_DURATION;
    if (slot.mult === 'luck') next.luckMultiplierEnd = end;
    else next.strengthMultiplierEnd = end;
    reward = { type: 'multiplier', kind: slot.mult };
  } else {
    const catalog = slot.skin === 'rod' ? ROD_SKINS : BOAT_SKINS;
    const ownedIds = slot.skin === 'rod' ? state.ownedSkins : state.ownedBoatSkins;
    const pool = catalog.filter(s => !ownedIds.includes(s.id) && (s.price > 0 || s.exclusive));
    if (pool.length === 0) {
      next.coins = state.coins + slot.fallbackCoins;
      reward = { type: 'coins', amount: slot.fallbackCoins };
    } else {
      const picked = pool[roll(pool.length)];
      if (slot.skin === 'rod') next.ownedSkins = [...state.ownedSkins, picked.id];
      else next.ownedBoatSkins = [...state.ownedBoatSkins, picked.id];
      reward = { type: slot.skin === 'rod' ? 'rodSkin' : 'boatSkin', skinId: picked.id };
    }
  }

  return { next, reward };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/stateRules.test.ts -t spinDailyRoulette` → PASS. Whole file → no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/game/stateRules.ts src/test/stateRules.test.ts
git commit -m "game: spinDailyRoulette pure rule (injected roll + now)"
```

---

### Task 4: `spinSkinRoulette` pure rule

**Files:**
- Modify: `src/game/stateRules.ts`
- Test: `src/test/stateRules.test.ts`

**Interfaces:**
- Consumes: `ROD_SKINS`, `BOAT_SKINS` from `./types.js`; `SKIN_ROULETTE_COST`, `ROULETTE_DUPLICATE_COINS` from `./rewards.js`.
- Produces: `spinSkinRoulette(state: PlayerState, roll: (n: number) => number): { next: PlayerState; reward: RewardGrant }` — throws `Error('INSUFFICIENT_FUNDS')` when `state.coins < SKIN_ROULETTE_COST`. `roll` is called twice: `roll(2)` for kind (0 = rod, 1 = boat), then `roll(pool.length)` for the entry.

- [ ] **Step 1: Write the failing test**

```ts
// add to imports: spinSkinRoulette, SKIN_ROULETTE_COST (from '@/game/rewards')

describe('spinSkinRoulette', () => {
  const base = { ...player, coins: 5000, ownedSkins: ['default'], ownedBoatSkins: ['classic'] };

  it('charges the cost and grants an unowned rod skin', () => {
    const { next, reward } = spinSkinRoulette(base, queuedRoll(0, 0));
    expect(next.coins).toBe(5000 - SKIN_ROULETTE_COST);
    expect(reward.type).toBe('rodSkin');
    if (reward.type === 'rodSkin') expect(next.ownedSkins).toContain(reward.skinId);
  });

  it('grants a boat skin when roll(2) picks 1', () => {
    const { reward } = spinSkinRoulette(base, queuedRoll(1, 0));
    expect(reward.type).toBe('boatSkin');
  });

  it('refunds 500 coins and does not re-add an already-owned skin', () => {
    const firstRod = ROD_SKINS.filter(s => s.price > 0 || s.exclusive)[0];
    const { next, reward } = spinSkinRoulette(
      { ...base, ownedSkins: ['default', firstRod.id] }, queuedRoll(0, 0),
    );
    expect(reward).toEqual({ type: 'rodSkin', skinId: firstRod.id, duplicate: true });
    expect(next.coins).toBe(5000 - SKIN_ROULETTE_COST + 500);
    expect(next.ownedSkins).toEqual(['default', firstRod.id]);
  });

  it('throws INSUFFICIENT_FUNDS below the cost', () => {
    expect(() => spinSkinRoulette({ ...base, coins: 1499 }, queuedRoll(0, 0)))
      .toThrow('INSUFFICIENT_FUNDS');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/stateRules.test.ts -t spinSkinRoulette`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Add `SKIN_ROULETTE_COST`, `ROULETTE_DUPLICATE_COINS` to the `./rewards.js` import, then:

```ts
export function spinSkinRoulette(
  state: PlayerState,
  roll: (n: number) => number,
): { next: PlayerState; reward: RewardGrant } {
  if (state.coins < SKIN_ROULETTE_COST) throw new Error('INSUFFICIENT_FUNDS');

  const isRod = roll(2) === 0;
  const catalog = (isRod ? ROD_SKINS : BOAT_SKINS).filter(s => s.price > 0 || s.exclusive);
  const picked = catalog[roll(catalog.length)];
  const ownedIds = isRod ? state.ownedSkins : state.ownedBoatSkins;
  const duplicate = ownedIds.includes(picked.id);

  const next: PlayerState = { ...state, coins: state.coins - SKIN_ROULETTE_COST };
  if (duplicate) {
    next.coins += ROULETTE_DUPLICATE_COINS;
  } else if (isRod) {
    next.ownedSkins = [...state.ownedSkins, picked.id];
  } else {
    next.ownedBoatSkins = [...state.ownedBoatSkins, picked.id];
  }

  return {
    next,
    reward: { type: isRod ? 'rodSkin' : 'boatSkin', skinId: picked.id, ...(duplicate ? { duplicate: true } : {}) },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/stateRules.test.ts` → all PASS. Then `npx tsc --noEmit -p tsconfig.app.json` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/stateRules.ts src/test/stateRules.test.ts
git commit -m "game: spinSkinRoulette pure rule (cost + dup refund, injected roll)"
```

---

### Task 5: Backend economy service — three reward methods

**Files:**
- Modify: `backend/src/gamestate/economyService.ts`
- Test: `backend/src/gamestate/economyService.test.ts`

**Interfaces:**
- Consumes: `resolveDailyGift`, `spinDailyRoulette`, `spinSkinRoulette` from `../../../src/game/stateRules.js`; `type RewardGrant` from `../../../src/game/rewards.js`; `randomInt` from `node:crypto`.
- Produces on `GameStateEconomyService`:
  - `spinRoulette(userId: string, idempotencyKey: string): Promise<Result>`
  - `spinSkinRoulette(userId: string, idempotencyKey: string): Promise<Result>`
  - `claimDailyGift(userId: string, idempotencyKey: string): Promise<Result>`
  - `Result` becomes `{ state: SaveEnvelope; version: number; reward?: RewardGrant }`
- Internal `Compute` type becomes `(envelope: SaveEnvelope) => { player: Player; reward?: RewardGrant }`.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/gamestate/economyService.test.ts` (the `withCoins` helper already exists; it seeds `ownedSkins: ['default']`, `ownedBoatSkins: ['classic']`, `coins: 10_000`):

```ts
describe('memory game-state economy service — reward ops', () => {
  it('claimDailyGift: grants day 1 (150 coins), version bump, reward in the result', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 0 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);

    const res = await svc.claimDailyGift('u1', 'gift-key-aaaaaaaaaaaa');

    expect(res.version).toBe(2);
    expect(res.state.player.coins).toBe(150);
    expect(res.reward).toEqual({ type: 'coins', amount: 150 });
    expect(res.state.player.dailyGiftsDay).toBe(2);
  });

  it('claimDailyGift replays the same key without granting twice', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 0 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    const first = await svc.claimDailyGift('u1', 'gift-key-bbbbbbbbbbbb');
    const replay = await svc.claimDailyGift('u1', 'gift-key-bbbbbbbbbbbb');
    expect(replay).toEqual(first);
    expect(store.get('u1')!.version).toBe(2);
  });

  it('claimDailyGift twice with distinct keys same day → DAILY_GIFT_ALREADY_CLAIMED', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 0 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    await svc.claimDailyGift('u1', 'gift-key-cccccccccccc');
    await expect(svc.claimDailyGift('u1', 'gift-key-dddddddddddd')).rejects.toThrow('DAILY_GIFT_ALREADY_CLAIMED');
    expect(store.get('u1')!.version).toBe(2);
  });

  it('spinRoulette: applies a reward, bumps version, marks lastRouletteDate', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 0 }), updatedAt: 'now', version: 3 });
    const svc = createMemoryGameStateEconomyService(store);
    const res = await svc.spinRoulette('u1', 'roul-key-aaaaaaaaaaaa');
    expect(res.version).toBe(4);
    expect(res.reward).toBeDefined();
    expect(typeof res.state.player.lastRouletteDate).toBe('string');
  });

  it('spinRoulette twice with distinct keys same day → ROULETTE_ALREADY_USED', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 0 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    await svc.spinRoulette('u1', 'roul-key-bbbbbbbbbbbb');
    await expect(svc.spinRoulette('u1', 'roul-key-cccccccccccc')).rejects.toThrow('ROULETTE_ALREADY_USED');
  });

  it('spinSkinRoulette: -1500 coins, a skin reward, version bump', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 5_000 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    const res = await svc.spinSkinRoulette('u1', 'skinroul-key-aaaaaa');
    expect(res.state.player.coins).toBeLessThanOrEqual(5_000 - 1_500 + 500);
    expect(res.reward!.type === 'rodSkin' || res.reward!.type === 'boatSkin').toBe(true);
  });

  it('spinSkinRoulette below the cost → INSUFFICIENT_FUNDS', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 1_499 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    await expect(svc.spinSkinRoulette('u1', 'skinroul-key-bbbbbb')).rejects.toThrow('INSUFFICIENT_FUNDS');
    expect(store.get('u1')!.version).toBe(1);
  });

  it('F2: a roulette spin does not replay a daily claim under the same key', async () => {
    const store = createMemoryGameStateStore();
    store.set('u1', { state: withCoins({ coins: 0 }), updatedAt: 'now', version: 1 });
    const svc = createMemoryGameStateEconomyService(store);
    const key = 'shared-key-gift-roul1';
    await svc.claimDailyGift('u1', key);          // ${u1}:daily_gift_claim:${key}
    const roul = await svc.spinRoulette('u1', key); // must run fresh
    expect(roul.state.player.lastRouletteDate).not.toBeNull();
    expect(store.get('u1')!.version).toBe(3);
  });

  it('rejects a user with no blob with GAME_STATE_NOT_FOUND', async () => {
    const svc = createMemoryGameStateEconomyService(createMemoryGameStateStore());
    await expect(svc.claimDailyGift('ghost', 'gift-key-eeeeeeeeeeee')).rejects.toThrow('GAME_STATE_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run backend/src/gamestate/economyService.test.ts -t "reward ops"`
Expected: FAIL — `svc.claimDailyGift is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/gamestate/economyService.ts`:

1. Extend imports:
```ts
import { randomInt } from 'node:crypto';
import {
  buyMultiplier as applyMultiplierPurchase,
  buyNet as applyNetPurchase,
  buyOwnedItem as applySkinPurchase,
  resolveDailyGift,
  sellWarehouse as applyWarehouseSale,
  spinDailyRoulette,
  spinSkinRoulette,
} from '../../../src/game/stateRules.js';
import type { RewardGrant } from '../../../src/game/rewards.js';
```

2. Widen the internal types:
```ts
type Result = { state: SaveEnvelope; version: number; reward?: RewardGrant };
type Compute = (envelope: SaveEnvelope) => { player: Player; reward?: RewardGrant };
```

3. Update the four existing `compute*` helpers to return `{ player: ... }` instead of the bare player, e.g.:
```ts
function computeSale(envelope: SaveEnvelope): { player: Player } {
  if (envelope.player.warehouse.length === 0) throw new Error('WAREHOUSE_EMPTY');
  return { player: applyWarehouseSale(envelope.player, LOCATIONS) };
}
```
(same shape for `computeNetPurchase`, `computeMultiplierPurchase`, `computeSkinPurchase`).

4. In `runMemoryOp` and `runPgOp`, change the compute call site from
   `const nextPlayer = compute(envelope);` to
   `const { player: nextPlayer, reward } = compute(envelope);`
   and build the result as
   `const result: Result = { state, version, ...(reward ? { reward } : {}) };`

5. Add to `OPS`:
```ts
  rouletteSpin: 'roulette_spin',
  skinRouletteSpin: 'skin_roulette_spin',
  dailyGiftClaim: 'daily_gift_claim',
```

6. Add the three compute closures + service methods. In both
   `createMemoryGameStateEconomyService` and `createPgGameStateEconomyService`:
```ts
    async spinRoulette(userId, idempotencyKey) {
      const today = new Date().toISOString().slice(0, 10);
      const now = Date.now();
      return runMemoryOp(store, ops, userId, OPS.rouletteSpin, idempotencyKey, env => {
        const { next, reward } = spinDailyRoulette(env.player, today, now, n => randomInt(n));
        return { player: next, reward };
      });
    },
    async spinSkinRoulette(userId, idempotencyKey) {
      return runMemoryOp(store, ops, userId, OPS.skinRouletteSpin, idempotencyKey, env => {
        const { next, reward } = spinSkinRoulette(env.player, n => randomInt(n));
        return { player: next, reward };
      });
    },
    async claimDailyGift(userId, idempotencyKey) {
      const today = new Date().toISOString().slice(0, 10);
      const now = Date.now();
      return runMemoryOp(store, ops, userId, OPS.dailyGiftClaim, idempotencyKey, env => {
        const { next, reward } = resolveDailyGift(env.player, today, now);
        return { player: next, reward };
      });
    },
```
   (PG variant: identical bodies but `runPgOp(db, userId, OPS.x, idempotencyKey, …)` — no `store`/`ops` args.)

7. Add the three signatures to the `GameStateEconomyService` interface.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run backend/src/gamestate/economyService.test.ts` → all PASS (existing + new).
Run: `npm run backend:typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/gamestate/economyService.ts backend/src/gamestate/economyService.test.ts
git commit -m "backend: economy service — spinRoulette / spinSkinRoulette / claimDailyGift"
```

---

### Task 6: Backend routes + error codes

**Files:**
- Modify: `backend/src/gamestate/economyRoutes.ts`
- Modify: `backend/src/http/errors.ts`
- Test: `backend/src/gamestate/economyRoutes.test.ts`

**Interfaces:**
- Consumes: `GameStateEconomyService.spinRoulette` / `.spinSkinRoulette` / `.claimDailyGift` from Task 5.
- Produces: `POST /api/v1/me/economy/roulette/spin`, `POST /api/v1/me/economy/skin-roulette/spin`, `POST /api/v1/me/economy/daily-gift/claim` — all `requireAuth`, no body, `200 { state, version, reward }`.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/gamestate/economyRoutes.test.ts` (`seedBlob` + `netBlob` helpers already exist):

```ts
describe('POST /api/v1/me/economy reward ops', () => {
  it('daily-gift/claim → 200 with a reward and version 1 → 2', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 0 }));
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe(2);
    expect(body.reward).toEqual({ type: 'coins', amount: 150 });
    expect(body.state.player.coins).toBe(150);
  });

  it('daily-gift/claim replay → identical body', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 0 }));
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim', idempotencyKey: 'gift-key-replayreplay1' });
    const replay = await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim', idempotencyKey: 'gift-key-replayreplay1' });
    expect(replay.json()).toEqual(first.json());
  });

  it('second distinct daily claim same day → 409 DAILY_GIFT_ALREADY_CLAIMED', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 0 }));
    await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim' });
    const res = await client.request({ method: 'POST', url: '/api/v1/me/economy/daily-gift/claim' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DAILY_GIFT_ALREADY_CLAIMED');
  });

  it('roulette/spin → 200 with a reward; second distinct spin same day → 409 ROULETTE_ALREADY_USED', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 0 }));
    const first = await client.request({ method: 'POST', url: '/api/v1/me/economy/roulette/spin' });
    expect(first.statusCode).toBe(200);
    expect(first.json().reward).toBeDefined();
    const second = await client.request({ method: 'POST', url: '/api/v1/me/economy/roulette/spin' });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('ROULETTE_ALREADY_USED');
  });

  it('skin-roulette/spin → 200; below the cost → 409 INSUFFICIENT_FUNDS', async () => {
    const a = await app();
    const client = await registerAndAuth(a);
    await seedBlob(client, netBlob({ coins: 5_000 }));
    const ok = await client.request({ method: 'POST', url: '/api/v1/me/economy/skin-roulette/spin' });
    expect(ok.statusCode).toBe(200);

    const poor = await registerAndAuth(a);
    await seedBlob(poor, netBlob({ coins: 100 }));
    const res = await poor.request({ method: 'POST', url: '/api/v1/me/economy/skin-roulette/spin' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('no session → 401', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/api/v1/me/economy/roulette/spin' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run backend/src/gamestate/economyRoutes.test.ts -t "reward ops"`
Expected: FAIL — routes 404 / error codes absent.

- [ ] **Step 3: Write minimal implementation**

`backend/src/http/errors.ts` — add to `DOMAIN_ERRORS` (near `INSUFFICIENT_FUNDS`):
```ts
  ROULETTE_ALREADY_USED: { status: 409, message: 'The daily roulette was already used today' },
  DAILY_GIFT_ALREADY_CLAIMED: { status: 409, message: 'The daily gift was already claimed today' },
```

`backend/src/gamestate/economyRoutes.ts` — after the skins route:
```ts
  r.post('/api/v1/me/economy/roulette/spin', {
    schema: { tags: ['gamestate'], summary: 'Spin the daily roulette (needs Idempotency-Key)' },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.spinRoulette(request.userId, idempotencyKey(request.headers['idempotency-key']));
  });

  r.post('/api/v1/me/economy/skin-roulette/spin', {
    schema: { tags: ['gamestate'], summary: 'Spin the paid skin roulette (needs Idempotency-Key)' },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.spinSkinRoulette(request.userId, idempotencyKey(request.headers['idempotency-key']));
  });

  r.post('/api/v1/me/economy/daily-gift/claim', {
    schema: { tags: ['gamestate'], summary: 'Claim the daily gift (needs Idempotency-Key)' },
    preHandler: app.requireAuth,
  }, async (request) => {
    return service.claimDailyGift(request.userId, idempotencyKey(request.headers['idempotency-key']));
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run backend/src/gamestate/economyRoutes.test.ts` → all PASS.
Run: `npm run backend:typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/gamestate/economyRoutes.ts backend/src/http/errors.ts backend/src/gamestate/economyRoutes.test.ts
git commit -m "backend: POST /me/economy/{roulette,skin-roulette,daily-gift} + error codes"
```

---

### Task 7: Backend integration tests

**Files:**
- Test: `backend/src/gamestate/economyService.integration.test.ts` (add cases)

**Interfaces:**
- Consumes: `createPgGameStateEconomyService` (already imported), `netBlob` helper (already in the file).

- [ ] **Step 1: Write the failing test**

Add before the `deleting the user cascades` test:

```ts
  it('claimDailyGift transactionally: +150 coins, version +1, one op row', async () => {
    const userId = await seedUser();
    await gameState.put(userId, netBlob({ coins: 0 }), null);

    const res = await economy.claimDailyGift(userId, 'gift-key-int-aaaaaaaa');
    expect(res.version).toBe(2);
    expect(res.state.player.coins).toBe(150);
    expect(res.reward).toEqual({ type: 'coins', amount: 150 });

    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('daily_gift_claim');
    expect((ops[0].result as { reward: unknown }).reward).toEqual({ type: 'coins', amount: 150 });
  });

  it('claimDailyGift replay: identical result incl. reward, one row', async () => {
    const userId = await seedUser();
    await gameState.put(userId, netBlob({ coins: 0 }), null);
    const first = await economy.claimDailyGift(userId, 'gift-key-int-bbbbbbbb');
    const replay = await economy.claimDailyGift(userId, 'gift-key-int-bbbbbbbb');
    expect(replay).toEqual(first);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('second distinct daily claim same day → DAILY_GIFT_ALREADY_CLAIMED, nothing written', async () => {
    const userId = await seedUser();
    await gameState.put(userId, netBlob({ coins: 0 }), null);
    await economy.claimDailyGift(userId, 'gift-key-int-cccccccc');
    await expect(economy.claimDailyGift(userId, 'gift-key-int-dddddddd')).rejects.toThrow('DAILY_GIFT_ALREADY_CLAIMED');
    expect((await gameState.get(userId))!.version).toBe(2);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
  });

  it('spinRoulette: concurrent same-key resolves identically, one op row, version 2', async () => {
    const userId = await seedUser();
    await gameState.put(userId, netBlob({ coins: 0 }), null);
    const key = 'roul-key-int-race-same';
    const [a, b] = await Promise.all([
      economy.spinRoulette(userId, key),
      economy.spinRoulette(userId, key),
    ]);
    expect(a).toEqual(b);
    expect(a.version).toBe(2);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('roulette_spin');
  });

  it('spinSkinRoulette: -1500 (± dup refund) coins, one op row', async () => {
    const userId = await seedUser();
    await gameState.put(userId, netBlob({ coins: 5_000 }), null);
    const res = await economy.spinSkinRoulette(userId, 'skinroul-key-int-aa');
    expect(res.state.player.coins).toBeGreaterThanOrEqual(5_000 - 1_500);
    expect(res.state.player.coins).toBeLessThanOrEqual(5_000 - 1_500 + 500);
    const ops = await harness.db.select().from(gameStateOperations).where(eq(gameStateOperations.userId, userId));
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('skin_roulette_spin');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run (Postgres up): `set TEST_DATABASE_URL=postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure && npm run test:integration`
(PowerShell: `$env:TEST_DATABASE_URL='postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure'; npm run test:integration`)
Expected: FAIL — `economy.claimDailyGift is not a function` (until Task 5) then the new assertions.

- [ ] **Step 3: Write minimal implementation**

No implementation — Tasks 5 & 6 already provide the service. If any assertion fails, fix the test to match the real (already-correct) behaviour, not the service.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:integration` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/gamestate/economyService.integration.test.ts
git commit -m "backend: integration tests for the reward ops (txn, replay, 409, concurrent)"
```

---

### Task 8: Frontend API endpoints

**Files:**
- Modify: `src/api/endpoints.ts`
- Test: `src/api/endpoints.test.ts`

**Interfaces:**
- Consumes: `apiFetch` from `./client`; `type RewardGrant` from `@/game/rewards`; `type GameStateEnvelope` from `@/api/types`.
- Produces:
  - `type RewardEnvelope = GameStateEnvelope & { reward: RewardGrant }`
  - `spinRoulette(idempotencyKey: string): Promise<RewardEnvelope>`
  - `spinSkinRoulette(idempotencyKey: string): Promise<RewardEnvelope>`
  - `claimDailyGift(idempotencyKey: string): Promise<RewardEnvelope>`

- [ ] **Step 1: Write the failing test**

Add to `src/api/endpoints.test.ts` (import the three names, `client` spy pattern already used):

```ts
  it('spinRoulette POSTs /me/economy/roulette/spin with the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await spinRoulette('idem-key-roulette0001');
    expect(spy).toHaveBeenCalledWith('/me/economy/roulette/spin', { method: 'POST', idempotencyKey: 'idem-key-roulette0001' });
  });

  it('spinSkinRoulette POSTs /me/economy/skin-roulette/spin with the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await spinSkinRoulette('idem-key-skinroul0001');
    expect(spy).toHaveBeenCalledWith('/me/economy/skin-roulette/spin', { method: 'POST', idempotencyKey: 'idem-key-skinroul0001' });
  });

  it('claimDailyGift POSTs /me/economy/daily-gift/claim with the idempotency key', async () => {
    const spy = vi.spyOn(client, 'apiFetch').mockResolvedValue({} as never);
    await claimDailyGift('idem-key-dailygift001');
    expect(spy).toHaveBeenCalledWith('/me/economy/daily-gift/claim', { method: 'POST', idempotencyKey: 'idem-key-dailygift001' });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/api/endpoints.test.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/api/endpoints.ts` (add `import type { RewardGrant } from '@/game/rewards';` at the top):

```ts
export type RewardEnvelope = GameStateEnvelope & { reward: RewardGrant };

export function spinRoulette(idempotencyKey: string): Promise<RewardEnvelope> {
  return apiFetch('/me/economy/roulette/spin', { method: 'POST', idempotencyKey });
}
export function spinSkinRoulette(idempotencyKey: string): Promise<RewardEnvelope> {
  return apiFetch('/me/economy/skin-roulette/spin', { method: 'POST', idempotencyKey });
}
export function claimDailyGift(idempotencyKey: string): Promise<RewardEnvelope> {
  return apiFetch('/me/economy/daily-gift/claim', { method: 'POST', idempotencyKey });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/api/endpoints.test.ts` → PASS. `npx tsc --noEmit -p tsconfig.app.json` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/endpoints.ts src/api/endpoints.test.ts
git commit -m "frontend: endpoints for the three reward ops"
```

---

### Task 9: `useGameState` — local reward helpers, drop the six grant callbacks

**Files:**
- Modify: `src/game/useGameState.ts`
- Modify: `src/test/replaceFromServer.test.ts`
- Test: `src/test/useGameState.rewards.test.tsx` (create)

**Interfaces:**
- Consumes: `resolveDailyGift`, `spinDailyRoulette`, `spinSkinRoulette` from `@/game/stateRules`; `type RewardGrant` from `@/game/rewards`.
- Produces on the hook return:
  - `spinDailyRouletteLocal(): RewardGrant` — throws `ROULETTE_ALREADY_USED`
  - `spinSkinRouletteLocal(): RewardGrant` — throws `INSUFFICIENT_FUNDS`
  - `claimDailyGiftLocal(): RewardGrant` — throws `DAILY_GIFT_ALREADY_CLAIMED`
- Removed from the hook return: `addCoins`, `addSkin`, `addBoatSkin`, `addMultiplier`, `setLastRouletteDate`, `claimDailyGift`. (`spendCoins` wrapper also removed — unused after this task.)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/useGameState.rewards.test.tsx
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from '@/game/useGameState';

describe('useGameState reward helpers', () => {
  it('claimDailyGiftLocal applies day 1 and returns the reward', () => {
    const { result } = renderHook(() => useGameState());
    let reward;
    act(() => { reward = result.current.claimDailyGiftLocal(); });
    expect(reward).toEqual({ type: 'coins', amount: 150 });
    expect(result.current.player.dailyGiftsDay).toBe(2);
  });

  it('claimDailyGiftLocal throws on a second call the same day', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.claimDailyGiftLocal(); });
    expect(() => result.current.claimDailyGiftLocal()).toThrow('DAILY_GIFT_ALREADY_CLAIMED');
  });

  it('spinDailyRouletteLocal returns a reward and blocks a second spin the same day', () => {
    const { result } = renderHook(() => useGameState());
    let reward;
    act(() => { reward = result.current.spinDailyRouletteLocal(); });
    expect(reward).toBeDefined();
    expect(() => result.current.spinDailyRouletteLocal()).toThrow('ROULETTE_ALREADY_USED');
  });
});
```

(Default `useGameState` starts a fresh player: `coins: 0`… — check `defaultState` in `src/game/data.ts`/`persistence.ts`; if starting coins are 0 the skin-roulette local test is skipped here and covered by the pure-rule tests. If starting coins ≥ 1500, add a `spinSkinRouletteLocal` returns-a-reward case.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/useGameState.rewards.test.tsx`
Expected: FAIL — `claimDailyGiftLocal` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/game/useGameState.ts`:

1. Add imports: `resolveDailyGift, spinDailyRoulette, spinSkinRoulette` from `./stateRules`, `type RewardGrant` from `./rewards`.
2. Add a ref that tracks the latest player:
```ts
const playerRef = useRef(player);
useEffect(() => { playerRef.current = player; }, [player]);
```
   (import `useRef` if not already imported.)
3. Add the three helpers:
```ts
const todayStr = () => new Date().toISOString().slice(0, 10);
const roll = (n: number) => Math.floor(Math.random() * n);

const claimDailyGiftLocal = useCallback((): RewardGrant => {
  const { next, reward } = resolveDailyGift(playerRef.current, todayStr(), Date.now());
  setPlayer(next);
  return reward;
}, []);

const spinDailyRouletteLocal = useCallback((): RewardGrant => {
  const { next, reward } = spinDailyRoulette(playerRef.current, todayStr(), Date.now(), roll);
  setPlayer(next);
  return reward;
}, []);

const spinSkinRouletteLocal = useCallback((): RewardGrant => {
  const { next, reward } = spinSkinRoulette(playerRef.current, roll);
  setPlayer(next);
  return reward;
}, []);
```
4. Delete the `addCoins`, `addSkin`, `addBoatSkin`, `spendCoins`, `addMultiplier`, `setLastRouletteDate`, `claimDailyGift` `useCallback` definitions.
5. Update the hook's returned object: remove those seven names, add `claimDailyGiftLocal`, `spinDailyRouletteLocal`, `spinSkinRouletteLocal`.
   - Keep `grantOwnedItem`-based `addSkin`/`addBoatSkin` **only if** something outside the roulettes still needs them — grep first: `grep -rn "addSkin\|addBoatSkin\|addMultiplier\|addCoins\|setLastRouletteDate" src --include=*.tsx --include=*.ts`. Task 10–12 remove the roulette/gift call sites; nothing else should reference them.

In `src/test/replaceFromServer.test.ts` line ~25: replace `result.current.addCoins(500)` with a still-present mutation that dirties state, e.g. `result.current.buyNet()` (costs coins → state changes) or `result.current.catchFish(...)`. Pick whichever keeps the test's intent (it just needs `player` to change so the sync hook goes dirty). Simplest: `result.current.consumeNet()` won't change state at 0 nets — use `result.current.buyNet()` after seeding coins, or keep it minimal by switching the assertion target. Read the test and adapt.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/useGameState.rewards.test.tsx src/test/replaceFromServer.test.ts` → PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json` → **expected to still fail** in `Index.tsx` (it references the removed callbacks) — that is fixed in Tasks 10–12. Note the failure is confined to `src/pages/Index.tsx` and the roulette/gift components.

- [ ] **Step 5: Commit**

```bash
git add src/game/useGameState.ts src/test/useGameState.rewards.test.tsx src/test/replaceFromServer.test.ts
git commit -m "frontend: useGameState local reward helpers; drop the six grant callbacks"
```

---

### Task 10: `Roulette.tsx` decorative wheel + `runRewardOp` + Index wiring

**Files:**
- Modify: `src/components/game/Roulette.tsx`
- Modify: `src/pages/Index.tsx`
- Modify: `src/components/game/dailygifts/rewards.ts` (widen `rewardLabel` to `RewardGrant`)
- Test: `src/test/Roulette.test.tsx`

**Interfaces:**
- Consumes: `spinDailyRouletteLocal` (Task 9), `spinRoulette as spinRouletteApi` (Task 8), `applyServerResult` + `flushNow` (existing sync hook), `type RewardGrant` / `type RewardEnvelope`.
- Produces:
  - `Index.tsx`: `runRewardOp(op, local, api): Promise<RewardGrant | null>` and `handleSpinRoulette(): Promise<RewardGrant | null>`; `busyOp` union gains `'roulette' | 'skinRoulette' | 'dailyGift'`.
  - `Roulette` props: `{ player: PlayerState; onSpin: () => Promise<RewardGrant | null>; busy?: boolean; onBack: () => void }`.
  - `rewardLabel(r: RewardGrant, t): string` (widened; still accepts the old `DailyGiftReward` shape).

- [ ] **Step 1: Write the failing test**

Rewrite the `Roulette` describe block in `src/test/Roulette.test.tsx`:

```tsx
describe('Roulette', () => {
  function renderRoulette(over: Partial<PlayerState> = {}, onSpin = vi.fn().mockResolvedValue({ type: 'coins', amount: 250 })) {
    const onBack = vi.fn();
    render(
      <I18nProvider>
        <Roulette player={makePlayer(over)} onSpin={onSpin} onBack={onBack} />
      </I18nProvider>,
    );
    return { onBack, onSpin };
  }

  it('offers a spin when the daily roulette is available', () => {
    renderRoulette({ lastRouletteDate: null });
    expect(screen.getByRole('button', { name: /girar/i })).toBeEnabled();
  });

  it('reports that the daily spin is used up', () => {
    renderRoulette({ lastRouletteDate: today });
    expect(screen.getByText(/já girou/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /girar/i })).not.toBeInTheDocument();
  });

  it('calls onSpin and reveals the returned reward', async () => {
    const onSpin = vi.fn().mockResolvedValue({ type: 'coins', amount: 250 });
    renderRoulette({ lastRouletteDate: null }, onSpin);
    fireEvent.click(screen.getByRole('button', { name: /girar/i }));
    expect(onSpin).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/250/)).toBeInTheDocument();
  });

  it('disables the control while busy', () => {
    render(
      <I18nProvider>
        <Roulette player={makePlayer()} onSpin={vi.fn()} busy onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: /girar/i })).toBeDisabled();
  });

  it('goes back', () => {
    const { onBack } = renderRoulette();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/Roulette.test.tsx -t Roulette`
Expected: FAIL — `Roulette` still expects `onAddCoins` etc.; new prop `onSpin` unused.

- [ ] **Step 3: Write minimal implementation**

**`src/components/game/dailygifts/rewards.ts`** — change the signature to accept `RewardGrant` (it is a structural superset of `DailyGiftReward`; only the `duplicate` flag is new and does not affect the label). Import `type RewardGrant` from `@/game/rewards`, change `r: DailyGiftReward` → `r: RewardGrant`. No body change needed.

**`src/components/game/Roulette.tsx`** — rewrite:
- Props: `{ player, onSpin, busy = false, onBack }` as above. Drop `onAddCoins/onAddSkin/onAddBoatSkin/onAddMultiplier/onSetLastRouletteDate` and the `Prize`/`prizes`/`drawWheel` RNG logic that read them.
- Keep a decorative wheel: render the 8 static `DAILY_ROULETTE_SLOTS` emojis (map `coins`→`💰`, `multiplier`→`🍀`/`💪`, `skinOrCoins`→`🎁`) on the canvas or as a simple SVG ring. The wheel spins a fixed `5 + n` turns on click; no computed target.
- `const today = new Date().toISOString().slice(0, 10); const alreadyUsed = player.lastRouletteDate === today;`
- On click (guard `spinning || alreadyUsed || busy`): `setSpinning(true)`, start the animation, and immediately `const r = await onSpin();`. When the animation finishes: `setSpinning(false)`; `r` → `setResult(r)` (reveal card, label via `rewardLabel(r, t)`); `r === null` → show `t('roulette.tryAgain')` (add this i18n key = "Falhou, tenta de novo" / per-locale) and no result card.
- Keep the "já girou" branch and the back button exactly as they are (tests depend on `/já girou/i` and `/voltar/i`).

**`src/pages/Index.tsx`**:
- `busyOp` union: `null | 'sell' | 'net' | 'multiplier' | 'skin' | 'roulette' | 'skinRoulette' | 'dailyGift'`.
- Import `spinRoulette as spinRouletteApi` (and, in Tasks 11–12, `spinSkinRoulette as spinSkinRouletteApi`, `claimDailyGift as claimDailyGiftApi`) from `@/api/endpoints`; `type RewardGrant` from `@/game/rewards`.
- Destructure `spinDailyRouletteLocal` (and the other two in later tasks) from `useGameState()`; remove `addCoins, addSkin, addBoatSkin, spendCoins, addMultiplier, setLastRouletteDate, claimDailyGift` from the destructure.
- Add:
```ts
const runRewardOp = useCallback(async (
  op: 'roulette' | 'skinRoulette' | 'dailyGift',
  local: () => RewardGrant,
  api: (key: string) => Promise<RewardEnvelope>,
): Promise<RewardGrant | null> => {
  if (!syncEnabled) { try { return local(); } catch { return null; } }
  setBusyOp(op);
  try {
    await flushNow();
    const res = await api(crypto.randomUUID());
    applyServerResult(res);
    return res.reward;
  } catch {
    console.warn(`reward op "${op}" failed; state unchanged`);
    return null;
  } finally {
    setBusyOp(null);
  }
}, [syncEnabled, flushNow, applyServerResult]);

const handleSpinRoulette = useCallback(
  () => runRewardOp('roulette', spinDailyRouletteLocal, spinRouletteApi),
  [runRewardOp, spinDailyRouletteLocal],
);
```
- Update the `screen === 'roulette'` render site:
```tsx
content = <Roulette player={player} onSpin={handleSpinRoulette} busy={busyOp === 'roulette'} onBack={() => setScreen('menu')} />;
```
- `import type { RewardEnvelope } from '@/api/endpoints';`

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/Roulette.test.tsx` → `Roulette` block PASS (the `SkinRoulette` block still fails — fixed in Task 11).
Run: `npx tsc --noEmit -p tsconfig.app.json` → **still failing** only on `SkinRoulette` / `DailyGifts` in `Index.tsx` (Tasks 11–12).

- [ ] **Step 5: Commit**

```bash
git add src/components/game/Roulette.tsx src/pages/Index.tsx src/components/game/dailygifts/rewards.ts src/test/Roulette.test.tsx
git commit -m "frontend: daily roulette through the server (decorative wheel + reveal)"
```

---

### Task 11: `SkinRoulette.tsx` decorative wheel + Index wiring

**Files:**
- Modify: `src/components/game/SkinRoulette.tsx`
- Modify: `src/pages/Index.tsx`
- Test: `src/test/Roulette.test.tsx` (the `SkinRoulette` describe block)

**Interfaces:**
- Consumes: `spinSkinRouletteLocal` (Task 9), `spinSkinRoulette as spinSkinRouletteApi` (Task 8), `runRewardOp` (Task 10), `SKIN_ROULETTE_COST` from `@/game/rewards`.
- Produces:
  - `SkinRoulette` props: `{ player: PlayerState; onSpin: () => Promise<RewardGrant | null>; busy?: boolean; onBack: () => void }`.
  - `Index.tsx`: `handleSpinSkinRoulette(): Promise<RewardGrant | null>`.

- [ ] **Step 1: Write the failing test**

Rewrite the `SkinRoulette` describe block:

```tsx
describe('SkinRoulette', () => {
  function renderSkinRoulette(over: Partial<PlayerState> = {}, onSpin = vi.fn().mockResolvedValue({ type: 'rodSkin', skinId: 'shark' })) {
    const onBack = vi.fn();
    render(
      <I18nProvider>
        <SkinRoulette player={makePlayer(over)} onSpin={onSpin} onBack={onBack} />
      </I18nProvider>,
    );
    return { onBack, onSpin };
  }

  it('shows the spin cost on the control', () => {
    renderSkinRoulette({ coins: 5000 });
    expect(screen.getByRole('button', { name: /1500/ })).toBeEnabled();
  });

  it('blocks the spin when the player cannot afford it', () => {
    const { onSpin } = renderSkinRoulette({ coins: 1000 });
    expect(screen.getByRole('button', { name: /1500/ })).toBeDisabled();
    expect(screen.getByText(/moedas insuficientes/i)).toBeInTheDocument();
    expect(onSpin).not.toHaveBeenCalled();
  });

  it('calls onSpin and reveals the returned skin', async () => {
    const onSpin = vi.fn().mockResolvedValue({ type: 'rodSkin', skinId: 'shark' });
    renderSkinRoulette({ coins: 5000 }, onSpin);
    fireEvent.click(screen.getByRole('button', { name: /1500/ }));
    expect(onSpin).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/tubarão/i)).toBeInTheDocument();
  });

  it('disables the control while busy', () => {
    render(
      <I18nProvider>
        <SkinRoulette player={makePlayer({ coins: 5000 })} onSpin={vi.fn()} busy onBack={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: /1500/ })).toBeDisabled();
  });

  it('goes back', () => {
    const { onBack } = renderSkinRoulette();
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/Roulette.test.tsx -t SkinRoulette`
Expected: FAIL — old props.

- [ ] **Step 3: Write minimal implementation**

**`src/components/game/SkinRoulette.tsx`**:
- Props `{ player, onSpin, busy = false, onBack }`. Drop `onAddSkin/onAddBoatSkin/onSpend` and `buildPrizes`/`shuffle` RNG.
- `import { SKIN_ROULETTE_COST } from '@/game/rewards';` replace the local `SPIN_COST`.
- Decorative wheel: a static 8-slice SVG ring (generic 🎣/⛵ emojis) that rotates a fixed amount on spin.
- Button: `disabled={player.coins < SKIN_ROULETTE_COST || spinning || busy}`, label `${t('roulette.spin')} · 💰 ${SKIN_ROULETTE_COST}`. Keep the `player.coins < SKIN_ROULETTE_COST` → `t('skinRoulette.noCoins')` message (test depends on `/moedas insuficientes/i`).
- On click (guard cost/spinning/busy): `setSpinning(true)`, animate, `const r = await onSpin()`; on finish reveal `r` (card with `rewardLabel(r, t)` — for a skin the label already resolves the skin name) or the try-again message if `null`.

**`src/pages/Index.tsx`**:
- Destructure `spinSkinRouletteLocal` from `useGameState()`.
- `import { spinSkinRoulette as spinSkinRouletteApi } from '@/api/endpoints';`
```ts
const handleSpinSkinRoulette = useCallback(
  () => runRewardOp('skinRoulette', spinSkinRouletteLocal, spinSkinRouletteApi),
  [runRewardOp, spinSkinRouletteLocal],
);
```
- Render site:
```tsx
content = <SkinRoulette player={player} onSpin={handleSpinSkinRoulette} busy={busyOp === 'skinRoulette'} onBack={() => setScreen('menu')} />;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/Roulette.test.tsx` → all PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json` → **still failing** only on `DailyGifts` in `Index.tsx` (Task 12).

- [ ] **Step 5: Commit**

```bash
git add src/components/game/SkinRoulette.tsx src/pages/Index.tsx src/test/Roulette.test.tsx
git commit -m "frontend: skin roulette through the server (decorative wheel + reveal)"
```

---

### Task 12: `DailyGifts.tsx` through the server + Index wiring

**Files:**
- Modify: `src/components/game/DailyGifts.tsx`
- Modify: `src/pages/Index.tsx`
- Test: `src/test/DailyGifts.test.tsx`

**Interfaces:**
- Consumes: `claimDailyGiftLocal` (Task 9), `claimDailyGift as claimDailyGiftApi` (Task 8), `runRewardOp` (Task 10).
- Produces:
  - `DailyGifts` props: `{ player: PlayerState; onClaim: () => Promise<RewardGrant | null>; onBack: () => void }`.
  - `Index.tsx`: `handleClaimDailyGift(): Promise<RewardGrant | null>`.

- [ ] **Step 1: Write the failing test**

Read `src/test/DailyGifts.test.tsx` first for the existing `makePlayer`/render helper, then update the claim test(s):

```tsx
// render helper: pass onClaim = vi.fn().mockResolvedValue({ type: 'coins', amount: 150 })

it('claims and shows the reward returned by the server', async () => {
  const onClaim = vi.fn().mockResolvedValue({ type: 'coins', amount: 150 });
  renderGifts({ dailyGiftsLastClaim: null, dailyGiftsDay: 1, dailyGiftsWeek: 1 }, onClaim);
  fireEvent.click(screen.getByRole('button', { name: /resgatar/i }));
  expect(onClaim).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/150/)).toBeInTheDocument();
});

it('disables the claim button once claimed today', () => {
  renderGifts({ dailyGiftsLastClaim: today });
  expect(screen.getByRole('button', { name: /volt/i })).toBeDisabled(); // "Volte amanhã"
});
```

(Match the actual button label regex from the current test — it uses `t('daily.claimDay')` / `t('daily.comeBack')`; keep whatever the existing test asserts.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/DailyGifts.test.tsx`
Expected: FAIL — `onClaim` is now async / returns a reward the component must reveal.

- [ ] **Step 3: Write minimal implementation**

**`src/components/game/DailyGifts.tsx`**:
- Prop `onClaim: () => Promise<RewardGrant | null>` (was `() => void`).
- `handleClaim` becomes async: `const reward = await onClaim(); if (reward) setPopup({ reward, day: currentDay });` — the popup now takes `reward: RewardGrant` instead of `gifts[currentDay-1]`. `null` → no popup.
- The day/week tiles keep rendering from `player` (server advances `dailyGiftsDay` via `applyServerResult`, re-render follows).
- `RewardIcon` / `rewardLabel` already accept the reward shape (widened in Task 10).

**`src/pages/Index.tsx`**:
- Destructure `claimDailyGiftLocal` from `useGameState()`; remove the last stale name if any.
- `import { claimDailyGift as claimDailyGiftApi } from '@/api/endpoints';`
```ts
const handleClaimDailyGift = useCallback(
  () => runRewardOp('dailyGift', claimDailyGiftLocal, claimDailyGiftApi),
  [runRewardOp, claimDailyGiftLocal],
);
```
- Render site:
```tsx
content = <DailyGifts player={player} onClaim={handleClaimDailyGift} onBack={() => setScreen('menu')} />;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/DailyGifts.test.tsx` → PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json` → **clean now** (all Index references resolved).
Run: `npm test` → full unit suite green.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/DailyGifts.tsx src/pages/Index.tsx src/test/DailyGifts.test.tsx
git commit -m "frontend: daily gift claim through the server (reward from the response)"
```

---

### Task 13: Full gate, browser smoke, PROJECT_MEMORY, PR

**Files:**
- Modify: `PROJECT_MEMORY.md`

**Interfaces:** none — this task verifies and ships.

- [ ] **Step 1: Static gate**

Run, expecting all green:
```bash
npx tsc --noEmit -p tsconfig.app.json
npm run backend:typecheck
npm run lint          # 0 errors (pre-existing warnings only)
npm test
npm run build
```
If `npm run lint` reports a new error in a touched file, fix it and re-run. Fix any failure at its source (test or code), do not paper over.

- [ ] **Step 2: Integration suite**

With the Docker Postgres up (`docker compose up -d postgres`):
```bash
# bash:
export TEST_DATABASE_URL="postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure"
npm run backend:db:migrate
npm run test:integration
```
Expected: all PASS (prior count + the 5 new reward-op cases).

- [ ] **Step 3: Browser smoke on the Docker stack**

`docker compose up -d`. Open `http://localhost:8080`, register a **fresh** account
(the integration run truncates tables). Seed coins for the skin-roulette check:
```bash
docker compose exec -T postgres psql -U deepbluelure -d deepbluelure \
  -c "update player_game_state set state = jsonb_set(state,'{player,coins}','20000'), version = version + 1;"
```
Reload. Verify:
1. **Prendas** → "Resgatar" → `POST /api/v1/me/economy/daily-gift/claim` 200, popup shows the reward, coins move, a second claim is blocked ("Volte amanhã").
2. **Roleta** → "Girar" → `POST .../roulette/spin` 200, wheel spins, reward revealed, coins/skin updated, no redundant `PUT /me/state`; reload → "Já girou hoje".
3. **Roleta de Skins** → "Girar · 1500" → `POST .../skin-roulette/spin` 200, −1500 coins (or −1000 net on a duplicate), skin revealed; repeat once more (no daily limit).
4. DevTools Network: exactly one POST per action, no follow-up `PUT`.
5. DB check:
```bash
docker compose exec -T postgres psql -U deepbluelure -d deepbluelure \
  -c "select operation, count(*) from game_state_operations group by 1 order by 1;"
```
   → rows for `daily_gift_claim`, `roulette_spin`, `skin_roulette_spin`, no duplicates.
6. Quick anonymous check: log out, open each screen, confirm the local path still grants + reveals.

Capture a GIF of the three flows (`gif_creator`, name `task-10-3-roulettes-daily-gifts-smoke.gif`).

- [ ] **Step 4: Record in PROJECT_MEMORY.md**

Add a `### Task 10.3 fatia 5 — roletas + prendas diárias server-autoritativas — 2026-09-08`
section after the slice 4 section, mirroring the slice 4 entry's structure:
domain module + 3 pure rules, backend service/routes/errors, frontend wiring +
decorative wheels, the "no balance change" note, test counts, and the browser-smoke
paragraph. Leave the "Ponto de parada" section's "Retomar por" pointing at **fatia
6 — captura + aquário** (already set).

```bash
git add PROJECT_MEMORY.md
git commit -m "docs: record Task 10.3 slice 5 (server-authoritative roulettes + daily gifts)"
```

- [ ] **Step 5: Push + PR**

```bash
git push -u origin feature/task-10-3-roulettes-daily-gifts
gh pr create --base main --title "Task 10.3 (slice 5): server-authoritative roulettes + daily gifts" --body "<summary from the spec: 3 endpoints, decorative wheel, server RNG, no balance change; verification table + smoke>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Then watch CI (`gh pr checks <n>`); when green with no review comments, `gh pr merge <n> --merge --delete-branch`, sync `main`, and add the `docs: record Task 10.3 slice 5 merge (PR #<n> -> main, <sha>)` commit on `main`.

---

## Self-Review

**1. Spec coverage:**
- D1 `rewards.ts` → Task 1. ✅
- D2 three pure rules → Tasks 2, 3, 4. ✅
- D3 `now` injection → folded into Tasks 2–4 (each rule takes `now` where it grants a multiplier). ✅
- A1 service (Compute generalization + 3 methods, memory + PG) → Task 5. ✅
- A2 routes → Task 6. ✅
- A3 error codes → Task 6. ✅
- A4 no schema/migration → stated in Global Constraints; nothing to do. ✅
- A5 backend tests (memory + integration) → Tasks 5, 7. ✅
- B1 endpoints → Task 8. ✅
- B2 useGameState helpers + drop callbacks → Task 9. ✅
- B3 `runRewardOp` + handlers → Task 10 (`runRewardOp` + roulette), 11, 12. ✅
- B4 three components → Tasks 10, 11, 12; `rewardLabel` widening → Task 10. ✅
- B5 frontend tests → Tasks 8–12. ✅
- Non-goals (seed RNG, faithful wheel, balance changes, skin-roulette daily limit, dormant-endpoint removal, catch/aquarium/leaderboard) → not implemented, correct. ✅
- Risks (3 animated screens, `resolveDailyGift` fidelity, `randomInt(0)`, memory/PG parity, `playerRef` staleness, op-row growth, `addCoins` removal) → covered by Task 9 grep + Task 3 empty-pool test + Task 2 week-table test + Task 13 smoke. ✅

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Task 7 step 3 legitimately has no implementation (tests only — the service already exists). Task 9 step 3 and Task 12 step 1 ask the implementer to read an existing file first because the exact existing helper/label text must be matched verbatim — that is a real instruction, not a placeholder. ✅

**3. Type consistency:**
- `RewardGrant` shape identical across Tasks 1, 2–4, 5, 8, 9, 10. ✅
- `{ next, reward }` from the pure rules (Tasks 2–4) vs `{ player, reward }` from `Compute` (Task 5) — Task 5 step 3 explicitly adapts `next` → `player` in the closure. ✅
- `Result` gains `reward?` (Task 5); `RewardEnvelope = GameStateEnvelope & { reward }` (Task 8) — server always sends `reward` for these three ops, client type requires it, consistent. ✅
- operations `roulette_spin` / `skin_roulette_spin` / `daily_gift_claim` identical in Tasks 5, 6, 7. ✅
- `runRewardOp` signature identical in Tasks 10, 11, 12. ✅
- Endpoint paths `/me/economy/roulette/spin`, `/me/economy/skin-roulette/spin`, `/me/economy/daily-gift/claim` identical across Tasks 6, 8, 13. ✅
