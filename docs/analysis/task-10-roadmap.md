# Task 10 — roadmap até o frontend consumir o backend por completo

Data: 2026-09-08
Estado base: `main` @ `c25de67` — Task 10.1, 10.2 e 10.3 fatias 1–4 integradas.
Fonte de verdade contínua: [`PROJECT_MEMORY.md`](../../PROJECT_MEMORY.md). Este
documento organiza o que falta e propõe uma ordem; não substitui a aprovação
fatia a fatia.

---

## 1. Onde estamos

A Task 10 transforma o frontend (SPA + `localStorage`) num cliente de uma API
confiável. O modelo adotado a partir de 10.1 é o **blob de estado**:
`player_game_state` guarda o `PlayerState` inteiro; `GET/PUT /api/v1/me/state` com
`version` (concorrência otimista) + pull periódico de 45 s.

As operações que **concedem valor** passam por endpoints dedicados que correm a
regra pura de `src/game/stateRules.ts` sobre o blob numa transação
(`SELECT … FOR UPDATE`, tabela de replay `game_state_operations` com PK
`(user_id, idempotency_key, operation)`), devolvem `{ state, version }` e o cliente
faz `flush → chamada → applyServerResult`. Utilizador anónimo mantém a regra local.

**Já server-autoritativo:** venda do armazém · compra de rede · compra de
multiplicador · compra de skin (fatias 1–4).

### Endpoints do backend

| Estado | Endpoints |
|---|---|
| **Ligados e em uso** | `auth/*`, `GET /me`, `GET/PUT /me/state`, `POST /me/economy/{warehouse/sell, nets/purchase, multipliers/purchase, skins/purchase}`, `migration/local/*` |
| **Dormentes** (implementados, nunca ligados ao modelo do blob) | `GET /wallet`, `POST /economy/{nets,multipliers}/purchase` (módulo antigo, tabelas `wallet`/`player_progress`), `GET/POST /inventory/warehouse{,/sell}`, `GET/POST /inventory/aquarium/*`, `POST /fishing/sessions` + `/complete`, `GET /leaderboard`, `GET /seasons/current`, `POST /rewards/daily/claim` (modelo antigo), `GET /catalog` |

---

## 2. Inventário do que falta

### 2.1 Operações de jogo ainda 100 % no cliente

Todas vêm de `src/game/useGameState.ts` e são aplicadas só ao estado local (com o
`PUT /me/state` a persistir depois — sem validação server-side do ganho).

| Operação | Concede | Risco de confiança | Endpoint hoje |
|---|---|---|---|
| `catchFish` / `catchFishBatch` | moedas, XP, nível, coleção, armazém, `heaviestFish` | **Alto** — o sorteio (`rollFish`, raridade, peso) corre no cliente | `/fishing/sessions` (dormente, modelo antigo, ignora raridade) |
| Roleta (`addCoins`, `addSkin`, `addBoatSkin`, `addMultiplier`, `setLastRouletteDate`) | moedas, skins, multiplicador | **Alto** — RNG e prémios escolhidos no cliente; porta diária no cliente | nenhum |
| Roleta de skins (`spendCoins`, `addSkin`, `addBoatSkin`) | skins a troco de moedas | **Alto** — custo, pool e RNG no cliente | nenhum |
| Prendas diárias (`claimDailyGift`) | moedas / multiplicador / skin | **Alto** — `dailyGiftsDay`/`Week`/`LastClaim` e tabela de prémios no cliente | `/rewards/daily/claim` (dormente, modelo antigo) |
| `consumeNet` | consome 1 rede | Médio — o valor foi comprado no servidor, o consumo não | nenhum |
| `moveAquariumFishToSector` | — (organização do aquário) | Baixo — estado do blob, não explorável | `/inventory/aquarium` (dormente) |
| `equipSkin` / `equipBoatSkin` | — (cosmético) | Baixo — só permite equipar o que já possui | blob via `PUT` |
| `resetProgress` | limpa o progresso local | Baixo — servidor volta a sincronizar | — |
| Desbloqueio de mundo (`world` em `localStorage`) | acesso a mundos 2/3 | Baixo — porta por nível, re-verificada no cliente | — |

### 2.2 Ranking e temporadas

- `Ranking.tsx` usa `getLeaderboard()` de `src/game/leaderboard.ts` (`localStorage`),
  e `Index.tsx` chama `syncCurrentPlayer(player)` a cada mudança de estado.
- `GET /api/v1/leaderboard` existe mas lê `player_progress` — que o modelo do blob
  **não atualiza**. Ligar o ranking exige o servidor projetar o blob → campos de
  ranking (nível, capturas, XP).
- `GET /api/v1/seasons/current` existe, não é consumido, e (ver `security-review.md`)
  **não valida o token**.

### 2.3 Limpeza pendente

