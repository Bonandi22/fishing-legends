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

### M1 · `GET /api/v1/seasons/current` não valida o token · esforço P
`security-review.md` S2. `void auth;` na rota.
**Ajuste**: validar o access token como nas outras rotas (ou via preHandler — M6).

### M2 · Oráculo de tempo no login · esforço P
`security-review.md` S3. Caminho rápido quando o email não existe.
**Ajuste**: `verifyPassword` sempre (contra hash dummy) antes de devolver
`INVALID_CREDENTIALS`.

### M3 · CORS default reflete qualquer origem · esforço P
`security-review.md` S4. `CORS_ORIGINS` vazio → eco de `Origin`.
**Ajuste**: sem config → negar/omitir ACAO. Adicionar `CORS_ORIGINS`,
`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` ao `.env.example`. Adicionar
`ACCESS_TOKEN_SECRET` com placeholder que passe o `min(32)` em dev.

### M4 · Valores de venda/economia divergem entre servidor e cliente · esforço M
`backend-review.md` inventory/economy. Servidor: `Math.floor(fish.xp/2)`; cliente:
`FISH_COIN_VALUE` por raridade. Ao ligar o frontend os números não batem.
**Ajuste**: decidir a fonte de verdade (servidor) e alinhar — idealmente um módulo
de regras de economia partilhado. Inclui `WAREHOUSE_LIMIT` não aplicado no servidor
e ausência de venda individual.

### M5 · Comportamento memória vs PostgreSQL diverge · esforço M
`backend-review.md` §3. Pesca em memória não aplica XP/nível; `players` em memória
devolve progresso fixo; leaderboard em memória só o próprio; `debit` só na memória.
**Ajuste**: igualar o comportamento observável, ou marcar explicitamente a memória
como "não fidedigna" e nunca a usar para asserções de teste (reforça B3).

### M6 · Autenticação re-implementada por rota · esforço M
`security-review.md` S8 / `quality-review.md` §4. ~9 rotas reparsando `Bearer`.
**Ajuste**: `preHandler` Fastify partilhado que valida o token e popula
`request.userId`; rotas passam a lê-lo. Remove a classe de erro do M1.

### M7 · Sem reuse detection / família de refresh tokens · esforço G
`security-review.md` S5. Necessário antes de o frontend ligar auth.
**Ajuste**: tabela de refresh tokens encadeados (`replaced_by`, `revoked_at`),
revogação em cascata ao detetar uso de token já rotacionado.

### M9 · Venda do armazém: retry idempotente falha após esvaziar · esforço P
Descoberto ao escrever os testes de integração de inventário (2026-09-05).
`inventory/pgRepository.ts` `sell` e `inventory/service.ts` `sell` verificam
`WAREHOUSE_EMPTY` **antes** de consultar a `idempotencyKey`. Fluxo real: cliente
vende, resposta perde-se na rede, cliente repete com a mesma chave → o armazém já
está vazio → recebe `WAREHOUSE_EMPTY` para uma operação que **teve sucesso** (moedas
já creditadas).
**Ajuste**: consultar a transação por `idempotencyKey` primeiro; se existir,
devolver o resultado gravado antes de qualquer verificação de estado.

### M8 · `openapi.json` desatualizado / sem teste de contrato · esforço M
`quality-review.md` §2.4. Documento tem 2 rotas; API tem ~20.
**Ajuste**: gerar OpenAPI a partir dos schemas Zod (ex.: `fastify-type-provider-zod`
+ `@fastify/swagger`) ou, no mínimo, um teste que falhe quando uma rota registada
não está no documento.

---

## Baixo

### L1 · `http/errors.ts` — mapa de erros frágil · esforço M
`backend-review.md` http/errors. `if` gigante + ternários; mensagens de "auth"
para erros de domínio.
**Ajuste**: `Map<code, {status, message}>` ou classe `DomainError` com `statusCode`.

### L2 · Colisão de idempotency key → 500 · esforço P
`security-review.md` S9. Constraint unique não mapeada.
**Ajuste**: apanhar a violação e devolver o resultado idempotente / `409` limpo.

### L3 · Rota `logout` em falta · esforço P
`backend-review.md` auth. `authService.logout` é código morto; `ARCHITECTURE`
lista `POST /api/v1/auth/logout`.
**Ajuste**: adicionar a rota (revoga a sessão atual).

### L4 · Normalização de username · esforço P
`backend-review.md` auth. Unique case-sensitive → `Angler`/`angler` coexistem.
**Ajuste**: normalizar (lowercase ou `citext`/índice funcional) e validar unicidade.

### L5 · Parâmetros de hashing não versionados · esforço M
`security-review.md` S10. `scrypt` sem N/r/p no encoded hash; `ARCHITECTURE` pede
Argon2id.
**Ajuste**: Argon2id (`@node-rs/argon2`) ou incluir custo no hash + verificação.

### L6 · Testes unitários de domínio no backend · esforço P
`quality-review.md` §2.2. `applyProgress`, `validateLocalSave`, `rewardForDay`,
`score` — funções puras sem teste.

### L7 · Fishing session sem expiração / limite de frequência · esforço M
`backend-review.md` fishing. `status='expired'` no CHECK mas nunca usado.
**Ajuste**: TTL na sessão + rejeição de conclusão tardia; base para antifraude.

### L8 · `fishing` insere em `warehouse_fish` diretamente · esforço P
`backend-review.md` fishing. Cruza fronteira de módulo (`ARCHITECTURE.md:42`).
**Ajuste**: passar pelo serviço de inventário (dentro da mesma transação).

### L9 · Higiene de repositório · esforço P
`quality-review.md` §4. `example.test.ts` placeholder; `bun.lock`+`bun.lockb`+
`package-lock.json` coexistem; Browserslist desatualizado.

### L10 · `bodyLimit` explícito no Fastify · esforço P
`security-review.md` threat model. Definir `bodyLimit` (o default é 1 MB; o
payload de migração de save pode ser grande — dimensionar conscientemente).

### L11 · `leaderboard.total` com semântica estranha · esforço P
`backend-review.md` leaderboard. Trocar por `COUNT(*)` ou omitir.

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
4. **M1, M2, M3, M6, M9** (segurança de rotas + CORS + idempotência da venda) —
   vários são P e M6 remove M1. **← próximo**
5. **M4, M5** (consistência de economia e memória/PG).
6. **M7, M8** (refresh tokens, OpenAPI) — antes de o frontend ligar auth.
7. **L1–L11** conforme se toca em cada módulo.
