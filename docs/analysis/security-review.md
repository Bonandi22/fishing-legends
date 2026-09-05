# Revisão de segurança

Data: 2026-09-05 · Branch: `feature/task-06-backend-foundation`

Confronta os **10 requisitos de segurança futura** e o **threat model** do
`PROJECT_MEMORY.md` / `backend/docs/ARCHITECTURE.md` com o código atual.

## Sumário

| # | Requisito | Estado |
|---|---|---|
| 1 | Validação de formulários no servidor | ✅ Zod em todas as rotas |
| 2 | Rotas protegidas no backend | ⚠️ maioria protegida; `GET /seasons/current` **não valida token** |
| 3 | Secrets fora do código | ✅ env vars, nada commitado |
| 4 | Autorização e isolamento por utilizador | ⚠️ ações usam `user_id` do token; sem `preHandler` partilhado; sem testes de acesso cruzado |
| 5 | Rate limiting e proteção contra abuso | ❌ derrotado por `X-Forwarded-For`; in-process; sem limite por rota/identidade |
| 6 | Validação de uploads | n/a (sem uploads) |
| 7 | Respostas sem dados sensíveis | ✅ sem password hash / token nas respostas |
| 8 | XSS, sanitização, CSP | ✅ CSP `default-src 'none'` na API (API JSON, sem HTML) |
| 9 | CORS restritivo por ambiente | ❌ default reflete **qualquer** origem |
| 10 | Mensagens de erro sem detalhes internos | ✅ forma estável; ⚠️ mensagens trocadas (auth vs domínio) |

## Achados

### S1 — `X-Forwarded-For` derrota o rate limiting *(alto)*

`backend/src/security/http.ts:57` — `clientKey()` usa o primeiro valor de
`x-forwarded-for` quando presente, senão `request.ip`. Não há proxy de confiança
configurado (`Fastify({ ... })` sem `trustProxy`). Qualquer cliente envia
`X-Forwarded-For: <aleatório>` a cada pedido e **nunca** é limitado. O mesmo header
polui a auditoria de auth (`http.ts:52`).

Correção: configurar `trustProxy` explicitamente (lista de IPs do proxy real, ou
`false`) e usar `request.ip`. Só honrar `X-Forwarded-For` quando a origem for um
proxy confiável.

### S2 — `GET /api/v1/seasons/current` não valida o access token *(médio)*

`backend/src/seasons/routes.ts:13` verifica apenas que existe um header
`Authorization: Bearer …` e faz `void auth;`. `Authorization: Bearer x` passa. É
uma rota marcada como protegida que não autentica. Baixo valor dos dados expostos,
mas quebra a invariante "toda rota `/api/v1` protegida valida o token" e pode ser
copiada como padrão.

Correção: `await auth.verifyAccessToken(header.slice(7))` como nos outros módulos
(idealmente via `preHandler` partilhado — ver S8).

### S3 — Oráculo de tempo na autenticação permite enumerar contas *(médio)*

`backend/src/auth/service.ts:44` — `login` faz
`if (!user || !(await verifyPassword(...)))`. Quando o email não existe, retorna
**sem** executar `scrypt`; quando existe, executa. A diferença de latência
(~dezenas de ms) distingue "conta existe" de "não existe", contrariando
`ARCHITECTURE.md:116` ("Login responses do not reveal whether an account exists").

Correção: executar sempre um `verifyPassword` contra um hash dummy de custo
equivalente quando o utilizador não existe, e devolver o mesmo `INVALID_CREDENTIALS`.

### S4 — CORS default reflete qualquer origem *(médio)*

`backend/src/security/http.ts:14-24` — com `CORS_ORIGINS` vazio (default, e o
`.env.example` nem inclui a variável), a verificação `allowedOrigins.length > 0` é
falsa: nenhum pedido é bloqueado e o ramo `else if (origin)` devolve
`Access-Control-Allow-Origin: <origin do pedido>`, ou seja, eco de qualquer origem.
Não há `Access-Control-Allow-Credentials` (bom, porque combinado com eco de origem
seria grave), mas o default devia ser **negar**, não refletir.

Correção: sem `CORS_ORIGINS` configurado → não emitir ACAO (ou bloquear) em vez de
refletir. Adicionar `CORS_ORIGINS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` ao
`.env.example`.

### S5 — Sem reuse detection nem família de refresh tokens *(médio)*

`ARCHITECTURE.md:114` pede revogação da família em deteção de reutilização.
`auth/service.ts:66` roda o token in-place; um refresh token roubado e usado pelo
atacante antes da vítima simplesmente rotaciona — quando a vítima tenta, recebe
`INVALID_REFRESH_TOKEN` mas o atacante mantém uma sessão válida. Não há tabela
`refresh_tokens` com cadeia/`replaced_by` nem revogação em cascata.

