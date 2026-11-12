# CLAUDE.md — Deep Blue Lure

Instruções para agentes trabalhando neste repositório. Complementa, não substitui,
o histórico técnico em [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md), que continua sendo
a fonte de verdade sobre roadmap, decisões e pontos de parada.

## O que é o projeto

Deep Blue Lure é um jogo de pesca 3D (React + TypeScript + Three.js). Historicamente
uma SPA frontend-only com persistência em `localStorage`. Está em curso a Task 6:
transformar o frontend num cliente de uma **API backend confiável** (Fastify + PostgreSQL)
que passa a ser autoridade sobre identidade, progresso, economia, inventário, capturas,
ranking e temporadas.

Estado resumido:

- **Frontend**: funcional, integrado em `main`. Ainda **não** consome o backend.
- **Backend**: em construção nesta branch (`feature/task-06-backend-foundation`).
  Ainda não foi validado contra um PostgreSQL real, não tem runner de migração
  funcional e não roda no CI. Ver [`docs/analysis/`](./docs/analysis/).

## Estrutura

```text
src/                     Frontend (Vite)
  game/                  Domínio do jogo: estado, regras puras, dados, i18n, persistência
    useGameState.ts      Hook orquestrador (grande; extrair regras com cuidado)
    stateRules.ts        Regras puras de progressão/economia/inventário
    fishingLogic.ts      Sorteio de peixe/raridade/peso (rollFish, getNormalizedRarityWeights)
    data.ts              FISH e LOCATIONS (catálogo canónico)
    types.ts             Tipos + constantes de balanceamento (RARITY_CONFIG, FISH_COIN_VALUE, MAX_LEVEL...)
    persistence.ts       Envelope versionado + validação Zod do save local
    storage.ts           Contrato KeyValueStorage (storage injetável)
  components/game/        Componentes de jogo e cenas 3D (alguns com @ts-nocheck)
  components/ui/          shadcn/ui
  test/                  Testes Vitest do frontend

backend/                  Backend (Node + Fastify + Drizzle)
  src/
    app.ts               Composition root: escolhe repositório PG vs memória e regista rotas
    server.ts            Bootstrap (loadConfig + listen)
    config/env.ts        Configuração validada com Zod
    db/client.ts         Pool pg + drizzle
    db/schema.ts         Schema Drizzle — espelha backend/migrations/*.sql (checks, uniques, índices)
    db/migrate.ts        Runner das migrações SQL (npm run backend:db:migrate)
    testing/pgHarness.ts Harness dos testes de integração (migra + trunca entre testes)
    <module>/*.integration.test.ts  Testes contra PostgreSQL real (suíte separada)
    http/                errors.ts (handler central), routes/system.ts (health/ready/openapi)
    security/http.ts     Headers, CORS, rate limiting (in-process), auditoria de auth
    <module>/            auth, players, catalog, fishing, gamestate,
                         migration, leaderboard, seasons
      routes.ts          Rotas Fastify + validação Zod do módulo
      service.ts         Implementação em memória (dev/teste sem DATABASE_URL)
      pgRepository.ts /  Implementação PostgreSQL transacional (caminho de produção)
      pgService.ts
  migrations/*.sql       Migrações SQL escritas à mão (SEM runner — ver findings)
  migrations/generated/  Saída do drizzle-kit (ainda não gerada)
  docs/ARCHITECTURE.md   Baseline de arquitetura do backend

docs/analysis/            Análise e lista priorizada de ajustes (este trabalho)

compose.yaml              Stack de dev: postgres + backend + frontend
Dockerfile                Frontend (multi-stage: deps/dev/build/runtime nginx)
backend/Dockerfile        Backend (multi-stage: deps/dev/build/runtime)
docker/nginx.conf         Config nginx do frontend em produção
.env.docker.example       Template do env do compose (.env.docker é git-ignored)
```

## Comandos

| Comando | Finalidade |
|---|---|
| `npm run dev` | Servidor Vite (frontend) |
| `npm run build` | Build de produção do frontend |
| `npm test` | Vitest — testes **unitários** do frontend + backend (repos em memória). Exclui `*.integration.test.ts` |
| `npm run test:integration` | Testes do backend contra PostgreSQL real (`vitest.integration.config.ts`). Precisa de `DATABASE_URL`/`TEST_DATABASE_URL`. Localmente, parar antes o `email-worker` do Docker (`docker compose stop email-worker`): ele consome a fila partilhada `email.send` e rouba mensagens dos testes |
| `npm run lint` | ESLint (config lint `**/*.{ts,tsx}` com globals de browser — impreciso para backend) |
| `npm run backend:dev` | Backend via `tsx` (precisa de `ACCESS_TOKEN_SECRET` com ≥32 chars) |
| `npm run backend:start` | Igual, sem watch — usado no contentor |
| `npm run backend:email-worker` | Worker de email (consome `email.send` do RabbitMQ, envia por SMTP e corre a limpeza horária de contas não confirmadas/desafios expirados). No Docker sobe como serviço `email-worker`; Mailpit (caixa de entrada de dev) em http://localhost:8025 |
| `npm run backend:typecheck` | `tsc --noEmit -p tsconfig.backend.json` |
| `npm run backend:db:migrate` | Aplica `backend/migrations/*.sql` pendentes via `backend/src/db/migrate.ts` (precisa de `DATABASE_URL`) |
| `npm run backend:db:generate` | `drizzle-kit generate` — só para **detetar drift** entre `db/schema.ts` e as migrações à mão (saída em `backend/migrations/generated/`, git-ignored) |
| `docker compose up` | Sobe postgres + backend + frontend (precisa de `.env.docker` — copiar de `.env.docker.example`) |
| `docker compose -f docker-compose.prod.yaml --env-file .env.production up -d` | Sobe o stack de produção (TLS + backups) — precisa de `scripts/deploy/init-letsencrypt.sh` já ter corrido uma vez para o domínio |
| `./scripts/backup/restore-test.sh` | Restaura o backup mais recente num Postgres descartável e confere as contagens de linhas contra o manifesto |