- Módulos backend dormentes: `backend/src/economy/` (wallet/nets/multipliers
  antigos), `backend/src/inventory/`, e o modelo antigo de `rewards`.
- `backend/src/fishing/service.ts` depende de `inventoryService.addCatch` — a
  limpeza de `inventory/` só pode vir **depois** de a pesca ser reescrita.
- Tabelas potencialmente órfãs após a migração: `player_progress`, `wallet`,
  `warehouse_fish`, `aquarium_fish`, `daily_reward_claims`. Remoção é destrutiva →
  migração própria, tardia, e só depois de confirmar zero uso.
- `openapi.test.ts` (lista de superfície esperada) a atualizar a cada mudança.

### 2.4 Dívida transversal (não bloqueia a Task 10)

| # | Item | Origem |
|---|---|---|
| D1 | Duplicação de domínio frontend/backend (`xpForLevel`, `MULTIPLIER_COST`, `FISH_COIN_VALUE`, custos) — consolidar num import único | `CLAUDE.md`, `backend-review.md` |
| D2 | Divergências de comportamento memória vs PostgreSQL em vários módulos | `backend-review.md` |
| D3 | Auth: remover o clear do `dbl_csrf` legado após 2026-10-07; decidir família de refresh tokens + reuse detection + rotação httpOnly | `security-review.md`, `cookies.ts` `TODO` |
| D4 | `GET /seasons/current` sem validação de token | `security-review.md` |
| D5 | Vulnerabilidades transitivas (`npm audit`: 1 low / 4 moderate / 15 high) — tarefa própria, sem `audit fix` automático | `quality-review.md` |
| D6 | CodeQL não obrigatório enquanto não houver GitHub Advanced Security | `PROJECT_MEMORY.md` |
| D7 | Bundle de produção ~1,6 MB JS — code splitting (assets 3D, rotas) | build |
| D8 | Componentes 3D com `@ts-nocheck` — reduzir gradualmente | `quality-review.md` |
| D9 | `npm run lint` aplica globals de browser também ao backend — impreciso | `CLAUDE.md` |
| D10 | `backend/migrations/generated/` (drift check do drizzle-kit) nunca corre no CI | `CLAUDE.md` |
| D11 | `.claude/` não está no `.gitignore` (settings local do harness) | esta sessão |
| D12 | `useGameState.ts` concentra orquestração — deve **encolher** ao longo da 10.3 | `PROJECT_MEMORY.md` |

---

## 3. Roadmap

Cada fatia segue o loop habitual: branch encadeada → TDD, commit por passo →
`tsc app` + `backend:typecheck` + `lint` (0 erros) + `npm test` + `build` +
`test:integration` + smoke real no browser (stack Docker, conta nova) → PR →
merge quando CI verde e sem comentários → `docs:` a registar em `PROJECT_MEMORY.md`.

### Fatia 5 — Roletas + prendas diárias  · **próxima**

**Muda de padrão:** o servidor passa a possuir o RNG e as portas temporais.
É a fatia que estabelece o padrão de "sorteio server-side" → merece brainstorming
+ mini-spec antes de codificar (não é repetição pura das fatias 2–4).

Endpoints propostos (todos `requireAuth` + CSRF + `Idempotency-Key`, aplicam ao
blob em transação, devolvem `{ state, version, reward }`):

- `POST /api/v1/me/economy/roulette/spin` — servidor verifica
  `lastRouletteDate != hoje` (relógio do servidor), sorteia o prémio de uma tabela
  server-side, aplica, marca a data. A porta diária é o guard real; a
  `Idempotency-Key` cobre o duplo-clique.
- `POST /api/v1/me/economy/skin-roulette/spin` — servidor cobra o custo
  (`spendCoins`), sorteia uma skin não possuída (vara ou barco), duplicado →
  devolve moedas. Custo + pool + RNG server-side.
- `POST /api/v1/me/rewards/daily/claim` — **novo, sobre o blob** (não o
  `/api/v1/rewards/daily/claim` dormente). Servidor possui a progressão
  `dailyGiftsDay`/`Week`/`LastClaim` e a tabela `getDailyGiftsForWeek`.

Decisões abertas:
- **RNG**: `crypto` no servidor chega para já; registar como dívida um esquema
  auditável (seed por temporada) para antifraude futuro.
- **Tabelas de prémio**: `getDailyGiftsForWeek` e os pesos da roleta vivem em
  `src/game/` — o backend **importa** (D1), não duplica.
- **Frontend**: as roletas animam com o resultado que o servidor devolveu (a
  animação deixa de decidir o prémio). `Roulette.tsx` / `SkinRoulette.tsx`
  precisam de refactor para receber o prémio em vez de o sortear.
- Anónimo mantém as regras locais.

Esforço estimado: **médio-alto** (3 endpoints + refactor de 3 componentes de
animação + brainstorming). 1 PR ou 2 (roletas | prendas).

