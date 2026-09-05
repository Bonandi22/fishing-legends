# Auditoria do backend

Data: 2026-09-05 · Branch: `feature/task-06-backend-foundation`

Referências de código no formato `caminho:linha`.

## 1. Visão geral da arquitetura

O `backend/src/app.ts` é o composition root. Para cada módulo escolhe entre a
implementação PostgreSQL (`pgRepository.ts` / `pgService.ts`) e a implementação em
memória (`service.ts`) conforme `config.databaseUrl`. As rotas são finas e delegam
num serviço; a validação de entrada é feita com Zod na rota.

Isto está alinhado com `backend/docs/ARCHITECTURE.md` e é uma base sólida. Os
problemas estão nos detalhes de consistência, no caminho de migração e na cobertura
de testes.

### 1.1 Divergências face ao ARCHITECTURE.md

| ARCHITECTURE.md diz | Realidade |
|---|---|
| `POST /api/v1/auth/logout` a implementar | `authService.logout` existe (`auth/service.ts:78`) mas **não há rota** |
| Password com Argon2id ou equivalente | `scrypt` com parâmetros default do Node, sem registo de custo no hash (`auth/crypto.ts:7`) |
| "Login não revela se a conta existe" | Caminho rápido quando o utilizador não existe → oráculo de tempo (`auth/service.ts:44`) |
| "Revoke the token family on reuse detection" | Sem reuse detection, sem família de tokens; rotação é in-place (`auth/service.ts:66`) |
| Refresh token "stored only in an approved secure client mechanism" | Devolvido no corpo JSON (`auth/routes.ts:41`) |
| Tabela `refresh_tokens` com "reuse detection" | Não existe; o estado vive em `sessions` |
| Módulos "must not reach into another module's tables directly" | `fishing/pgService.ts:89` insere em `warehouse_fish` diretamente em vez de passar pelo serviço de inventário |
| `requestId` na forma de erro | O handler central não injeta `requestId` (`http/errors.ts:18`) |

## 2. Migrações e schema — **bloqueador**

### 2.1 Não há runner de migração funcional

- `backend/migrations/0000_foundation.sql` cria `schema_migrations`, mas **nada
  aplica os ficheiros SQL nem escreve nessa tabela**.
- `npm run backend:db:migrate` = `drizzle-kit migrate`, que aplica migrações da
  pasta `out` do `drizzle.config.ts` = `./backend/migrations/generated` — pasta que
  **não existe** (nunca se correu `drizzle-kit generate`).
- Os 13 ficheiros `backend/migrations/*.sql` foram escritos à mão e **não têm o
  journal `meta/_journal.json`** que o `drizzle-kit migrate` exige.

Consequência: hoje não existe forma suportada de levar um PostgreSQL vazio ao
schema que o código espera, a não ser aplicar os `.sql` manualmente e à mão.

**Decisão a tomar**: (a) adotar `drizzle-kit generate` como fonte única e descartar
os `.sql` à mão, ou (b) manter os `.sql` à mão e escrever um runner mínimo que
itere a pasta e registe em `schema_migrations`. O `ARCHITECTURE.md:102` diz que "os
SQL commitados permanecem a fonte revisável", o que aponta para (b).

### 2.2 `db/schema.ts` diverge das migrações SQL

O schema Drizzle é usado em runtime (queries) e seria a fonte para `drizzle-kit
generate`. Diferenças detetadas:

| Objeto | Migração SQL | `db/schema.ts` |
|---|---|---|
| `wallet_transactions` | `UNIQUE (user_id, idempotency_key)` (`0004`) | **sem** `uniqueIndex` (`db/schema.ts:94`) |
| `fishing_sessions.status` | `CHECK IN ('open','completed','expired')` (`0003`) | `varchar(16)` sem enum/check (`db/schema.ts:39`) |
| `player_progress` checks | `level 1..30`, `coins >= 0`, `nets 0..10`, multiplier `IN (0,2,4)` (`0002/0007/0008`) | nenhum check no schema |
| `seasons` índice parcial | `UNIQUE (status) WHERE status='active'` (`0012`) | ausente no schema |
| `wallets.balance` | `CHECK (balance >= 0)` | ausente no schema |

Enquanto se usarem os `.sql` à mão, o runtime está protegido pelos constraints do
DB. Mas assim que alguém correr `drizzle-kit generate`, a migração gerada vai
**divergir** e potencialmente propor `DROP CONSTRAINT`. Precisa ser reconciliado
antes de qualquer deploy.

### 2.3 Idempotência depende de constraint ausente no schema

