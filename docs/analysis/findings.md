# Achados consolidados e ajustes

Data: 2026-09-05 · Branch: `feature/task-06-backend-foundation`

Lista priorizada. Cada item: **severidade** (bloqueador / alto / médio / baixo),
**esforço** (P/M/G), origem e correção proposta. IDs cruzam com os outros documentos.

Legenda esforço: P ≈ < 1h · M ≈ 1–4h · G ≈ > meio dia (ou precisa de decisão).

---

## Bloqueadores — resolver antes de ligar o frontend ao backend

### B1 · Sem runner de migração funcional · esforço G · ✅ feito 2026-09-05
`backend-review.md` §2.1.
**Decisão tomada**: opção (b) — SQL à mão como fonte, runner próprio.
**Feito**: `backend/src/db/migrate.ts` (helpers puros `toMigrationVersion` /
`selectPendingMigrations` + `runMigrations` que aplica cada `.sql` pendente em
`BEGIN/COMMIT` e regista em `schema_migrations`). `package.json`:
`backend:db:migrate` → `tsx backend/src/db/migrate.ts`. Testes unitários dos
helpers em `migrate.test.ts` (4). **Falta**: teste de integração contra PostgreSQL
real (faz parte de B3); validação manual do utilizador (comandos no resumo).

### B2 · `db/schema.ts` diverge das migrações SQL · esforço M · ✅ feito 2026-09-05
`backend-review.md` §2.2.
**Feito**: `db/schema.ts` reconciliado com os 13 `.sql` — todos os `check()`,
`uniqueIndex`/`index`, o índice parcial `seasons_active_unique WHERE status='active'`,
`daily_reward_claims.claim_date` corrigido de `varchar` para `date`, e o model
`schema_migrations` adicionado. Confirmado com `npm run backend:db:generate`: o SQL
gerado bate com as migrações à mão (única divergência cosmética: nomes das FKs —
Drizzle usa `_users_id_fk`, o SQL à mão deixa o Postgres auto-nomear `_fkey`;
irrelevante em runtime). `drizzle-kit generate --check` no CI fica para B4.

### B3 · Zero testes de integração PostgreSQL · esforço G · ✅ feito 2026-09-05
`quality-review.md` §2.1.
**Feito**: suíte de integração separada (`vitest.integration.config.ts`,
`npm run test:integration`, glob `*.integration.test.ts` excluído do `npm test`).
Harness `backend/src/testing/pgHarness.ts` (migra uma vez, trunca entre testes).
**35 testes, verdes contra PostgreSQL 16 real** (2026-09-05):
- `db/migrate.integration.test.ts` — versões registadas, no-op na 2ª corrida,
  tabelas criadas, check constraint ativa.
- `auth/pgRepository.integration.test.ts` — createUser transacional (user+profile+
  progress), email duplicado, rotação/revogação de sessão.
- `economy/pgRepository.integration.test.ts` — idempotência de crédito, montante
  inválido, compra de redes com/sem fundos + idempotência, guarda de saldo negativo.
- `fishing/pgService.integration.test.ts` — sessão idempotente, conclusão
  transacional (armazém + progresso), conclusão repetida sem duplicar captura,
  rejeição de sessão de outro jogador, localização bloqueada/inexistente.
- `inventory/pgRepository.integration.test.ts` — adicionar/listar por utilizador,
  venda atómica + crédito, armazém vazio, transferência para setor do aquário,
  item inexistente, setor inválido, isolamento entre utilizadores.
- `rewards/pgRepository.integration.test.ts` — claim único por dia UTC + ledger,
  repetição sem re-creditar, isolamento entre utilizadores.
- `migration/pgRepository.integration.test.ts` — preview sem persistir, import
  transacional (armazém + aquário + merge de progresso), progresso nunca desce,
  import único por utilizador.

Um teste documenta o gap M9 em vez de o corrigir (a venda do armazém). O gap A1
já foi corrigido — ver A1.

### B4 · CI não cobre o backend · esforço P · ✅ feito 2026-09-05
`quality-review.md` §3.
**Feito**: `code-review.yml` — job `quality` ganhou o step `backend:typecheck`;
novo job `integration` com `services: postgres:16`, corre `backend:db:migrate` +
`test:integration`. `drizzle-kit generate --check` fica pendente (drizzle-kit
antigo não tem check de drift sem escrever ficheiro; reavaliar).

---

## Alto