### Fatia 6 — Captura + aquário  · **a maior**

Pré-requisito para o ranking ter significado. Precisa de spec própria (SDD).

- **Captura**: mover o sorteio (`rollFish` + raridade + peso, de `fishingLogic.ts`,
  com localização e multiplicadores do blob) para o servidor. Já existe
  `/fishing/sessions` + `/complete` para isto, mas contra o modelo antigo e a
  ignorar raridade — reescrever sobre o blob.
  - Opção A (preferida): `POST /me/fishing/cast` → servidor sorteia e devolve a
    captura; cliente anima; `POST /me/fishing/land` aplica ao blob (moedas por
    `FISH_COIN_VALUE`, XP, nível, coleção, capacidade do armazém, `heaviestFish`).
  - Rede = variante em lote de `cast`/`land`.
  - Cobrir: minigame, level-up, desbloqueio de mundo, `aquariumWarehouse`.
- **Aquário**: `moveAquariumFishToSector` não concede valor → pode continuar a
  viajar no `PUT /me/state` (não explorável). Baixa prioridade; agrupado aqui só
  porque os peixes do aquário vêm da captura.
- **`consumeNet`**: alinhar aqui — o consumo passa a fazer parte do `cast` de rede.

Esforço estimado: **alto**. Provável 2–4 sub-fatias (cast/roll · land/apply ·
lote de rede · aquário). Vários PRs.

### Fatia 7 — Ranking + temporada (leitura)

Depende da 6 (o blob precisa de progresso real vindo do servidor).

- Servidor projeta `player_game_state` → campos de ranking (na escrita, ou por
  view). `GET /leaderboard` passa a ler essa projeção.
- `Ranking.tsx` troca `getLeaderboard()` (localStorage) pela API;
  `syncCurrentPlayer` é removido; `src/game/leaderboard.ts` reduz-se a tipos.
- `GET /seasons/current` — autenticar (D4) e mostrar a temporada no ranking/menu.

Esforço estimado: **médio**. 1–2 PRs.

### Fatia 8 — Limpeza dos dormentes

Só quando 5–7 cobrirem tudo.

- Apagar `backend/src/economy/` (antigo), `backend/src/inventory/`, modelo antigo
  de `rewards`, e as rotas/testes/registos em `app.ts`.
- Atualizar `openapi.test.ts`.
- Migração própria (tardia, revista com cuidado) para remover tabelas órfãs — ou
  deixá-las e só remover o código.
- `useGameState.ts` deve estar visivelmente menor; remover helpers locais mortos.

Esforço estimado: **baixo-médio**, mas **destrutivo** — diff revisto com atenção.

### Depois da Task 10

- **D1** (consolidar domínio duplicado) — idealmente feito *durante* 5–7, cada vez
  que uma constante é tocada dos dois lados.
- **D3** (endurecimento de auth: refresh token family, reuse detection) — tarefa
  própria, alinhar o design antes (`security-review.md`).
- **D2, D5, D7, D8, D9, D10** — tarefas independentes, sem ordem forçada.
- **D11** — commit trivial, pode ir já.

---

## 4. Ordem recomendada

```
Fatia 5  Roletas + prendas diárias        (brainstorm + mini-spec, ~1–2 PRs)
Fatia 6  Captura + aquário                (SDD, ~2–4 PRs)   ← maior bloco
Fatia 7  Ranking + temporada (leitura)    (~1–2 PRs)
Fatia 8  Limpeza dos endpoints dormentes  (~1 PR, destrutivo)
─────────────────────────────────────────────────────────────
D1 consolidação de domínio  → oportunista durante 5–7
D11 .claude no .gitignore    → agora
D3 auth hardening            → tarefa própria, pós-10
D2/D5/D7/D8/D9/D10           → tarefas independentes
```

Marco "Task 10 concluída": nenhuma operação que concede valor corre só no cliente
para um utilizador autenticado; ranking e temporada vêm do servidor; endpoints
dormentes removidos; `localStorage` só serve o modo anónimo.

---

## 5. Riscos e princípios a manter

- **Paridade memória/PostgreSQL** — cada fatia implementa os dois caminhos com o
  mesmo comportamento observável (regride facilmente — ver D2).
- **Idempotência** — toda operação de valor exige `Idempotency-Key` e é atómica.
- **Anónimo intacto** — o modo `localStorage` continua a funcionar sem backend.
- **Sem duplicar regras** — o backend importa de `src/game/*`; mudança de regra
  verifica os dois lados.
- **Nada de cookie httpOnly novo / reuse detection / família de refresh tokens**
  sem alinhar antes (`security-review.md`).
- **Smoke manual** faz parte do "pronto" — o agente não tem browser fora da stack.
- **Sem `npm audit fix` automático**; CodeQL não obrigatório por agora.
