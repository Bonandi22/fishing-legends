# Auditoria — checklist de 20 pontos de segurança

Data: 2026-09-08 · Branch base: `main` (inclui até fatia 10.3-6b-1)
Âmbito: backend Fastify + Postgres, frontend SPA, infra Docker/CI no repositório.

Legenda: ✅ cumprido · ⚠️ parcial / com ressalva · ❌ em falta

| # | Ponto | Estado |
|---|---|---|
| 1 | Proteger API keys privadas | ⚠️ |
| 2 | Separar dev e produção | ⚠️ |
| 3 | Configurar backups automáticos | ❌ |
| 4 | Forçar HTTPS | ⚠️ |
| 5 | Encriptar dados sensíveis | ⚠️ |
| 6 | Usar server-side auth | ✅ |
| 7 | Restringir acessos | ⚠️ |
| 8 | Bloquear mass assignment | ⚠️ |
| 9 | Proteger cookies | ✅ |
| 10 | Hash das palavras-passe | ✅ |
| 11 | Rate limiting | ⚠️ |
| 12 | Proteção contra bots | ❌ |
| 13 | Queries parametrizadas | ✅ |
| 14 | Validar inputs | ✅ |
| 15 | Não expor dados sensíveis | ✅ |
| 16 | Restringir uploads | ✅ (n/a) |
| 17 | Limitar respostas da API | ⚠️ |
| 18 | Security headers | ⚠️ |
| 19 | Dependency scan | ❌ |
| 20 | Não confiar apenas no RLS | ✅ |

---

## 1. Proteger API keys privadas — ⚠️

**O que existe**
- Toda a configuração sensível passa por env var validada com Zod
  (`backend/src/config/env.ts`): `ACCESS_TOKEN_SECRET` exige `min(32)`, o servidor
  não arranca sem ela.
- `.gitignore` cobre `.env` e `.env.*`, exceto `*.example` — nada de secrets
  commitados. `.env.docker.example` só tem placeholder de dev
  (`dev-access-token-secret-change-me-please`).
- Não há chaves de terceiros no código (sem Stripe/SendGrid/etc. nesta fase).

**Lacunas**
- Sem integração com secret manager para produção — hoje é só ficheiro `.env`.
- `.claude/` continua **untracked mas não gitignored** (aparece em `git status`).
  Risco de commit acidental de configuração local. Adicionar `/.claude/` ao
  `.gitignore`.

## 2. Separar dev e produção — ⚠️

**O que existe**
- `NODE_ENV` é enum `development|test|production` (`config/env.ts`).
- `createApp` recusa arrancar em `production` sem `DATABASE_URL` (`app.ts:52`).
- `COOKIE_SECURE`, `CORS_ORIGINS`, `TRUST_PROXY`, `COOKIE_DOMAIN`, TTLs, limites de
  rate — todos dirigidos por env, portanto configuráveis por ambiente.
- `backend/Dockerfile` tem stage `runtime` separado com `NODE_ENV=production` e
  `USER node`.

**Lacunas**
- Só existe `compose.yaml` de desenvolvimento. Não há manifesto de deploy de
  produção (compose prod, Helm, Terraform…) no repositório, por isso a separação
  de rede/segredos/TLS de produção não está versionada nem revista.
- `.env.docker` de dev tem `COOKIE_SECURE=false` e `TRUST_PROXY=false` — corretos
  para local, mas a configuração de produção equivalente não está documentada num
  `.env.production.example`.

## 3. Configurar backups automáticos — ❌

- Nenhuma automação de backup do Postgres no repositório: sem `pg_dump`
  agendado, sem `wal-g`/`pgbackrest`, sem configuração de managed DB.
- `docs/ARCHITECTURE.md:184` lista backups como controlo de outage *previsto*;
  `docs/analysis/security-review.md:141` regista "backups não testados".
- Único fallback hoje: o save local em JSON que o utilizador pode reimportar
  (`migration/routes.ts`) — não é backup do lado do servidor.

**Ação**: definir política de backup (frequência, retenção, teste de restauro)
quando o Postgres de produção existir. Ponto de bloqueio para ir a produção.

## 4. Forçar HTTPS — ⚠️