### Antes de abrir um PR

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run backend:typecheck
npm test
npm run build
# com um PostgreSQL disponível:
npm run backend:db:migrate && npm run test:integration
```

O CI (`.github/workflows/code-review.yml`) tem dois jobs: `quality` (typecheck
frontend + backend, testes unitários, build) e `integration` (migrações + testes de
integração contra um `services: postgres`).

### Docker

`compose.yaml` (na raiz) sobe `postgres` + `backend` (target `dev`, corre migrações
no arranque) + `frontend` (Vite). `backend/Dockerfile` e `Dockerfile` são
multi-stage (`deps` → `dev` / `build` → `runtime`). `backend/` e `src/` são
bind-mounted; `node_modules` fica o da imagem. Após mexer em `package.json`:
`docker compose up --build` (ou `down -v` para recriar volumes).

## Convenções de código

- **TypeScript strict** em todo o lado. Sem `any` novo. Componentes 3D legados com
  `@ts-nocheck` devem ser reduzidos gradualmente, não expandidos.
- **Backend ESM**: imports relativos usam sufixo `.js` (`./service.js`), mesmo para
  ficheiros `.ts` — exigência de `moduleResolution: NodeNext`.
- **Migrações**: os ficheiros `backend/migrations/*.sql` escritos à mão são a fonte
  de verdade. `db/schema.ts` (Drizzle) tem de as espelhar (checks, uniques, índices
  parciais incluídos). Ao adicionar uma migração: criar o `NNNN_nome.sql`, refletir
  em `db/schema.ts`, e correr `npm run backend:db:generate` para confirmar que não
  há diff inesperado. O runner regista cada versão aplicada em `schema_migrations`.
- **Validação Zod** para todo body, query e param no backend. Nunca confiar em
  entrada do cliente.
- **Erros do backend**: lançar `Error` com um código estável (`SNAKE_CASE`) já
  mapeado em `backend/src/http/errors.ts`, ou `AppError(status, code, message)`.
  Nunca vazar detalhe interno, SQL, token ou secret numa resposta.
- **Domínio partilhado**: o backend importa o catálogo e constantes de `src/game/*`.
  Ao mudar regras de jogo, verificar os dois lados. Preferir importar a duplicar
  (hoje `xpForLevel`, custos e valores estão duplicados — ver findings).
- **Idempotência**: operações que concedem valor (compras, vendas, recompensas,
  captura, importação de save) exigem `Idempotency-Key` (16–128 chars) e devem
  ser atómicas na base de dados.
- **Padrão de módulo**: `routes.ts` fino, `service.ts` (memória) e `pgRepository.ts`
  (PostgreSQL) implementando o mesmo contrato. `app.ts` decide qual usar por
  presença de `DATABASE_URL`. Manter memória e PostgreSQL com o **mesmo comportamento
  observável** (hoje divergem em vários pontos).

## Segurança (guardrails permanentes)

Do `PROJECT_MEMORY.md`, não negociáveis sem suspensão explícita do utilizador:

- Nunca escrever secrets (chaves, tokens, senhas, connection strings) em código,
  commits, migrações, logs ou output de debug. Tudo sensível vive em env vars
  (`.env`, git-ignored) ou secret manager.
- Verificar ficheiros staged antes de commitar, mesmo com nomes inocentes.
- Rotas protegidas: autenticar e autorizar por `user_id` do token.
- Mutações de valor sempre em transação; respostas de API sem dados sensíveis.
- CORS restritivo por ambiente; headers de segurança + CSP; rate limiting.

## Qualidade e processo

- Nenhuma mudança está "pronta" sem testes a passar **e** sem o utilizador ter
  revisto o diff.
- Antes de declarar terminado: apresentar diff (ou resumo) + riscos (o que pode
  partir, o que não foi testado, dependências afetadas).
- Mudanças com comportamento em runtime exigem teste manual local do utilizador
  (correr a app / exercitar o fluxo), não só build e testes automáticos. O agente
  não tem browser; ao usar worktree isolado, indicar o caminho da pasta no início.
- No fim de tarefas com loops/subagents/múltiplas iterações, apresentar estimativa
  de esforço e onde reduzir.

## Estratégia de branches

`main` é a base de integração. Cada task tem a sua branch encadeada
(`feature/task-06-backend-foundation` é a atual). Só criar a próxima branch quando
a anterior estiver validada e consolidada. Só commitar/push/PR quando o utilizador
pedir.

## O que NÃO fazer

- Não fazer o frontend consumir o backend antes de a fundação do backend estar
  revista e validada contra PostgreSQL.
- Não rodar `npm audit fix` automaticamente (vulnerabilidades transitivas
  conhecidas; tratar em tarefa própria).
- Não tornar o CodeQL check obrigatório enquanto GitHub Advanced Security não
  estiver disponível no repositório.
- Não apagar mudanças do utilizador nem reescrever `PROJECT_MEMORY.md` — só
  acrescentar/atualizar secções.
- Não introduzir a autenticação por cookie httpOnly, reuse detection ou família de
  refresh tokens sem alinhar antes (ver `docs/analysis/security-review.md`).