`economy/pgRepository.ts:18`, `:40`, `:62` e `inventory/pgRepository.ts:38` fazem
"check-then-insert" da linha de `wallet_transactions` por `idempotencyKey` dentro
da transação. Sob concorrência, a corretude depende **apenas** do
`UNIQUE (user_id, idempotency_key)` da migração `0004` (a segunda transação falha
no insert). Como esse unique não está em `db/schema.ts`, é frágil a uma
regeneração. Além disso o erro do constraint não é mapeado em `http/errors.ts` →
sai como `500 INTERNAL_ERROR` em vez de algo idempotente/limpo.

## 3. Consistência memória vs PostgreSQL

Os dois caminhos deviam ter o mesmo comportamento observável. Não têm:

| Área | Memória | PostgreSQL |
|---|---|---|
| Conclusão de pesca | **não** aplica XP/nível/`totalFishCaught` (`fishing/service.ts:66`); só chama `onCatch` | aplica progresso e escreve no armazém em transação (`fishing/pgService.ts:93`) |
| Progresso do jogador | `players/memoryRepository.ts:12` devolve sempre `level 1, xp 0, coins 0`, ignorando qualquer captura | lê `player_progress` real |
| Leaderboard | só o próprio jogador, uma entrada (`leaderboard/service.ts:24`) | todos os jogadores persistidos |
| `economy` `debit` | existe na memória (`economy/service.ts:50`) | **não existe** no PG; nem está no tipo `EconomyService` |
| Multiplicador — reuso de idempotency key com outro `type` | memória volta a cobrar (`economy/service.ts:80`, condição `existing && current`) | idem (`economy/pgRepository.ts:68`, `existing[0] && existingExpiry`) |
| Colocar no aquário | memória não persiste, devolve item efémero (`inventory/service.ts:52`) | remove do armazém + insere no aquário em transação |

O caminho em memória é "dev/teste", mas como **é o único testado**, os testes dão
uma falsa sensação de cobertura (ver `quality-review.md`).

## 4. Notas por módulo

### auth (`backend/src/auth/`)
- `app.ts:74` faz `void registerAuthRoutes(app, authService)` — a única rota
  registada de forma assíncrona e não aguardada. Funciona porque o registo é
  síncrono, mas é inconsistente com os outros módulos e frágil.
- `schemas.ts:6` — `username` regex `^[a-zA-Z0-9_]+$` sem normalização de
  maiúsculas/minúsculas; o unique de DB é case-sensitive → `Angler` e `angler`
  coexistem. `ARCHITECTURE`/`PROJECT_MEMORY` pedem "normalização/unicidade de username".
- `pgRepository.ts:83` `rotateSession` só roda se `expiresAt > now` e `revokedAt IS
  NULL` — bom. Mas não deteta reutilização do token antigo.
- Sem rota de `logout`; `authService.logout` é código morto.
- `crypto.ts:26` `hashToken` = SHA-256 sem sal — aceitável para tokens de alta
  entropia (padrão), manter.

### players (`backend/src/players/`)
- `routes.ts:8` reparse manual de `Bearer` — repetido em ~9 rotas. Falta um
  `preHandler`/decorator de autenticação partilhado.
- `memoryRepository.ts` não reflete progresso — ver §3.

### catalog (`backend/src/catalog/`)
- Sólido: valida FISH/LOCATIONS com Zod ao arrancar, deteta ids duplicados e
  referências partidas (`service.ts:39`). Versão explícita `local-v1`.
- Não há persistência de versões de catálogo (planeado, ok).

### fishing (`backend/src/fishing/`)
- **O outcome ignora a raridade.** `pgService.ts:69` e `service.ts:62` escolhem
  `available[Math.floor(Math.random() * available.length)]` — uniforme. Todo o
  sistema `RARITY_CONFIG` / `getNormalizedRarityWeights` / `rollFish` de
  `src/game/fishingLogic.ts` é ignorado. Um jogador tem a mesma probabilidade de
  tirar um peixe `cosmic` (chance 0.002 no cliente) e um `common` (0.50).
- `xpForLevel` (`pgService.ts:9`) é reimplementado em vez de importar
  `getXpForLevel` de `src/game/types.ts` (valores coincidem hoje — risco de
  divergirem).
- Sessão não expira: `status` tem `'expired'` no CHECK mas nada o define. Sem TTL,
  sem limite de frequência.
- Sem `Math.random` seedado nem auditoria do sorteio → não reproduzível para
  antifraude.

### economy (`backend/src/economy/`)
- `EconomyService` (`service.ts:11`) declara `getBalance/credit/purchaseNets/
  purchaseMultiplier` mas não `debit`; a memória implementa `debit`, o PG não.
  Não há endpoint que gaste moedas via `debit` — só compras específicas.
