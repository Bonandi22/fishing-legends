# Fishing Legends

Fishing Legends é um jogo de pesca 3D full-stack. O jogador explora rios, lagos e oceanos, captura peixes de diferentes raridades, evolui de nível, administra moedas e inventário, desbloqueia mundos e mantém uma coleção e um aquário.

O frontend é uma SPA React/Three.js; o backend (Fastify + PostgreSQL) é a autoridade sobre identidade, progresso, economia, capturas, ranking e temporadas.

## Funcionalidades atuais

- Pesca normal com casting, espera, mordida e minigame de captura.
- Pesca submarina e pesca com redes em lote.
- Raridades, pesos, XP, moedas, multiplicadores e progressão até o nível 30.
- Mundos, regiões desbloqueadas por nível e catálogo de peixes.
- Armazém com limite, aquário, skins de vara e barco.
- Roletas, presentes diários e ranking local.
- Internacionalização e cenas 3D com Three.js/React Three Fiber.
- Persistência local versionada, migração de saves legados e validação com Zod.

## Tecnologias

**Frontend** — React 18 · TypeScript · Vite · Three.js + React Three Fiber + drei ·
Tailwind CSS + shadcn/ui (Radix) · TanStack Query · React Router · Zustand ·
react-hook-form · Zod · Framer Motion · Recharts · i18n próprio.

**Backend** (`backend/`) — Node.js · Fastify 5 · PostgreSQL · Drizzle ORM +
drizzle-kit · Zod · `jose` (access tokens JWT) · `scrypt` (`node:crypto`) para
passwords · migrações SQL à mão com runner próprio.

**Qualidade e infra** — Vitest (unitários + integração contra PostgreSQL) ·
Playwright (E2E) · ESLint + typescript-eslint · tsx · Docker + Docker Compose ·
GitHub Actions (CI + Claude Code Review).

## Arquitetura

O frontend é uma SPA baseada em Vite. O estado do jogador é controlado por
`src/game/useGameState.ts`, as regras puras estão sendo extraídas para módulos de
domínio, e a persistência local usa `localStorage` por meio de uma abstração
`KeyValueStorage`.

O backend em `backend/` (integrado em `main` na Task 6) expõe uma API REST/JSON
versionada em `/api/v1`, com módulos isolados (`auth`, `players`, `catalog`,
`fishing`, `economy`, `inventory`, `migration`, `leaderboard`, `rewards`,
`seasons`). Cada operação de valor é transacional e idempotente; autenticação por
access token curto + refresh token rotativo com deteção de reutilização.

O frontend ainda **não** consome o backend — a integração é uma tarefa posterior.
Enquanto isso, conta, ranking e progresso local não devem ser considerados
confiáveis para competição online. Arquitetura, análise e ajustes pendentes estão
em [`backend/docs/ARCHITECTURE.md`](./backend/docs/ARCHITECTURE.md),
[`docs/analysis/`](./docs/analysis/) e [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md).

## Desenvolvimento local

Requisitos: Node.js e npm.

```bash
git clone https://github.com/Bonandi22/deep-blue-lure.git
cd deep-blue-lure
npm install
npm run dev
```

## Desenvolvimento com Docker

Requisitos: Docker e Docker Compose. Sobe PostgreSQL, backend (Fastify, com
migrações no arranque) e frontend (Vite) de uma vez:

```bash
cp .env.docker.example .env.docker
docker compose up
```

- Frontend: http://localhost:8080
- Backend: http://localhost:8090 (`/health`, `/ready`, `/api/v1/...`)
- PostgreSQL: `localhost:5432` (`deepbluelure` / `deepbluelure`)

O `.env.docker` contém apenas valores de desenvolvimento e é git-ignored.
`backend/` e `src/` são bind-mounted para hot-reload; após mudar `package.json`,
reconstruir com `docker compose up --build` (ou `docker compose down -v` para
recriar os volumes de `node_modules`).

### Testes de integração (PostgreSQL)

```bash
docker compose up -d postgres
DATABASE_URL=postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure npm run backend:db:migrate
DATABASE_URL=postgres://deepbluelure:deepbluelure@localhost:5432/deepbluelure npm run test:integration
```

## Scripts

| Comando | Finalidade |
|---|---|
| `npm run dev` | Inicia o servidor Vite |
| `npm run build` | Gera o build de produção |
| `npm run build:dev` | Gera o build em modo desenvolvimento |
| `npm test` | Executa os testes unitários Vitest (frontend + backend em memória) |
| `npm run test:watch` | Executa Vitest em modo watch |
| `npm run test:integration` | Testes de integração do backend contra PostgreSQL (`DATABASE_URL` obrigatório) |
| `npm run lint` | Executa o ESLint |
| `npm run backend:dev` | Backend Fastify local (`ACCESS_TOKEN_SECRET` ≥32 chars) |
| `npm run backend:typecheck` | Typecheck do backend |
| `npm run backend:db:migrate` | Aplica as migrações SQL pendentes (`DATABASE_URL` obrigatório) |

## Testes e qualidade

- **Frontend** — regras de pesca, persistência, migração de saves, progressão,
  desbloqueios, capacidade do armazém e o adaptador de armazenamento (Vitest).
- **Backend** — testes unitários de domínio (memória) e uma suíte de integração
  contra PostgreSQL real (`npm run test:integration`) cobrindo migração, auth,
  economia, pesca, inventário, recompensas, migração de save e leaderboard.
- Playwright está configurado para a evolução dos testes E2E.

Antes de abrir um pull request:

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run backend:typecheck
npm test
npm run build
```

Pull Requests para `main` disparam automaticamente:

- **CI** — job `quality` (TypeScript frontend + backend, testes unitários, build de
  produção) e job `integration` (migrações + testes contra um PostgreSQL efémero).
- **Claude Code Review** — review automática do Claude em cada PR; `@claude` em
  comentários responde com acesso aos resultados do CI.

O merge deve ocorrer somente após os checks aprovarem e a revisão ser concluída.

## Estratégia de branches

`main` é a base de integração. Cada etapa tem a sua branch `feature/task-NN-*`,
mergeada por Pull Request. A memória técnica, os commits e o roadmap completo estão
em [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md).

## Roadmap resumido

1. **Task 1 — Estabilização do núcleo:** concluída.
2. **Task 2 — Refatoração arquitetural:** concluída.
3. **Task 3 — Conteúdo e balanceamento:** concluída.
4. **Task 4 — Qualidade e conclusão do frontend:** concluída.
5. **Task 5 — Revitalização de interfaces:** concluída.
6. **Task 6 — Fundação do backend (Fastify + PostgreSQL):** concluída — API, testes
   de integração, Docker, análise em `docs/analysis/` e correções aplicadas.
7. **Task 7 — Endurecimento do backend:** em andamento (expiração de sessões,
   Argon2id, OpenAPI, fronteiras de módulo).
8. **Task 8 — Integração do frontend com o backend:** planejada.
9. **Campeonato e ranking global server-side:** planejado.

## Origem

O protótipo inicial foi criado no [Lovable](https://lovable.dev) e atualmente é mantido localmente e versionado neste repositório GitHub.
