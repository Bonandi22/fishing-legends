# Antifraude (Fase 11, bloco 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detetar batota na pesca (regras duras síncronas + análise estatística periódica), suspender só com evidência esmagadora, e dar ao dono uma página de admin para banir / repor / arquivar, com o jogador informado no jogo e por e-mail.

**Architecture:** Abordagem C do spec. As regras duras (H0–H3) vivem no `cast`/`land` dos dois serviços de pesca (memória + PG). A análise é uma função pura `evaluatePlayer` alimentada por um repositório de estatísticas e corrida a cada 10 min no `email-worker` por `runAntiCheatScan`. Os casos ficam em `fraud_cases`; o estado da conta em `users.status`. As rotas de admin vivem em `backend/src/admin/`; o frontend ganha um ecrã de conta bloqueada e um ecrã de admin.

**Tech Stack:** Fastify + Zod, Drizzle + PostgreSQL (migrações SQL à mão), Vitest, React + TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-13-anti-cheat-design.md`

## Global Constraints

- Prioridade do dono: **nunca suspender um honesto**; na dúvida, `flag`, não `suspend`.
- Nenhum sinal usa moedas, XP ou nível — só resultados de pesca.
- Todos os limites num único módulo: `backend/src/anticheat/config.ts` (valores provisórios abaixo).
- Backend ESM: imports relativos com sufixo `.js`. Zod em todo body/query/param. Erros com códigos `SNAKE_CASE` mapeados em `backend/src/http/errors.ts`.
- Memória e PostgreSQL com o mesmo comportamento observável; mutações de valor em transação; `Idempotency-Key` em mutações de admin.
- Nova migração: `backend/migrations/0026_anti_cheat.sql`, espelhada em `backend/src/db/schema.ts`; `npm run backend:db:generate` sem diff inesperado.
- Nunca logar payloads, códigos, e-mails ou tokens no worker (só nomes de erro e contagens).
- i18n nas 6 línguas existentes (`pt en es fr de ja`), no frontend (`src/game/i18n.tsx`) e nos e-mails (`backend/src/email/templates.ts`).
- Um PR por fatia (ver "PRs" no fim). Commit/push/PR só com OK do utilizador.

### Valores provisórios (`backend/src/anticheat/config.ts`)

```ts
export const FISHING_CLIENT_LOCK_MS = 60_000;        // H0
export const MIN_ROD_CAST_INTERVAL_MS = 3_500;       // H2
export const MIN_ROD_LAND_MS = 300;                  // H3
export const SCAN_INTERVAL_MS = 600_000;             // análise a cada 10 min
export const ANALYSIS_WINDOW_MS = 24 * 3_600_000;
export const S1_FLAG = { p: 1e-3, minAttempts: 15 };
export const S1_SUSPEND = { p: 1e-6, minAttempts: 30 };
// Teto de vitória de um honesto no melhor caso — generoso, a calibrar na Task 12.
export const P0: Record<Rarity, { plain: number; strength: number }> = {
  common: { plain: 0.99, strength: 0.99 }, uncommon: { plain: 0.97, strength: 0.99 },
  mythic: { plain: 0.92, strength: 0.97 }, legendary: { plain: 0.88, strength: 0.95 },
  abyssal: { plain: 0.82, strength: 0.93 }, volcanic: { plain: 0.78, strength: 0.92 },
  platinum: { plain: 0.72, strength: 0.9 }, legends: { plain: 0.65, strength: 0.88 },
  cosmic: { plain: 0.55, strength: 0.85 },
};
export const S2_MAX_LANDS_PER_HOUR = { rod: 600, net: 600, submarine: 1_500 };
export const S2_MAX_CONTINUOUS_MS = 10 * 3_600_000; // atividade sem pausa ≥ S2_PAUSE_MS
export const S2_PAUSE_MS = 30 * 60_000;
export const S3_RARE = ['abyssal', 'volcanic', 'platinum', 'legends', 'cosmic'] as const;
export const S3_SHARE_CEILING_FACTOR = 4;            // × soma das chances base (cobre multiplicadores de sorte)
export const S3_FLAG = { p: 1e-6, minCasts: 50 };
export const S4_FLAG = 5;
export const S4_SUSPEND = 50;
```

## Review Focus

1. **Duas janelas do mesmo jogador** — a segunda recebe `FISHING_ELSEWHERE` e **nenhum** `anti_cheat_events` é gravado; passados 60 s sem `cast` da primeira, a segunda pesca. Teste na Task 3.
2. **Replay idempotente de um `cast`/`land`** (mesma `Idempotency-Key`) não pode disparar H0/H2/H3 nem gravar violação. Teste na Task 3.
3. **Conta reposta não é re-suspensa** pelo ciclo seguinte com a mesma atividade (o piso de análise = data da decisão). Teste na Task 8.
4. **Sessão já autenticada de uma conta suspensa** deixa de jogar no pedido seguinte (não espera 15 min pelo TTL do access token). Teste na Task 4.
5. **Honesto no teto `p0` a jogar 24 h ao ritmo máximo** → zero suspensões em Monte Carlo. Teste na Task 5.

---

## Fatia A — regras duras e estado da conta (PR 1)

### Task 1: Migração 0026 e schema

**Files:**
- Create: `backend/migrations/0026_anti_cheat.sql`
- Modify: `backend/src/db/schema.ts`
- Test: `backend/src/db/antiCheatSchema.integration.test.ts`

**Interfaces:**
- Produces (usadas por todas as tasks seguintes):
  - `users.status` check → `IN ('active','suspended','banned','deleted')`; `users.is_admin boolean NOT NULL DEFAULT false`.
  - `fishing_sessions.client_id uuid NULL`, `fishing_sessions.strength_active boolean NOT NULL DEFAULT false`; índice `(user_id, created_at DESC)`.
  - `fishing_lands(id uuid pk, user_id uuid fk users on delete cascade, session_id uuid fk fishing_sessions on delete cascade, mode varchar(16) NOT NULL, fish_id varchar(120) NOT NULL, landed_at timestamptz NOT NULL default now())`, índice `(user_id, landed_at)`.
  - `anti_cheat_events(id uuid pk, user_id uuid fk cascade, type varchar(32) NOT NULL check IN ('cast_too_fast','land_too_fast'), session_id uuid NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL default now())`, índice `(user_id, created_at)`.
  - `fraud_cases(id uuid pk, user_id uuid fk cascade, status varchar(16) NOT NULL check IN ('flagged','suspended','banned','restored','dismissed'), evidence jsonb NOT NULL, opened_at timestamptz NOT NULL default now(), updated_at timestamptz NOT NULL default now(), decided_at timestamptz NULL, decided_by uuid NULL fk users, note text NULL)`; índice único parcial `fraud_cases_one_open ON (user_id) WHERE status IN ('flagged','suspended')`.
  - Drizzle: `fishingLands`, `antiCheatEvents`, `fraudCases`; novos campos em `users` (`isAdmin`) e `fishingSessions` (`clientId`, `strengthActive`).

- [ ] **Step 1:** Teste de integração (via `pgHarness`): dois `fraud_cases` `flagged` do mesmo user → erro de `fraud_cases_one_open`; um `flagged` + um `dismissed` → ok; `users.status = 'banned'` aceite; `'frozen'` rejeitado.
- [ ] **Step 2:** `npm run test:integration -- antiCheatSchema` → FAIL.
- [ ] **Step 3:** Escrever `0026_anti_cheat.sql` e espelhar em `schema.ts`.
- [ ] **Step 4:** `npm run backend:db:migrate && npm run test:integration -- antiCheatSchema` → PASS; `npm run backend:db:generate` → só o diff esperado.
- [ ] **Step 5:** Commit `feat(db): anti-cheat tables and account states (0026)`.

### Task 2: Configuração e regras duras puras

**Files:**
- Create: `backend/src/anticheat/config.ts` (valores acima), `backend/src/anticheat/hardRules.ts`
- Test: `backend/src/anticheat/hardRules.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LastCast = { clientId: string | null; createdAt: Date; mode: CastMode } | null;
  export function checkCastAllowed(last: LastCast, clientId: string | undefined, mode: CastMode, now: Date):
    | { ok: true }
    | { ok: false; code: 'FISHING_ELSEWHERE' }
    | { ok: false; code: 'CAST_TOO_FAST'; intervalMs: number };
  export function checkLandAllowed(mode: CastMode, castAt: Date, now: Date):
    | { ok: true } | { ok: false; code: 'LAND_TOO_FAST'; elapsedMs: number };
  ```
  `last` = o `cast` mais recente do utilizador em qualquer modo. `clientId === undefined` (só durante a Fatia A, ver PRs) → H0 e H2 não se aplicam. H0: `last.clientId` não nulo, diferente de `clientId`, e `now − last.createdAt < FISHING_CLIENT_LOCK_MS` → `FISHING_ELSEWHERE`. H2: `mode === 'rod'`, `last.mode === 'rod'`, mesmo `clientId`, intervalo `< MIN_ROD_CAST_INTERVAL_MS`. H3: só `rod`, `now − castAt < MIN_ROD_LAND_MS`.

- [ ] **Step 1:** Testes: `FISHING_ELSEWHERE` a 59 999 ms de outro clientId e `ok` a 60 000 ms; `CAST_TOO_FAST` a 3 499 ms (rod→rod, mesmo client) e `ok` a 3 500; net/submarine nunca `CAST_TOO_FAST`; `LAND_TOO_FAST` a 299 ms e `ok` a 300; `last = null` → `ok`; `clientId` undefined → `ok`.
- [ ] **Step 2:** `npx vitest run backend/src/anticheat/hardRules.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat(anticheat): hard-rule checks (H0, H2, H3)`.

### Task 3: Regras duras no `cast`/`land` (memória + PG)

**Files:**
- Modify: `backend/src/fishing/routes.ts`, `backend/src/fishing/service.ts`, `backend/src/fishing/pgRepository.ts`, `backend/src/http/errors.ts`, `backend/src/app.ts`
- Test: `backend/src/fishing/service.test.ts`, `backend/src/fishing/routes.test.ts`, `backend/src/fishing/pgRepository.integration.test.ts`

**Interfaces:**
- Consumes: `checkCastAllowed`, `checkLandAllowed` (Task 2); tabelas da Task 1.
- Produces:
  - Body do `cast`: `clientId: z.string().uuid().optional()` (obrigatório a partir da Task 10).
  - `FishingService.cast(userId, idempotencyKey, locationId, mode?, clientId?: string)`.
  - Códigos: `FISHING_ELSEWHERE` 409 "You are already fishing in another window"; `CAST_TOO_FAST` 429 "Casting too fast"; `LAND_TOO_FAST` 409 "The fish got away".
  - Memória: `export type MemoryAntiCheatStore = { lands: FishingLandRow[]; events: AntiCheatEventRow[]; sessions: Map<string, FishingSessionRow> }` e `createMemoryFishingService(store, anticheat: MemoryAntiCheatStore)`; `FishingSessionRow` ganha `clientId: string | null`, `strengthActive: boolean`, `completedAt: Date | null`. (A Task 6 lê este store.)
  - Ambos os serviços aceitam um relógio injetável `now: () => Date` (default `() => new Date()`) para os testes.

Comportamento (igual nos dois serviços; no PG dentro da transação já existente):
- O replay por `Idempotency-Key` é resolvido **antes** de qualquer regra.
- `cast`: ler o `cast` mais recente do user → `checkCastAllowed`. `FISHING_ELSEWHERE` → lançar, sem evento. `CAST_TOO_FAST` → gravar `anti_cheat_events` (`detail: { intervalMs }`) numa transação própria, já confirmada, e lançar. H1: para `rod`/`net`, marcar `expired` as sessões `open` do mesmo user e modo. Gravar `client_id` e `strength_active = player.strengthMultiplierEnd != null && player.strengthMultiplierEnd > now`.
- `land`: `checkLandAllowed(session.mode, session.createdAt, now)`; falha → sessão `expired` + evento `land_too_fast` (`detail: { elapsedMs }`), confirmados, e lançar. Sucesso → uma linha `fishing_lands` por peixe apanhado (`landed_at = now`); `completed_at = now` quando a sessão fica `completed`. O submarino mantém a renovação de `created_at`; os tempos por captura ficam em `fishing_lands`.

- [ ] **Step 1:** Testes (memória): segunda janela → `FISHING_ELSEWHERE` e `events.length === 0`; replay do mesmo `cast` 1 s depois devolve a mesma sessão sem erro nem evento; `cast` rod 1 s depois do anterior (outra key, mesmo client) → `CAST_TOO_FAST` e 1 evento; novo `cast` rod expira a sessão rod aberta; `land` 100 ms após o `cast` → `LAND_TOO_FAST`, sessão `expired`, 1 evento; replay de um `land` bem-sucedido não grava segundo `fishing_lands`; `land` net grava um `fishing_lands` por peixe; `strength_active` reflete o blob.
- [ ] **Step 2:** Rotas: `clientId` não-uuid → 400 `VALIDATION_ERROR`; os três códigos saem com o status certo.
- [ ] **Step 3:** `npx vitest run backend/src/fishing` → FAIL.
- [ ] **Step 4:** Implementar nos dois serviços; os testes existentes passam a usar o relógio injetável.
- [ ] **Step 5:** `npx vitest run backend/src/fishing` → PASS.
- [ ] **Step 6:** Mesmos cenários em `pgRepository.integration.test.ts`; `npm run test:integration -- fishing` → PASS.
- [ ] **Step 7:** Commit `feat(fishing): enforce one window, cast interval and land floor`.

### Task 4: Estados `suspended`/`banned` nas contas

**Files:**
- Modify: `backend/src/auth/service.ts`, `backend/src/auth/types.ts`, `backend/src/auth/middleware.ts`, `backend/src/auth/pgRepository.ts`, repositório de memória do auth, `backend/src/http/errors.ts`, `backend/src/leaderboard/pgRepository.ts`, `backend/src/leaderboard/service.ts`, `backend/src/auth/cleanup.ts` (só se a query não proteger já estas contas)
- Test: `backend/src/auth/service.test.ts`, `backend/src/auth/middleware.test.ts` (criar), testes do leaderboard, `backend/src/auth/cleanup.test.ts`

**Interfaces:**
- Produces:
  - `AuthUser.status: 'active' | 'suspended' | 'banned' | 'deleted'`; `AuthUser.isAdmin: boolean`.
  - Códigos: `ACCOUNT_SUSPENDED` 403 "This account is under review"; `ACCOUNT_BANNED` 403 "This account has been banned".
  - `AuthService.assertActive(userId: string): Promise<{ isAdmin: boolean }>` — lança os códigos acima, ou `INVALID_ACCESS_TOKEN` se o user não existe.
  - `requireAuth` chama `assertActive` depois de verificar o token e guarda `request.isAdmin`.
  - `AuthRepository.setStatus(userId: string, status: AuthUser['status'], tx?: unknown): Promise<void>` (usado nas Tasks 8 e 9; `revokeAllSessions` já existe e ganha `tx?`).

Comportamento:
- `login` e `verifyLogin`: palavra-passe errada → `INVALID_CREDENTIALS` (sempre primeiro); certa e `suspended`/`banned` → código respetivo, sem emitir código de login. `refresh` idem. `forgotPassword` mantém o decoy para não-`active`.
- Leaderboard (memória e PG): só utilizadores `active`.
- A limpeza de não-confirmados nunca apaga `suspended`/`banned`.

- [ ] **Step 1:** Testes: login com senha certa de conta `suspended` → `ACCOUNT_SUSPENDED`; senha errada da mesma conta → `INVALID_CREDENTIALS`; `banned` → `ACCOUNT_BANNED`; `requireAuth` com token válido de conta suspensa → `ACCOUNT_SUSPENDED` (Review Focus 4); refresh de conta banida → `ACCOUNT_BANNED`; leaderboard não lista `suspended`/`banned`; cleanup não apaga uma conta `banned` sem `email_verified_at`.
- [ ] **Step 2:** `npx vitest run backend/src/auth backend/src/leaderboard` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mesmo comando → PASS; `npm run test:integration -- leaderboard auth` → PASS.
- [ ] **Step 5:** Commit `feat(auth): suspended and banned accounts cannot play`.

---

## Fatia B — análise periódica (PR 2)

### Task 5: Regras estatísticas puras

**Files:**
- Create: `backend/src/anticheat/stats.ts` (tipos), `backend/src/anticheat/binomial.ts`, `backend/src/anticheat/rules.ts`
- Test: `backend/src/anticheat/binomial.test.ts`, `backend/src/anticheat/rules.test.ts`, `backend/src/anticheat/honestSimulation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // stats.ts
  export type WinTally = { rarity: Rarity; strength: boolean; attempts: number; wins: number };
  export type PlayerStats = {
    userId: string; since: Date; until: Date;
    winTallies: WinTally[];                             // rod (+ net, ver Task 6)
    lands: Array<{ mode: CastMode; at: number }>;       // epoch ms
    castRarityCounts: Partial<Record<Rarity, number>>;  // rod + net, sorteadas
    violations: number;
  };
  // binomial.ts
  export function binomialUpperTail(k: number, n: number, p: number): number; // P(X ≥ k), calculado em log-espaço
  // rules.ts
  export type Level = 'none' | 'flag' | 'suspend';
  export type Signal = { id: 'S1' | 'S2' | 'S3' | 'S4'; level: Level; detail: Record<string, number | string | boolean> };
  export function evaluatePlayer(stats: PlayerStats): { level: Level; signals: Signal[] };
  ```
  Regras como no spec §3, com os valores de `config.ts`. `signals` só inclui sinais com `level !== 'none'`; o nível é o máximo; vários `flag` não fazem `suspend`. S1 por tally: `p = binomialUpperTail(wins, attempts, P0[rarity][strength ? 'strength' : 'plain'])`. S2: lands por hora de relógio por modo, e maior período contínuo (lands separados por menos de `S2_PAUSE_MS`). S3: `p0 = min(1, S3_SHARE_CEILING_FACTOR × Σ RARITY_CONFIG[r].chance, r ∈ S3_RARE)`, `k` = casts raros, `n` = total. `detail` leva os números usados (para a página de admin).

- [ ] **Step 1:** `binomialUpperTail(30, 30, 0.5)` ≈ `9.313e-10` (tolerância relativa 1e-6); `(0, n, p) === 1`; finito e em [0,1] para `n = 5000`.
- [ ] **Step 2:** `rules.test.ts`: 30/30 cósmicos sem força → `suspend` (S1); 15/15 cósmicos → `flag`; 30/30 lendários com força → `none`; 50 violações → `suspend` (S4), 5 → `flag`; 700 lands rod numa hora → `flag` (S2); 11 h com um land a cada 5 min → `flag` (S2); S2 + S3 + S4 em `flag` → nível `flag`.
- [ ] **Step 3:** `honestSimulation.test.ts` (RNG com seed): 2 000 honestos, 24 h cada, um `cast` rod a cada 4 s, raridade com `RARITY_CONFIG.chance`, força ativa em metade dos jogadores, vitória com probabilidade `P0[r]` → **0** `suspend`; `console.info` da taxa de `flag`. Batoteiro (100% de vitórias) → `suspend`, com `console.info` do nº de lançamentos até lá, e `expect(lancamentos).toBeLessThan(2000)`.
- [ ] **Step 4:** `npx vitest run backend/src/anticheat` → FAIL; implementar; → PASS.
- [ ] **Step 5:** Commit `feat(anticheat): statistical rules with honest-player simulation`.

### Task 6: Recolha de estatísticas (memória + PG)

**Files:**
- Create: `backend/src/anticheat/statsRepository.ts` (interface + memória), `backend/src/anticheat/pgStatsRepository.ts`
- Test: `backend/src/anticheat/statsRepository.test.ts`, `backend/src/anticheat/pgStatsRepository.integration.test.ts`

**Interfaces:**
- Consumes: `MemoryAntiCheatStore` (Task 3), tabelas (Task 1), `PlayerStats` (Task 5).
- Produces:
  ```ts
  export interface StatsRepository {
    /** Users `active` com pelo menos um cast desde `since`. */
    listActiveFishers(since: Date): Promise<string[]>;
    collect(userId: string, since: Date, until: Date): Promise<PlayerStats>;
  }
  export function createMemoryStatsRepository(anticheat: MemoryAntiCheatStore, users: { statusOf(id: string): string | null }): StatsRepository;
  export function createPgStatsRepository(db: Database): StatsRepository;
  ```
  `attempts` = sessões rod com `status = 'completed'`, ou `expired`, ou `open` com `created_at < until − FISHING_SESSION_TTL_MS`; `wins` = `completed`. Net: ler `src/components/game/NetFishing.tsx`; se a vitória for decidida no cliente como no rod, incluir nos tallies (raridade do net), senão excluir — registar a decisão no ledger. Raridade via `FISH` (`src/game/data.ts`). Só sessões com `since ≤ created_at < until`.

- [ ] **Step 1:** Testes (memória e PG, mesmos cenários): 3 sessões rod cósmicas (2 `completed`, 1 `open` com 6 min) → `{ rarity: 'cosmic', strength: false, attempts: 3, wins: 2 }`; `open` com 1 min não conta; atividade antes de `since` ignorada; user `suspended` fora de `listActiveFishers`; `violations` conta só eventos na janela.
- [ ] **Step 2:** FAIL → implementar → `npx vitest run backend/src/anticheat` e `npm run test:integration -- anticheat` → PASS.
- [ ] **Step 3:** Commit `feat(anticheat): collect per-player fishing stats`.

### Task 7: E-mails de suspensão, banimento e reposição

**Files:**
- Modify: `backend/src/email/types.ts`, `backend/src/email/templates.ts`
- Test: `backend/src/email/templates.test.ts`

**Interfaces:**
- Produces: `EmailKind` += `'account_suspended' | 'account_banned' | 'account_restored'`, payload `{}`. Textos pt (traduzir para as outras 5 línguas, mesmo tom dos templates existentes):
  - `account_suspended` — assunto "A tua conta está em revisão"; corpo "Detetámos atividade fora do normal na tua conta do Fishing Legends e suspendemo-la enquanto a revemos. Vais receber outro e-mail com a decisão."
  - `account_banned` — "A tua conta foi banida"; "Após revisão, a tua conta do Fishing Legends foi banida por violar as regras do jogo."
  - `account_restored` — "A tua conta foi reposta"; "Revimos a tua conta do Fishing Legends e está tudo em ordem. Já podes voltar a jogar. Pedimos desculpa pelo incómodo."

- [ ] **Step 1:** Teste: cada kind renderiza nos 6 locales com assunto e corpo não vazios e sem placeholders por preencher.
- [ ] **Step 2:** FAIL → implementar → `npx vitest run backend/src/email` → PASS.
- [ ] **Step 3:** Commit `feat(email): account review notices`.

### Task 8: Casos de fraude, `runAntiCheatScan` e ligação ao worker

**Files:**
- Create: `backend/src/anticheat/cases.ts` (interface + memória), `backend/src/anticheat/pgCases.ts`, `backend/src/anticheat/scan.ts`
- Modify: `backend/src/email/workerMain.ts`
- Test: `backend/src/anticheat/scan.test.ts`, `backend/src/anticheat/pgCases.integration.test.ts`

**Interfaces:**
- Consumes: `StatsRepository` (Task 6), `evaluatePlayer` (Task 5), `AuthRepository.setStatus`/`revokeAllSessions` (Task 4), `EmailOutbox.enqueue` (Task 7).
- Produces:
  ```ts
  export type FraudCaseStatus = 'flagged' | 'suspended' | 'banned' | 'restored' | 'dismissed';
  export type CaseEvidence = { level: Level; signals: Signal[]; window: { since: string; until: string } };
  export type FraudCase = { id: string; userId: string; status: FraudCaseStatus; evidence: CaseEvidence;
    openedAt: Date; updatedAt: Date; decidedAt: Date | null; decidedBy: string | null; note: string | null };
  export type FraudCaseView = FraudCase & { email: string; username: string };
  export interface FraudCaseRepository {
    /** Data da última decisão `restored`/`dismissed` do user, ou null. */
    analysisFloor(userId: string): Promise<Date | null>;
    /** Abre ou atualiza o caso aberto. Ao passar a `suspended`, na mesma transação: users.status='suspended', revokeAllSessions, enqueue 'account_suspended'. Nunca baixa de `suspended` para `flagged`. */
    record(userId: string, evaluation: { level: 'flag' | 'suspend'; signals: Signal[] }, window: { since: Date; until: Date }, now: Date): Promise<FraudCase>;
    list(filter: { status?: FraudCaseStatus; limit: number; offset: number }): Promise<{ items: FraudCaseView[]; total: number }>;
    get(id: string): Promise<FraudCaseView | null>;
    decide(id: string, action: 'ban' | 'restore' | 'dismiss', adminId: string, note: string | null, now: Date): Promise<FraudCase>;
  }
  export async function runAntiCheatScan(deps: { stats: StatsRepository; cases: FraudCaseRepository }, now: Date): Promise<{ scanned: number; flagged: number; suspended: number }>;
  ```
  `runAntiCheatScan`: para cada user de `listActiveFishers(now − ANALYSIS_WINDOW_MS)`: `since = max(now − ANALYSIS_WINDOW_MS, analysisFloor(user))`; `evaluatePlayer(collect(user, since, now))`; `level !== 'none'` → `cases.record`. Erro num jogador não interrompe os outros (log só do nome do erro).
  `decide` — transições: `flagged → ban | dismiss`; `suspended → ban | restore`; outra → `INVALID_CASE_DECISION` 409 (novo código). `ban` → users `banned` + revoke + e-mail `account_banned`; `restore` → users `active` + e-mail `account_restored`; `dismiss` → só o caso, sem e-mail. Caso inexistente → `FRAUD_CASE_NOT_FOUND` 404.
  Worker: segundo `setInterval(scan, SCAN_INTERVAL_MS)` ao lado do `cleanup`, mesmo padrão (`unref`, `clearInterval` no shutdown), log `email-worker: anti-cheat scanned N, flagged F, suspended S`.

- [ ] **Step 1:** `scan.test.ts` (memória): batoteiro → caso `suspended`, user `suspended`, 1 e-mail `account_suspended`, sessões revogadas; segundo scan não duplica caso nem e-mail; flag-only → caso `flagged` e 0 e-mails; `suspended` → `restore` → scan seguinte com a mesma atividade → nenhum caso novo (Review Focus 3); idem com `dismiss`; atividade nova após o piso volta a ser avaliada; `decide('restore')` num `flagged` → `INVALID_CASE_DECISION`.
- [ ] **Step 2:** `pgCases.integration.test.ts`: efeitos de `record`/`decide` atómicos (falha simulada no enqueue reverte o status do user); dois `record` concorrentes para o mesmo user deixam um só caso aberto.
- [ ] **Step 3:** FAIL → implementar → `npx vitest run backend/src/anticheat` e `npm run test:integration -- anticheat` → PASS.
- [ ] **Step 4:** Commit `feat(anticheat): fraud cases and periodic scan in the worker`.

---

## Fatia C — admin e frontend (PR 3)

### Task 9: Admin no backend

**Files:**
- Create: `backend/src/admin/routes.ts`, `backend/src/admin/grantAdmin.ts`
- Modify: `backend/src/app.ts`, `backend/src/auth/middleware.ts`, `backend/src/players/types.ts`, `backend/src/players/pgRepository.ts`, `backend/src/players/memoryRepository.ts`, `package.json`
- Test: `backend/src/admin/routes.test.ts`, `backend/src/admin/grantAdmin.integration.test.ts`

**Interfaces:**
- Consumes: `FraudCaseRepository` (Task 8), `request.isAdmin` (Task 4).
- Produces:
  - `PlayerProfile.isAdmin: boolean` em `GET /api/v1/me`.
  - `app.requireAdmin` (preHandler, depois de `requireAuth`): não-admin → `AppError(404, 'NOT_FOUND', 'Not found')`.
  - `GET /api/v1/admin/fraud-cases?status=&limit=(1..100, default 50)&offset=(≥0, default 0)` → `{ items: FraudCaseView[], total }`; ordem: `suspended` antes de `flagged`, depois `updatedAt` desc.
  - `GET /api/v1/admin/fraud-cases/:id` (uuid) → `FraudCaseView`.
  - `POST /api/v1/admin/fraud-cases/:id/decision`, body `{ action: 'ban'|'restore'|'dismiss', note?: string (≤ 500) }`, com `Idempotency-Key` (replay devolve o mesmo resultado; reutilizar o padrão de replay existente) → `FraudCase`.
  - Script `npm run backend:admin:grant -- <email>` (`tsx backend/src/admin/grantAdmin.ts`): `is_admin = true`; e-mail inexistente → exit 1 com "no such user".
  - Sem `DATABASE_URL`, `app.ts` usa o `FraudCaseRepository` de memória.

- [ ] **Step 1:** Testes: não-admin recebe 404 nas três rotas; admin lista, vê detalhe e decide; `restore` num `flagged` → 409 `INVALID_CASE_DECISION`; decisão repetida com a mesma key → mesmo corpo e um só e-mail; `/me` devolve `isAdmin`.
- [ ] **Step 2:** FAIL → implementar → `npx vitest run backend/src/admin backend/src/players` → PASS; `npm run test:integration -- grantAdmin` → PASS.
- [ ] **Step 3:** Commit `feat(admin): fraud case review API and admin grant script`.

### Task 10: Frontend — janela única e conta bloqueada

**Files:**
- Create: `src/api/clientId.ts`, `src/components/game/AccountBlocked.tsx`
- Modify: `src/api/endpoints.ts`, `src/api/client.ts`, `src/api/types.ts`, `src/game/auth/AuthProvider.tsx`, `src/pages/Index.tsx`, `src/components/game/FishingScreen.tsx`, `src/components/game/menu/AccountModal.tsx`, `src/game/i18n.tsx`, `backend/src/fishing/routes.ts` (`clientId` passa a obrigatório)
- Test: `src/api/endpoints.test.ts`, `src/api/client.test.ts`, `src/test/AccountBlocked.test.tsx`, `src/test/AccountModal.test.tsx`, `backend/src/fishing/routes.test.ts`

**Interfaces:**
- Produces:
  - `getFishingClientId(): string` — `crypto.randomUUID()` guardado em `sessionStorage` (um por separador), com fallback em memória se o storage falhar.
  - `castLine(key, locationId, mode)` envia `clientId: getFishingClientId()`.
  - `setAccountBlockedHandler(fn: (reason: 'suspended' | 'banned') => void)` em `client.ts`, chamado quando qualquer resposta traz `ACCOUNT_SUSPENDED`/`ACCOUNT_BANNED`.
  - `AuthStatus` += `'blocked'`; `AuthContextValue.blockedReason: 'suspended' | 'banned' | null`; `ApiUser.isAdmin: boolean`.
  - `Index`: com `status === 'blocked'` renderiza `<AccountBlocked reason={…} onLogout={logout} />` em vez do jogo.
  - `onCast` passa a devolver `Hooked | null | 'elsewhere'`; `FishingScreen` mostra `t('fish.elsewhere')` quando recebe `'elsewhere'` (os outros erros mantêm-se: sem peixe).
  - `AccountModal`: login com `ACCOUNT_SUSPENDED`/`ACCOUNT_BANNED` mostra o corpo do ecrã bloqueado.
  - i18n pt (traduzir para as outras 5): `fish.elsewhere` "Já estás a pescar noutra janela."; `account.suspendedTitle` "Conta em revisão"; `account.suspendedBody` "Detetámos atividade fora do normal e a tua conta está em revisão. Vais receber um e-mail com a decisão."; `account.bannedTitle` "Conta banida"; `account.bannedBody` "Esta conta foi banida por violar as regras do jogo."

- [ ] **Step 1:** Testes: `castLine` envia o mesmo `clientId` em chamadas seguidas; 403 `ACCOUNT_SUSPENDED` chama o handler com `'suspended'`; `AccountBlocked` mostra título/corpo por `reason` e um botão de sair; o modal de login mostra o texto de banido; backend: `cast` sem `clientId` → 400.
- [ ] **Step 2:** FAIL → implementar → `npx vitest run` → PASS; `npx tsc --noEmit -p tsconfig.app.json` limpo.
- [ ] **Step 3:** Commit `feat(frontend): one fishing window and blocked-account screen`.

### Task 11: Frontend — ecrã de admin

**Files:**
- Create: `src/components/game/admin/AdminCases.tsx`, `src/components/game/admin/CaseDetail.tsx`
- Modify: `src/api/endpoints.ts`, `src/pages/Index.tsx` (`Screen` += `'admin'`), `src/components/game/MainMenu.tsx`, `src/game/i18n.tsx`
- Test: `src/test/AdminCases.test.tsx`

**Interfaces:**
- Consumes: rotas da Task 9.
- Produces: `listFraudCases(status?, limit?, offset?)`, `getFraudCase(id)`, `decideFraudCase(key, id, action, note?)` em `endpoints.ts`. Botão "Admin" no menu só com `user.isAdmin`. Lista (suspensos primeiro) → detalhe com, por sinal: tabela vitórias/tentativas/p por raridade e força (S1), lands/hora e maior período contínuo (S2), raros sorteados vs teto (S3), nº de violações (S4). Só os botões permitidos pelo estado do caso, cada um com confirmação (`AlertDialog` do shadcn) e nota opcional.

- [ ] **Step 1:** Testes: o menu não mostra "Admin" a não-admin; o detalhe de um caso `flagged` mostra Banir e Arquivar, não Repor; confirmar chama `decideFraudCase` com uma key e volta à lista atualizada.
- [ ] **Step 2:** FAIL → implementar → `npx vitest run src` → PASS.
- [ ] **Step 3:** Commit `feat(frontend): admin fraud case review screen`.

### Task 12: Calibração, documentação e verificação final

**Files:**
- Modify: `backend/src/anticheat/config.ts`, `PROJECT_MEMORY.md` (acrescentar secção), `CLAUDE.md` (comando `backend:admin:grant`, módulos `anticheat/` e `admin/`)

- [ ] **Step 1:** Stack Docker (`docker compose up --build`) + Playwright: medir, a jogar o mais depressa possível, o menor intervalo entre `cast`s rod e o menor `cast → land` (pedidos de rede). Se algum ficar abaixo do valor de H2/H3 + 20% de margem, baixar o valor em `config.ts` e registar a medição em comentário.
- [ ] **Step 2:** Jogar ~40 lançamentos a tentar ganhar raros, com e sem força; se a taxa observada de alguma raridade passar o `P0` provisório, subir esse `P0` (nunca descer sem dados). Voltar a correr `honestSimulation.test.ts`.
- [ ] **Step 3:** Smoke ponta a ponta: conceder admin pelo script; script de teste que chama `cast`/`land` sem minijogo (batoteiro) → caso suspenso no admin, jogador vê o ecrã de revisão, e-mail no Mailpit; repor → e-mail de reposição, volta a jogar e não é re-suspenso no scan seguinte; duas janelas → a segunda vê "Já estás a pescar noutra janela."
- [ ] **Step 4:** Gate: `npx tsc --noEmit -p tsconfig.app.json && npm run backend:typecheck && npm test && npm run build && npm run lint`; `docker compose stop email-worker && npm run backend:db:migrate && npm run test:integration`.
- [ ] **Step 5:** Commit `docs: anti-cheat runbook and calibration notes`.

## PRs

- **PR 1 (Fatia A, Tasks 1–4):** regras duras + estados de conta. O frontend ainda não envia `clientId`, por isso nesta fatia ele é opcional e H0/H2 só se aplicam quando presente; H1 e H3 aplicam-se já.
- **PR 2 (Fatia B, Tasks 5–8):** análise periódica, casos, e-mails.
- **PR 3 (Fatia C, Tasks 9–12):** admin, ecrãs, `clientId` obrigatório, calibração, docs.