- Preços/limites server-side hard-coded (`5000`, `3000/6000`, limite 10) — coincidem
  com `NET_PRICE`/`MULTIPLIER_COST*` de `src/game/types.ts` mas duplicados.
- `purchaseMultiplier` não valida se já há um multiplicador ativo do mesmo tipo
  (sobrescreve silenciosamente, sem reembolso nem bloqueio).

### inventory (`backend/src/inventory/`)
- Valor de venda = `Math.max(1, Math.floor(fish.xp / 2))` (`service.ts:35`,
  `pgRepository.ts:36`). O cliente usa `FISH_COIN_VALUE` por raridade
  (`src/game/types.ts:138`) — valores completamente diferentes. Ao ligar o
  frontend, os números não vão bater.
- `sell` vende **todo** o armazém de uma vez; não há venda individual nem respeito
  ao `WAREHOUSE_LIMIT = 15` (nada impede o armazém de crescer sem limite no
  servidor).
- `placeInAquarium` PG (`pgRepository.ts:64`) não valida capacidade do setor.

### migration (`backend/src/migration/`)
- `service.ts:2` importa `FISH, LOCATIONS` de `../../../src/game/data.js` e `MAX_LEVEL`
  de `src/game/types` — acoplamento cross-tree ok mas aumenta a superfície de build.
- `pgRepository.ts:28` importa capturas do save local com `xp: 0` fixo e não credita
  moedas — o `result.player.coins` validado é ignorado no import (só level/xp/
  totalFishCaught/unlocks são fundidos). Pode ser intencional (recomputar), mas não
  está documentado nem testado.
- `import` é idempotente por `local_save_migrations UNIQUE(user_id)` + key na rota.

### leaderboard (`backend/src/leaderboard/`)
- `pgRepository.ts:31` `total` = `entries.length < limit ? offset + entries.length : null`
  — semântica estranha; devia ser um `COUNT(*)` ou omitido.
- `score` (`level*1000 + fish*100 + xp`) duplicado em memória e PG, sem versão de
  regras. `PROJECT_MEMORY` quer "peso máximo, XP, moedas, peixes raros" — ainda não.

### rewards (`backend/src/rewards/`)
- **Exploit**: `routes.ts:12` aceita `day` do cliente (`z.number().int().min(1).max(7)`)
  e `rewardForDay` devolve até 1500 moedas para o dia 7. Um cliente pede sempre
  `day: 7` e recebe o prémio máximo diariamente. O dia da streak tem de ser
  **calculado no servidor** a partir do histórico de claims.
- `todayUtc()` fixa o dia em UTC — decisão de timezone não documentada; jogadores
  em fusos negativos "viram o dia" a meio da tarde.
- PG (`pgRepository.ts:26`) insere `wallet_transactions` com
  `idempotencyKey: daily-reward:${claimDate}` — bom, colide com o unique se repetir.

### seasons (`backend/src/seasons/`)
- **Bypass de auth**: `routes.ts:13` só verifica que existe `Authorization: Bearer …`
  e faz `void auth;` — **nunca valida o token**. Qualquer string passa. Baixo
  impacto (info de temporada) mas é uma rota "protegida" que não protege nada.
- Memória (`service.ts:19`) devolve uma temporada que acaba em `2099`.

### security (`backend/src/security/http.ts`)
- Ver `security-review.md` — `X-Forwarded-For` spoofável, CORS default permissivo,
  rate limit in-process, `OPTIONS` responde antes do rate limit (ok).

### http/errors (`backend/src/http/errors.ts`)
- `:23` — lista gigante de códigos de erro num único `if` com `.includes()` e uma
  cadeia de ternários para o status. Frágil e difícil de manter: cada novo erro de
  domínio exige editar dois pontos desta função. Melhor: um `Map<code, status>` ou
  uma classe de erro de domínio com `statusCode`.
- Mensagem genérica "Authentication request could not be completed" para erros que
  nada têm a ver com auth (ex.: `WAREHOUSE_EMPTY`, `INVALID_AQUARIUM_SECTOR`).

## 5. Pontos fortes a preservar

- Isolamento de módulos e contrato duplo memória/PG.
- Zod em todas as entradas HTTP; `config/env.ts` valida o ambiente ao arrancar.
- Transações reais nos caminhos PG de economia/inventário/pesca/recompensas.
- Idempotência desenhada para compras, vendas, recompensas, captura e importação.
- Migrações com FKs `ON DELETE CASCADE`, checks e índices desde o início.
- Produção recusa arrancar sem `DATABASE_URL` (`app.ts:43`).
- Nenhum secret commitado; `.env.example` sem valores reais.
