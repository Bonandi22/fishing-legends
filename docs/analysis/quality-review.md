# Revisão de qualidade e testes

Data: 2026-09-05 · Branch: `feature/task-06-backend-foundation`

## 1. Verificações automáticas

| Comando | Resultado | Notas |
|---|---|---|
| `npm run backend:typecheck` | ✅ | `tsc --noEmit -p tsconfig.backend.json` limpo |
| `npx tsc --noEmit -p tsconfig.app.json` | ✅ (assumido; sem alterações no frontend) | rodar no PR |
| `npm test` | ✅ 34 testes, 7 ficheiros | ver §2 |
| `npm run lint` | ✅ 0 erros, 12 avisos | todos `react-refresh/only-export-components`, frontend |
| `npm run build` | ✅ | avisos: Browserslist 15 meses; chunk `index-*.js` 1.5 MB (441 kB gzip) |

## 2. Cobertura de testes — principal lacuna

### 2.1 O backend só é testado em memória

`backend/src/app.test.ts` tem 14 testes. **Todos** correm com `createApp` sem
`DATABASE_URL`, logo exercitam exclusivamente os `service.ts` em memória. O que
**não** é testado:

- Qualquer `pgRepository.ts` / `pgService.ts` — o caminho que vai para produção.
- Correção das 13 migrações SQL (nunca aplicadas por um teste).
- Comportamento transacional: rollback em falha parcial, concorrência na mesma
  sessão de pesca, colisão de idempotency key.
- As divergências memória vs PG documentadas em `backend-review.md` §3 passam
  despercebidas porque o lado PG nunca corre.

Recomendação: testes de integração com PostgreSQL efémero (Testcontainers ou um
serviço `postgres` no CI) que apliquem as migrações e exercitem cada
`pgRepository`. Alvo mínimo: auth (registo/login/refresh/rotação), economia
(crédito/compra/idempotência/saldo negativo), pesca (conclusão transacional +
conclusão concorrente), inventário (venda atómica), migração de save, recompensa
diária (uma por dia).

### 2.2 Sem testes unitários de domínio no backend

Lógica pura sem teste: `applyProgress`/`xpForLevel` (`fishing/pgService.ts`),
`validateLocalSave` (`migration/service.ts`), `rewardForDay`/`todayUtc`
(`rewards/service.ts`), cálculo de `score` (leaderboard). São funções puras,
baratas de testar, e cobrem regras de economia/progressão.

### 2.3 Frontend

`src/test/` tem 6 ficheiros: `fishingLogic`, `persistence`, `stateRules`,
`storage`, `catalog`, `example`. Cobrem regras de pesca, migração de save,
progressão e o adaptador de storage — bom para o âmbito frontend-only. `example.test.ts`
é um placeholder e pode sair. Playwright está configurado mas sem specs no repo.

### 2.4 Sem teste de contrato

`GET /openapi.json` (`http/routes/system.ts:30`) devolve um documento com **duas**
rotas (`/health`, `/ready`) enquanto a API tem ~20. Não há geração a partir dos
schemas Zod nem teste que verifique que cada rota registada aparece no OpenAPI.
`ARCHITECTURE.md` e os "critérios de pronto" exigem "OpenAPI publicada".

## 3. CI

`.github/workflows/code-review.yml`:

- Typecheck **só** `tsconfig.app.json` — não corre `backend:typecheck`.
- `npm test` corre backend (o glob do `vitest.config.ts` inclui `backend/**`), mas
  sem PostgreSQL não há integração.
- Não corre `drizzle-kit generate --check` nem valida migrações.
- `push` em `feature/**` dispara o workflow — ok.
- CodeQL removido (GitHub Advanced Security indisponível no plano) — documentado.

Ajustes: adicionar step `npm run backend:typecheck`; adicionar serviço `postgres`
+ step de migração + testes de integração; adicionar `drizzle-kit generate --check`
depois de reconciliar schema/migrações.

## 4. Dívida técnica

| Item | Local | Nota |
|---|---|---|
| `http/errors.ts` — `if` gigante + ternários para status | `backend/src/http/errors.ts:23` | trocar por `Map<code,status>` ou erro de domínio com `statusCode` |
| Auth reparseada em ~9 rotas | vários `*/routes.ts` | extrair `preHandler` que popula `request.userId` |
| `xpForLevel`, `NET_PRICE`, `MULTIPLIER_COST*`, valores de venda duplicados backend/frontend | `fishing/pgService.ts:9`, `economy/*`, `inventory/*` | importar de `src/game/types.ts` ou criar módulo de regras partilhado |
| `db/schema.ts` sem os checks/uniques das migrações | `backend/src/db/schema.ts` | reconciliar (bloqueia `drizzle-kit generate`) |
| `EconomyService` type ≠ implementações (`debit`) | `economy/service.ts:11` | alinhar tipo e as duas implementações |
| Memória não aplica progresso na pesca | `fishing/service.ts:66` | igualar ao comportamento PG |
| `example.test.ts` placeholder | `src/test/example.test.ts` | remover |
| Browserslist desatualizado | build | `npx update-browserslist-db@latest` |
| Bundle 1.5 MB num único chunk | build | code splitting / `manualChunks` (adiado no `PROJECT_MEMORY`) |
| `@ts-nocheck` em componentes 3D | `src/components/game/scene/*` | reduzir gradualmente |
| Vulnerabilidades transitivas (1 low, 4 mod, 15 high reportadas) | `npm install` | tarefa própria; **não** `npm audit fix` automático |
| `bun.lock` + `bun.lockb` + `package-lock.json` coexistem | raiz | escolher um gestor; o CI usa `npm ci` |

## 5. Documentação

- `README.md` e `PROJECT_MEMORY.md` ainda descrevem o projeto como frontend-only /
  "não existe backend" (`README.md:20`, `PROJECT_MEMORY.md:9`). Desatualizado — há
  20 commits de backend nesta branch. (Atualização de `PROJECT_MEMORY.md` faz parte
  deste trabalho.)
- `backend/docs/ARCHITECTURE.md` é bom mas descreve estado "a implementar" para
  coisas já feitas (auth, `/me`, catálogo, pesca…) e planos que divergiram
  (`refresh_tokens`, Argon2id, logout). Merece uma passagem de "o que foi
  efetivamente construído".
- Não há `CLAUDE.md` até este trabalho.