**O que existe**
- `COOKIE_SECURE` default `true` (`config/env.ts:16`) → cookies de auth só viajam
  em HTTPS em produção.
- nginx repassa `X-Forwarded-Proto` ao backend (`docker/nginx.conf:13`).

**Lacunas**
- `docker/nginx.conf` escuta só `:80`, sem TLS, **sem redirect HTTP→HTTPS** e
  **sem HSTS**. Assume um terminador TLS a montante que não está no repositório.
- Sem header `Strict-Transport-Security` em lado nenhum.

**Ação**: no edge (load balancer ou nginx), redirect 301 para HTTPS + 
`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

## 5. Encriptar dados sensíveis — ⚠️

- **Em trânsito**: ver ponto 4 (depende de infra não versionada).
- **Em repouso**:
  - Palavras-passe: hash Argon2id, não "encriptação" — correto (`auth/crypto.ts`).
  - Refresh tokens: guardados como SHA-256 hex, nunca em claro
    (`auth/crypto.ts:41`, `auth/service.ts:39`).
  - PII (email, país): texto simples. Aceitável para esta classe de dados, mas
    não há encriptação ao nível da coluna nem configuração de encriptação
    at-rest do Postgres no repositório.

**Ação**: ativar encriptação at-rest no volume/instância do Postgres de produção
(geralmente uma opção do provedor).

## 6. Usar server-side auth — ✅

- Access token JWT HS256, **algoritmo fixado** na verificação
  (`jwtVerify(..., { algorithms: ['HS256'] })`, `auth/service.ts:94`), claim
  `type: 'access'` e `sub` string obrigatórios.
- `requireAuth` (`auth/middleware.ts`) é `preHandler` partilhado; lê cookie
  `dbl_at` e cai para `Authorization: Bearer`. Popula `request.userId`.
- Refresh token opaco (`randomUUID + 24 bytes`), rotação a cada uso, **reuse
  detection** com revogação de família (`repository.rotateRefreshToken` →
  `outcome: 'reuse_detected'` → `REFRESH_TOKEN_REUSED`).
- Nada de decisão de identidade no cliente.

## 7. Restringir acessos — ⚠️

**O que existe**
- Todas as rotas `/api/v1/*` exceto `auth/*` têm `preHandler: app.requireAuth`.
  Verificado: `seasons/current` (era o furo S2 da revisão anterior) já valida o
  token; **não há mais parsing manual de `Bearer` espalhado** — a classe de erro
  S8 foi eliminada.
- Autorização por dono: cada serviço recebe `request.userId` e faz scoping por
  `user_id` nas queries.

**Lacunas**
- Sem testes automáticos de acesso cruzado (utilizador A tenta ler/escrever
  recursos de B). A garantia é por convenção, não por teste — ver threat model em
  `docs/analysis/security-review.md`.

**Ação**: um teste de integração por módulo que confirma 403/404 em acesso
cross-user.

## 8. Bloquear mass assignment — ⚠️

**O que existe**
- Zod em todos os bodies; nenhum spread de `request.body` para dentro de um
  update. Respostas de auth passam por `pickUser()` (whitelist explícita).

**Lacuna principal (dívida de migração conhecida)**
- `PUT /api/v1/me/state` (`gamestate/routes.ts:29`) aceita o **blob inteiro**
  (`saveSchema`) de um cliente autenticado — incluindo `coins`, `level`, `xp` —
  e grava-o tal e qual. É o estado deliberado e temporário da Task 10.3: as
  operações de valor estão a ser movidas fatia a fatia para endpoints
  server-owned (`/api/v1/me/economy/*`, `/api/v1/me/fishing/*`). Enquanto o
  write do blob não for aposentado, um utilizador autenticado pode definir a sua
  própria moeda.

**Ação**: é exatamente o objetivo do roadmap da Task 10 (`docs/analysis/task-10-roadmap.md`).
Fechar as fatias restantes e depois retirar o caminho de escrita livre do blob
para utilizadores autenticados.

## 9. Proteger cookies — ✅

`auth/cookies.ts`:
- `dbl_at`: `httpOnly`, `sameSite: 'lax'`, `secure` (prod), `path=/api`, `maxAge` = TTL do access.
- `dbl_rt`: `httpOnly`, `sameSite: 'strict'`, `secure` (prod), `path=/api/v1/auth`.
- `dbl_csrf`: `httpOnly: false` **por design** (double-submit), `sameSite: 'lax'`.
- CSRF double-submit imposto para mutações em `/api/v1/` (`security/http.ts:46`),
  com `x-csrf-token` comparado ao cookie; `auth/login` e `auth/register` isentos.

## 10. Hash das palavras-passe — ✅

- Argon2id via `@node-rs/argon2` (defaults m=19456, t=2, p=1), string PHC
  auto-descritiva (`auth/crypto.ts:8`).
- `needsRehash` migra hashes legados (scrypt) para Argon2id no próximo login
  bem-sucedido (`auth/service.ts:57`).
- Hash decoy calculado no arranque e verificado quando o email não existe, para
  equalizar o tempo de resposta do login (`auth/service.ts:15`, `:49`) — o
  oráculo de tempo S3 da revisão anterior está fechado.
- Política de password: `min(12).max(128)` no registo (`auth/schemas.ts`).

## 11. Rate limiting — ⚠️

**O que existe**
- Limiter in-process (`Map<clientKey, {count, resetAt}>`) em `security/http.ts`,
  `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` configuráveis, resposta `429` +
  `retry-after`.
- `clientKey` = `request.ip`, que honra `trustProxy`; **nunca** lê
  `X-Forwarded-For` diretamente (o furo S1 está fechado, com comentário no código
  e em `config/env.ts:39`).

**Lacunas**
- In-process: reinicia com o processo e não é partilhado entre instâncias.
- Balde **global único** — sem limite por rota nem por identidade. Brute-force de
  login partilha o mesmo balde que o gameplay.
- Com `TRUST_PROXY=false` atrás do proxy nginx/Vite, todos os browsers partilham
  um balde (tradeoff documentado em `.env.docker.example:24`).

**Ação**: limiter partilhado (Redis) quando houver >1 instância; balde
dedicado e mais apertado para `auth/login` e `auth/register`.

## 12. Proteção contra bots — ❌

- Sem CAPTCHA, proof-of-work, fingerprint de dispositivo ou throttle de registo
  além do rate limiter global. Registo aberto.

**Ação**: no mínimo, throttle dedicado por IP para registo + verificação de
email; CAPTCHA/turnstile no registo e no login se houver abuso.

## 13. Queries parametrizadas — ✅

- Todo o acesso a dados passa pelo query builder do Drizzle / template `sql`
  parametrizado. Sem SQL construído por concatenação (confirmado em
  `docs/analysis/security-review.md` e no threat model).
- Uniques de idempotência agora estão no schema Drizzle
  (`db/schema.ts` — `fishing_sessions_idempotency_unique`,
  `wallet_transaction_idempotency_unique`,
  `game_state_operations_idempotency_pk`) e a colisão `23505` é mapeada para
  `409` em `http/errors.ts:94` (S9 fechado).

**Ressalva**: `npm audit` assinala `drizzle-orm` HIGH — "SQL injection via
improperly escaped SQL identifiers". Os identificadores usados no código são
todos literais (não vêm do cliente), portanto não explorável aqui, mas convém
subir a versão. Ver ponto 19.

## 14. Validar inputs — ✅

- `fastify-type-provider-zod` com `validatorCompiler` — Zod em todo body, query e
  param.
- Registo: email `email().max(320)`, password `min(12).max(128)`, username
  `regex(/^[a-zA-Z0-9_]+$/)` `min(3).max(20)`, país ISO-2.
- Limites de corpo: global 128 KB (`app.ts:61`); rotas de migração e
  `PUT /me/state` sobem para 2 MB explicitamente.
- Paginação do leaderboard com limites (`limit ≤ 100`, `offset ≤ 10000`).

## 15. Não expor dados sensíveis — ✅

- Error handler central (`http/errors.ts`) devolve sempre `{ code, message }`
  estável; sem stack, SQL ou detalhe interno. `500` só faz `request.log.error`
  no servidor.
- `passwordHash` / tokens nunca em respostas — `players/pgRepository.ts`
  `getProfile` mapeia campos à mão; `auth/routes.ts` usa `pickUser`. Teste
  `app.test.ts` assere isto.
- Ressalva menor: `getProfile` faz `select({ user: users })` (traz o hash para
  memória da app embora não o serialize) — cosmético, vale um `select` de
  colunas explícitas.
- `GET /openapi.json` é público (`http/routes/system.ts:39`) — expõe o contrato
  da API, valor baixo, mas considerar proteger ou remover em produção.

## 16. Restringir uploads — ✅ (n/a)

- Não há endpoints de upload de ficheiros.
- Único input "grande": import do save local em JSON (`migration/routes.ts`) —
  cap de 2 MB, shell Zod `passthrough` + validação profunda `validateLocalSave`
  no serviço, idempotente e uma vez por utilizador.

## 17. Limitar respostas da API — ⚠️

- Leaderboard é paginado com tetos. As restantes respostas de coleção
  (`/me/state`, `/me`) são objeto único.
- Não há framework de projeção de campos nem cap global de tamanho de resposta,
  mas também não há endpoint que devolva coleção não paginada. Risco baixo hoje;
  manter a regra "toda listagem nova nasce paginada".

## 18. Security headers — ⚠️

**API (bom)** — `security/http.ts:32` em todas as respostas:
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.

**Frontend estático (em falta)** — `docker/nginx.conf` **não adiciona headers**
ao HTML da SPA:
- sem CSP para a aplicação (a da API não protege a página servida pelo nginx),
- sem `Strict-Transport-Security`,
- sem `X-Frame-Options` / `frame-ancestors` no HTML,
- sem `Permissions-Policy`.

**Ação**: bloco `add_header` no nginx para o `location /` com CSP adequada à
SPA (scripts próprios + Vite/asset origin), HSTS, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## 19. Dependency scan — ❌

- Sem `npm audit` no CI, sem Dependabot, sem CodeQL (este último deliberadamente
  não-obrigatório enquanto não houver GitHub Advanced Security — ver CLAUDE.md).
- `npm audit` hoje: **1 low / 7 moderate / 16 high** (24 no total). Maioria são
  transitivos de build (`vite`, `esbuild`, `rollup`, `postcss`, `drizzle-kit`,
  `browserslist`), mas há **runtime**:
  - `drizzle-orm` — SQLi via identificadores (HIGH),
  - `react-router` / `react-router-dom` — XSS via open redirect (HIGH).
- **Não correr `npm audit fix`** automaticamente (CLAUDE.md — tarefa própria por
  causa de transitivos que partem o build).

**Ação**: adicionar step **não-bloqueante** `npm audit --audit-level=high` ao
`ci.yml` + ficheiro `.github/dependabot.yml` (npm, semanal). Tratar os 2
advisories de runtime numa tarefa dedicada de bump.

## 20. Não confiar apenas no RLS — ✅

- RLS do Postgres **não está ativado** em nenhuma tabela
  (`isRLSEnabled: false` em todos os snapshots).
- Toda a autorização é na aplicação: `requireAuth` + scoping por `user_id` em
  cada query; mutações de valor em transação explícita com
  `SELECT … FOR UPDATE` + tabelas de replay de idempotência.
- Ou seja, a app **não depende de RLS** — depende de checks disciplinados na
  camada de aplicação.
- **Contraponto**: não há *nenhuma* segunda camada ao nível da BD. Um bug de
  autorização na app não tem nada atrás dele. Se um dia se adicionar RLS, é
  defense-in-depth, não substituição dos checks da app.

---

## Prioridades

**Bloqueiam produção**
1. Backups automáticos do Postgres + teste de restauro (#3).
2. HTTPS forçado + HSTS no edge (#4, #18).
3. Retirar o write livre do blob `PUT /me/state` para utilizadores autenticados
   — concluir a Task 10.3 (#8).

**Alto valor, baixo custo**
4. Step `npm audit --audit-level=high` (não-bloqueante) + `dependabot.yml` (#19).
5. Headers de segurança no nginx para a SPA (#18).
6. Balde de rate limit dedicado para `auth/login` e `auth/register` (#11).
7. `/.claude/` no `.gitignore` (#1).

**Endurecer**
8. Testes de integração de acesso cross-user (#7).
9. Throttle/verificação de email no registo (#12).
10. Bump de `drizzle-orm` e `react-router*` (#13, #19).
11. `.env.production.example` documentado (#2).