Correção (quando o frontend for ligar auth): tabela de refresh tokens encadeados,
`revoked_at` + `replaced_by`, e ao detetar uso de um token já rotacionado revogar
toda a cadeia daquela sessão.

### S6 — Recompensa diária: o cliente escolhe o prémio *(alto — exploit de economia)*

`backend/src/rewards/routes.ts:12` — `day` vem do corpo. `rewardForDay(7)` = 1500
moedas. Cliente pede sempre `day: 7`. O servidor só impede **duas** claims no mesmo
dia UTC, não impede escolher o dia 7 todos os dias.

Correção: o servidor calcula o dia da streak a partir de `daily_reward_claims`
(último `claim_date` consecutivo) e ignora o `day` do cliente.

### S7 — Sorteio de captura no servidor ignora a raridade *(médio — integridade de jogo)*

`backend/src/fishing/pgService.ts:69` / `service.ts:62` — seleção uniforme entre os
peixes da localização. O sistema de raridade (`src/game/fishingLogic.ts`,
`RARITY_CONFIG` com chances de 0.50 a 0.002) é ignorado. Consequências: progressão
e ranking triviais de inflar (peixes raros valem XP/pontuação alta), e o cliente
mostra probabilidades que o servidor não respeita.

Correção: portar `rollFish` / `getNormalizedRarityWeights` para o serviço de pesca
do servidor (idealmente partilhando o módulo de domínio), com versão de ruleset
registada na sessão.

### S8 — Autenticação re-implementada por rota *(baixo — risco de manutenção)*

`players/routes.ts:9`, `economy/routes.ts:12`, `inventory/routes.ts:12`,
`fishing/routes.ts:13`, `leaderboard/routes.ts:12`, `rewards/routes.ts:10`,
`migration/routes.ts:11` — cada uma reparsa `Bearer` à mão. Uma delas (seasons) já
esqueceu a validação (S2). Um `preHandler` Fastify partilhado que popula
`request.userId` elimina a classe inteira de erro.

### S9 — Erro de constraint de idempotência → 500 *(baixo)*

Colisão do `UNIQUE (user_id, idempotency_key)` sob concorrência não é mapeada em
`http/errors.ts` → `500 INTERNAL_ERROR`. Deveria devolver o resultado idempotente
existente ou um `409` limpo. Ver `backend-review.md` §2.3.

### S10 — Parâmetros de hashing de password não versionados *(baixo)*

`auth/crypto.ts:10` — o hash guardado é `scrypt$<salt>$<key>`, sem N/r/p. Não é
possível endurecer parâmetros no futuro sem quebrar hashes antigos. `ARCHITECTURE`
pede Argon2id.

Correção: migrar para Argon2id (ex.: `@node-rs/argon2`) **ou** incluir os
parâmetros de custo no encoded hash e verificar contra eles.

## Threat model — cobertura atual

| Ameaça (ARCHITECTURE.md) | Controlo previsto | Estado |
|---|---|---|
| Saldo/XP forjado pelo cliente | Cálculo server-side + ledger | ⚠️ ledger ok; recompensa diária e raridade fura (S6, S7) |
| Replay de recompensa/compra | Idempotency keys + unique | ⚠️ depende de constraint fora do schema Drizzle (S9) |
| Roubo de refresh token | Hash, rotação, reuse detection, revogação | ⚠️ hash+rotação ok; sem reuse detection (S5) |
| Acesso entre utilizadores | Autorização por `user_id` autenticado | ⚠️ ok no geral; sem testes; S2 e S8 |
| Brute-force de login | Rate limit, erros genéricos, auditoria | ❌ rate limit furável (S1); erro genérico ok; auditoria polui-se com XFF |
| Payloads malformados | Zod + tamanho limitado | ⚠️ Zod ok; sem `bodyLimit` explícito no Fastify |
| SQL injection | Drizzle parametrizado | ✅ sem SQL string-built |
| Manipulação de ranking | Eventos de pontuação server-owned + versão de regras | ⚠️ score server-side mas sem versão nem antifraude |
| Vazamento de secret | Env only + verificação de staged | ✅ |
| Outage | Health/readiness, logs, backups | ⚠️ health/ready ok; backups não testados |

## Não são problemas (verificado)

- Nenhuma resposta expõe `passwordHash`, `refreshTokenHash` ou tokens além do
  esperado (`auth/routes.ts` seleciona campos explicitamente; teste
  `app.test.ts:71`).
- Sem SQL construído por concatenação.
- CSP `default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` presentes em
  todas as respostas (`security/http.ts:27`).
- Produção não arranca sem `DATABASE_URL` nem sem `ACCESS_TOKEN_SECRET` de ≥32
  chars (`config/env.ts:8`, `app.ts:43`).
