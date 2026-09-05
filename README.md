# Deep Blue Lure

Deep Blue Lure é um jogo de pesca 3D desenvolvido com React e TypeScript. O jogador explora rios, lagos e oceanos, captura peixes de diferentes raridades, evolui de nível, administra moedas e inventário, desbloqueia mundos e mantém uma coleção e um aquário.

## Funcionalidades atuais

- Pesca normal com casting, espera, mordida e minigame de captura.
- Pesca submarina e pesca com redes em lote.
- Raridades, pesos, XP, moedas, multiplicadores e progressão até o nível 30.
- Mundos, regiões desbloqueadas por nível e catálogo de peixes.
- Armazém com limite, aquário, skins de vara e barco.
- Roletas, presentes diários e ranking local.
- Internacionalização e cenas 3D com Three.js/React Three Fiber.
- Persistência local versionada, migração de saves legados e validação com Zod.

## Arquitetura atual

O frontend é uma SPA baseada em Vite. O estado do jogador é controlado por `src/game/useGameState.ts`, as regras puras estão sendo extraídas para módulos de domínio, e a persistência usa `localStorage` por meio de uma abstração `KeyValueStorage`.

Um backend (Fastify + PostgreSQL + Drizzle) está em construção em `backend/` na branch `feature/task-06-backend-foundation` — ainda não integrado em `main` e o frontend ainda **não** o consome. Enquanto isso, conta, ranking e progresso local não devem ser considerados confiáveis para competição online. Arquitetura, análise e ajustes pendentes estão em [`backend/docs/ARCHITECTURE.md`](./backend/docs/ARCHITECTURE.md), [`docs/analysis/`](./docs/analysis/) e [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md).

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

Os testes atuais cobrem regras de pesca, persistência, migração de saves, progressão, desbloqueios, capacidade do armazém e o adaptador de armazenamento. Playwright está configurado para a evolução dos testes E2E.

Antes de abrir um pull request:

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run backend:typecheck
npm test
npm run build
```

Pull Requests para `main` executam automaticamente o workflow **Code Review**: job
`quality` (TypeScript frontend + backend, testes unitários, build de produção) e job
`integration` (migrações + testes de integração contra um PostgreSQL efémero). O
merge deve ocorrer somente após os checks obrigatórios aprovarem e a revisão do
código ser concluída.

## Estratégia de branches

```text
main
  ↑
feature/task-01
  ↑
feature/task-02
  ↑
feature/task-03
  ↑
feature/task-04-frontend-complete
  ↑
feature/task-05
```

O trabalho atual está em `feature/task-04-frontend-complete`, dedicada à conclusão e à qualidade do frontend. A memória técnica, os commits e o roadmap completo estão em [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md).

## Roadmap resumido

1. **Task 1 — Estabilização do núcleo:** concluída.
2. **Task 2 — Refatoração arquitetural:** concluída.
3. **Task 3 — Conteúdo e balanceamento:** concluída.
4. **Task 4 — Qualidade e conclusão do frontend:** em andamento.
5. **Task 5 — Campeonato e ranking global:** planejada.

## Origem

O protótipo inicial foi criado no [Lovable](https://lovable.dev) e atualmente é mantido localmente e versionado neste repositório GitHub.