### A1 · Recompensa diária escolhida pelo cliente · esforço M · ✅ feito 2026-09-05
`security-review.md` S6 / `backend-review.md` rewards.
**Feito**: `resolveRewardDay(lastClaim, today)` puro em `rewards/service.ts` —
sem histórico ou dia perdido → 1; último claim ontem (UTC) → dia+1 com wrap 7→1.
`claim` (PG + memória) deixou de aceitar `requestedDay`: lê o último claim do
utilizador e deriva o dia. `POST /api/v1/rewards/daily/claim` já não valida `day`
no corpo (um `day` enviado é ignorado). 6 testes unitários de `resolveRewardDay` +
8 de integração (streak avança, wrap, reset, isolamento por utilizador, dia gravado
na linha). Resposta mantém `{ claimed, day, amount, transactionId, balance }`.

### A2 · `X-Forwarded-For` derrota o rate limiting · esforço P · ✅ feito 2026-09-05
`security-review.md` S1.
**Feito**: `Fastify({ trustProxy: config.trustProxy })` em `app.ts`; `clientKey`
em `security/http.ts` usa `request.ip` e nunca lê `X-Forwarded-For` diretamente.
Nova env `TRUST_PROXY` (`parseTrustProxy` em `config/env.ts`): default `false`
(header ignorado, `request.ip` = endereço do socket), `true`, ou lista de
CIDRs/endereços de proxy a confiar. Adicionada a `.env.example` e
`.env.docker.example`. Testes: 3 unitários de `parseTrustProxy` + 2 de
comportamento (`security/http.test.ts` — spoof de XFF não escapa ao limite com
default; com `trustProxy: true` os buckets separam por IP encaminhado).

### A3 · Sorteio de captura ignora a raridade · esforço M · ✅ feito 2026-09-05
`security-review.md` S7.
**Feito**: `backend/src/fishing/roll.ts` — `normalizedRarityWeights` +
`rollCatch(fish, playerLevel, random?)`, port fiel de `getNormalizedRarityWeights`
e do caminho não-lucky de `rollFish`. Importa `RARITY_CONFIG` de `src/game/types`
(fonte única das odds); o algoritmo de seleção é duplicado (a versão do frontend
está acoplada ao seu próprio tipo `Fish` e a `getFishForLocation`).
`fishing/service.ts` (memória) e `fishing/pgService.ts` chamam
`rollCatch(available, profile.level)` em vez do `Math.random` uniforme. A versão do
ruleset já era registada na sessão (`rulesetVersion` = versão do catálogo). 8 testes
unitários (soma = 1, raro < comum, roll→0 dá o mais raro, roll→1 dá o mais comum,
peso uniforme no intervalo, não-uniforme em 4000 amostras); RNG injetável.
**Fora do âmbito**: RNG seedado/auditável (L7); lucky mode server-side
(multiplicadores não estão ligados à conclusão de pesca).

---

## Médio

### M1 · `GET /api/v1/seasons/current` não valida o token · esforço P · ✅ feito 2026-09-05
`security-review.md` S2. Era `void auth;` na rota.
**Feito**: a rota passou a usar `{ preHandler: app.requireAuth }` (M6). Teste em
`app.test.ts`: sem header → 401; `Bearer <inválido>` → 401 (antes 200). Smoke no
servidor real confirmou.

### M2 · Oráculo de tempo no login · esforço P · ✅ feito 2026-09-05
`security-review.md` S3.
**Feito**: `auth/service.ts` calcula um `decoyPasswordHash` uma vez no arranque
(`hashPassword(...)`) e `login` faz sempre `verifyPassword(input.password,
user?.passwordHash ?? decoy)` antes de rejeitar. Teste de tempo em
`auth/service.test.ts`: login com email inexistente demora comparável ao login
com password errada (antes era ~instantâneo).

### M3 · CORS default reflete qualquer origem · esforço P · ✅ feito 2026-09-05
`security-review.md` S4.
**Feito**: `security/http.ts` — sem allowlist configurada, nenhum
`Access-Control-Allow-Origin` é emitido (o browser aplica same-origin); uma origem
arbitrária nunca é refletida. Com allowlist: eco das permitidas, `*` para wildcard,
403 `ORIGIN_NOT_ALLOWED` para as restantes. `CORS_ORIGINS`, `RATE_LIMIT_MAX`,
`RATE_LIMIT_WINDOW_MS` adicionados ao `.env.example`. 3 testes em
`security/http.test.ts`.
**Pendente menor**: `.env.example` ainda tem `ACCESS_TOKEN_SECRET=` vazio (falha o
`min(32)` em dev) — deixar assim obriga a definir um secret conscientemente.

### M4 · Valores de venda/economia divergem entre servidor e cliente · esforço M · ✅ feito 2026-09-05
`backend-review.md` inventory/economy.
**Feito**: `backend/src/economy/pricing.ts` — `fishSaleValue(rarity)` (usa
`FISH_COIN_VALUE`), `netUnitPrice` (`NET_PRICE`), `multiplierPrice(power)`
(`MULTIPLIER_COST`/`_4X`), todos importados de `src/game/types`. `inventory`
(venda) e `economy` (redes, multiplicadores) deixaram de usar `xp/2` e números
hard-coded. 3 testes unitários + o teste de integração de venda passou a esperar
o valor por raridade.
**Ainda em aberto** (não é M4 estrito): `WAREHOUSE_LIMIT` não aplicado no servidor,
sem venda individual — registar como L-item se relevante ao ligar o frontend.

### M5 · Comportamento memória vs PostgreSQL diverge · esforço M · 🟡 parcial 2026-09-05
`backend-review.md` §3.
**Feito**: `backend/src/players/progress.ts` `applyCatchProgress` (importa
`getXpForLevel`/`MAX_LEVEL` de `src/game/types`) — fonte única, usada pelo
`pgService` (removida a cópia local `applyProgress`/`xpForLevel`) e pelo repositório
de memória. `createMemoryPlayerRepository` passou a ser stateful e expõe
`recordCatch`; a conclusão de pesca em memória chama-o → XP/nível/`totalFishCaught`
sobem como no PostgreSQL. `app.test.ts` verifica isso. `debit` morto removido do
serviço de economia em memória.
**Ainda diverge** (só sem `DATABASE_URL`, sem impacto em testes): leaderboard em
memória só expõe o próprio jogador; aquário em memória não persiste entre chamadas.
Aceitável como dev-only enquanto o frontend não liga.

### M6 · Autenticação re-implementada por rota · esforço M · ✅ feito 2026-09-05
`security-review.md` S8 / `quality-review.md` §4.
**Feito**: `backend/src/auth/middleware.ts` — `createRequireAuth(authService)`
devolve um `preHandler` que valida o `Bearer` e popula `request.userId` (com
augmentação de tipos de `FastifyRequest`/`FastifyInstance`). `app.ts` faz
`app.decorateRequest('userId', '')` + `app.decorate('requireAuth', ...)`. As 8
funções `register*Routes` (players, economy, inventory, fishing, leaderboard,
rewards, migration, seasons) deixaram de receber `authService`; cada rota
autenticada usa `{ preHandler: app.requireAuth }` e lê `request.userId`. Removidos
os helpers `getUserId`/`userId` duplicados. Rotas públicas (`/health`, `/ready`,
`/openapi.json`, `/api/v1/auth/*`, `/api/v1/catalog`) ficam sem preHandler.
Verificado: 58 testes unitários + 39 de integração verdes; smoke no servidor real
(`/me`, `/seasons/current`, `/catalog`).

### M7 · Sem reuse detection / família de refresh tokens · esforço G · ✅ feito 2026-09-05
`security-review.md` S5.
**Feito**: migração `0013_refresh_tokens.sql` — tabela `refresh_tokens(id,
session_id→sessions, token_hash unique, replaced_by→self, replaced_at, revoked_at)`;
backfill dos hashes atuais; `sessions.refresh_token_hash` removido. A `sessions` é a
família. `AuthRepository` reformulado: `createSession({userId, tokenHash, expiresAt})`,
`rotateRefreshToken({presentedHash, nextHash, nextExpiresAt})` → `{outcome:
'rotated'|'reuse_detected'|'invalid'}`, `revokeSession`. Reuse (token já
`replaced_at`/`revoked_at`, ou sessão revogada) → revoga todos os tokens da sessão +
a sessão, e o serviço lança `REFRESH_TOKEN_REUSED` (401). Impl. PG (transacional) e
memória. Testes: 4 de integração (rotação encadeada, token desconhecido, reuse
revoga a família, revokeSession bloqueia) + 1 HTTP em `app.test.ts`. Smoke no
servidor real confirmou. `drizzle-kit generate` valida o schema.

### M9 · Venda do armazém: retry idempotente falha após esvaziar · esforço P · ✅ feito 2026-09-05
Descoberto ao escrever os testes de integração de inventário.
**Feito**: `sell` (PG e memória) consulta a idempotência **antes** de qualquer
verificação de estado. Replay devolve `{ ..., replayed: true }` com a transação e o
valor gravados, sem lançar e sem re-creditar; o caminho normal devolve
`replayed: false`. PG não recupera o `sold` no replay (armazém já vazio) → devolve
`0`; a memória guarda o resultado em `settledSales` e devolve a contagem original.
Teste de integração de inventário reescrito (era o "KNOWN GAP").

### M8 · `openapi.json` desatualizado / sem teste de contrato · esforço M
`quality-review.md` §2.4. Documento tem 2 rotas; API tem ~20.
**Ajuste**: gerar OpenAPI a partir dos schemas Zod (ex.: `fastify-type-provider-zod`
+ `@fastify/swagger`) ou, no mínimo, um teste que falhe quando uma rota registada
não está no documento.

---

## Baixo

### L1 · `http/errors.ts` — mapa de erros frágil · esforço M · ✅ feito 2026-09-05
**Feito**: `if`+ternários → `DOMAIN_ERRORS` (`Record<code, {status, message}>`); cada
erro devolve uma mensagem segura e precisa (fim do "Authentication request could not
be completed" fora de contexto). `INVALID_WALLET_AMOUNT`/`INVALID_NET_QUANTITY`
corrigidos para 400; `NO_FISH_AVAILABLE` adicionado (422). `errors.test.ts`.

### L2 · Colisão de idempotency key → 500 · esforço P · ✅ feito 2026-09-05
`security-review.md` S9.
**Feito**: o handler deteta `23505` (no erro ou no `.cause`); se o constraint contém
`idempotency` → `409 IDEMPOTENCY_CONFLICT` (cliente repete e lê o resultado
gravado); outros `23505` → `409 RESOURCE_CONFLICT`. Testado em `errors.test.ts`.

### L3 · Rota `logout` em falta · esforço P · ✅ feito 2026-09-05
`backend-review.md` auth.
**Feito**: o access token passa a carregar `sid` (session id); `verifyAccessToken`
devolve `{ userId, sessionId }`; `requireAuth` popula `request.sessionId`. Nova rota
`POST /api/v1/auth/logout` (`preHandler: requireAuth`) → `service.logout` revoga a
sessão (a cadeia de refresh tokens) → 204. Teste em `app.test.ts` (após logout, o
refresh do token original → 401). O access token JWT continua válido até expirar
(sem denylist — fora do âmbito).

### L4 · Normalização de username · esforço P · ✅ feito 2026-09-06
`backend-review.md` auth.
**Feito**: migração `0014` — `user_profiles_username_unique` recriado como índice
funcional `UNIQUE (lower(username))` (a casing de exibição preserva-se). `createUser`
(PG e memória) deteta a colisão e lança `USERNAME_TAKEN` (409, novo código);
`ACCOUNT_ALREADY_EXISTS` também é derivado da violação do unique de email no PG.
Helpers de erro pg movidos para `backend/src/db/pgErrors.ts` (`isUniqueViolation`).
Testes: `app.test.ts` (memória) + integração (`Angler` vs `angler` → `USERNAME_TAKEN`).

### L5 · Parâmetros de hashing não versionados · esforço M · ✅ feito 2026-09-06
`security-review.md` S10.
**Feito**: `hashPassword` usa Argon2id via `@node-rs/argon2` (string PHC com
`m=19456,t=2,p=1` embutido). `verifyPassword` aceita `$argon2*` **e** o formato
`scrypt$...` legado. `needsRehash(encoded)` → `login` re-hash transparente para
Argon2id quando o hash é legado (`updatePasswordHash` no `AuthRepository`, PG +
memória). O decoy hash de timing (M2) passa a ser Argon2. Testes: `crypto.test.ts`
(round-trip Argon2, verify de scrypt legado, `needsRehash`, hash malformado) +
integração (hash scrypt semeado → login → hash atualizado para `$argon2id$`).
Nota: `@node-rs/argon2` traz binários pré-compilados (musl para o Alpine, gnu para
o CI) — ambos no `package-lock.json`.

### L6 · Testes unitários de domínio no backend · esforço P · ✅ feito 2026-09-06
`quality-review.md` §2.2.
**Feito**: `players/progress.test.ts` (`applyCatchProgress` — M5), `rewards/service.test.ts`
(`resolveRewardDay` — A1), `fishing/roll.test.ts` (raridade — A3),
`config/env.test.ts` (A2), `economy/pricing.test.ts` (M4), `migration/service.test.ts`
(`validateLocalSave` — 6 casos). Score do leaderboard coberto pela integração.

### L7 · Fishing session sem expiração / limite de frequência · esforço M · ✅ feito 2026-09-06
`backend-review.md` fishing.
**Feito**: `backend/src/fishing/session.ts` — `FISHING_SESSION_TTL_MS` (5 min),
`isSessionExpired(createdAt, now)`, `sessionExpiresAt`. `complete` (PG e memória)
rejeita sessões fora da janela: marca `status='expired'` e lança
`FISHING_SESSION_EXPIRED` (410). `toSession` expõe `expiresAt`. Sem migração
(deriva de `created_at`). Testes: `session.test.ts` (pure), `service.test.ts`
(memória, `now` injetável), integração (backdate de `created_at` → 410 + status
gravado + sem captura). **Limite de frequência** fica para o módulo de antifraude
(Fase 11).

### L8 · `fishing` insere em `warehouse_fish` diretamente · esforço P · ✅ feito 2026-09-06
`backend-review.md` fishing. Cruzava a fronteira de módulo (`ARCHITECTURE.md:42`).
**Feito**: `backend/src/inventory/warehouse.ts` — `addWarehouseFish(executor, input)`
onde `executor` é a `Database` **ou** uma transação aberta. `fishing/pgService`
chama-o passando o seu `tx` (mantém a atomicidade); `inventory/pgRepository.addCatch`
também passa a usá-lo. O `fishing/pgService` deixou de importar a tabela
`warehouseFish`. Coberto pelos testes de integração de pesca/inventário existentes.
**Ajuste**: passar pelo serviço de inventário (dentro da mesma transação).

### L9 · Higiene de repositório · esforço P · ✅ feito 2026-09-06
`quality-review.md` §4.
**Feito**: `bun.lock`/`bun.lockb` removidos (commit `5784866`); `src/test/example.test.ts`
placeholder removido; `caniuse-lite` atualizado (`update-browserslist-db` — fim do
aviso de build, deps do `package.json` reordenados alfabeticamente pela ferramenta);
`.gitattributes` adicionado (`text=auto eol=lf` + assets binários).

### L10 · `bodyLimit` explícito no Fastify · esforço P · ✅ feito 2026-09-06
`security-review.md` threat model.
**Feito**: `bodyLimit: 128 KB` global; as rotas `/api/v1/migration/local/*` sobem
para 2 MB via `bodyLimit` de rota.

### L11 · `leaderboard.total` com semântica estranha · esforço P · ✅ feito 2026-09-06
`backend-review.md` leaderboard.
**Feito**: `total` = `COUNT(*)` de `player_progress` (era `entries.length < limit ?
offset + entries.length : null`). Memória já devolvia um número. Teste de integração
novo (`leaderboard/pgRepository.integration.test.ts`).

---

## Fora de escopo desta ronda (registado, não agir agora)

- Code splitting do bundle frontend (adiado no `PROJECT_MEMORY`).
- Vulnerabilidades transitivas de dependências (tarefa própria, sem `audit fix`).
- `@ts-nocheck` nos componentes 3D (redução gradual).
- Antifraude competitivo completo, snapshots de temporada, inscrição/fecho de
  Campeonato (fases 11–12 do roadmap).

---

## Ordem sugerida de execução

1. ~~**B2 → B1 → B4**~~ ✅ feito 2026-09-05.
2. ~~**B3**~~ ✅ feito 2026-09-05 (35 testes de integração; falta só expandir cobertura
   conforme novos módulos).
3. ~~**A1, A2, A3**~~ ✅ feito 2026-09-05.
4. ~~**M1, M2, M3, M6, M9**~~ ✅ feito 2026-09-05.
5. ~~**M4**~~ ✅ · ~~**M5**~~ 🟡 parcial (falta leaderboard/aquário em memória — dev-only) — 2026-09-05.
6. ~~**M7**~~ ✅ 2026-09-05. **M8** (OpenAPI dos schemas Zod). **← próximo**
7. **L1–L11** conforme se toca em cada módulo.
