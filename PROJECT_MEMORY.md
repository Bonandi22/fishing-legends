# Deep Blue Lure — Memória do Projeto

Este arquivo mantém o contexto técnico e o roadmap versionados no repositório. Ele deve ser atualizado ao concluir cada etapa relevante.

## Estado atual

- Data de referência: 2026-09-11.
- Projeto: jogo de pesca React/TypeScript com Vite, Vitest, Playwright e sistemas 3D.
- Backend Fastify + PostgreSQL integrado em `main` e consumido pelo frontend
  (Task 10 concluída — auth, economia, pesca, aquário, ranking e temporadas
  server-authoritative). Ver `docs/analysis/` para o histórico da auditoria.
- **Task 11 (endurecimento de produção) concluída** — backups automáticos do
  Postgres e HTTPS forçado/HSTS estão implementados e commitados
  (`docker-compose.prod.yaml`, `scripts/backup/*`, `scripts/deploy/init-letsencrypt.sh`,
  `docs/deploy/production.md`), mas **não exercitados contra uma VPS/domínio
  reais** — único passo que falta antes de um primeiro deploy real.
- Persistência do frontend: `localStorage` só como cache/fallback para modo
  anónimo; a fonte de verdade para utilizadores autenticados é o backend.
- Branch principal integrada: `main`, em `1eeb05f`.
- PRs das Tasks 2, 3 e 4: `Bonandi22/deep-blue-lure#1`, `#2` e `#3`, todos integrados.
- PR da revitalização de interfaces: `Bonandi22/deep-blue-lure#4`, integrado na `main`.
- PR da Task 11: `Bonandi22/deep-blue-lure#41`, integrado na `main`.
- CodeQL removido temporariamente do workflow em razão da indisponibilidade de GitHub Advanced Security para o repositório privado no plano atual.
- `main` continua sendo a base de integração.

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
feature/task-04
  ↑
feature/task-05
```

Cada branch deve conter uma etapa coerente e pode receber commits incrementais. A próxima branch só deve ser criada quando a etapa anterior estiver validada e consolidada.

## Ponto de parada — 2026-09-04

- O frontend está funcional e integrado na `main`.
- A revitalização visual foi integrada pelo PR `#4`.
- Foi criada a correção local `fix/menu-symmetry` com o commit `fc78fd1` para equilibrar tamanhos, larguras e alturas dos elementos da página inicial.
- Essa correção ainda não foi publicada nem aberta em PR; retomar por ela antes de iniciar qualquer nova task.
- O servidor local do jogo foi iniciado em `http://127.0.0.1:8082`; as portas `8080` e `8081` estavam ocupadas por instâncias anteriores.
- Playwright foi instalado como extensão do VS Code e o Chromium foi baixado com sucesso.
- O build de produção passa. Permanecem alertas de Browserslist desatualizado e chunks grandes.
- O workflow de CI mantém TypeScript, Vitest e build; CodeQL foi removido por indisponibilidade de GitHub Advanced Security no repositório privado.
- Não iniciar autenticação, ranking global ou Campeonato até concluir a fundação e a revisão do backend.

## Roadmap

### Task 1 — Estabilização do núcleo — concluída

Commit principal: `6e7a699`.

- Corrigidas operações que dependiam incorretamente de retornos síncronos de `setState`.
- Consumo de redes normalizado e protegido contra saldo negativo.
- Progressão liberada até `MAX_LEVEL = 30`, compatível com o Mundo 3.
- Sorteio de raridade e pesos normalizado.
- Proteção contra finalização duplicada do minigame.
- Cleanup inicial de timers.
- Persistência com envelope versionado, migração de save legado e validação Zod.
- Validação de peixes, regiões e pesos contra o catálogo.
- Regras de progressão, desbloqueio e capacidade de inventário extraídas para `stateRules.ts`.
- Captura em lote implementada para redes.
- Testes de pesca, persistência e regras de estado.

### Task 2 — Refatoração arquitetural — concluída

Commit atual: `9c1977b`.

- Criado o contrato `KeyValueStorage` em `src/game/storage.ts`.
- O carregamento e salvamento do jogador aceitam storage injetado.
- Adicionado teste com storage em memória.
- Captura em lote foi integrada ao fluxo de redes.
- Regras de economia, redes, compras de itens, concessão de skins e multiplicadores foram extraídas para `stateRules.ts`.
- Venda do armazém e colocação de peixes no aquário também foram extraídas para regras puras.
- O hook React concentra transições de estado e efeitos de persistência; cálculos de domínio são testáveis sem renderizar componentes.
- Operações monetárias agora ignoram valores negativos e compras normalizam preços/poderes.
- A Task 2 possui commits incrementais e está publicada em `origin/feature/task-02`.

Task 2 foi fechada e publicada no Pull Request `Bonandi22/deep-blue-lure#1`.

### Task 3 — Conteúdo e balanceamento — concluída

- Validar automaticamente IDs de peixes e regiões.
- Revisar pools exibidos versus pools efetivamente sorteados.
- Corrigir e documentar probabilidades.
- Medir progressão de XP, moedas, pesos, raridades e capacidade do armazém.
- Criar testes de balanceamento e regressão de conteúdo.
- Adicionado `validateCatalog()` para detectar IDs duplicados, referências quebradas e faixas de peso inválidas.
- Adicionado `getNormalizedRarityWeights()` para expor probabilidades normalizadas por pool e nível, com teste de soma igual a 1.
- Branch criada e publicada: `feature/task-03`.
- Pull Request aberto: `Bonandi22/deep-blue-lure#2`.
- Workflow `.github/workflows/code-review.yml` criado para validar TypeScript, testes, build e CodeQL em Pull Requests para `main`.
- A primeira execução do workflow revelou `package-lock.json` fora de sincronia; o lockfile foi regenerado e validado com `npm ci`.
- Após a correção do lockfile, TypeScript, testes e build passaram no GitHub.
- O CodeQL executa a análise, mas o job falha ao publicar os resultados porque o code scanning ainda não está habilitado nas configurações do repositório; isso requer habilitação administrativa antes de tornar esse check obrigatório.
- O workflow mantém TypeScript, testes e build como gate obrigatório; CodeQL poderá ser reintroduzido quando GitHub Advanced Security estiver disponível.
- `npm ci` ainda reporta vulnerabilidades transitivas existentes (1 low, 4 moderate, 15 high); isso deve ser tratado em uma tarefa própria de dependências, sem aplicar `npm audit fix` automaticamente.

### Task 5 — Backend e autenticação — planejada

- Introduzir API e persistência server-side.
- Implementar autenticação real e autorização por usuário.
- Migrar ranking e conta local para dados remotos.
- Remover confiança do cliente para moedas, XP, inventário e resultados competitivos.

### Task 6 — Campeonato — planejada

- Definir temporadas, regras, pontuação e critérios antifraude.
- Reutilizar o domínio de captura, raridade, peso, XP e inventário.
- Implementar ranking global server-side.
- Adicionar auditoria, encerramento de temporada e premiações.

## Requisitos de segurança futura

Estes itens não fazem parte da fase frontend-only, mas são obrigatórios antes de disponibilizar recursos online:

1. Validação de formulários no servidor.
2. Rotas protegidas no backend.
3. Secrets fora do código e em variáveis de ambiente ou secret manager.
4. Validação de autorização e isolamento por usuário.
5. Rate limiting e proteção contra abuso.
6. Validação de uploads por tipo, tamanho e conteúdo.
7. Respostas da API sem dados sensíveis.
8. Proteção contra XSS, sanitização e CSP.
9. CORS restritivo por ambiente.
10. Mensagens de erro sem detalhes internos.

## Decisões e riscos conhecidos

- `localStorage` é adequado apenas para o modo local; não deve ser considerado fonte confiável para competição.
- O ranking atual é local ao navegador e não representa ranking global.
- A conta local não oferece autenticação real nem isolamento de progresso.
- `useGameState.ts` ainda concentra operações de orquestração e efeitos; novas regras devem continuar sendo extraídas com cuidado.
- Componentes 3D possuem arquivos com `@ts-nocheck` e devem ser tratados gradualmente.
- O bundle de produção é grande por causa dos assets 3D e imagens; code splitting será avaliado depois da separação arquitetural.
- Alterações devem ser feitas sem apagar mudanças de usuário e sem modificar backend inexistente.

## Guardrails permanentes (definidas em 2026-07-08)

Aplicam-se a qualquer tarefa, agêntica ou não. Não são negociáveis por omissão — só o utilizador as pode suspender explicitamente para uma tarefa concreta.

### Qualidade

- Nenhuma mudança é considerada pronta sem testes a passar e sem o utilizador ter revisto o diff.
- Antes de declarar uma tarefa terminada, apresentar o diff (ou resumo, se grande) e um resumo dos riscos — o que pode partir, o que não foi testado, dependências afetadas.
- Para mudanças com comportamento em runtime (não só documentação/configuração), o teste manual local — correr a app e exercitar o fluxo, não só `dotnet build`/testes automáticos — faz parte do "pronto para merge", não é um passo opcional a fazer depois.
- Não há ferramenta de browser disponível neste ambiente, por isso esse teste manual é sempre do utilizador: ao trabalhar num worktree isolado, indicar o caminho da pasta logo no início (é uma checkout normal, corre-se `dotnet run`/`npm start` diretamente lá) para o utilizador poder testar por partes à medida que se avança, em vez de só no fim.

### Segurança

- Nunca escrever segredos (chaves, tokens, senhas, connection strings, secrets de API) em código, commits, migrações, logs ou output de debug.
- Tudo sensível vive em `ICM_*` (env vars) ou `appsettings.Development.json`/`.env`/`.env.docker` (git-ignored) — nunca em `appsettings.json` commitado.
- Verificar ficheiros staged antes de commitar, mesmo com nomes inocentes.

### Custo

- No final de qualquer tarefa que use loops, subagents/forks ou múltiplas iterações de exploração, apresentar uma estimativa do esforço gasto (nº de agentes lançados, builds/testes repetidos, tempo aproximado) e sugerir onde reduzir da próxima vez.

## Validação registrada

Na conclusão das Tasks 1, 2, 3, 4 e da revitalização visual:

- TypeScript passa com `npx tsc --noEmit -p tsconfig.app.json`.
- Vitest passa com 20 testes.
- Build de produção passa.
- O build ainda emite o alerta de chunks grandes do Vite.
- A correção de simetria da página inicial foi validada com build de produção e `git diff --check`.

## Plano de redesenho completo do backend — definido em 2026-09-04

### Estado de parada

- O PR `Bonandi22/deep-blue-lure#5` foi integrado na `main`.
- Merge commit atual: `9e6428a`.
- A `main` local estava sincronizada com `origin/main` e o worktree estava limpo antes desta atualização de memória.
- O frontend está funcional e a correção de simetria do menu foi integrada.
- O frontend foi executado localmente para revisão manual em `http://localhost:8081/`.
- Nenhum código de backend foi criado.
- Nenhuma alteração de código da aplicação foi feita nesta etapa de planejamento.
- A próxima etapa é desenhar e aprovar a arquitetura do backend antes de implementar qualquer módulo.

### Objetivo

Transformar o frontend atual em um cliente de uma API confiável, mantendo o servidor como autoridade sobre identidade, progresso, XP, moedas, inventário, capturas, ranking, temporadas e Campeonato.

O `localStorage` poderá continuar como suporte temporário para modo local, cache e migração, mas não será fonte confiável para recursos online ou competitivos.

### Arquitetura-alvo

```text
React/Vite
   |
   | HTTPS / JSON
   v
API Backend
   |
   +-- Autenticação e autorização
   +-- Regras de domínio do jogo
   +-- Economia e inventário
   +-- Capturas e sessões de pesca
   +-- Ranking e temporadas
   +-- Auditoria e antifraude
   |
   +-- PostgreSQL
   +-- Redis opcional
   +-- Serviço de jobs opcional
```

Stack a decidir formalmente na primeira etapa:

- Backend: Node.js + TypeScript.
- HTTP: Fastify ou NestJS.
- Validação: Zod.
- Banco: PostgreSQL.
- ORM e migrações: Drizzle ou Prisma.
- Autenticação: sessão segura ou access token curto com refresh token rotativo.
- Testes: Vitest para domínio/API e Playwright para fluxos integrados.
- Contratos: OpenAPI.
- Observabilidade: logs estruturados, métricas e rastreamento de erros.

### Sequência de implementação planejada

#### Fase 0 — Decisões e contratos

Branch sugerida: `feature/task-05-backend-design`.

Entregáveis:

- documento de arquitetura;
- decisão da stack;
- modelo inicial de dados;
- contrato de autenticação;
- contrato de API;
- política de migração do save local;
- ambientes local, staging e produção;
- versionamento da API;
- matriz de permissões;
- threat model básico;
- critérios de aceite por módulo.

Nenhum código de produção deve ser escrito antes da revisão desses contratos.

#### Fase 1 — Fundação

Branch sugerida: `feature/task-06-backend-foundation`.

Implementar estrutura modular, configuração por ambiente, PostgreSQL, migrações, tratamento de erros, validação Zod, logging, health/readiness checks, CORS, headers de segurança, rate limiting, OpenAPI, CI e testes unitários/de integração.

Estrutura sugerida:

```text
backend/
  src/
    app/
    config/
    db/
    modules/
      auth/
      players/
      game/
      economy/
      inventory/
      leaderboard/
      seasons/
      admin/
    shared/
      errors/
      validation/
      logging/
      security/
  migrations/
  tests/
```

#### Fase 2 — Identidade e contas

Implementar criação de conta, login, logout, refresh, recuperação, alteração de username, país, exclusão, isolamento por `user_id`, normalização/unicidade de username, auditoria e expiração/revogação de sessões.

Tabelas iniciais:

- `users`;
- `user_profiles`;
- `sessions`;
- `refresh_tokens`;
- `auth_events`.

Senhas nunca serão armazenadas em texto puro; usar Argon2id ou bcrypt adequadamente configurado.

#### Fase 3 — Perfil e progresso

Migrar para o servidor nível, XP, mundos/regiões desbloqueados, coleção, skins, redes, multiplicadores, estatísticas e preferências persistentes.

O servidor deverá calcular ou validar XP, níveis, desbloqueios, capacidade e progressão máxima. O cliente enviará intenções/ações, não saldo ou estado final confiável.

#### Fase 4 — Domínio de pesca server-side

Reutilizar e adaptar o domínio existente de raridade, pools, peso, XP, moedas, regiões, mundos e captura em lote.

Fluxo planejado:

1. cliente solicita início de sessão de pesca;
2. servidor cria `fishing_session`;
3. servidor fornece identificador e parâmetros;
4. cliente executa a interação visual;
5. cliente envia o resultado da ação;
6. servidor valida sessão, tempo, estado e regras;
7. servidor calcula a captura;
8. servidor grava o resultado em transação;
9. servidor retorna o estado autorizado.

Tabelas possíveis:

- `fishing_sessions`;
- `fishing_attempts`;
- `catches`;
- `fish_catalog_versions`;
- `game_rules_versions`.

Cada captura deverá registrar jogador, região, mundo, peixe, peso, raridade, XP, moedas, multiplicadores, timestamp, versão de regras e idempotency key.

#### Fase 5 — Economia e inventário

Migrar carteira, histórico de saldo, venda, compras, consumo de redes/multiplicadores, roletas, skins, aquário, armazém e recompensas para operações transacionais.

Usar ledger imutável, impedir saldo negativo, validar duplicação por idempotency key, registrar origem e executar operações econômicas em transação.

Tabelas possíveis:

- `wallets`;
- `wallet_transactions`;
- `inventory_items`;
- `inventory_transactions`;
- `warehouse_fish`;
- `aquarium_fish`;
- `owned_skins`;
- `owned_boats`;
- `owned_rods`;
- `multiplier_items`;
- `net_items`.

#### Fase 6 — Catálogo e regras de conteúdo

Versionar peixes, regiões, mundos, pesos, raridades, probabilidades, recompensas, preços, skins, roletas, presentes e regras de Campeonato.

Manter IDs estáveis, validação no deploy, histórico de mudanças, conteúdo público separado de regras internas, ativação/desativação e compatibilidade com saves antigos.

#### Fase 7 — Ranking global

Substituir o ranking local por ranking server-side com peso máximo, XP, moedas obtidas e peixes raros, incluindo temporadas, paginação, limites, cache e desempates explícitos.

Preservar eventos de pontuação, snapshots, período da temporada, versão das regras e origem da pontuação.

#### Fase 8 — Presentes, roletas e recompensas

Migrar presentes diários, roletas e bônus para sorteio server-side, limite diário, timezone definido, idempotência, registro do resultado e auditoria.

#### Fase 9 — Migração do modo local

Fluxo planejado:

1. usuário faz login;
2. frontend lê o save local;
3. frontend envia para pré-validação;
4. servidor valida catálogo, pesos e limites;
5. servidor retorna inconsistências;
6. usuário confirma;
7. servidor importa somente dados aceitos;
8. migração é registrada;
9. save local permanece como backup temporário;
10. dados online tornam-se a fonte principal.

#### Fase 10 — Integração gradual

Migrar por módulos nesta ordem:

1. autenticação;
2. perfil;
3. carregamento do jogador;
4. inventário;
5. carteira;
6. captura;
7. lojas;
8. roletas e presentes;
9. ranking;
10. modo competitivo.

Separar progressivamente `useGameState` em cliente de API, cache/query state, estado visual local, domínio compartilhado e adaptador de compatibilidade.

#### Fase 11 — Segurança e antifraude

Antes de ranking competitivo: autorização por recurso, rate limiting, proteção contra replay, idempotência, validação temporal, limites de captura, detecção de padrões impossíveis, auditoria, rotação de tokens, CSP, CORS restritivo, proteção XSS, validação de payloads, proteção de roletas e revisão/bloqueio de contas suspeitas.

O servidor nunca deverá confiar em moedas, XP, peso, raridade, inventário, pontuação, nível ou desbloqueios enviados pelo cliente.

#### Fase 12 — Campeonato e temporadas

Somente depois da identidade, economia e ranking estarem estáveis.

Tabelas possíveis:

- `seasons`;
- `season_rules`;
- `season_entries`;
- `season_scores`;
- `season_rewards`;
- `season_audit_events`.

Definir antes da implementação duração, pontuação, categorias, elegibilidade, reset, desempates, premiações, encerramento, contestação, correções administrativas e publicação final.

### Critérios de pronto do backend

- entradas validadas;
- endpoints protegidos;
- autorização testada;
- economia transacional;
- ações importantes idempotentes;
- recompensas calculadas pelo servidor;
- auditoria disponível;
- testes unitários, de integração e de contrato;
- migrações reproduzíveis;
- OpenAPI publicada;
- secrets apenas em variáveis de ambiente/secret manager;
- staging funcional;
- backup e restauração testados;
- fluxo de erros de rede definido no frontend;
- modo local e migração documentados.

### Próxima sessão

Retomar pela Fase 0, com a stack já decidida:

1. escrever e revisar o documento de arquitetura;
2. desenhar o modelo de dados;
3. definir os primeiros contratos OpenAPI;
4. definir a estratégia de migração do `localStorage`;
5. definir a matriz de permissões e o threat model;
6. criar a branch própria da fundação;
7. somente depois implementar autenticação e módulos de domínio.

### Implementação iniciada — fundação do backend

Decisões confirmadas pelo utilizador em 2026-09-04:

- HTTP: Fastify.
- Persistência: PostgreSQL com Drizzle ORM.
- Autenticação futura: access token curto com refresh token rotativo.
- Escopo inicial: somente fundação, contratos básicos e health checks; sem economia, pesca ou Campeonato.

Arquivos adicionados:

- `backend/src/app.ts`;
- `backend/src/server.ts`;
- `backend/src/config/env.ts`;
- `backend/src/db/client.ts`;
- `backend/src/http/errors.ts`;
- `backend/src/http/routes/system.ts`;
- `backend/src/app.test.ts`;
- `backend/migrations/0000_foundation.sql`;
- `tsconfig.backend.json`;
- `.env.example`.

Arquivos de integração alterados:

- `package.json`;
- `package-lock.json`;
- `vitest.config.ts`.

Capacidades atuais:

- configuração validada com Zod;
- servidor Fastify inicial;
- tratamento centralizado de erros;
- endpoint `GET /health`;
- endpoint `GET /ready`;
- endpoint inicial `GET /openapi.json`;
- cliente Drizzle para PostgreSQL;
- migração inicial de controle `schema_migrations`;
- teste automatizado da fundação;
- configuração sem secrets commitados.

Validação da fundação:

- `npm run backend:typecheck`: passou;
- `npm test -- --run`: 22 testes passaram;
- `npm run build`: passou;
- teste manual em `http://127.0.0.1:8090/health`: HTTP 200;
- teste manual em `http://127.0.0.1:8090/ready`: HTTP 503 esperado sem `DATABASE_URL`;
- teste manual em `http://127.0.0.1:8090/openapi.json`: HTTP 200.

Observações:

- A porta padrão `8082` estava ocupada pelo frontend; a verificação manual do backend foi feita em `8090`.
- O frontend em `8081` não foi alterado.
- `npm install` reporta vulnerabilidades transitivas existentes; não foi executado `npm audit fix`.
- O próximo passo técnico é escrever o documento de arquitetura e o modelo de dados da Fase 0 antes de implementar autenticação ou módulos de domínio.

### Fase 0 iniciada

- Branch criada: `feature/task-06-backend-foundation`.
- Commit da fundação: `481ab83` — `Create backend foundation`.
- Documento de arquitetura criado em `backend/docs/ARCHITECTURE.md`.
- O documento registra stack, limites de módulos, fluxo de requisições, modelo de dados inicial, contratos de autenticação/API, migração do save local, segurança e threat model.
- A implementação de autenticação continua bloqueada até revisão do documento de arquitetura.

### Primeiro vertical slice de autenticação

- Adicionada a migração `backend/migrations/0001_identity.sql` com `users`, `user_profiles` e `sessions`.
- Adicionados hash de senha com `scrypt`, hash de refresh token com SHA-256 e access tokens JWT assinados.
- Adicionados contratos Zod para registro, login e refresh.
- Adicionado serviço de autenticação com rotação de refresh token.
- Adicionadas rotas `/api/v1/auth/register`, `/api/v1/auth/login` e `/api/v1/auth/refresh`.
- Adicionado repositório em memória exclusivamente para desenvolvimento/testes.
- Produção não inicia sem `DATABASE_URL`.
- A persistência PostgreSQL do módulo de autenticação ainda precisa ser implementada antes de qualquer deploy.
- A suíte passou com 24 testes e o typecheck do backend passou.

### Persistência PostgreSQL da autenticação

- Adicionado schema Drizzle tipado em `backend/src/db/schema.ts`.
- Adicionado `createPgAuthRepository()` com transações para criação de usuário/perfil, sessões, rotação e revogação.
- O app usa PostgreSQL quando `DATABASE_URL` existe e usa memória somente sem banco em desenvolvimento/testes.
- Adicionado `drizzle.config.ts`.
- Adicionados scripts `backend:db:generate` e `backend:db:migrate`.
- A validação executada não conectou a um PostgreSQL real; o typecheck e os 24 testes passaram.
- Antes de produção, executar migrações em staging e adicionar testes de integração contra PostgreSQL.

### Perfil e progresso server-side

- Adicionada a migração `backend/migrations/0002_player_progress.sql`.
- Adicionado schema Drizzle para `player_progress`.
- Adicionado `GET /api/v1/me`, protegido por access token.
- O endpoint retorna perfil, nível, XP, peixes capturados, moedas e locais desbloqueados.
- O perfil inicial é criado junto com usuário/perfil em uma transação PostgreSQL.
- O fallback em memória fornece progresso inicial apenas para desenvolvimento/testes.
- A suíte passou com 25 testes e o typecheck do backend passou.
- Economia, captura, inventário, ranking, recompensas, segurança avançada, temporadas e integração do frontend continuam sendo etapas posteriores.

### Catálogo server-side

- Adicionado serviço de catálogo validado com Zod, usando o catálogo atual como fonte inicial.
- Adicionado `GET /api/v1/catalog`.
- O serviço verifica IDs duplicados e referências quebradas antes de iniciar.
- O catálogo público inclui uma versão explícita (`local-v1`) para futura evolução e migração.
- O próximo passo é retirar progressivamente a dependência direta do catálogo do frontend e persistir versões no backend.

### Pesca server-side inicial

- Adicionada migração `backend/migrations/0003_fishing_sessions.sql`.
- Adicionados endpoints autenticados para iniciar e concluir sessões de pesca.
- Sessões exigem `Idempotency-Key` e repetição da mesma chave retorna a mesma sessão.
- O servidor valida a região, desbloqueio por nível e calcula peixe/peso/XP.
- A conclusão repetida da mesma sessão retorna o mesmo resultado.
- A persistência PostgreSQL das sessões e das capturas ainda precisa ser ligada ao serviço antes de produção competitiva; o primeiro slice usa memória para testes/desenvolvimento.
- A suíte passou com 27 testes e o typecheck do backend passou.

### Economia inicial

- Adicionada migração `backend/migrations/0004_economy.sql` para carteiras e ledger de transações.
- Adicionado endpoint autenticado `GET /api/v1/wallet`.
- O endpoint usa PostgreSQL quando `DATABASE_URL` existe e memória apenas no modo local/teste.
- O serviço de memória já aplica idempotência e impede saldo negativo para futuros créditos/débitos internos.
- Créditos, débitos, venda de capturas e integração transacional com pesca/recompensas ainda precisam ser fechados antes de produção.

### Inventário server-side inicial

- Adicionada migração `backend/migrations/0005_inventory.sql` para o armazém.
- Adicionados endpoints autenticados `GET /api/v1/inventory/warehouse` e `POST /api/v1/inventory/warehouse/sell`.
- Venda usa ledger idempotente e rejeita armazém vazio.
- O slice atual mantém itens em memória; a tabela PostgreSQL foi preparada, mas o repositório transacional de inventário e a integração automática da captura ainda precisam ser concluídos antes de produção.

### Integração de captura e inventário

- Adicionado repositório PostgreSQL de armazém.
- A captura concluída agora adiciona o peixe ao armazém através do adaptador de inventário.
- Em ambiente com `DATABASE_URL`, listagem e venda usam o armazenamento PostgreSQL.
- Em desenvolvimento/testes, o fluxo continua usando os adaptadores em memória.
- O ledger PostgreSQL e a remoção do armazém ainda precisam ser consolidados em uma única transação de banco antes de produção.
- A etapa de economia/inventário permanece em andamento até incluir aquário, redes, multiplicadores, compras e transações integradas.

### Fechamento transacional parcial da economia

- Venda PostgreSQL agora executa consulta, crédito no ledger e remoção do armazém na mesma transação.
- Idempotência da carteira é validada por `user_id` e chave.
- Adicionada migração `0006_aquarium.sql`.
- Adicionado endpoint `GET /api/v1/inventory/aquarium/:sector`.
- O aquário está persistido no schema PostgreSQL e pronto para receber operações de colocação.

### Transferência para o aquário

- Adicionada a operação autenticada `POST /api/v1/inventory/aquarium`.
- A operação recebe `warehouseItemId` e `sector` (1 a 5).
- No PostgreSQL, a remoção do armazém e a inserção no aquário acontecem na mesma transação.
- O fallback em memória aplica a mesma regra de transferência.
- Peixe inexistente no armazém retorna `WAREHOUSE_FISH_NOT_FOUND` com HTTP 404.
- A suíte passou com 29 testes e o typecheck do backend passou.

### Compras server-side de redes

- Adicionada a migração `0007_net_inventory.sql` com estoque de redes no progresso do jogador.
- Adicionado `POST /api/v1/economy/nets/purchase`.
- Preço fixo server-side: 5.000 moedas por rede; limite máximo: 10.
- O débito da carteira, o registro idempotente e o incremento do estoque são atômicos no PostgreSQL.
- O fallback em memória aplica as mesmas regras.
- Saldo insuficiente retorna `INSUFFICIENT_FUNDS`; limite excedido retorna `NET_LIMIT_REACHED`.
- O teste de rota cobre o limite inicial de 10 redes; o cenário de saldo insuficiente será coberto junto com a concessão de saldo controlada para testes.

### Multiplicadores server-side

- Adicionada a migração `0008_multipliers.sql`.
- Adicionado `POST /api/v1/economy/multipliers/purchase`.
- O backend aceita somente `luck`/`strength` e potências 2x/4x.
- Custos e duração são server-side: 3.000/6.000 moedas e 60 segundos.
- Débito, ledger idempotente e estado do multiplicador são persistidos em transação PostgreSQL.

### Pesca PostgreSQL transacional

- Adicionadas as colunas de resultado na migração `0009_fishing_results.sql`.
- O backend PostgreSQL agora persiste sessões de pesca e aplica idempotência no banco.
- A conclusão grava sessão, captura no armazém, XP, nível e total de peixes na mesma transação.
- Conclusões concorrentes da mesma sessão retornam o resultado já persistido sem duplicar a captura.
- O fallback em memória continua disponível somente para desenvolvimento/testes sem `DATABASE_URL`.

### Migração do save local

- Adicionada a migração `0010_local_save_migrations.sql`.
- Adicionados `POST /api/v1/migration/local/preview` e `POST /api/v1/migration/local/import`.
- O servidor valida peixes, locais, pesos, níveis e limites contra o catálogo.
- A prévia retorna contagens aceitas e rejeitadas sem alterar estado.
- A importação é única por usuário, idempotência é exigida na rota e a persistência PostgreSQL ocorre em transação.
- O save local continua sendo responsabilidade do cliente como backup temporário.

### Ranking global inicial

- Adicionado `GET /api/v1/leaderboard` com autenticação e paginação (`limit`/`offset`).
- A ordenação é estável por nível, peixes capturados, XP e identificador.
- A pontuação é derivada exclusivamente do progresso server-side: nível, peixes capturados e XP.
- PostgreSQL consulta todos os jogadores persistidos; o fallback em memória expõe o jogador atual para testes locais.
- Temporadas e snapshots históricos permanecem reservados para a etapa de temporadas.

### Recompensas diárias server-side

- Adicionada a migração `0011_daily_rewards.sql`.
- Adicionado `POST /api/v1/rewards/daily/claim`.
- O dia é validado pelo servidor e a data usa UTC.
- Cada usuário pode receber uma recompensa por dia; repetição retorna o resultado já registrado.
- Crédito na carteira, claim e ledger são gravados na mesma transação PostgreSQL.
- O primeiro slice server-side cobre recompensas em moedas; multiplicadores e skins permanecem para o módulo de recompensas completo.

### Endurecimento HTTP inicial

- Adicionados cabeçalhos de segurança, política CORS configurável e respostas OPTIONS.
- Adicionado rate limiting por origem/IP com janela configurável.
- Origens não permitidas recebem HTTP 403.
- Requisições de autenticação geram auditoria estruturada sem tokens ou payloads sensíveis.
- Os limites são locais ao processo; produção com múltiplas instâncias ainda deve usar Redis ou gateway compartilhado.

### Temporadas e Campeonato — fundação

- Adicionada a migração `0012_seasons.sql`.
- Adicionado `GET /api/v1/seasons/current`, protegido por autenticação.
- Temporadas possuem estado, janela de início/fim, versão de regras e nível mínimo de elegibilidade.
- PostgreSQL só retorna a temporada ativa dentro da janela válida.
- O fallback local fornece uma temporada ativa determinística para desenvolvimento/testes.
- Pontuação competitiva, inscrição, fechamento, snapshots e premiação permanecem bloqueados até a integração do ranking e antifraude.

### Análise completa do backend — 2026-09-05

Estado da branch `feature/task-06-backend-foundation`: 20 commits à frente de `main`
(`481ab83` → `cc475e2`). Worktree limpo antes desta atualização de memória.

Arquivos de suporte criados nesta etapa (documentação, sem alterar código de aplicação):

- `CLAUDE.md` na raiz — convenções, comandos, estrutura, guardrails e "o que não fazer".
- `docs/analysis/README.md` — índice e veredito.
- `docs/analysis/backend-review.md` — auditoria módulo a módulo.
- `docs/analysis/security-review.md` — 10 requisitos de segurança + threat model vs código.
- `docs/analysis/quality-review.md` — testes, tipos, lint, CI, dívida técnica.
- `docs/analysis/findings.md` — lista priorizada de ajustes (fonte para a próxima etapa).

Verificações executadas: `backend:typecheck` ✅ · `npm test` ✅ (34 testes) ·
`npm run lint` ✅ (0 erros, 12 avisos no frontend) · `npm run build` ✅.

Conclusão: o backend tem boa forma (módulos isolados, contrato memória/PG, Zod em
todas as entradas, transações e idempotência nos caminhos PG), mas **não está pronto
para ligar ao frontend**. Bloqueadores:

- **B1** — não há runner de migração funcional; `drizzle-kit migrate` aponta para
  `backend/migrations/generated`, que não existe; os `.sql` à mão não têm journal.
- **B2** — `backend/src/db/schema.ts` diverge das migrações SQL (uniques, checks,
  enums, índice parcial).
- **B3** — zero testes de integração PostgreSQL; os 14 testes de backend só exercitam
  os repositórios em memória.
- **B4** — o CI (`code-review.yml`) não roda `backend:typecheck` nem testes de
  integração.

Exploits/altos: **A1** recompensa diária escolhe o `day` no cliente (dia 7 sempre =
1500 moedas); **A2** `X-Forwarded-For` derrota o rate limiting; **A3** o sorteio de
captura no servidor ignora todo o sistema de raridade.

Médios notáveis: `GET /api/v1/seasons/current` não valida o token (`void auth;`);
oráculo de tempo no login permite enumerar contas; CORS default reflete qualquer
origem; valores de venda/economia divergem entre servidor (`xp/2`) e cliente
(`FISH_COIN_VALUE`); comportamento memória vs PostgreSQL diverge.

Guardrail reforçado: **não iniciar a integração do frontend com o backend nem a
autenticação no cliente** até B1–B4 e A1–A3 estarem resolvidos. Próxima etapa:
utilizador aprova quais achados de `docs/analysis/findings.md` endereçar; cada
ajuste com TDD, um de cada vez, diff revisto antes de commit.

Nenhum código de aplicação foi alterado nesta etapa de análise.

### Ajustes B1–B4 + Docker — 2026-09-05

Continuação da análise. Nenhuma rota/serviço da app mudou de comportamento.

**B1 — runner de migração** (decisão do utilizador: SQL à mão como fonte + runner próprio):
- `backend/src/db/migrate.ts` — helpers puros + `runMigrations` (aplica cada `.sql`
  pendente em transação, regista em `schema_migrations`).
- `package.json`: `backend:db:migrate` → `tsx backend/src/db/migrate.ts`;
  `backend:db:generate` fica só para detetar drift.
- `backend/src/db/migrate.test.ts` — 4 testes unitários dos helpers.

**B2 — `db/schema.ts` reconciliado com as 13 migrações SQL**: todos os `check()`,
`index`/`uniqueIndex`, o índice parcial `seasons_active_unique`, `claim_date`
corrigido de `varchar` para `date`, model `schema_migrations` adicionado.
Confirmado com `drizzle-kit generate` (diff coerente; só nomes de FK diferem).

**B3 — testes de integração PostgreSQL**:
- `vitest.integration.config.ts` + `npm run test:integration`; `*.integration.test.ts`
  excluído do `npm test`.
- `backend/src/testing/pgHarness.ts` — migra uma vez, trunca entre testes.
- **35 testes, executados e verdes contra PostgreSQL 16 real** (container efémero):
  migração runner, auth, economia, pesca (conclusão transacional + idempotência +
  isolamento entre jogadores), inventário (venda atómica, aquário, isolamento),
  recompensas (uma por dia UTC + ledger), migração de save (preview sem persistir,
  import transacional, progresso nunca desce, uma vez por utilizador).
- O runner de migração também foi validado: aplica as 13 migrações e é no-op na 2ª
  corrida.
- Dois testes documentam gaps conhecidos: M9 (retry da venda falha após esvaziar o
  armazém) e A1 (o `day` da recompensa vem do cliente).

**B4 — CI cobre o backend**: `code-review.yml` — job `quality` ganhou
`backend:typecheck`; novo job `integration` com `services: postgres:16` que corre
migrações + `test:integration`.

**Docker** (pedido do utilizador, "tudo no Docker como no ICM"):
- `compose.yaml` — postgres + backend (target `dev`, migra no arranque) + frontend (Vite).
- `backend/Dockerfile` e `Dockerfile` multi-stage (`deps` → `dev` / `build` → `runtime`).
- `docker/nginx.conf`, `.dockerignore`, `.env.docker.example` (`.env.docker` git-ignored).
- `README.md` e `CLAUDE.md` atualizados com o fluxo Docker.
- **Não construído/executado na sessão** (sem daemon Docker); `docker compose config`
  valida. Teste do utilizador: `cp .env.docker.example .env.docker && docker compose up`.

Verificações executadas: `backend:typecheck` ✅ · `npm test` ✅ (38 testes, integração
excluída) · `npm run lint` ✅ · `drizzle-kit generate` ✅ · `docker compose config` ✅.

Próximo: completar B3 (pesca/inventário/rewards/migração) e seguir para A1–A3.

### A1 — recompensa diária calculada no servidor — 2026-09-05

- `resolveRewardDay(lastClaim, today)` puro em `backend/src/rewards/service.ts`:
  sem histórico / dia perdido → 1; último claim ontem (UTC) → dia+1 com wrap 7→1.
- `claim` (PostgreSQL e memória) deixou de aceitar `requestedDay`; deriva o dia do
  último claim do utilizador.
- `POST /api/v1/rewards/daily/claim` já não valida `day` no corpo (ignorado se
  enviado). Resposta inalterada: `{ claimed, day, amount, transactionId, balance }`.
- TDD: 6 testes unitários de `resolveRewardDay` + suíte de integração de rewards
  passou de 4 para 8 testes (streak avança, wrap, reset após dia perdido, isolamento
  por utilizador, dia gravado na linha). `app.test.ts` atualizado (sem `day` no payload).
- Verificação: `backend:typecheck` ✅ · `npm test` ✅ 44 · `test:integration` ✅ 39
  (contra PostgreSQL real).
- Próximo: A2 (`trustProxy` no rate limit) e A3 (raridade no sorteio de pesca).

### A2 — `trustProxy` explícito, rate limit à prova de spoof — 2026-09-05

- `Fastify({ trustProxy: config.trustProxy })` em `backend/src/app.ts`;
  `clientKey` (`security/http.ts`) usa `request.ip` e nunca lê `X-Forwarded-For`
  diretamente.
- Nova env `TRUST_PROXY` + `parseTrustProxy` em `config/env.ts`: default `false`
  (header ignorado), `true`, ou lista de CIDRs/endereços de proxy. Fastify não
  aceita hop count no tipo — só `boolean`/lista. Adicionada a `.env.example` e
  `.env.docker.example` (compose usa `false`, backend acedido diretamente).
- TDD: 3 testes de `parseTrustProxy` + `security/http.test.ts` (spoof de
  `X-Forwarded-For` não escapa ao limite com default; buckets separam por IP
  encaminhado quando `trustProxy: true`).
- Verificação: `backend:typecheck` ✅ · `npm test` ✅ 49 · `test:integration` ✅ 39.
- Próximo: A3 (portar `rollFish`/raridade para o serviço de pesca do servidor).

### A3 — sorteio de captura ponderado por raridade — 2026-09-05

- `backend/src/fishing/roll.ts`: `normalizedRarityWeights` + `rollCatch(fish,
  playerLevel, random?)` — port fiel de `getNormalizedRarityWeights` e do caminho
  não-lucky de `rollFish`. Reutiliza `RARITY_CONFIG` de `src/game/types` (odds);
  duplica o algoritmo de seleção (frontend acoplado ao seu tipo `Fish`).
- `fishing/service.ts` e `fishing/pgService.ts` chamam `rollCatch(available,
  profile.level)` — antes era `available[Math.floor(Math.random()*length)]`.
- A versão do ruleset já era gravada na sessão (`rulesetVersion`).
- TDD: 8 testes unitários (RNG injetável; distribuição não-uniforme em 4000
  amostras). Testes de pesca existentes continuam verdes.
- Verificação: `backend:typecheck` ✅ · `npm test` ✅ 57 · `test:integration` ✅ 39.
- Fora do âmbito: RNG seedado (L7), lucky mode server-side.
- **A1, A2 e A3 concluídos.** Próximo bloco: M1/M2/M3/M6/M9.

### M6 + M1 — preHandler de autenticação partilhado — 2026-09-05

- `backend/src/auth/middleware.ts`: `createRequireAuth(authService)` → `preHandler`
  que valida o `Bearer` e popula `request.userId` (augmentação de tipos Fastify).
- `app.ts`: `decorateRequest('userId','')` + `decorate('requireAuth', ...)`. As 8
  `register*Routes` (players, economy, inventory, fishing, leaderboard, rewards,
  migration, seasons) deixaram de receber `authService`; cada rota autenticada usa
  `{ preHandler: app.requireAuth }`. Helpers `getUserId`/`userId` duplicados
  removidos.
- **M1**: `GET /api/v1/seasons/current` tinha `void auth;` e aceitava qualquer
  `Bearer x`. Agora valida via o preHandler. Teste novo em `app.test.ts`
  (sem header → 401, token inválido → 401).
- Rotas públicas sem preHandler: `/health`, `/ready`, `/openapi.json`,
  `/api/v1/auth/*`, `/api/v1/catalog`.
- Verificação: `backend:typecheck` ✅ · `npm test` ✅ 58 · `test:integration` ✅ 39 ·
  `lint` ✅ · smoke no servidor real via `docker compose` (`/me` 200/401,
  `/seasons/current` bad→401 valid→200, `/catalog` 200).
- Próximo: M2 (oráculo de tempo no login), M3 (CORS default), M9 (idempotência da venda).

### M2 + M3 + M9 — 2026-09-05

- **M2**: `auth/service.ts` calcula um `decoyPasswordHash` no arranque; `login`
  corre sempre `verifyPassword` (contra o decoy quando o email não existe) antes de
  rejeitar. Teste de tempo em `auth/service.test.ts`.
- **M3**: `security/http.ts` — sem `CORS_ORIGINS` configurado, nenhum
  `Access-Control-Allow-Origin` é emitido (antes refletia qualquer `Origin`). Com
  allowlist: eco das permitidas / `*` / 403 para as restantes. `CORS_ORIGINS`,
  `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` adicionados ao `.env.example`. 3 testes.
- **M9**: `sell` (PG + memória) verifica a `idempotencyKey` antes do
  `WAREHOUSE_EMPTY`; replay devolve `{ replayed: true }` com a transação gravada,
  sem lançar nem re-creditar. Teste de integração reescrito.
- **Bloco M inicial concluído**: M1, M2, M3, M6, M9. Próximo: M4/M5 (consistência
  economia + memória/PG), depois M7 (refresh token reuse detection) e M8 (OpenAPI).
- Verificação global: `backend:typecheck` ✅ · `npm test` ✅ 63 · `test:integration`
  ✅ 39 · `lint` ✅ · smoke docker (auth preHandler).

### M4 + M5 — 2026-09-05

- **M4**: `backend/src/economy/pricing.ts` — `fishSaleValue(rarity)` (usa
  `FISH_COIN_VALUE`), `netUnitPrice`, `multiplierPrice(power)`, tudo de
  `src/game/types`. Venda de peixe deixou de usar `xp/2`; redes/multiplicadores
  deixaram de ter números hard-coded. 3 testes.
- **M5** (parcial): `players/progress.ts` `applyCatchProgress` — fonte única
  (importa `getXpForLevel`/`MAX_LEVEL` do frontend), usada por `pgService` (cópia
  local removida) e pelo repositório de memória (agora stateful, com `recordCatch`).
  A conclusão de pesca em memória aplica XP/nível/`totalFishCaught` como o
  PostgreSQL — `app.test.ts` verifica. `debit` morto removido da economia em memória.
  Ainda diverge (só dev sem DB): leaderboard memória só o próprio, aquário memória
  não persiste — aceitável até o frontend ligar.
- Verificação: `backend:typecheck` ✅ · `npm test` ✅ 71 · `test:integration` ✅ 39 · `lint` ✅.
- Próximo: M7 (reuse detection de refresh tokens) e M8 (OpenAPI dos schemas Zod).

### M7 — reuse detection de refresh tokens — 2026-09-05

- Migração `0013_refresh_tokens.sql`: tabela `refresh_tokens` (id, session_id→sessions,
  token_hash unique, replaced_by→self, replaced_at, revoked_at); backfill dos hashes
  de `sessions`; `sessions.refresh_token_hash` removido. `sessions` = a família.
- `AuthRepository` reformulado: `createSession({userId, tokenHash, expiresAt})`,
  `rotateRefreshToken(...)` → `{ outcome: 'rotated' | 'reuse_detected' | 'invalid' }`,
  `revokeSession`. Removidos `rotateSession` e `findSessionByTokenHash`.
- Reuse (token já `replaced_at`/`revoked_at`, ou sessão revogada) → revoga todos os
  tokens da sessão + a sessão; o serviço lança `REFRESH_TOKEN_REUSED` (401, novo
  código em `http/errors.ts`).
- Impl. PostgreSQL (transacional) e memória. `AuthSession` perdeu `refreshTokenHash`.
- Testes: 4 de integração + 1 HTTP em `app.test.ts` (reuse → 401 + token rotacionado
  também morre). Smoke `docker compose` no servidor real: rotação ok, reuse do token
  antigo → `REFRESH_TOKEN_REUSED`, token rotacionado → 401.
- Verificação: `backend:typecheck` ✅ · `npm test` ✅ 72 · `test:integration` ✅ 41
  (migração 0013 aplicada) · `lint` ✅ · `drizzle-kit generate` ✅.
- Próximo: M8 (OpenAPI dos schemas Zod).

### Bloco L (dívida menor) — 2026-09-06

- **L1**: `http/errors.ts` — `if`+ternários → `DOMAIN_ERRORS` map (code → {status,
  message}); mensagens seguras e precisas. `errors.test.ts`.
- **L2**: `23505` (unique violation, no erro ou `.cause`) com constraint `idempotency`
  → `409 IDEMPOTENCY_CONFLICT`; outros → `409 RESOURCE_CONFLICT`. Fim do 500.
- **L3**: access token carrega `sid`; `verifyAccessToken` → `{ userId, sessionId }`;
  `requireAuth` popula `request.sessionId`. Nova rota `POST /api/v1/auth/logout`
  (revoga a sessão / cadeia de refresh tokens) → 204.
- **L4**: migração `0014` — `user_profiles_username_unique` vira índice funcional
  `UNIQUE (lower(username))`. `createUser` (PG + memória) lança `USERNAME_TAKEN`
  (409). Helpers pg movidos para `db/pgErrors.ts` (`isUniqueViolation`).
- Verificação: `backend:typecheck` ✅ · `npm test` ✅ 79 · `test:integration` ✅ 42
  (migração 0014 aplicada) · `lint` ✅ · `drizzle-kit generate` ✅.
- Falta: L5 (Argon2id — precisa de dep + migração verify-and-upgrade), L6 (mais
  testes de domínio — parcialmente coberto), L7 (expiração de sessão de pesca),
  L8 (pesca insere em warehouse_fish diretamente), L9 (browserslist, example.test),
  L10 (`bodyLimit`), L11 (`leaderboard.total`).
- Branch enviada para `origin/feature/task-06-backend-foundation` (nunca tinha sido
  pushada); `.gitignore`/`.dockerignore` revistos, `bun.lock`/`bun.lockb` removidos.
- **PR #6 mergeada em `main`** (merge commit `d23155a`), CI verde. Workflows do
  Claude no GitHub adicionados (paridade com o ICM); secret `CLAUDE_CODE_OAUTH_TOKEN`
  configurado pelo utilizador; GitHub App instalada.

### Task 7 — endurecimento do backend — branch `feature/task-07-backend-hardening`

- **L7** — expiração de sessões de pesca (`fishing/session.ts`, TTL 5 min,
  `FISHING_SESSION_EXPIRED` 410; sem migração).
- **README + GitHub About** atualizados (tecnologias, arquitetura, roadmap,
  descrição + topics do repo).
- **L8** — `fishing/pgService` deixa de inserir em `warehouse_fish` diretamente;
  usa `inventory/warehouse.ts` `addWarehouseFish(executor, input)` passando o seu `tx`.
- **L5** — Argon2id (`@node-rs/argon2`) com verify-and-upgrade dos hashes scrypt
  legados no login. `AuthRepository.updatePasswordHash` (PG + memória).
- Pendente na Task 7: **M8** (OpenAPI dos schemas Zod).

### M8 — OpenAPI gerado dos schemas Zod — branch `feature/openapi-from-zod` — 2026-09-06

- Plano A: `fastify-type-provider-zod@4` (Zod 3) + `@fastify/swagger@9`.
- `app.ts` regista os compiladores + swagger (`jsonSchemaTransform`); **`createApp`
  passou a ser `async`** — todos os call sites (`server.ts`, testes) ganharam `await`.
- `/openapi.json` serve o documento gerado (22 rotas, sempre em sync). As 11 rotas
  declaram `schema` em Zod (tags, body, params, querystring, response); os
  `z.object().parse()` inline foram removidos. Verificações de `Idempotency-Key`
  ficam inline (preservam `INVALID_IDEMPOTENCY_KEY`).
- `http/errors.ts` mapeia `hasZodFastifySchemaValidationErrors` → `400 VALIDATION_ERROR`.
- `http/openapi.test.ts` — teste de contrato.
- Verificação: `backend:typecheck` ✅ · `npm test` ✅ 96 · `test:integration` ✅ 45 ·
  `lint` ✅ · `build` ✅ · smoke no container (register 201, body inválido → 400,
  `/openapi.json` com 22 rotas).
- **Todos os itens da análise (`docs/analysis/findings.md`) concluídos** exceto M5
  (parcial — memória/PG só em dev sem DB).
- Nota: builds Docker locais a falhar intermitentemente com `ECONNRESET` no
  `npm ci` (rede, não código); Dockerfiles endurecidos com `--fetch-retries`.
  O CI do GitHub valida o `npm ci` (linux/gnu) na PR.

### Workflows Claude no GitHub (paridade com o ICM) — 2026-09-06

Replicados de `ICM_TESOURARIA/ICMSolution/.github/workflows/`:
- `.github/workflows/claude-code-review.yml` — review automática do Claude em cada
  PR (`opened`/`synchronize`/`ready_for_review`/`reopened`), usa
  `anthropics/claude-code-action@v1` + plugin `code-review`. Salta PRs do Dependabot.
- `.github/workflows/claude.yml` — handler de `@claude` em comentários de issue/PR,
  reviews e issues.
- `code-review.yml` renomeado para `ci.yml` (name: `CI`) para não confундir com a
  review do Claude.
- **Falta a ação do utilizador**: adicionar o secret `CLAUDE_CODE_OAUTH_TOKEN` em
  Settings → Secrets and variables → Actions (gerar com `claude setup-token`).
  Até lá o check "Claude Code Review" falha (não bloqueia — não é check obrigatório).

### Task 8 — repaginação da página principal (menu) — branch `feature/task-08-main-menu-redesign` — 2026-09-06

Redesenho visual profundo do `MainMenu`, direção "deep blue / submerso" aprovada pelo
utilizador. Sem backend, sem mudança de contrato: `Index.tsx` continua a passar as
mesmas props. Frontend-only.

- **Branch renomeada** de `feature/task-08-frontend-auth` para
  `feature/task-08-main-menu-redesign` (a auth do cliente continua bloqueada pela
  análise do backend; esta task é só UI).
- **Conceito**: o menu como uma descida — barra de superfície fina no topo, fundo em
  gradiente que escurece até ao abismo, ações em estratos com peso visual diferente
  em vez de uma grelha de botões iguais. Elemento memorável: o **mostrador de
  profundidade** (`DepthGauge`) — anel de progresso de XP + nível grande + leituras
  (peixes/espécies/moedas/armazém).
- **`MainMenu.tsx`** passou de ~480 para ~230 linhas; decomposto em
  `src/components/game/menu/`:
  - `account.ts` — `Account`, `loadAccount`/`saveAccount`, `COUNTRIES`, chaves.
  - `AccountModal.tsx` — modal de credenciais/username/login extraído **com lógica
    verbatim** (+ `role="dialog"`, `aria-modal`, `aria-labelledby`).
  - `SurfaceBar.tsx` — moedas + chip de Presentes (com ponto de notificação) +
    trigger de definições.
  - `SettingsSheet.tsx` — idioma + música + faixa consolidados numa `Sheet` (saíram
    dos quatro cantos).
  - `DepthGauge.tsx` — instrumento do jogador (SVG, anima o anel no load).
  - `WorldDial.tsx` — controlo segmentado de 3 estados (Mundo 1/2/3) com
    `aria-pressed` e locks por nível (12 / 20).
  - `HubList.tsx` — linhas de navegação compactas agrupadas ("O barco", "Sorte &
    economia").
- **Tema (menu-scoped, não afeta outras telas)**: novos tokens HSL em `index.css`
  (`--abyss`, `--menu-panel`, `--menu-raised`, `--lure`, `--lure-foreground`,
  `--biolume`) + cores/`fontFamily.display` em `tailwind.config.ts`. Fonte display
  **Big Shoulders Display** (via Google Fonts) aplicada só no menu; o Cinzel global
  de `h1/h2/h3` fica intacto. Utilitário `.font-body` para os `<h2>` do menu não
  herdarem Cinzel. Classes `.menu-surface` / `.menu-caustic` / `.menu-panel` /
  `.menu-row` + `@keyframes menu-caustic-drift` (desligado em
  `prefers-reduced-motion`).
- **Movimento**: uma sequência de load (stagger sink dos blocos + varredura do anel);
  `useReducedMotion` respeitado. Sem hover-wobble por card. Removida a rotação
  infinita do emoji do título.
- **i18n**: novas chaves `menu.tagline`, `menu.sectionBoat`, `menu.sectionLuck`,
  `menu.worldLabel`, `menu.unlockAt`, `menu.settingsTitle`, `menu.musicTrack`,
  `menu.species`, `menu.close`, `menu.dailyGifts` — nos 6 idiomas. "Presentes"
  deixou de ser hard-coded.
- **Testes (novos, RTL)**: `src/test/MainMenu.test.tsx` (11) — caracterização do
  comportamento preservado (callbacks de navegação, locks de mundo, ponto de
  presentes, reset por nível, modal de conta) + 2 do novo `WorldDial`
  (`aria-pressed`, seleção direta do Mundo 3). `src/test/AccountModal.test.tsx` (2)
  — login por username guardado e erro de conta não encontrada.
- **Ajustes pós-revisão do diff (2026-09-06)**:
  - Removido o prop morto `onSwitchWorld` (interface de `MainMenu`, `Index.tsx` e
    o handler de teste) — o `WorldDial` chama `onSetWorld` diretamente para os 3
    mundos, o toggle antigo `w === 2 ? 1 : 2` deixou de existir.
  - `DepthGauge` deixou de derivar o rótulo do armazém por regex sobre
    `t('menu.warehouse')` (`.replace(/^\S+\s/, '')`); nova chave `menu.storage`
    (sem emoji) nos 6 idiomas.
- **Verificação**: `tsc -p tsconfig.app.json` ✅ · `backend:typecheck` ✅ ·
  `npm test` ✅ 109 · `lint` ✅ (0 erros, 12 avisos pré-existentes) · `build` ✅ ·
  revisão visual do agente com Playwright em 390px e 1440px (desktop + mobile).
- **Pendente**: teste manual do utilizador (`npm run dev`, exercitar cada botão,
  troca de mundo/idioma/faixa, modal de conta, presentes) e revisão do diff antes de
  commit. Menu commitado em `977eb9d`. Fora de âmbito: relocar o banner de tutorial
  (hoje dentro do modal de conta, comportamento preservado); ligar o menu ao backend.

### Task 8 (cont.) — repaginação do ecrã de locais de pesca — mesma branch — 2026-09-06

Segunda tela do redesenho frontend. Direção aprovada pelo utilizador: **"carta
náutica / levantamento"** — o ecrã é uma carta batimétrica e cada local é um sítio
de amostragem sobre ela. Frontend-only, sem mudança de contrato (`Index.tsx` passa
as mesmas props).

- **`LocationSelect.tsx`** (~106 → ~66 linhas) decomposto em
  `src/components/game/locations/`:
  - `rarity.ts` — `fishRarityComposition(fishIds)` (puro): agrega `location.fishIds`
    por raridade via `getFishById`, ordenado common→cosmic. `RARITY_ORDER`,
    `rarityColor`.
  - `SpeciesSpectrum.tsx` — barra tipo eco-sonda: uma banda por raridade presente,
    largura = `count · √(RARITY_CONFIG.chance)` (amortecida para o topo raro ficar
    visível), com separadores; número à direita = tamanho do roster. `role="img"` +
    `aria-label` com o detalhe.
  - `LocationArt.tsx` — placa da carta: foto tratada (`saturate .9`, keyline,
    gradiente de legibilidade); sem foto (Mundos 2/3) → anéis de sonda em tinta
    `--lure` + brilho radial na `waterColor` do local + emoji-selo. Bloqueado →
    mesma placa + haze `bg-abyss/35 backdrop-blur`.
  - `LocationCard.tsx` — desbloqueado = `<button>` (`data-location`, foco visível);
    bloqueado = `<div data-location>` com objetivo `Alcança o nível N (+shortfall)`
    e `aria-label`. Sem opacidade-esbatida, sem rótulo de tipo com emoji (removido —
    era clutter).
  - `SurveyHeader.tsx` — título `loc.title` em Big Shoulders + medidor de progresso
    (`X/Y cartografados` + linha isóbata `--lure`); empilha no mobile.
  - `ChartField.tsx` — substrato SVG `position: fixed` de curvas de nível + sondas
    em `--lure` a baixo contraste, atrás dos cartões.
- **Tema**: nova classe `.chart-surface` em `index.css` (gradiente radial
  azul-abismo). **`world-bg-2/3` (vermelho/verde) já não são usados aqui** — a "sala
  de cartas" é monocromática azul em todos os mundos (a cor do mundo aparece na cena
  de pesca); coerente com os acentos cyan. As classes `world-bg-*` continuam usadas
  no `MainMenu`.
- **Movimento**: mesma sequência "afundar" escalonada do menu; `useReducedMotion`
  respeitado. Sem hover-lift por cartão (só a foto "emerge" — scale 1.04, desligado
  em reduced-motion).
- **i18n**: 3 chaves novas nos 6 idiomas — `loc.charted`, `loc.reachLevel`,
  `loc.world`.
- **Prop removida**: `onCastNet` do `LocationSelect` (nunca era passado nem usado).
- **Testes novos**: `src/test/locationRarity.test.ts` (4) — composição por raridade,
  ordenação, ids inválidos. `src/test/LocationSelect.test.tsx` (7) — filtro por
  mundo, contagem cartografada, seleção só de água desbloqueada, botão vs região,
  nível exigido no bloqueado, voltar.
- **Verificação**: `tsc app` ✅ · `backend:typecheck` ✅ · `npm test` ✅ 120 ·
  `lint` ✅ (0 erros, 12 avisos pré-existentes) · `build` ✅ · revisão visual do
  agente com Playwright (Mundo 1 e Mundo 2, 390px + 1440px).
- **Pendente**: teste manual do utilizador e revisão do diff. Nada commitado ainda
  nesta parte.
- **PR #9 mergeada em `main`** (merge commit `0ffe92d`), CI verde (incl. claude-review).
  Branch `feature/task-08-main-menu-redesign` apagada (remoto + local).

### Task 9 — repaginação frontend das telas restantes — 2026-09-06

Continuação da linguagem "deep blue" para as ~13 telas fora do menu/locais. Aprovado
fatiar em 5 PRs encadeados, revisão + merge antes de cada seguinte:

1. Fundação (shell partilhado) + `Collection` + `Warehouse`
2. Lojas: `MultiplierShop`, `SkinsShop`, `BoatSkinsShop`, `NetShop`
3. `Ranking`, `DailyGifts` (precisa i18n completa + repaleta), `Aquarium`
4. Roletas: `Roulette`, `SkinRoulette`
5. Cromo dos minijogos (HUD/botões/pop-ups de `FishingScreen`/`SubmarineFishing`/
   `NetFishing`) — **sem tocar na cena 3D nem na física do reel**; por último, task
   própria, teste manual pesado.

Frontend-only, sem mudança de contrato em nenhuma fatia.

#### Fatia 1 — branch `feature/task-09-frontend-screens-slice-1`

- **Shell partilhado `src/components/game/shell/`**: `GameScreen.tsx` (fundo
  `.deep-shell`, `ScreenHeader`, container `narrow`/`default`/`wide`, slot de ação
  fixo com `pb-32` de folga e safe-area, entrada "afundar" uma vez via
  `useReducedMotion`), `ScreenHeader.tsx` (título Big Shoulders + subtítulo + voltar
  `loc.back` + `CoinChip` opcional), `CoinChip.tsx`, `motion.ts` (`screenStagger`/
  `screenItem` — as variantes partilhadas). É a interface que as Fatias 2-5 usam
  para substituir `screen-shell`/`screen-header` (8 telas).
- **`Collection.tsx`**: `GameScreen` + tira de instrumentos compacta (nível/total/
  mais pesado) + **chips de raridade** (`aria-pressed`, substituem as Tabs shadcn) +
  grelha de `SpecimenTile` (`collection/`). Capturado = placa com fio da cor da
  raridade + imagem `FISH_IMAGES` + recorde; não-capturado = placa esbatida com
  ponto de raridade. **Espécimes capturados ordenados primeiro.**
- **`Warehouse.tsx`**: `GameScreen` (com `coins`) + manifesto (peso total +
  rendimento) + grelha de `HaulTile` (`warehouse/`, com `haul.ts` = `haulXp`/
  `haulCoins` puros) + "Vender tudo · +X XP · 💰 +Y" no slot de ação. Estado vazio
  decente.
- **`index.css`**: `.deep-shell` (gradiente azul-abismo calmo). **`.gitignore`**:
  `.playwright-mcp/`.
- **i18n**: +5 chaves nos 6 idiomas (`wh.name` sem emoji, `wh.sellAll`,
  `wh.totalWeight`, `wh.yield`; `col.speciesCount` deixou de ser usado).
- **Testes novos (TDD)**: `GameScreen.test.tsx` (7), `Collection.test.tsx` (5),
  `Warehouse.test.tsx` (4).
- **Verificação**: `tsc app` ✅ · `backend:typecheck` ✅ · `npm test` ✅ 136 ·
  `lint` ✅ (0 erros, 12 avisos pré-existentes) · `build` ✅ · revisão visual
  Playwright (cheios + vazios, 390px + 1440px). Teste manual do utilizador ✅.
- Commitada em `4ab049e`, **PR #10** aberta. Branch `feature/task-09-...-slice-2`
  encadeada a partir daqui.

#### Fatia 2 — branch `feature/task-09-frontend-screens-slice-2`

Lojas ("o armador"). Todas passam a usar `GameScreen` + `coins`.

- **`src/components/game/shops/`**: `CosmeticCard.tsx` (tile `menu-panel` `h-full`,
  slot de preview + nome + estado; equipado → anel `--lure`, possuído → `--biolume`,
  à venda → `PriceTag` + botão comprar desativado sem moedas; ação alinhada em baixo
  com `min-h`), `RodPreview.tsx` / `BoatPreview.tsx` (a arte CSS existente, extraída),
  `PriceTag.tsx` (`💰 N`, nada se grátis).
- **`SkinsShop.tsx`** / **`BoatSkinsShop.tsx`** — `GameScreen` + grelha de
  `CosmeticCard`. SkinsShop: "Visuais do barco" como `menu-row` de navegação (não
  botão gigante).
- **`MultiplierShop.tsx`** — `GameScreen` (`width="narrow"`) + 4 tiles de buff
  (efeito + duração + `PriceTag` + estado "ativo" com opacidade a pulsar).
- **`NetShop.tsx`** — `GameScreen` + painel "paiol": `nets/NET_LIMIT` grande +
  medidor de nível + botão. **i18n extraída** (as strings PT hard-coded saíram).
- **i18n**: +11 chaves nos 6 idiomas — `net.*` (6), nomes limpos sem emoji
  (`mult.name`, `skins.name`, `boat.name`), `skins.boatLink`. `net.subtitle` usa
  `{n}` resolvido com `.replace` no call site (o `t()` não interpola).
- Sem `index.css` novo (reuso `.deep-shell`, `menu-panel`, `--lure`/`--biolume`).
- **Testes novos (TDD)**: `CosmeticCard` (5), `SkinsShop`+`BoatSkinsShop` (5),
  `MultiplierShop` (3), `NetShop` (4).
- **Verificação**: `tsc app` ✅ · `backend:typecheck` ✅ · `npm test` ✅ 153 ·
  `lint` ✅ (0 erros, 12 avisos) · `build` ✅ · revisão visual Playwright (Skins,
  BoatSkins, Multipliers, 390px + 1440px).
- CI falhou 1x (`CosmeticCard` dependia de `toLocaleString()` — `1000`→`1,000` no
  ICU completo do CI; corrigido para `999`). **PR #11 mergeada** (`f2fbd8d`).

#### Fatia 3 — dividida em 3a (Ranking + DailyGifts) e 3b (Aquarium) a pedido do utilizador

##### Fatia 3a — branch `feature/task-09-frontend-screens-slice-3a`

- **`Ranking.tsx`** — `GameScreen` (`width="default"`) + tabela `menu-panel` (grid de
  4 colunas, linhas `<button>`, medalhas top-3, linha do jogador em `bg-lure/10`,
  seleção em `menu-raised`). `ranking/ProfileModal.tsx` — modal extraído com
  `role="dialog"`/`aria-modal`, swatches de skin/barco inline, tiles `menu-row`.
  Cartão "sua posição" (fora do top 100) → `menu-panel` fixo. `rank.*` i18n já
  completo.
- **`DailyGifts.tsx`** — **reconstrução total**: mata a paleta rosa/roxo/índigo,
  passa a `GameScreen` + `coins` + slot de ação. Tira de 7 dias → `dailygifts/
  DayTile.tsx` (resgatado = check `--biolume` esbatido · hoje = `--lure` + tag
  "HOJE" a pulsar · bloqueado = cadeado · dias exclusivos = `--biolume`). Popup de
  resgate → `menu-panel` `role="dialog"`. Lógica de estado dos dias preservada à
  letra (`claimedDay`/`isCurrent`/`isClaimed`). `dailygifts/rewards.ts`
  (`rewardLabel(r, t)` + `isExclusive`, puros) + `dailygifts/RewardIcon.tsx`
  (separados por causa do `react-refresh/only-export-components`).
- **i18n**: **+16 chaves `daily.*` nos 6 idiomas** (as strings PT hard-coded do
  DailyGifts saíram todas). `daily.subtitleRotation` usa `{n}` via `.replace`.
- **Testes novos (TDD)**: `Ranking` (4 — ordem, abre perfil, "sua posição", voltar),
  `DailyGifts` (4 — resgatar + popup, resgatado desativado, dias exclusivos, voltar).
- **Verificação**: `tsc app` ✅ · `backend:typecheck` ✅ · `npm test` ✅ 161 ·
  `lint` ✅ (0 erros, 12 avisos) · `build` ✅ · revisão visual Playwright (Ranking +
  perfil, DailyGifts + popup, 390px + 1440px). **PR #12.**

##### Fatia 3b — branch `feature/task-09-frontend-screens-slice-3b`

Toque leve no `Aquarium` — **a cena do tanque fica** (gradiente aquário, cáusticas,
peixes a nadar, silhuetas de público; era uma feature, não "gráfico amador").

- **`shell/FilterChip.tsx`** — o chip de filtro extraído do `Collection` (raridade /
  setor), agora partilhado. `Collection.tsx` passou a importá-lo.
- **`Aquarium.tsx`** — cena preservada; chrome alinhado: header com voltar
  `border-lure/25 bg-menu-panel/70` + título `font-display` + toggle `bg-lure`; tabs
  de setor → `FilterChip`; grelha de armazém → tiles `menu-panel` com fio da cor da
  raridade + `💰`/`⭐`. Removido estado morto (`selected`). Comportamento (troca
  tank/storage, mover peixe exige setor, um de cada vez) preservado.
- **i18n**: +4 chaves `aquarium.*` (`pickSectorFirst`, `sectorSelected` com `{n}`,
  `reward`) — as 2 strings PT hard-coded saíram.
- **Testes novos (TDD)**: `Aquarium` (4 — troca de vista, mover exige setor, setor
  vazio, voltar).
- **Verificação**: `tsc app` ✅ · `backend:typecheck` ✅ · `npm test` ✅ 165 ·
  `lint` ✅ (0 erros, 12 avisos) · `build` ✅ · revisão visual Playwright (tank +
  storage, 1440px). **PR #13 mergeada** (`8a0b8d2`).

#### Fatia 4 — branch `feature/task-09-frontend-screens-slice-4`

Roletas ("a roleta") — toque leve, a mecânica de giro fica intacta.

- **`Roulette.tsx`** (roda em `<canvas>`) e **`SkinRoulette.tsx`** (roda em SVG +
  rotação CSS) passam a `GameScreen` (`width="narrow"` + `coins`). Toda a matemática
  de spin/alinhamento preservada à letra.
- **Paleta**: `Roulette` — as 8 cores das fatias re-afinadas para o registo
  deep-sea (dourados suaves para moedas, teal/cyan para multiplicadores/fillers; as
  fatias de skin mantêm a cor real do item). `SkinRoulette` mantém as cores reais das
  skins (identidade do prémio). Ambas: separadores `#0a141b`, hub `#12212b` com anel
  `--lure`, ponteiro `--lure` (era vermelho).
- Botão girar → `bg-lure`. Cartão de resultado → `menu-panel` `border-lure/40`.
- **i18n**: +2 chaves (`roulette.name`, `skinRoulette.name`, sem emoji).
- **Testes novos (TDD)**: `Roulette` (3 — giro disponível, giro diário usado, voltar),
  `SkinRoulette` (3 — custo no botão, bloqueio sem moedas, voltar).
- **Verificação**: `tsc app` ✅ · `backend:typecheck` ✅ · `npm test` ✅ 171 ·
  `lint` ✅ (0 erros, 12 avisos) · `build` ✅ · revisão visual Playwright (as duas
  roletas, 1440px).
  **PR #14 mergeada** (`8f33ecf`).

#### Fatia 5 — dividida em 5a (FishingScreen + SubmarineFishing) e 5b (NetFishing)

##### Fatia 5a — branch `feature/task-09-frontend-screens-slice-5a`

Cromo dos 2 minijogos 3D. **A cena 3D, os overlays de barco/vara e a física do reel
(`PullMinigame`) NÃO são tocados** — só os painéis de HUD que flutuam por cima.

- **`.hud-panel`** (novo, `index.css`) — vidro para overlays sobre cena viva
  (`bg-abyss/75 + border-lure/15 + backdrop-blur`).
- **`FishingScreen.tsx`**: back / contadores / card de local / mensagem de fundo →
  `.hud-panel` (era `bg-background/80`); banner de sorte amarelo → `--lure`
  (`bg-abyss/80 border-lure/40`); barra XP → `bg-lure`/`bg-menu-raised`; botão PUXAR
  + "pescar/tentar novamente" → `bg-lure`; 2 modais de resultado
  `bg-card border-2` → `menu-panel border-lure/40` + `role="dialog"`.
- **`SubmarineFishing.tsx`**: mesmo tratamento — HUD, label do arpão, hint de fundo
  → `.hud-panel`; modal de captura → `menu-panel` `role="dialog"`; `+XP` → `biolume`.
- **i18n**: +3 chaves `fish.*` (`castNet`, `nets`, `netShop`) — as 3 strings PT
  hard-coded do FishingScreen (controlo de rede em lagos) saíram.
- **Testes novos**: `FishingScreen` (3 — HUD, voltar, controlo de rede só em lago;
  cena mockada) + `SubmarineFishing` (2 — título, voltar).
- **Verificação**: `tsc app` ✅ · `backend:typecheck` ✅ · `npm test` ✅ 176 ·
  `lint` ✅ (0 erros, 12 avisos) · `build` ✅ · revisão visual Playwright (HUD dos
  dois minijogos na cena real, 1440px). **Teste manual de gameplay (lançar, fisgar,
  puxar, capturar → modal) é do utilizador.**
- **Falta 5b**: `NetFishing` — reconstrução do cromo + i18n completa; nomes das
  redes derivados da raridade (`t()` + `getRarityLabel`), não do campo `name`.
- **PR #15** aberta.

##### Fatia 5b — branch `feature/task-09-frontend-screens-slice-5b`

`NetFishing` — **reconstrução completa do cromo + extração i18n total**. O minijogo
de barra (loop do `linePos`, `handlePull` com verificação da zona verde, sorteio da
rede) fica intacto.

- **`netfishing/netTypes.ts`** (novo) — `NetType`, `NET_TYPES` (9 grelhas, uma por
  raridade; sem o campo `name`), `randomNet`. Tirado do componente (arruma o aviso
  `react-refresh` — lint 12 → 11).
- **`NetFishing.tsx`** — passa a `GameScreen` (`width="narrow"`, subtítulo = local).
  As 5 fases (pull/pulled/opened/empty/lost) reestilizadas: barra vermelho/verde →
  `bg-destructive/40` + `bg-biolume/70` + marcador com glow `--lure`; botões PUXAR /
  ABRIR / "lançar outra" → `bg-lure`; grelha de resultado `Card border-2` → tiles
  `menu-panel` com fio da cor da raridade. **Nome da rede derivado da raridade**
  (`t('net.type')` — `getRarityLabel`), não do campo `name`.
- **i18n**: **+19 chaves `net.*` nos 6 idiomas** — todas as strings PT hard-coded do
  NetFishing (era zero i18n) saíram. `net.received` usa `{n}` via `.replace`.
- **Testes novos**: `NetFishing` (3 — fase inicial + controlo de puxar, nome da rede
  por raridade, voltar).
- **Verificação**: `tsc app` ✅ · `backend:typecheck` ✅ · `npm test` ✅ 179 ·
  `lint` ✅ (0 erros, **11** avisos) · `build` ✅ · revisão visual Playwright (fluxo
  completo: puxar → abrir → haul, 1440px).

**Task 9 completa** — todas as telas do jogo repaginadas na linguagem "deep blue".

### Task 10.1 — Fundação de auth (httpOnly cookies + proxy /api + cliente) — branch `feature/task-10-1-auth-foundation` — 2026-09-07

Primeira fatia da Task 10: o frontend passa a ter **sessão real via cookies httpOnly**
servidos same-origin. Ainda **não** consome o backend para o loop de jogo — o
`localStorage` continua a ser a store viva. Só troca identidade/progresso na
autenticação e importa o save local uma vez no 1º login.

- **Spec**: `docs/superpowers/specs/2026-09-06-task-10-1-auth-foundation-design.md`
- **Plano**: `docs/superpowers/plans/2026-09-06-task-10-1-auth-foundation.md`
- Commits `f2508f3..772891d` (13 tasks de implementação); esta secção = Task 14
  (verificação + registo).

#### Backend — auth por cookie + CSRF

- `@fastify/cookie@^11` adicionado. `config/env.ts` ganha `COOKIE_SECURE`
  (default `true`) e `COOKIE_DOMAIN` (opcional).
- `backend/src/auth/cookies.ts` (novo) — helpers `setAuthCookies` / `clearAuthCookies`
  / `readAccessToken` / `readRefreshToken` / `readCsrfCookie` / `generateCsrfToken`
  + tipo `CookieConfig`. `COOKIE_DOMAIN` só entra nos 3 cookies quando definido.

  | Cookie | Conteúdo | Atributos |
  |---|---|---|
  | `dbl_at` | JWT de acesso | `HttpOnly; Secure=<COOKIE_SECURE>; SameSite=Lax; Path=/api; Max-Age=ACCESS_TOKEN_TTL_SECONDS` |
  | `dbl_rt` | refresh token | `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=REFRESH_TOKEN_TTL_SECONDS` |
  | `dbl_csrf` | 32 bytes aleatórios base64url (**não** HttpOnly) | `Secure; SameSite=Lax; Path=/; Max-Age=REFRESH_TOKEN_TTL_SECONDS` (Path=/ — o JS tem de o ler via document.cookie na SPA servida em /) |

  Migração de cookie: browsers que autenticaram antes da mudança de `Path=/api`
  para `Path=/` guardam um `dbl_csrf` legado em `Path=/api` que mascara o novo no
  servidor (`cookie.parse` é first-wins) → `403 CSRF_FAILED` permanente, incluindo
  no logout. Correção: `setAuthCookies` (register/login/refresh) e
  `clearAuthCookies` (logout) emitem também `clearCookie('dbl_csrf', { path: '/api' })`,
  pelo que um browser pré-fix se auto-corrige no próximo auth. Remover o clear
  legado ~30 dias após o deploy (todas as sessões pré-fix já rodaram — ver
  `TODO(remove after 2026-10-07)` em `backend/src/auth/cookies.ts`).

- `auth/routes.ts`: `register` → `201 { user }` + 3 cookies; `login` → `200 { user }`
  + 3 cookies; `refresh` → lê o cookie `dbl_rt` (o `refreshSchema` do body foi
  removido), rotaciona, re-emite os 3 cookies, responde **204** sem body; `logout`
  → limpa os 3 cookies, mantém `preHandler: requireAuth`, 204. `registerAuthRoutes`
  ganhou um 3º parâmetro `cookieCfg`.
- `auth/middleware.ts` `createRequireAuth`: lê o cookie `dbl_at` primeiro, com
  fallback para `Authorization: Bearer` (mantido para clientes não-browser/testes).
- `security/http.ts` — **CSRF double-submit** no hook `onRequest`: mutações
  `POST|PUT|PATCH|DELETE` sob `/api/v1/` (exceto `/api/v1/auth/login` e
  `/api/v1/auth/register`) exigem `X-CSRF-Token` == cookie `dbl_csrf`, senão
  **403 `CSRF_FAILED`**. **Só é aplicado quando existe o cookie `dbl_csrf`** — uma
  mutação sem cookie cai para o 401 da própria rota (preserva
  `refresh`-sem-cookie → `401 INVALID_REFRESH_TOKEN`). `x-csrf-token` adicionado a
  `access-control-allow-headers`. `CSRF_FAILED` → 403 em `http/errors.ts`.
- `backend/src/testing/authClient.ts` (novo) — `registerAndAuth(app, overrides?)`:
  cookie jar + CSRF/Idempotency-Key automáticos nas mutações. `app.test.ts`
  totalmente migrado; mantido um teste explícito do fallback `Authorization: Bearer`.
  **Nenhum `*.integration.test.ts` precisou de mudar** (exercitam repos/serviços PG
  diretamente, não a auth HTTP).

#### Proxy `/api` same-origin

- `vite.config.ts`: proxy de dev `/api` → `process.env.VITE_API_BASE_URL ||
  'http://localhost:8090'`, `changeOrigin`.
- `docker/nginx.conf`: `location /api/` → `proxy_pass http://backend:8090` (antes de
  `location /`).
- `compose.yaml`: frontend `VITE_API_BASE_URL: http://backend:8090`.
- `.env.example` / `.env.docker.example` (+ `.env.docker`, git-ignored) ganham
  `COOKIE_SECURE=false` / `COOKIE_DOMAIN=`.

#### Frontend — cliente API + contexto de auth + UI

- `src/api/client.ts` (novo) — `apiFetch<T>(path, { method?, body?, idempotencyKey? })`:
  base relativa `/api/v1`, `credentials: 'same-origin'`, `X-CSRF-Token` (do cookie
  `dbl_csrf`) + `Idempotency-Key` nas mutações, um retry `401 → POST /auth/refresh →
  repete` (de-dupado; não para paths `/auth/`; em falha de refresh chama o callback
  de `setLoggedOutHandler` e lança), erro tipado `ApiError { status, code }`, `204 →
  undefined`. `src/api/types.ts` escrito à mão (`ApiUser`, `PlayerProfile`,
  `MigrationPreview`, `MigrationResult`).
- `src/api/endpoints.ts` (novo) — `register` / `login` / `logout` / `getMe` /
  `previewMigration` / `importMigration`.
- `src/game/auth/AuthProvider.tsx` (novo) — `AuthProvider` + `useAuth()` →
  `{ status: 'loading'|'anonymous'|'authenticated', user, login, register, logout }`.
  `getMe()` no mount (qualquer rejeição → anonymous). `src/game/auth/countries.ts`
  (novo) — `COUNTRIES` (16 bandeiras) + `flagToIso2` / `iso2ToFlag` (🌍 → `ZZ`),
  movidos para fora de `account.ts`.
- `src/game/auth/hydrate.ts` (novo) — `hydrateFromServer(replace)` one-shot: mapeia
  `GET /me` → parcial de `PlayerState` (`level`, `xp`, `xpToNextLevel =
  getXpForLevel(level)`, `totalFishCaught`, `coins`, `unlockedLocations`).
  `useGameState` ganhou `replaceFromServer(partial)` (merge shallow + persist
  existente). O `localStorage` continua a ser a store viva do jogo em 10.1.
- `src/game/auth/importFlow.ts` (novo) — `maybeOfferImport` / `runImport`
  (+ `IMPORT_DONE_KEY = 'dbl-import-done'`). `src/components/game/menu/
  ImportSaveDialog.tsx` (novo). 1º login com save local e ainda não importado →
  diálogo de preview → `POST /migration/local/import` → marca feito + re-hidrata.
  "Agora não" **não** marca feito (re-oferecido no login seguinte).
- `src/components/game/menu/AccountModal.tsx` — reescrita completa: 2 passos
  (`signup`: email / password / username / país; `login`: email / password),
  guiada por `useAuth()`, **birthdate removido**, mensagens de erro via i18n
  `auth.err.<code>`. `account.ts` reduzido a apenas `TUTORIAL_KEY`.
- `src/components/game/MainMenu.tsx` — chip de conta a partir de
  `useAuth().user.username` (ou `menu.register` quando anónimo).
- `src/pages/Index.tsx` — `<AuthProvider>` monta à volta de todo o render de
  `IndexInner` (a cadeia de early-returns foi refatorada para um único valor
  `content` primeiro, para o provider nunca remontar na navegação).
  `onAuthenticated` → hidrata + eventualmente oferece import.
- `src/game/i18n.tsx` — **19 chaves `auth.*` novas nos 6 idiomas**:
  `auth.emailLabel`, `auth.passwordLabel`, `auth.passwordHint`, `auth.usernameLabel`,
  `auth.countryLabel`, `auth.signupCta`, `auth.loginCta`, `auth.logoutCta`,
  `auth.haveAccount`, `auth.needAccount`, `auth.importTitle`, `auth.importBody`,
  `auth.importYes`, `auth.importNo`, e `auth.err.{VALIDATION,ACCOUNT,USERNAME,INVALID,NETWORK}`.

#### Alteração 2026-09-07 — logout explícito reinicia o jogo local

Decisão do utilizador, **desvia do spec original** ("logout keeps the local save"):
o **logout explícito** (método `logout()` do `useAuth()`) reinicia o save local para
o estado inicial — nível 1, 0 moedas, locais base, coleção / armazém / aquário
vazios. Racional: o progresso da conta é do lado do servidor e a 10.2 torna o
servidor autoritativo; deixar o save do jogador anterior visível após logout é
enganoso. **A expiração de sessão / falha de refresh NÃO reinicia** (o
`setLoggedOutHandler` continua só a pôr `status: 'anonymous'`) — o utilizador pode
voltar a entrar e apagar-lhe o jogo aí seria hostil.

- `AuthProvider` ganhou prop opcional `onLoggedOut?: () => void`, guardada em
  `onLoggedOutRef` e chamada só no fim do `logout()` (depois de `setUser(null)` /
  `setStatus('anonymous')`), nunca no caminho do `setLoggedOutHandler`.
- `src/pages/Index.tsx` — `handleLoggedOut`: `resetProgress()` +
  `localStorage.removeItem(IMPORT_DONE_KEY)` (para o import poder ser re-oferecido
  num login futuro) + `setImportPreview(null)`. Passado como
  `<AuthProvider onAuthenticated={afterAuth} onLoggedOut={handleLoggedOut}>`.
- Testes: `AuthProvider.test.tsx` cobre "logout dispara `onLoggedOut` uma vez" e
  "callback do `setLoggedOutHandler` vai a anonymous sem disparar `onLoggedOut`".
  Não há teste de render do `Index.tsx` (desproporcionado); o fio fica coberto
  pelo teste de callback + verificação manual.

#### Fora de âmbito (10.2–10.5)

Leituras contínuas de `/me` / `/wallet` / `/catalog` / `/leaderboard` / `/inventory`;
escritas de economia/pesca via API; ranking/temporadas reais; geração de tipos a
partir do OpenAPI; CSP da SPA.

#### Verificação (Task 14, 2026-09-07)

- `npx tsc --noEmit -p tsconfig.app.json` ✅ — "No errors found".
- `npm run backend:typecheck` (`tsc -p tsconfig.backend.json`) ✅ — 0 erros.
- `npm run lint` ✅ — **0 erros, 12 avisos** (todos `react-refresh/only-export-components`,
  pré-existentes; `AuthProvider.tsx` acrescenta 1, a extração de `NetFishing` na
  Task 9 tinha removido 1 → líquido 12).
- `npm test` ✅ — **47 ficheiros, 222 testes** (inclui `backend/src/auth/{cookies,routes}.test.ts`,
  `backend/src/security/{http,csrf}.test.ts`, `src/api/endpoints.test.ts`,
  `src/game/auth/{hydrate,importFlow}.test.ts`).
- `npm run build` ✅ — `vite build` em ~13s (aviso pré-existente de chunk > 500 kB).
- `npm run test:integration` ✅ — **8 ficheiros, 45 testes**, contra `postgres:16-alpine`
  local (`docker compose up -d postgres`; `backend:db:migrate` → "No pending
  migrations"). Task 10.1 não tocou nenhum `*.integration.test.ts`.
- **Smoke HTTP do backend** (stack via `docker compose up -d --build backend` —
  a imagem tinha de ser reconstruída porque `@fastify/cookie` é nova): `register`
  → `201` + `Set-Cookie` dos 3 cookies com os atributos da tabela acima (`Secure`
  ausente porque `COOKIE_SECURE=false` no `.env.docker`); `logout` com cookie e sem
  `X-CSRF-Token` → `403 CSRF_FAILED`; com header válido → `204`; `refresh` sem
  cookie → `401 INVALID_REFRESH_TOKEN`.
- **Pendente (utilizador)**: smoke do contentor **frontend** no browser em
  `http://localhost:8080` (`docker compose up --build`) — cookies `dbl_at` /
  `dbl_rt` / `dbl_csrf` visíveis, reload mantém sessão, logout limpa, diálogo de
  import no 1º login, erro "já existe uma conta" com email repetido; e revisão do
  diff.

### Persistência de estado de jogo no servidor (núcleo do 10.2, feito na branch do 10.1) — 2026-09-07

A conta passa a lembrar o progresso entre logout/login e entre dispositivos. O
frontend carrega o `PlayerState` guardado no servidor ao autenticar e empurra-o
continuamente enquanto joga. **Último-a-gravar-ganha**; guarda de versão/merge fica
para o 10.2 completo.

- **Spec**: `docs/superpowers/specs/2026-09-07-server-game-state-sync-design.md`
- **Plano**: `docs/superpowers/plans/2026-09-07-server-game-state-sync.md`
- Commits `37c6649..4cb54af` (Tasks 1–8); esta secção = Task 9 (verificação + registo).

#### Backend

- `backend/migrations/0015_player_game_state.sql` — tabela `player_game_state`
  (`user_id uuid PK → users(id) ON DELETE CASCADE`, `state jsonb NOT NULL`,
  `updated_at timestamptz`). Espelhada em `db/schema.ts` (`playerGameState`).
- Módulo `backend/src/gamestate/` — `routes.ts` (fino), `memoryService.ts` (dev/teste
  sem `DATABASE_URL`), `pgRepository.ts` (upsert `onConflictDoUpdate`). `app.ts`
  escolhe por presença de `DATABASE_URL`. Tag OpenAPI `gamestate`.
- `GET /api/v1/me/state` → `200 { state: <object>|null, updatedAt: <iso>|null }`.
- `PUT /api/v1/me/state` → `204`; body `{ state }` validado contra o `saveSchema`
  **do cliente** (`src/game/persistence.ts`, agora exportado); `bodyLimit` 2 MiB;
  `preHandler: requireAuth`; mutação sob `/api/v1/` → exige `X-CSRF-Token`.
- Testes: `gamestate/routes.test.ts` (5, memória, corre no `npm test`) +
  `gamestate/pgRepository.integration.test.ts` (4, PostgreSQL real — round-trip,
  `updated_at` estritamente crescente, cascade ao apagar o utilizador).

#### Frontend

- `src/api/endpoints.ts` — `getGameState()` / `putGameState(state)`;
  `GameStateEnvelope` em `types.ts`.
- `src/game/auth/hydrate.ts` — **reescrito**: carrega o blob e faz **replace** do
  estado local (deixou de fazer merge de `GET /me`). Devolve
  `{ kind: 'loaded' | 'empty' | 'error' }`. Blob inválido → `empty` (tratado como
  sem estado).
- `src/game/auth/gameStateSync.ts` (novo) — `useGameStateSync({ player, enabled })`:
  `PUT` debounced ~4 s após a última mudança de `player`; `fetch` keepalive em
  `pagehide` / `visibilitychange:hidden`; `flushNow()` para o logout. `enabled:false`
  → inerte.
- `src/game/auth/AuthProvider.tsx` — nova prop `onBeforeLogout?: () => void |
  Promise<void>`, aguardada **antes** de `endpoints.logout()`; **não** dispara na
  expiração de sessão (`setLoggedOutHandler`).
- `src/pages/Index.tsx` — `afterAuth` carrega o blob (replace) e, se o servidor não
  tem estado (`empty`), adota o save local com um `PUT` (sem diálogo). `useGameStateSync`
  montado; `onBeforeLogout={flushNow}`; `handleLoggedOut` desliga o sync + `resetProgress()`.

#### Depreca a fatia de import da Task 13

`src/game/auth/importFlow.ts`, `src/components/game/menu/ImportSaveDialog.tsx` e
`POST /api/v1/migration/local/{preview,import}` deixam de ser usados no fluxo
autenticado (o diálogo de 1º login foi removido do `Index.tsx`). Ficheiros e rotas
mantidos por agora; remover numa limpeza posterior.

#### Verificação (Task 9, 2026-09-07)

- `npx tsc --noEmit -p tsconfig.app.json` ✅ · `npm run backend:typecheck` ✅ ·
  `npm run lint` ✅ (0 erros, 12 avisos pré-existentes) · `npm test` ✅
  **49 ficheiros, 263 testes** · `npm run build` ✅.
- `npm run test:integration` ✅ **9 ficheiros, 49 testes** contra `postgres:16-alpine`
  local (inclui `gamestate/pgRepository.integration.test.ts`).
- **Smoke HTTP backend** (curl, stack `docker compose`): `GET /me/state` anónimo →
  `401`; registo → `GET` devolve `{state:null}`; `PUT` sem `X-CSRF-Token` → `403
  CSRF_FAILED`; `PUT` com header → `204`; `GET` devolve o envelope exacto (level 9,
  coins 1234).
- **Smoke browser** (Playwright, `http://localhost:8080`) — todos verdes:
  1. registo → chip de conta, **sem diálogo de import**;
  2. presente diário + roleta → `PUT /me/state` `204` debounced;
  3. logout pelo UI → `PUT /me/state` `204` **e depois** `POST /auth/logout` `204`
     (ordem certa), jogo reinicia para nível 1 / 0 moedas;
  4. novo login → blob do servidor carregado, moedas restauradas (1150), sem diálogo;
  5. reload mantém sessão e restaura o estado;
  6. 1º login de conta nova com save local (1150 moedas) + servidor vazio → adota o
     save via `PUT` (servidor fica com 1150), sem diálogo;
  7. `GET /me/state` autenticado → envelope; anónimo → `401`.
- Os contentores `backend` e `frontend` tiveram de ser reiniciados (`docker compose
  restart`) para o `tsx watch` / Vite apanharem a migração 0015 e a remoção do
  `ImportSaveDialog`.
- **Não exercido de forma determinística**: o caminho keepalive em `pagehide`
  (código presente, listeners registados; o plano remete-o para teste manual). O
  debounce cobriu o mesmo `PUT` várias vezes.
- **Teste manual do utilizador**: confirmado a funcionar no browser dele
  (2026-09-07).
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#17` merged em `3988c7d`
  (merge commit). Junta a fundação de auth 10.1 + esta sincronização de estado.
  `main` local sincronizada, typecheck (app + backend) e 263 testes verdes na `main`.
  Branches `feature/task-10-1-auth-foundation` (local + remota) apagadas. Commit de
  registo do merge: `172d923` (na `main`).

### Task 10.2 (fatia A) — guarda de concorrência otimista no `PUT /me/state` — branch `feature/task-10-2-state-version-guard` — 2026-09-07

Fecha o buraco de perda de progresso multi-dispositivo do 10.1 (era
último-a-gravar-ganha puro). **Fatia A** só: versão otimista. Sem polling (fatia B),
sem merge campo-a-campo (fatia C).

- **Spec/brainstorm**: em chat (tarefa *bounded*, sem spec-doc). Implementada com TDD.
- Commits `acd5647` (migração + schema), `d5ef1cf` (backend), `16ae498` (frontend).

#### Backend

- `backend/migrations/0016_player_game_state_version.sql` — `ADD COLUMN version
  integer NOT NULL DEFAULT 1`. Espelhado em `db/schema.ts` (`playerGameState.version`).
- Contrato do serviço (memória + PG iguais):
  `get → { state, updatedAt, version } | null`;
  `put(userId, state, baseVersion: number | null) → { version }`.
  - `baseVersion = N` → grava só se a versão actual for N; sobe para N+1.
  - `baseVersion = null` → grava só se **não existe** linha; cria em `version: 1`.
  - desajuste → `throw new Error('STATE_VERSION_CONFLICT')`, não grava nada.
  - PG: uma só instrução por ramo (`INSERT … ON CONFLICT DO NOTHING RETURNING` /
    `UPDATE … WHERE version = $base RETURNING`). Concorrentes não ganham os dois.
- `PUT /api/v1/me/state` — body ganha `baseVersion` (Zod `int | null`), passa a
  responder **`200 { version }`** (era `204`). `GET` devolve `version`.
- `STATE_VERSION_CONFLICT` → `409` em `http/errors.ts`.
- Testes: `gamestate/routes.test.ts` 8 (base certa → 200+versão, base stale → 409,
  base null com linha → 409) · `gamestate/pgRepository.integration.test.ts` 6.

#### Frontend

- `putGameState(state, baseVersion)` → body `{ state, baseVersion }`, devolve
  `{ version }`. `GameStateEnvelope` ganha `version`.
- `hydrateFromServer(replace)` → `{ kind, version }` (`loaded` traz a versão do
  servidor; `empty`/`error` → `null`).
- `useGameStateSync({ player, enabled, replace })` → `{ flushNow, start }`:
  - `baseVersion` interno; avança a cada `PUT` bem-sucedido.
  - `start()` = `hydrateFromServer` + (se `empty`) adopção do save local com
    `baseVersion: null`; semeia a versão. Consolidou o que estava no `afterAuth`.
  - `409 STATE_VERSION_CONFLICT` → `console.warn` + re-corre `hydrateFromServer`
    (pull + replace + re-semeia); a alteração seguinte volta a empurrar. **O delta
    local não gravado do lado perdedor perde-se** (limitação assumida da fatia A;
    a janela do debounce de 4 s torna-a pequena).
  - *dirty check* (`JSON.stringify` do envelope vs. último enviado) — evita `PUT`
    no-op logo após um replace e no logout sem alterações.
  - keepalive de `pagehide` manda `baseVersion` no corpo.
- `src/pages/Index.tsx` — `afterAuth` encolheu para
  `setSyncEnabled((await startSync()) !== 'error')`; perdeu os imports de
  `hydrateFromServer` / `putGameState` / `SAVE_SCHEMA_VERSION`.

#### Verificação (2026-09-07)

- `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ (0 erros, 12 avisos) ·
  `npm test` ✅ **49 ficheiros, 273 testes** · `build` ✅.
- `npm run test:integration` ✅ **9 ficheiros, 51 testes** contra `postgres:16` local
  (migração 0016 aplicada).
- **Smoke HTTP backend** (curl): `GET` vazio → `version: null`; `PUT` base `null`
  → `200 {version:1}`; base `1` → `200 {version:2}`; base `1` de novo → `409
  STATE_VERSION_CONFLICT`, `GET` mantém coins da 2ª escrita.
- **Smoke browser** (Playwright, stack Docker) — todos verdes:
  1. registo → `GET /me/state 200` + `PUT 200` (adopção, era 204);
  2. escrita fora-de-banda via consola (sobe o servidor para v2, coins 7777);
  3. compra de skin no jogo → `PUT` com base stale → **`409`** → `console.warn`
     "game state version conflict; pulling the server state" → `GET` → estado local
     **substituído** (ecrã passa a 7777 moedas, a compra da skin é descartada) →
     `PUT` seguinte com versão fresca → `200`;
  4. logout sem alterações → **sem `PUT` redundante** (dirty check), `POST
     /auth/logout 204`, jogo reinicia para 0;
  5. novo login → estado do servidor (7777) restaurado.
- Contentores `backend`+`frontend` reiniciados (migração 0016 + 204→200).
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#18` merged em `617d83a`
  (merge commit). Branches `feature/task-10-2-state-version-guard` (local + remota)
  apagadas.
- **Pendente (utilizador)**: confirmar num browser real (jogar em 2 separadores →
  o 2º apanha o conflito e adota o estado do 1º).

### Estado — 2026-09-07 (fim da sessão)

- `main` em `2d20ef6`. Integrado e verificado nesta sessão:
  - **10.1** — auth foundation (cookies httpOnly + CSRF + proxy `/api`) + persistência
    de estado no servidor (PR #17).
  - **10.2 fatia A** — guarda de concorrência otimista no `PUT /me/state` (PR #18).
  - **Limpeza** — remoção do fluxo de import órfão (PR #19).
  - **10.2 fatia B** — pull periódico de 45 s (PR #20, merge `2d20ef6`). Branch
    `feature/task-10-2b-periodic-pull` apagada.
- `tsc app` + `backend:typecheck` + `npm test` (48 ficheiros, 273 testes) verdes na `main`.
- **Limitação aberta do 10.2**: 1 `PUT` redundante por pull cross-device (ver secção
  da fatia B). Candidato a resolver: `replaceFromServer` fazer replace verdadeiro.
- Próximo do 10.x: 10.3 (economia server-autoritativa + reestruturar o blob
  `player_game_state` em colunas), 10.4 (pesca/inventário), 10.5 (ranking/temporadas
  reais, tipos do OpenAPI, CSP). O 10.3 merece a sua própria sessão de design
  (*architectural*).
- `.claude/settings.json` (config local de plugins) aparece como untracked; não foi
  commitado. Pôr no `.gitignore` se incomodar.
- **Limpeza feita**: PR `#19` merged em `2445ef2` — removidos `src/game/auth/importFlow.ts`,
  `ImportSaveDialog.tsx` e os wrappers `previewMigration`/`importMigration` (mortos
  desde o 10.2). Os endpoints backend `/api/v1/migration/local/*` **ficaram** (isolados,
  testados, na OpenAPI — base para uma futura ferramenta "importar save antigo").

### Task 10.2 fatia B — pull periódico — branch `feature/task-10-2b-periodic-pull` — 2026-09-07

Completa o multi-dispositivo do 10.2: um dispositivo apanha uma gravação de outro em
~45 s, sem reload. Ainda **sem merge campo-a-campo** (isso é a fatia C).

- Tarefa *bounded*, brainstorm em chat, TDD. Só `gameStateSync.ts` + `hydrate.ts`
  (+ testes). API do hook, `Index.tsx`, backend — intocados.
- Commits: `cb37dd7` (hydrate devolve `player`), `eccd9f8` (pull periódico),
  `25c2725` (dirty-check independente de ordem de chaves).

#### `useGameStateSync` — o poll

- `useEffect` com `setInterval(POLL_MS = 45_000)`, ativo só com `enabled` **e**
  separador visível; `clearInterval` + listener de `visibilitychange` no cleanup.
- Cada tick (`poll`): salta se `busy` (um `PUT` em curso — `push` marca `busy`) ou
  separador escondido. `GET /me/state` → se `version > baseVersion.current` →
  `resync()` (pull + `replace` + re-semeia) + `console.warn`.
- `visibilitychange → visible` → um `poll()` imediato.

#### Melhorias de suporte

- `hydrateFromServer` passa a devolver `{ kind, version, player? }` (o `player`
  aplicado). `resync` usa-o para semear `lastSent`, para o debounce a seguir ao
  `replace` não re-empurrar o estado acabado de puxar.
- `stableStringify` (chaves de objeto ordenadas) no dirty-check: o `replaceFromServer`
  faz merge (`{ ...prev, ...server }`) que reordena chaves vs. um blob fresco — um
  `JSON.stringify` simples via-os diferentes e re-empurrava o estado puxado (ping-pong
  de versões entre dois separadores parados). Arrays mantêm ordem.

#### Verificação (2026-09-07)

- `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ (0 erros, 12 avisos) ·
  `npm test` ✅ **48 ficheiros, 273 testes** · `build` ✅. Integração não corrida
  (backend intocado).
- **Smoke browser** (Playwright, stack Docker):
  1. separador parado + autenticado → só `GET` a cada ~45 s, **zero `PUT`** (ping-pong
     resolvido) ao longo de ~200 s;
  2. escrita fora-de-banda (servidor v10, coins 3131) → após ~45 s o ecrã passa a
     3131 **sozinho** + `console.warn` "game state changed on another device";
  3. **1 `PUT` redundante** logo após cada pull cross-device, depois quiescente (um
     campo do merge do `replaceFromServer` ainda difere do blob puro — ver limitação).
- **Limitação conhecida**: 1 `PUT` de conteúdo idêntico por cada pull cross-device
  (a versão sobe). Num único separador estabiliza logo; entre 2 separadores
  continuamente ativos há uma alternância lenta de ~1 `PUT`/45 s cada, sem perda de
  dados. Fecha-se fazendo o `replaceFromServer` um replace verdadeiro (não merge) ou
  na fatia C.
- **Teste manual do utilizador**: confirmado a funcionar em 2 browsers em simultâneo
  (2026-09-07).

### Task 10.3 fatia 1 — venda do armazém server-autoritativa — 2026-09-07

Primeira fatia da economia server-autoritativa: a "vender tudo" do armazém passa a
ser executada pelo servidor quando o jogador está autenticado. O cliente anónimo
continua a correr a regra pura local. Marca o **padrão** para todas as fatias de
economia seguintes.

- **Spec** (autoridade): `docs/superpowers/specs/2026-09-07-server-economy-warehouse-sell.md`
- **Plano**: `docs/superpowers/plans/2026-09-07-server-economy-warehouse-sell.md`
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#21` merged em `210ba71`
  (merge commit). Execução SDD (7 tasks + review whole-branch + vaga de correção,
  todos com review limpo). `main` verde: `npm test` 289, `test:integration` 57,
  `tsc` app + backend limpos. Branch `feature/task-10-3-economy-warehouse-sell`
  (local + remota) apagada.
- Tarefas 1–7 do plano.

#### Backend

- **`game_state_operations`** (migração `0017_game_state_operations.sql`, espelhada em
  `db/schema.ts`): tabela de replay/idempotência para mutações sobre o blob
  `player_game_state`. PK `(user_id, idempotency_key)`, FK `user_id` com
  `ON DELETE CASCADE`, guarda `operation` + `result` (jsonb) + `created_at`. Uma
  segunda chamada com a mesma `Idempotency-Key` devolve o `result` gravado sem tocar
  no estado. A **identidade de replay é `(user_id, operation, idempotency_key)`** —
  tanto o serviço em memória (chave do Map) como o pg (`WHERE` do `readRecordedResult`)
  incluem `operation`, para uma `Idempotency-Key` reutilizada entre dois endpoints de
  economia não devolver o envelope do primeiro.
- **Retenção**: cada linha guarda um envelope `{ state, version }` **completo** (o blob
  inteiro do jogador). Aceitável para uma operação de baixa frequência como a venda do
  armazém; **antes** de migrar operações de alta frequência (captura, aquário) é
  preciso um job de retenção/prune de `game_state_operations` — follow-up conhecido.
- **`POST /api/v1/me/economy/warehouse/sell`** (`backend/src/gamestate/economyRoutes.ts`):
  `requireAuth` + CSRF + `Idempotency-Key` (16–128 chars). Numa transação:
  `SELECT ... FOR UPDATE` da linha de estado, corre `stateRules.sellWarehouse` sobre
  o `player` do blob, grava o novo blob com `version + 1`, insere a linha de replay,
  devolve `{ state, version }` (mesma forma do envelope de `/me/state`, sem `updatedAt`).
  Armazém vazio → lança `WAREHOUSE_EMPTY` → **HTTP 422**, nada escrito (nem blob nem
  linha de replay, a transação faz rollback). Sem linha de estado → `GAME_STATE_NOT_FOUND`.
  O double-check pré-lock/pós-lock de `game_state_operations` assume **READ COMMITTED**
  (o default do projeto).
- Serviço em memória (`economyService`) e pg (`economyPgService`) partilham o mesmo
  contrato e o mesmo `MemoryGameStateStore` partilhado registado em `app.ts`.
- Testes: `gamestate/economyRoutes.test.ts` (6 — venda, replay, vazio, 401, 403, 400),
  `gamestate/economyService.test.ts` (memória — venda, replay, vazio, not-found, F2
  replay com chave escopada à operação),
  `gamestate/economyService.integration.test.ts` (6 — txn, replay, vazio, cascade +
  **concorrência**: mesma chave → resultado idêntico / 1 linha / versão 2; chaves
  diferentes → só uma vende, a outra perde a corrida ao lock com `WAREHOUSE_EMPTY`),
  `economy/pricing.test.ts`.

#### Frontend

- **`src/api/endpoints.ts`** — `sellWarehouse(idempotencyKey): Promise<GameStateEnvelope>`.
- **`useGameStateSync().applyServerResult({ state, version })`** — valida o envelope
  com `saveSchema`, substitui o estado local (`replaceFromServer`), re-semeia a versão
  base da concorrência otimista e marca o blob como "já enviado" (via
  `adoptServerState`, fatorado da lógica de `resync`), de modo que o debounce que
  dispara a seguir ao re-render **não** faz um `PUT` redundante. Envelope inválido →
  `console.warn`, no-op.
- **`src/pages/Index.tsx`** — `handleSellWarehouse` ramifica por `syncEnabled`:
  - `!syncEnabled` (anónimo / GET inicial falhou) → `sellWarehouse()` local do
    `useGameState` (regra pura).
  - autenticado → `setSelling(true)` → **`await flushNow()`** (persiste o blob local
    pendente antes de o servidor vender — sem isto uma captura feita nos últimos 4s
    perde-se) → `applyServerResult(await sellWarehouseApi(crypto.randomUUID()))`
    → `catch` `console.warn` → `finally` `setSelling(false)`.
  - Ramifica em `syncEnabled` e **não** no estado de auth porque `IndexInner` é quem
    renderiza `<AuthProvider>` e por isso não pode chamar `useAuth()`.
- **`src/components/game/Warehouse.tsx`** — prop `selling?: boolean`; o botão
  "vender tudo" fica `disabled={selling || warehouse.length === 0}`. Sem label de
  "a processar" (não há chave i18n reutilizável e não se adiciona string por
  traduzir); o estado desativado é o comportamento garantido.
- Testes: `test/Warehouse.test.tsx` (botão desativado enquanto `selling`, ativo caso
  contrário), mais os testes de `applyServerResult` e do wrapper de endpoint das
  fatias 5–6.

#### O padrão (para as fatias de economia seguintes)

Redes / multiplicadores / skins / roletas / prendas diárias / captura / aquário
seguem todas esta forma:

1. `POST /api/v1/me/economy/<op>` (ou `/me/<área>/<op>`) — `requireAuth` + CSRF +
   `Idempotency-Key`, transação com `FOR UPDATE` sobre a linha de `player_game_state`,
   corre a **regra pura de `src/game/stateRules.ts`** sobre o blob, `version + 1`,
   linha em `game_state_operations`, devolve `{ state, version }`.
2. Cliente: wrapper em `endpoints.ts`. No handler, **`await flushNow()` ANTES** da
   chamada ao servidor (persiste qualquer mutação local pendente do debounce de 4s —
   sem isto o servidor corre a operação sobre um blob obsoleto e `applyServerResult`
   sobrescreve o que ainda não foi enviado), depois `applyServerResult(await <op>Api(...))`.
   Padrão: **flush → operação no servidor → applyServerResult**.
3. `Index.tsx` (ou o componente dono do handler) ramifica em `syncEnabled`: servidor
   quando autenticado, regra pura local quando anónimo. **Mesma regra dos dois lados.**
4. Componente recebe uma prop `<verbo>ing?: boolean` para desativar o controlo
   enquanto a chamada está em curso.

#### Endpoints dormentes superados

Os `/api/v1/economy/*` e `/api/v1/inventory/*` (e as tabelas `wallets`,
`wallet_ledger`, `player_catches`, `player_items`) deixam de ser o caminho para o
jogador autenticado — a economia autoritativa vive agora no blob
`player_game_state` + `game_state_operations`. Continuam isolados, testados e na
OpenAPI; **pendente uma limpeza** numa tarefa própria depois de as fatias de
economia estarem todas migradas.

#### Verificação (2026-09-07)

- `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ (0 erros, 12 avisos) ·
  `npm test` ✅ **50 ficheiros, 288 testes** · `build` ✅ ·
  `test:integration` ✅ **10 ficheiros, 55 testes** (Postgres local, migrações já
  aplicadas).
- **Smoke browser na stack Docker** (controlador SDD): venda pelo UI → `POST
  .../warehouse/sell` 200, +20 moedas, armazém vazio, sem `PUT` redundante; armazém
  vazio → 422; 0 erros de consola.

### Task 10.3 fatia 2 — compra de rede server-autoritativa — 2026-09-08

Segunda op do padrão (ordem acordada: rede → multiplicador → skin). Branch
`feature/task-10-3-economy-net-purchase`. Executada inline (bounded, padrão provado).

- **`GameStateEconomyService.purchaseNet(userId, key)`** — mesma forma transacional que
  `sellWarehouse`. `computeNetPurchase` verifica `NET_LIMIT_REACHED` (nets ≥ 10) e
  `INSUFFICIENT_FUNDS` (coins < `NET_PRICE` = 5000) **antes** de delegar em
  `stateRules.buyNet`. Ambos os erros já mapeados a 409.
- **Runner partilhado**: `economyService.ts` fatorou `runMemoryOp` / `runPgOp` — as duas
  ops (venda, compra de rede) passam por eles, com a identidade de replay
  `(userId, operation, idempotencyKey)`. Os slices 3–7 só acrescentam um `compute*` +
  uma linha de rota.
- **`POST /api/v1/me/economy/nets/purchase`** — `requireAuth` + CSRF + `Idempotency-Key`,
  sem body → `200 { state, version }`.
- **Migração `0018_game_state_operations_op_pk.sql`** — a PK de `game_state_operations`
  passa a `(user_id, idempotency_key, operation)` (era `(user_id, idempotency_key)`).
  Fecha o follow-up da fatia 1: uma `Idempotency-Key` reutilizada entre endpoints
  corre a 2ª op de fresco em vez de `23505`. Nome do constraint mantido
  (`..._idempotency_pk`, contém "idempotency" → mapeia a `IDEMPOTENCY_CONFLICT`).
- **Frontend**: `endpoints.purchaseNet`; `NetShop` ganha `buying?: boolean`; `Index.tsx`
  fatorou `runEconomyOp(op, local, api)` — **flush → op no servidor → applyServerResult**,
  fallback local quando `!syncEnabled` — partilhado por `handleSellWarehouse` e
  `handleBuyNet`. `busyOp: null | 'sell' | 'net'` substitui `selling`.
- Testes: `economyService.test.ts` (+6 — compra, replay, sem fundos, no limite, not-found,
  F2 cross-op real), `economyRoutes.test.ts` (+5), `economyService.integration.test.ts`
  (+4 — txn, replay, concorrente mesma-chave, F2 cross-op contra PG real),
  `endpoints.test.ts` (+1), `test/NetShop.test.tsx` (+1 disabled while buying).
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros · `npm test` ✅
  **302** · `build` ✅ · `test:integration` ✅ **61** (Postgres local, migração 0018
  aplicada).
- Smoke browser (stack Docker): UI "Comprar 1 rede" → `POST .../nets/purchase` 200,
  moedas −5000, redes +1, sem `PUT` redundante; replay → sem duplo débito; sem fundos
  → `409 INSUFFICIENT_FUNDS`, nada escrito.
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#22` merged em `03bc80e`.
  Branch `feature/task-10-3-economy-net-purchase` apagada. `main` verde (302 + 61).

### Task 10.3 fatia 3 — compra de multiplicador server-autoritativa — 2026-09-08

Terceira op. **Primeiro endpoint de economia com body.** Branch
`feature/task-10-3-economy-multiplier-purchase`. Inline, TDD.

- **`purchaseMultiplier(userId, key, type, power)`** — `computeMultiplierPurchase`
  verifica `INSUFFICIENT_FUNDS` contra o custo server-side (`MULTIPLIER_COST` 3000 /
  `MULTIPLIER_COST_4X` 6000) e delega em `stateRules.buyMultiplier` com um **`now`
  fornecido pelo servidor** (o `end` do multiplicador é `now + 60s`). Passa pelos
  `runMemoryOp`/`runPgOp` com um `compute` parametrizado (closure captura `type`/`power`/`now`).
- **`POST /api/v1/me/economy/multipliers/purchase`** — `economyRoutes.ts` passou a
  `withTypeProvider<ZodTypeProvider>`; body `z.object({ type: enum(['luck','strength']),
  power: union([literal(2), literal(4)]) })`. Body inválido → **`400 VALIDATION_ERROR`**
  (handler central de erros já trata `ZodError`).
- **Frontend**: `endpoints.purchaseMultiplier(key, type, power)` (body `{ type, power }`);
  `MultiplierShop` ganha `buying?: boolean` (desativa os 4 botões); `Index.handleBuyMultiplier`
  encaminha `type`/`power` por `runEconomyOp('multiplier', () => buyMultiplier(type,p),
  key => purchaseMultiplierApi(key,type,p))`. `busyOp` estende para `'multiplier'`.
- Replay: mesma chave → resultado gravado (com o `end` original). Chave nova por clique.
- Testes: `economyService.test.ts` (+5), `economyRoutes.test.ts` (+7 — inclui 400 body
  inválido ×2), `economyService.integration.test.ts` (+3), `endpoints.test.ts` (+1),
  `test/MultiplierShop.test.tsx` (+1).
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros · `npm test` ✅
  **316** · `build` ✅ · `test:integration` ✅ **64**.
- Smoke browser (stack Docker): UI "Comprar 2x Sorte" → `POST .../multipliers/purchase`
  200, moedas −3000, cartão passa a "Ativo!", sem `PUT` redundante; body inválido
  (`power: 3`, `type` desconhecido) → `400 VALIDATION_ERROR`, nada escrito.
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#23` merged em `2030e65`.
  Branch `feature/task-10-3-economy-multiplier-purchase` apagada. `main` verde
  (316 unit — 1 flake de MainMenu numa corrida, verde em 2 re-runs — + 64 integração).

- **Próximo**: fatia 4 = compra de skin (`buySkin`/`buyBoatSkin` — o servidor passa a
  possuir os preços, lookup nos arrays `SKINS`/`BOAT_SKINS` de `types.ts`). Roletas e
  prendas diárias (RNG/limite diário server-side) ficam para depois.

### Task 10.3 fatia 4 — compra de skin server-autoritativa — 2026-09-08

Quarta op. **Preço passa a ser do servidor.** Branch
`feature/task-10-3-economy-skin-purchase`. Inline, TDD, 3 commits.

- **`purchaseSkin(userId, key, kind, skinId)`** — `computeSkinPurchase` faz lookup
  em `ROD_SKINS` / `BOAT_SKINS` (de `src/game/types.ts`) e cobra o **preço do
  catálogo**; o serviço não tem parâmetro `price`. Skin exclusiva (só roleta) ou id
  desconhecido → `SKIN_NOT_FOUND` (404); já possuída → `SKIN_ALREADY_OWNED` (409);
  abaixo do preço → `INSUFFICIENT_FUNDS` (409). Delega em `stateRules.buyOwnedItem`.
  Passa pelos `runMemoryOp`/`runPgOp` com operation `skin_purchase` (closure captura
  `kind`/`skinId`). Sem `now` — `buyOwnedItem` não é temporizado.
- **`POST /api/v1/me/economy/skins/purchase`** — body
  `z.object({ kind: enum(['rod','boat']), skinId: string().min(1).max(64) })`. O
  `kind` é necessário: ids colidem entre `ROD_SKINS` e `BOAT_SKINS` (`gold`,
  `default`/`classic`). Body inválido → `400 VALIDATION_ERROR`.
- **`http/errors.ts`**: `SKIN_NOT_FOUND` (404) e `SKIN_ALREADY_OWNED` (409) no mapa
  `DOMAIN_ERRORS`. Sem migração nova — a PK `(user_id, idempotency_key, operation)`
  da fatia 2 já cobre a op nova.
- **Frontend**: `endpoints.purchaseSkin(key, kind, skinId)`; `Index.tsx`
  `handleBuySkin` / `handleBuyBoatSkin` por `runEconomyOp('skin', …)` — flush →
  server op → `applyServerResult` quando `syncEnabled`, regra local
  `buySkin(id, price)` quando anónimo. `busyOp` estende para `'skin'`.
  `SkinsShop` / `BoatSkinsShop` ganham `buying?: boolean` → `CosmeticCard` `busy`
  (desativa o botão comprar).
- **Mudança de comportamento**: `BoatSkinsShop` passa a filtrar `!s.exclusive`
  (o `SkinsShop` já filtrava; o barco exclusivo `daily_leviathan` deixa de aparecer
  na loja por 99999 moedas). UI e servidor ficam alinhados.
- Testes: `economyService.test.ts` (+11 — rod, boat, preço do catálogo, replay,
  já possuída, id desconhecido, exclusiva rod+boat, sem fundos, not-found, F2
  cross-op skin↔net), `economyRoutes.test.ts` (+10 — inclui 400 body inválido ×2,
  404 exclusiva, 409 já possuída), `economyService.integration.test.ts` (+4 — txn +
  op row `skin_purchase`, replay, concorrente mesma-chave, já possuída sem escrita),
  `endpoints.test.ts` (+1), `SkinsShop.test.tsx` (+3 — disabled enquanto compra,
  boat sem exclusivas, boat disabled), `CosmeticCard.test.tsx` (+1).
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros (12 warnings
  pré-existentes) · `npm test` ✅ **341** · `build` ✅ · `test:integration` ✅ **68**
  (Postgres do compose em `localhost:5432`).
- Smoke browser (stack Docker, conta nova, moedas semeadas via `psql` no blob):
  loja de vara "Comprar" Tubarão → `POST .../skins/purchase` 200, moedas 50000→49000
  (−1000, preço do catálogo), cartão passa a "Equipar"; loja de barco Iate →
  46500 (−2500), "Equipar"; **sem `PUT /me/state` redundante** (só o `POST` por
  compra); barco exclusivo ausente da loja; DB: `version` 5,
  `ownedSkins ["default","shark"]`, `ownedBoatSkins ["classic","yacht"]`, 2 linhas
  `game_state_operations` op `skin_purchase` (sem duplicados).
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#24` merged em `2947291`.
  Branch `feature/task-10-3-economy-skin-purchase` apagada. `main` verde (341 unit
  + 68 integração).

### Task 10.3 fatia 5 — roletas + prendas diárias server-autoritativas — 2026-09-08

Quinta op. **Muda de padrão: RNG e portas temporais no servidor.** Branch
`feature/task-10-3-roulettes-daily-gifts`. Spec
`docs/superpowers/specs/2026-09-08-server-roulettes-daily-gifts.md`, plano
`docs/superpowers/plans/2026-09-08-server-roulettes-daily-gifts.md`. Executado com
`executing-plans` (13 tarefas), inline, commit por passo.

- **`src/game/rewards.ts` (novo)** — tipo `RewardGrant`, `RouletteSlot`,
  `DAILY_ROULETTE_SLOTS` (8 fatias uniformes, espelha a `Roulette.tsx` antiga),
  `SKIN_ROULETTE_COST` 1500, `DAILY_GIFT_DUPLICATE_COINS` 1000,
  `ROULETTE_DUPLICATE_COINS` 500. O backend importa (dívida D1).
- **3 regras puras em `stateRules.ts`** (todas puras — `now` e `roll(n)→[0,n)`
  injetados): `resolveDailyGift(state, todayStr, now)` (port verbatim do antigo
  `useGameState.claimDailyGift`; lança `DAILY_GIFT_ALREADY_CLAIMED`),
  `spinDailyRoulette(state, todayStr, now, roll)` (lança `ROULETTE_ALREADY_USED`;
  slot `skinOrCoins` verifica `pool.length` antes de `roll` — `randomInt(0)` lança),
  `spinSkinRoulette(state, roll)` (`roll(2)` rod/boat + `roll(pool.length)`;
  duplicada → reembolso, skin não re-adicionada; lança `INSUFFICIENT_FUNDS`).
- **Backend** — `Compute` generaliza para `{ player, reward? }`; `Result` ganha
  `reward?`. 3 métodos no service (`spinRoulette`/`spinSkinRoulette`/`claimDailyGift`)
  por `runMemoryOp`/`runPgOp` com ops `roulette_spin` / `skin_roulette_spin` /
  `daily_gift_claim`; `roll = crypto.randomInt`, `today`/`now` tirados uma vez por
  chamada. **O `reward` resolvido fica no op row** → replay devolve o mesmo prémio.
  3 rotas `POST /api/v1/me/economy/{roulette/spin, skin-roulette/spin, daily-gift/claim}`
  (todas sob `/me/economy/` — `daily-gift/claim` evita a rota dormente
  `/api/v1/rewards/daily/claim`). Sem body. Erros `ROULETTE_ALREADY_USED` /
  `DAILY_GIFT_ALREADY_CLAIMED` (409). Sem migração.
- **Frontend** — `endpoints.{spinRoulette,spinSkinRoulette,claimDailyGift}` →
  `RewardEnvelope = GameStateEnvelope & { reward }`. `Index.runRewardOp(op, local, api)`
  devolve o `reward` (do servidor quando `syncEnabled`, da regra local quando
  anónimo). `useGameState` troca 6 callbacks de concessão (`addCoins`, `addSkin`,
  `addBoatSkin`, `spendCoins`, `addMultiplier`, `setLastRouletteDate`,
  `claimDailyGift`) por 3 helpers locais (`claimDailyGiftLocal`,
  `spinDailyRouletteLocal`, `spinSkinRouletteLocal`) que lêem um `playerRef` e
  devolvem o `reward`. `busyOp` estende para `'roulette'|'skinRoulette'|'dailyGift'`.
  `Roulette` / `SkinRoulette` viram **roda decorativa** (SVG estático de 8 fatias,
  giro de voltas fixas, sem alvo calculado) que revela o `reward` recebido ~400ms
  depois; `DailyGifts` mostra o `reward` devolvido (não `gifts[currentDay-1]`).
  `dailygifts/rewards.ts` `rewardLabel` alargado a `RewardGrant` + `rewardEmoji`.
  Nova chave i18n `roulette.failed` (6 locales).
- **Sem mudança de balanceamento** — custos, cooldowns (prenda + roleta 1×/dia UTC,
  roleta de skins ilimitada), tabelas, durações (`MULTIPLIER_DURATION` 60s, poder 2),
  reembolsos de duplicado — tudo carregado como estava.
- Testes: `rewards.test.ts` (+2), `stateRules.test.ts` (+16), `economyService.test.ts`
  (+9), `economyRoutes.test.ts` (+6), `economyService.integration.test.ts` (+5),
  `endpoints.test.ts` (+3), `useGameState.rewards.test.tsx` (+4, novo),
  `Roulette.test.tsx` (+4), `DailyGifts.test.tsx` (reescritos), `replaceFromServer.test.ts`
  (ajuste — `addCoins` removido).
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros · `npm test`
  ✅ **384** · `build` ✅ · `test:integration` ✅ **73**.
- Smoke browser (Playwright — a extensão Chrome estava a congelar; **Vite no
  contentor não fez HMR das mudanças — precisou de `docker compose restart frontend`**,
  o que levou a uma volta de debug inútil sobre código velho): autenticado, prenda
  → `POST .../daily-gift/claim` 200 (+300), roleta → `POST .../roulette/spin` 200
  (ganhou skin `gold`), roleta de skins → `POST .../skin-roulette/spin` 200 (−1500,
  ganhou `pirate`); 3 linhas `game_state_operations` com `reward`, estado correto,
  **sem `PUT /me/state` redundante**, botões de cooldown desativam; anónimo → regra
  local, revelação ok.
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#25` merged em `4c88b7c`.
  Branch `feature/task-10-3-roulettes-daily-gifts` apagada. `main` verde (384 unit
  + 73 integração). Nota de processo: **`docker compose restart frontend` antes de
  cada smoke** — o Vite no contentor não faz HMR das mudanças bind-mounted neste
  host; e usar Playwright MCP (a extensão Chrome congela).

### Task 10.3 fatia 6a — captura à vara server-autoritativa — 2026-09-08

Primeira das 3 sub-fatias da captura. **O servidor sorteia o peixe/peso/modo
sortudo; o minigame de puxar fica no cliente** (furo aceite — um cliente batoteiro
"ganha sempre" mas já não fabrica peixe/raridade/peso). Branch
`feature/task-10-3-fishing-catch-6a`. Spec
`docs/superpowers/specs/2026-09-08-server-fishing-catch.md` (6a; 6b/6c esboçadas),
plano `docs/superpowers/plans/2026-09-08-server-fishing-catch-6a.md` (15 tarefas,
`executing-plans`, inline).

- **`applyCatch(state, catches, {fromNet}, locations)`** — regra pura nova em
  `stateRules.ts`, port verbatim de `catchFishBatch` (XP rede ×0.3, nível,
  desbloqueio, coleção, `heaviestFish`, overflow armazém→`aquariumWarehouse`,
  `totalFishCaught`). `useGameState.catchFishBatch` passa a delegar nela.
- **`resolveLuckyMode(state, now, random)`** — o buff "modo sortudo" (7min/50%/1min)
  passa para o servidor: 2 campos novos no `PlayerState` / `saveSchema`
  (`luckyUntil`, `luckyCooldownUntil`).
- **`rollFish` / `rollWeight`** ganham `random = Math.random` injetável (todos os
  `Math.random()` internos → `random()`; `getWaitTime` intacto). `fishingLogic.ts`
  passa a usar sufixos `.js` nos imports (agora compilado pelo backend).
- **`opReplay.ts` (novo)** — o `readRecordedResult` inline do `runPgOp` extraído,
  partilhado por economia + `fishing_land`. Sem mudança de comportamento.
- **Backend `fishing/` reescrito para o blob** (`roll.ts` / `service.ts` /
  `pgService.ts` antigos apagados): `service.ts` (memória) + `pgRepository.ts` (PG,
  transação própria a espelhar `runPgOp`), helpers partilhados `rollCast` /
  `applyLand`. Migração `0020`… **na verdade `0019_fishing_sessions_result_lucky.sql`**
  (+`result_lucky`). `cast` valida localização + `requiredLevel`, sorteia, escreve
  a janela de sorte no blob (versão +1) + `INSERT fishing_sessions` com o roll.
  `land` (op `fishing_land`, idempotente por chave **e** por `status` da sessão)
  valida a sessão (`INVALID_FISHING_SESSION` / `FISHING_SESSION_EXPIRED` TTL 5min),
  `applyCatch`, versão +1. Rotas
  `POST /api/v1/me/fishing/{cast,land}`; as antigas `/api/v1/fishing/sessions*`
  removidas (`app.ts` partilha o memory blob store como a economia; `openapi.test.ts`
  + `app.test.ts` atualizados).
- **Frontend** — `endpoints.{castLine,landCatch}`; `src/game/fishing.ts` (tipo
  `Hooked`); `Index.handleCast`/`handleLand` (servidor quando `syncEnabled` — flush,
  cast/land, `applyServerResult` nos **dois**; regra local + `catchFishBatch` quando
  anónimo). `FishingScreen` deixa de sortear: no fim da espera chama `onCast`, no win
  do minigame chama `onLand` — **`land` falhado → peixe escapou** (`phase='lost'`),
  nunca diverge. Sem o timer local de modo sortudo. `SubmarineFishing`/`NetFishing`
  intactos (6b).
- Sem mudança de balanceamento (odds de raridade, pesos, XP, `WAREHOUSE_LIMIT`,
  janela de sorte — tudo carregado).
- Testes: `persistence.test.ts` (+1), `stateRules.test.ts` (+9), `fishingLogic.test.ts`
  (+3), `useGameState.catch.test.tsx` (+2, novo), `fishing/service.test.ts` (novo, 8),
  `fishing/routes.test.ts` (novo, 6), `fishing/pgRepository.integration.test.ts` (novo,
  6), `endpoints.test.ts` (+2), `FishingScreen.test.tsx` (reescrito, +1 mock de cena).
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros · `npm test`
  ✅ **406** · `build` ✅ · `test:integration` ✅ **72**.
- Smoke browser (Playwright, stack Docker, conta nova nível 1, Atlântico): 2
  capturas — clicar água → "Lançando" → fim da espera → `POST .../fishing/cast` 200
  (servidor sorteou "Corvina"), minigame no cliente (Enter até ao verde),
  `POST .../fishing/land` 200 → revelação "Capturado! Corvina 3.23 kg +12 XP".
  DB: `fishing_sessions` 1 completed + 1 open (minigame abandonado, TTL trata),
  2 op rows `fishing_land`, blob version 5, xp 24, `totalFishCaught` 2, armazém 2,
  `luckyCooldownUntil` escrito pelo cast; sem divergência, sem erros na consola.
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#26` merged em `a35f7dc`.
  Branch `feature/task-10-3-fishing-catch-6a` apagada. `main` verde (406 unit + 72
  integração).

### Task 10.3 fatia 6c — aquário server-autoritativo — 2026-09-09

Colocar um peixe do `aquariumWarehouse` num sector de exibição passa a ser
server-autoritativo. Branch `feature/task-10-3-economy-aquarium-place`. Bounded
(reusa o runner de economia; `placeAquariumFish` já era regra pura) — sem spec/plano.

- **`POST /api/v1/me/economy/aquarium/place`** + `Idempotency-Key`, body
  `{ timestamp: int≥0, sector: int 1..5 }`. Sector fora de 1–5 → `400 VALIDATION_ERROR`
  (não uso `INVALID_AQUARIUM_SECTOR` — esse é da rota dormante `/inventory/aquarium`
  que a fatia 8 apaga). Op `aquarium_place`.
- **`GameStateEconomyService.placeAquariumFish(userId, key, timestamp, sector)`** —
  `computeAquariumPlace` verifica que existe um peixe com esse `timestamp` no
  `aquariumWarehouse` (senão `AQUARIUM_FISH_NOT_FOUND`, **404**, código novo em
  `errors.ts`), depois delega em `placeAquariumFish` (regra pura **inalterada** —
  o guard fica no `compute`, como `computeSkinPurchase`; o caminho anónimo mantém
  o comportamento tolerante). Corre via `runMemoryOp` / `runPgOp` — **sem sessão**.
- **Result `{ state, version }` — sem `reward`**: os coins+xp de `AQUARIUM_REWARDS`
  já entram no blob via `placeAquariumFish` (`applyXp` + `coins + reward.coins`).
- **Frontend**: `endpoints.placeAquariumFish(key, timestamp, sector)`.
  `Index.handleMoveAquarium` → `runEconomyOp('aquariumPlace', () => moveAquariumFishToSector(ts, sector), key => placeAquariumFishApi(...))`.
  `runEconomyOp` `op` union + `busyOp` ganham `'aquariumPlace'`. `<Aquarium onMoveToSector>`
  passa a apontar para o novo handler. `Aquarium.tsx` sem mudança (assinatura igual).
  Anónimo: `moveAquariumFishToSector` local, inalterado.
- Testes: `economyService.test.ts` (+3 memória), `economyService.integration.test.ts`
  (+3 PG: transacional / replay / concorrência mesma-key), `economyRoutes.test.ts`
  (+5: 200, replay, 404, 400 sector, 401), `endpoints.test.ts` (+1),
  `openapi.test.ts` (+path), `app.test.ts` (+1 fluxo HTTP).
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros ·
  `npm test` ✅ **447** · `build` ✅ · `test:integration` ✅ **79**.
- Smoke browser (Playwright, stack Docker): caminho **anónimo** — Aquário →
  Armazém do Aquário → escolher Setor 1 → tocar num peixe (Piranha de Magma,
  Vulcânica): `coins` 0→350, `xp` 679→959 (+280), `aquariumWarehouse` 23→22,
  Setor 1 passa a ter 1 peixe; **reload** → tudo persiste. Caminho **servidor**
  coberto pelos testes HTTP (`app.test.ts` + `economyService.integration.test.ts`):
  place transacional (1 op row `aquarium_place`, blob atualizado, `version +1`),
  replay, concorrência mesma-key, `AQUARIUM_FISH_NOT_FOUND` (404), sector 6 → 400.
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#37` merged em `6230db3`.
  (`claude-review` continua a falhar por infra — binário `claude` não instala no
  action; jobs `quality` + `integration` verdes.)

### Ponto de parada — 2026-09-09 (fatia 6c integrada)

- `main` em `6230db3`, sincronizada, worktree limpo.
- **Toda a Task 10.3 até 6c** integrada: economia (venda, rede, multiplicador,
  skin, roletas, prendas), captura (vara, rede, submarino), **aquário** — tudo
  server-autoritativo sobre o blob. `Index` sem `onCatch`.
- **Retomar por**: Task 10.3 **fatia 7 — ranking + temporada (leitura)**. O
  frontend passa a ler o ranking e a temporada ativa do servidor quando
  autenticado. Endpoints já existem: `GET /api/v1/leaderboard` (paginado,
  `createPgLeaderboardService`) e `GET /api/v1/seasons/current`
  (`createPgSeasonsService`). Hoje o `Ranking.tsx` usa `src/game/leaderboard.ts`
  (local, `syncCurrentPlayer`). Verificar o que o servidor devolve vs o que o
  componente espera; provável adaptador em `endpoints.ts` + ramo autenticado no
  `Index`/`Ranking`. **Leitura apenas** — sem op, sem escrita. Pode precisar de
  brainstorm curto (bounded) para decidir o shape.
- Depois: fatia 8 (apagar endpoints/tabelas dormentes — `/api/v1/economy/*`,
  `/inventory/*`, `/rewards/daily/claim`, `player_progress`/`wallet`/
  `warehouse_fish`/`aquarium_fish`), e por fim **retirar o write livre do
  `PUT /me/state`** para autenticados (auditoria de segurança #8).
- **Dependabot**: PRs #29–#35 continuam abertos — tarefa própria do utilizador.

### Task 10.3 fatia 7 — ranking + temporada (leitura) — 2026-09-10

`Ranking.tsx` passa a ler `GET /api/v1/leaderboard` + `GET /api/v1/seasons/current`
do servidor quando autenticado (`useAuth()`), mantendo `src/game/leaderboard.ts`
(local) para o caminho anónimo. Branch `feature/task-10-3-leaderboard-read`.

- **Bug encontrado e corrigido durante a investigação inicial**: desde as fatias
  1–6c o progresso vive só no blob `player_game_state`, mas o leaderboard e o
  `/me` continuavam a ler `player_progress` — tabela morta desde a fatia 1.
  Qualquer jogador real apareceria sempre como nível 1 / 0 peixes. Corrigido em
  `backend/src/gamestate/playerStats.ts` (`extractPlayerStats`, novo): lê o blob
  (ou `null`) e degrada para defaults em vez de rebentar em `.parse()` — uma linha
  corrompida não pode partir a listagem inteira. `players/pgRepository.ts`,
  `players/memoryRepository.ts`, `leaderboard/pgRepository.ts`, `leaderboard/service.ts`
  todos reescritos para usar isto.
- **`backend/src/leaderboard/rank.ts`** (`buildLeaderboard`, novo): função pura de
  ranking/paginação partilhada por memória e PG — busca todos os jogadores e
  ordena/pagina em JS, mantendo a regra de nunca mexer no blob com SQL jsonb cru.
- Modo memória do leaderboard passa a listar **todos** os utilizadores registados
  (antes: só o jogador atual) via `AuthRepository.listUsers()` novo (opcional,
  só memória).
- Apagados `backend/src/players/progress.ts` + teste — código morto desde que o
  `recordCatch` (nunca chamado) foi removido.
- `src/game/leaderboard.ts` ganhou `fromApiEntry` (adapta uma entrada do servidor,
  incl. país ISO→bandeira via `iso2ToFlag`, para o `LeaderboardPlayer` que a UI e o
  `ProfileModal` já renderizavam — sem rework de UI).
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros ·
  `npm test` ✅ **457** · `build` ✅ · `test:integration` ✅ **79** (incl.
  `leaderboard/pgRepository.integration.test.ts` reescrito para semear via o blob).
- Smoke browser (Playwright, stack Docker): conta nova → Ranking mostra nível/
  peixes/coins/skins reais (não presos em defaults) → perfil abre com os mesmos
  valores do blob → badge de temporada corretamente ausente (BD nova sem season
  semeada) → sem erros novos na consola/rede.
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#38` merged em `7ff135b`.
  CI 7/7 verde (quality, integration, claude-review, audit).

### Ponto de parada — 2026-09-10 (fatia 7 integrada)

- `main` em `7ff135b`, sincronizada, worktree limpo.
- **Toda a Task 10.3 até 7** integrada: economia, captura (3 modos), aquário,
  ranking + temporada — tudo server-autoritativo sobre o blob.
- **Retomar por**: Task 10.3 **fatia 8** — apagar endpoints/tabelas dormentes
  (`/api/v1/economy/*`, `/inventory/*`, `/rewards/daily/claim`, `player_progress`/
  `wallet`/`warehouse_fish`/`aquarium_fish` — a fatia 7 confirmou que `player_progress`
  já não tem nenhum leitor vivo). Depois: **retirar o write livre do `PUT /me/state`**
  para autenticados (auditoria de segurança #8) — isto fecha a Task 10.3.
- **Dependabot**: PRs #29–#35 continuam abertos — tarefa própria do utilizador.

### Task 10.3 fatia 8 — limpeza de endpoints/tabelas dormentes — 2026-09-10

Branch `feature/task-10-3-cleanup-dormant`. Apaga os módulos `economy/`,
`inventory/`, `rewards/` (17 ficheiros) e as suas rotas (`/api/v1/wallet`,
`/api/v1/economy/nets|multipliers/purchase`, `/api/v1/inventory/*`,
`/api/v1/rewards/daily/claim`) — sem nenhuma chamada do frontend (confirmado
por grep antes de apagar). Apaga `wallets`/`wallet_transactions`/
`daily_reward_claims` via migração nova `0022_drop_dormant_economy_tables.sql`
(sem nenhum outro leitor no código) e espelha em `db/schema.ts`.

- **Decisão explícita do utilizador**: `player_progress`/`warehouse_fish`/
  `aquarium_fish` e o módulo `migration` (import do save local) **ficam
  intocados** — `migration.import()` continua a escrever só nessas tabelas
  legadas, nunca no blob, por isso o import continua sem efeito real hoje
  (mesma classe de bug da fatia 7, mas numa funcionalidade inalcançável pelo
  frontend). Registado como follow-up próprio, fora desta fatia.
- Testes ajustados: 4 blocos removidos de `app.test.ts` (batiam nas rotas
  dormentes), caminhos dormentes removidos da lista esperada em
  `openapi.test.ts`, `wallets` removida da lista de tabelas esperadas em
  `migrate.integration.test.ts`. `CLAUDE.md` atualizado (lista de módulos).
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros ·
  `npm test` ✅ **443** (era 457) · `build` ✅ · `test:integration` ✅ **59**
  (era 79) · migração `0022` aplicada limpa no Postgres do Docker.
- Smoke browser (Playwright, stack Docker): conta nova → ecrã de Multiplicador
  carrega com preços reais do servidor (`/me/economy/multipliers/purchase`,
  distinta da rota dormente apagada) → Ranking continua a funcionar → traço de
  rede sem nenhuma chamada a um caminho apagado → sem erros novos na consola.
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#39` merged em `85c6023`.
  CI 7/7 verde, sem comentários de review.

### Ponto de parada — 2026-09-10 (fatia 8 integrada)

- `main` em `85c6023`, sincronizada, worktree limpo.
- **Toda a Task 10.3 até 8** integrada. Só falta um item para fechar a task.
- **Retomar por**: **retirar o write livre do `PUT /me/state`** para
  utilizadores autenticados (auditoria de segurança #8) — isto fecha a
  Task 10.3. Hoje qualquer autenticado pode substituir o blob inteiro via
  `PUT /me/state` sem passar por nenhuma regra de servidor; a ideia é o
  cliente autenticado deixar de ter esse caminho de escrita livre (as
  operações já todas passam pelos ops `/me/economy/*` e `/me/fishing/*`).
  Precisa de bounded brainstorm: o que acontece a `useGameStateSync`/
  `hydrate.ts` (que hoje fazem `PUT` periódico e no logout), migração do
  save local ainda pendente de decisão (fatia anterior), e se a rota fica só
  leitura (`GET`) para autenticados ou é removida de vez.
- **Dependabot**: PRs #29–#35 continuam abertos — tarefa própria do utilizador.

### Task 10.3 fatia 6b-2 — captura no submarino server-autoritativa — 2026-09-08

Terceira sub-fatia da captura (fecha o 6b). Branch `feature/task-10-3-fishing-catch-6b2`.
Spec `docs/superpowers/specs/2026-09-08-server-fishing-catch-6b2-submarine.md`,
plano `.../plans/2026-09-08-server-fishing-catch-6b2-submarine.md` (9 tarefas,
`executing-plans`, inline, TDD).

- **Modelo**: `cast { mode:'submarine' }` sorteia um **roster de 24** peixes
  (`rollSubmarineBatch`, tabela de raridade própria portada de `SubmarineFishing.spawnFish`)
  para `result_catches`, cria sessão `open` com `mode:'submarine'`. **Cast neutro**:
  não corre `resolveLuckyMode`, **não escreve no blob**, **não bumpa `version`**.
  `land { sessionId, catchId }` aplica exatamente a entrada com esse `id` sintético
  (`fromNet:false`), remove-a de `result_catches`, **renova `created_at`**, e marca
  `completed` quando o roster esvazia. Op `fishing_land`, key fresca por clique,
  `version +1` por colheita.
- **Coluna `mode` real** (`fishing_sessions.mode varchar(16)`, migração `0021`,
  check `rod|net|submarine`, backfill `net WHERE result_catches IS NOT NULL`).
  Substitui a inferência `result_catches != null ⇒ net` — o submarino também usa
  `result_catches`. `modeOf()` eliminado; lê-se `session.mode`. `result_catches`
  `$type` ganha `id?` (só o submarino põe).
- **`SUBMARINE_LOCATION_ID = 'submarine'`** (`src/game/data.ts`), aceite como caso
  especial em `caughtFishSchema` (`persistence.ts`). **Corrige o bug de corrupção
  de save**: uma captura de submarino (`location:'submarine'`) já não faz
  `saveSchema.parse` rejeitar o blob inteiro. `LOCATIONS` fica intacto (não
  aparece no seletor de locais).
- **`applyLand`** ganha `opts: { catchId? }` e devolve `remaining` (roster pós-colheita
  para o submarino; `null` para rod/net). `FishingService.land` ganha `catchId?`.
  `land` body: `{ sessionId: uuid, catchId?: uuid }` (era `fishId?`).
- **Frontend**: `endpoints` — `SubmarineCast`, `landCatch(key, sid, catchId?)`.
  `Index.handleCast('submarine','submarine')` (servidor: `castLine` → `SubmarineHooked`;
  anon: `rollSubmarineBatch` local com `id`s gerados). `Index.handleLand` passa a
  devolver **`{ outcome, caught? }`** (rod/net lêem `.outcome`; submarino lê `.caught`).
  Ramo `hooked.kind === 'submarine'` (servidor `landCatch`; anon `catchFish(..., 'submarine')`).
  **`handleCatch` removido → `Index` não tem mais nenhum `onCatch`.**
- **`SubmarineFishing.tsx`** reescrito: props `{ player, onCast, onLand, onBack }`.
  Mantém todo o canvas/arpão/HUD/overlay. Muda: os peixes que nadam vêm do roster
  de `onCast` (cada `SwimmingFish` carrega `catchId` + `sessionId`); refill em
  background quando restam ≤4 não-colhidos (`SUBMARINE_ROSTER_REFILL_AT`), fundido
  no roster; `handleFishClick` → `onLand(hooked, 'submarine', sf.catchId)` (com o
  `sessionId` do próprio peixe, porque um refill traz sessão nova). `spawnFish`
  standalone eliminado (lógica movida para `fishingLogic.rollSubmarineFish`).
  Fases `casting` / `active` / `empty` (`sub.unavailable` i18n nova).
- Sem mudança de balanceamento (raridade do submarino, peso, XP `fromNet:false`).
  Sem custo/limite (buraco de economia conhecido, deferido, como o trust hole do
  minigame).
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros ·
  `npm test` ✅ **437** · `build` ✅ · `test:integration` ✅ **76**.
- Smoke browser (Playwright, stack Docker): caminho **anónimo** — abrir a Pesca
  Submarina, roster sorteado localmente e a nadar, clicar num peixe → arpão →
  overlay "Capturado! Tilápia 1.57 kg +10 XP" (`catchFish(..., 'submarine')`),
  **reload** → o save mantém-se (nível 10, `totalFishCaught` 37→38, 1 entrada
  `location:'submarine'` no `collection` + overflow para `aquariumWarehouse`) —
  antes deste fix o `parseSavedState` descartava o save inteiro. Caminho
  **servidor** coberto pelos testes HTTP end-to-end (`app.test.ts` + 76 de
  integração): cast de 24 sem op row nem `version` bump, colheitas bumpam
  `version`, roster encolhe, `created_at` renovado, drain → `completed`, coluna
  `mode='submarine'`, guards `INVALID_FISHING_SESSION` (sem `catchId` / `catchId`
  inválido / já colhido).
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#36` merged em `c6f7fbf`.
  (`claude-review` falhou por infra — binário `claude` não instalou no action,
  `ANTHROPIC_API_KEY` vazio — não é um achado de código; jobs `quality` +
  `integration` verdes, sem review comments.)

### Ponto de parada — 2026-09-08 (fatia 6b-2 integrada)

- `main` em `c6f7fbf`, sincronizada com `origin/main`, worktree limpo.
- **Task 10.3 fatias 1–5** + **6a** (vara) + **6b-1** (rede) + **6b-2** (submarino)
  + **segurança lote 1** — integradas e verificadas. **Todos os modos de captura
  são server-autoritativos**; `Index` não tem mais nenhum `onCatch`.
- **Retomar por**: Task 10.3 **fatia 6c — aquário** (`POST /api/v1/me/economy/aquarium/place`,
  body `{ timestamp, sector }` + `Idempotency-Key`, op `aquarium_place`;
  `placeAquariumFish` já é regra pura em `stateRules.ts`, concede `AQUARIUM_REWARDS`
  coins+xp). Reusa o runner de economia (`runPgOp`/`runMemoryOp`), **sem sessão**
  (opera sobre um peixe já no `aquariumWarehouse`). Frontend:
  `Aquarium.onMoveToSector` → `runEconomyOp('aquariumPlace', …)`. Erro novo
  possível: `AQUARIUM_FISH_NOT_FOUND` (404) quando o `timestamp` não existe (a
  regra pura hoje devolve estado inalterado — fazê-la lançar). Ver sketch §6c em
  `docs/superpowers/specs/2026-09-08-server-fishing-catch.md`.
- Depois de 6c: fatia 7 (ranking + temporada, leitura), fatia 8 (limpeza de
  endpoints dormentes `/api/v1/economy/*`, `/inventory/*`, `/rewards/daily/claim`),
  e por fim **retirar o write livre do blob `PUT /me/state`** para autenticados
  (#8 da auditoria de segurança).
- **Dependabot**: 7 PRs abertos (#29–#35) desde o lote 1 de segurança — tarefa
  própria do utilizador, não mexer nos transitivos (CLAUDE.md).

### Task 10.3 fatia 6b-1 — captura à rede server-autoritativa — 2026-09-08

Segunda das 3 sub-fatias da captura (6b = rede + submarino; 6b-1 = rede). Mesmo
`cast`/`land` do 6a, agora com lote. Branch `feature/task-10-3-fishing-catch-6b1`.
Spec `docs/superpowers/specs/2026-09-08-server-fishing-catch-6b.md` (M1–M5, §6b-1),
plano `.../plans/2026-09-08-server-fishing-catch-6b1-net.md` (10 tarefas,
`executing-plans`, inline).

- **Modelo partilhado**: `cast` body ganha `mode: 'rod'|'net'|'submarine'` (default
  `rod`); `land` body ganha `fishId?` (aceite, só usado no 6b-2). Coluna
  `fishing_sessions.result_catches jsonb` (migração `0020`) — `rod` usa
  `result_fish_id/weight/xp`, `net` usa `result_catches`; o mode infere-se de
  `result_catches != null`. `LandResult.caught` passa a **array** (rod = 1 elemento).
- **`src/game/netTypes.ts`** (movido de `src/components/game/netfishing/`) — `NET_TYPES`
  + `rollNet(random)`. O caminho antigo re-exporta.
- **Backend**: `rollCast(player, locationId, mode, now)` devolve `RodRoll | NetRoll`
  discriminado; net verifica `nets >= 1` (senão `NO_NETS`, 409, código novo),
  decrementa `nets` no blob, sorteia `NetType` + `fishCount` peixes da rarity da
  rede (fallback: pool da localização). `applyLand` lê `result_catches` e chama
  `applyCatch(..., { fromNet: true })`. Helpers partilhados `castPlayerPatch` /
  `castResultFor` / `sessionRowFor`. Memória + PG.
- **Frontend**: `endpoints.castLine(key, loc, mode)` / `landCatch(key, sid, fishId?)`;
  `CastResult` discriminado (`RodCast | NetCast`), `LandResult.caught` array.
  `Index.handleCast(loc, mode)` roteia net/rod (servidor ou roll local — o roll
  anónimo de rede decrementa `nets` via `replaceFromServer`); `handleLand` é
  batch-aware. `Hooked = RodHooked | NetHooked`. **A rede consome-se no `cast`** —
  `Index` deixa de chamar `consumeNet` ao entrar no ecrã de rede; `NetFishing`
  deixa de chamar `onUseNet`.
- **`NetFishing`** reescrito: lança a rede no mount via `onCast(_, 'net')`, corre o
  minigame com `net.{greenZoneSize,speed}` do servidor, pull-verde → `onLand` →
  revelação do lote de `hooked.catches`; pull-vermelho ou `land` falhado → rede
  vazia. `handleNetCatch`/`consumeNet` removidos do `Index`; `handleCatch` só serve
  o submarino agora (6b-2 remove-o).
- Sem mudança de balanceamento (`NET_TYPES`, sorteio de peso, `fromNet` XP ×0.3).
- Testes: `netTypes.test.ts` (+2, novo), `service.test.ts` (+6 net), `routes.test.ts`
  (+2), `pgRepository.integration.test.ts` (+2), `endpoints.test.ts` (+2 reescritos),
  `NetFishing.test.tsx` (reescrito), `FishingScreen`/`app`/`pg` 6a tests ajustados
  a `caught[]`.
- Verificação: `tsc app` ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros · `npm test`
  ✅ **416** · `build` ✅ · `test:integration` ✅ **74**.
- Smoke browser (Playwright, stack Docker, conta nova nível 8 + 5 redes semeados):
  lago Titicaca → "Lançar a rede" → `POST .../fishing/cast { mode: net }` 200
  (servidor sorteou "Rede Abissal / 5 peixes", `result_lucky: t`), minigame no
  cliente, pull-verde → `POST .../fishing/land` 200 → "Recebeste 5 peixes" com o
  lote do servidor. 4 redes lançadas: 4 op rows `fishing_land` (lotes 5/8/4/8),
  `nets` 5→1, armazém 15 (cheio) + `aquariumWarehouse` 12 (overflow do `applyCatch`),
  4 sessões `completed`. Um 409 na consola durante o mashing agressivo do smoke
  (`STATE_VERSION_CONFLICT` entre um `PUT` de flush e um `cast` — comportamento de
  concorrência otimista pré-existente, o cliente retenta).
- **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#27` merged em `26fe90d`.

### Task 10.3 — segurança, lote 1 (alto valor / baixo custo) — 2026-09-08

Primeiro lote da auditoria `docs/analysis/security-checklist-20.md`. Branch
`security/quick-wins`. **Integrado na `main`**: PR `Bonandi22/deep-blue-lure#28`
merged em `3d88662`.

- **#1** `.claude/` deixa de ser versionado — `.claude/settings.json` tinha sido
  commitado por acidente em `c2cdb17`. `git rm --cached` + `/.claude/` no
  `.gitignore`. (O ficheiro local é recriado pelo harness; não afeta runtime.)
- **#19** Job `audit` novo no `ci.yml`: corre `npm audit --audit-level=high`,
  **nunca falha o check** (escreve o relatório no `$GITHUB_STEP_SUMMARY`), só
  torna visível um advisory novo. `.github/dependabot.yml`: npm + github-actions
  semanais, agrupado prod/dev. **Não** mexer nos transitivos agora (CLAUDE.md).
- **#11** Balde de rate limit dedicado para `POST /api/v1/auth/{login,register}`:
  contam também num segundo `Map` mais apertado. Env `AUTH_RATE_LIMIT_MAX`
  (default 20) / `AUTH_RATE_LIMIT_WINDOW_MS` (default 300000). `overLimit()`
  helper partilhado em `security/http.ts`. Keyed em `request.ip` como o geral —
  ressalva do balde partilhado atrás de proxy documentada no `.env*.example`.
- **#18** `docker/nginx.conf` bloco `location /`: `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS e CSP
  (`script-src 'self'`; `style-src 'self' 'unsafe-inline' fonts.googleapis.com`;
  `font-src … fonts.gstatic.com`; `worker-src 'self' blob:`). Só se aplica ao
  nginx de produção (o Vite de dev não passa por aqui). **TODO**: self-hostar as
  fontes para largar os 2 hosts Google.
- Verificação: `tsc` app ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros ·
  `npm test` ✅ **419** · `build` ✅ · `test:integration` ✅ **74**.
- Smoke: build da imagem de produção do frontend (`Dockerfile` target `runtime`),
  container na rede do compose a apontar `/api` para o backend. Home + escolha de
  local + cena 3D de pesca renderizam sem violações de CSP (só 401 `/me` e 403
  `/auth/refresh`, esperados em anónimo). A CSP inicial partia o `@import` do
  Google Fonts em `src/index.css` — daí os 2 hosts Google na policy final.

### Ponto de parada — 2026-09-08 (segurança lote 1 integrado)

- `main` em `3d88662`, sincronizada com `origin/main`, worktree limpo.
  `.claude/` agora ignorado (untracked local, recriado pelo harness).
- **Task 10.3 fatias 1–5** + **6a** (vara) + **6b-1** (rede) + **segurança lote 1**
  — integradas e verificadas.
- **Bloqueiam produção** (auditoria `docs/analysis/security-checklist-20.md`):
  (a) backups automáticos do Postgres (#3) — infra;
  (b) HTTPS forçado + HSTS no edge (#4/#18) — infra;
  (c) retirar o write livre do blob `PUT /me/state` para utilizadores
  autenticados (#8) — **isto é concluir a Task 10.3** (fatias 6b-2, 6c, 7, 8).
- **Retomar por**: Task 10.3 **fatia 6b-2 — submarino** (mesmo `cast`/`land`,
  `mode:'submarine'`; precisa de coluna `mode` para distinguir de `net`;
  `location:'submarine'` não está em `LOCATIONS` — bug latente de corrupção de
  save a corrigir aqui). Depois **6c** aquário, ranking+temporada (leitura),
  limpeza de endpoints dormentes, e por fim retirar o write do blob.

### Ponto de parada — 2026-09-08 (fatia 6a integrada)

- `main` em `a35f7dc`, sincronizada com `origin/main`, worktree limpo (`.claude/`
  fica untracked — settings local do harness; candidato a `.gitignore` à parte).
- **Task 10.1**, **10.2**, **limpeza** do import, e **10.3 fatias 1–5** + **6a**
  (venda armazém, rede, multiplicador, skin, roletas+prendas, **captura à vara**) —
  todas integradas e verificadas.
- **Retomar por**: Task 10.3 **fatia 6b — rede (lote) + submarino**. Mesmo padrão do
  6a (`cast` sorteia, `land` aplica). `cast` ganha `{ mode: 'rod'|'net'|'submarine' }`:
  net sorteia N peixes (ver contagem atual em `NetFishing`), `land` aplica
  `applyCatch(..., { fromNet: true })`; consumo da rede (`consumeNet`) funde-se no
  `cast`. `SubmarineFishing` = `cast`/`land` como a vara com `mode:'submarine'`.
  Frontend: `NetFishing`/`SubmarineFishing` saem do `onCatch` para `onCast`/`onLand`;
  `Index` larga o último `onCatch`. Ver `docs/superpowers/specs/2026-09-08-server-fishing-catch.md`
  §6b. Precisa de spec própria (brainstorm → spec → plano).
- Infra do padrão pronta: `service.ts`/`pgRepository.ts` de pesca com `rollCast` /
  `applyLand` partilhados, `opReplay.ts`, `applyCatch` / `resolveLuckyMode` puros.
- Depois de 6b: **6c** aquário (`POST /me/economy/aquarium/place`, op `aquarium_place`,
  `placeAquariumFish` já é regra pura). Depois: ranking + temporada (leitura), depois
  a limpeza dos endpoints dormentes `/api/v1/economy/*` + `/api/v1/inventory/*` +
  `/api/v1/rewards/daily/claim`.
- Stack Docker fica de pé; a BD de dev partilha instância com os testes de integração
  (as contas de smoke são truncadas entre corridas — criar conta nova a cada smoke).

### Task 11 — Endurecimento de produção (backups + HTTPS forçado) — concluída, 2026-09-11

PR `Bonandi22/deep-blue-lure#41` → `main` `1eeb05f`. Branch `feature/task-11-production-hardening`
apagada (local e remoto). Plano em 8 tarefas:
`docs/superpowers/plans/2026-09-11-production-hardening.md` (spec em
`docs/superpowers/specs/2026-09-11-production-hardening-design.md`).

- Novo `docker-compose.prod.yaml`, standalone, ao lado do `compose.yaml` de dev
  (nunca modificado): serviços `postgres`, `backend`, `frontend` (porta 80/443,
  única exposta ao host), `certbot`, `backup`. Volumes nomeados fixos
  `deep_blue_lure_prod_*`.
- **Backups automáticos** (#3): `scripts/backup/backup.sh` — `pg_dump` em loop,
  restauro imediato numa BD scratch no mesmo servidor para provar validade,
  manifesto JSON de contagem de linhas por tabela, poda por
  `BACKUP_RETENTION_DAYS` (mantém sempre o mais recente).
  `scripts/backup/restore-test.sh` — restauro independente num Postgres
  descartável, compara contra o manifesto.
- **HTTPS forçado + HSTS** (#4/#18): `docker/nginx.prod.conf.template`
  (redirect 80→443, TLS, HSTS, mesmos headers/CSP do nginx de dev) + serviço
  `certbot` (renovação automática a cada 12h) + `scripts/deploy/init-letsencrypt.sh`
  (bootstrap de certificado novo: cert dummy → nginx arranca → certbot emite o
  real → reload).
- `.env.production.example` (git-ignored `.env.production` real) +
  `docs/deploy/production.md` (runbook: setup inicial, renovação, verificação
  de backup, disaster recovery).
- `docs/analysis/security-checklist-20.md` corrigido (#3, #4, #18) e `CLAUDE.md`
  ganhou as duas novas entradas de comando.
- Verificação: `tsc` app ✅ · `backend:typecheck` ✅ · `lint` ✅ 0 erros ·
  `npm test` ✅ **444** · `build` ✅ · `test:integration` ✅ **61** (contra
  PostgreSQL local real). CI da PR: 7/7 checks verdes (incl. `claude-review`).
- **Não validado** (impossível sem infraestrutura real): o `certbot certonly`
  ao vivo contra um domínio DNS real — documentado no runbook como o teste de
  aceitação do primeiro deploy.
- **Estado**: os dois bloqueadores de produção que restavam
  ((a) backups automáticos, (b) HTTPS forçado) estão agora **implementados no
  repositório**, mas **não exercitados contra uma VPS/domínio reais** — esse é
  o único passo que falta antes de um primeiro deploy real.

### Manutenção de dependências (Dependabot) — concluída, 2026-11-11

Retoma após ~2 meses parado. Os 7 PRs do Dependabot pendentes foram todos tratados;
nenhum PR fica aberto.

- **#29 / #30** — `actions/checkout` e `actions/setup-node` 4 → 7. Merge direto.
- **#48** (`chore/deps-2026-11`) consolida #47 (39 deps de produção: radix-ui,
  fastify 5.12.7, drizzle-orm 0.45, **three 0.160 → 0.187**, react-query,
  react-hook-form, next-themes 0.4…), #45 (10 dev-deps: typescript-eslint 8.71,
  eslint-plugin-react-refresh 0.5…), #34 (`vaul` 1.1.2) e #35 (`@types/node` 26).
  Os lockfiles conflituavam entre si, por isso foram juntados numa branch e o lock
  regenerado. Correção necessária: `@types/node` 26 deixou de expor
  `Array.prototype.at` ao programa do frontend → `tsconfig.app.json` declara
  `lib: ES2022` (só tipos).
- **#50** (substitui #33 e #49) — **Tailwind 3 → 4** com a ferramenta oficial
  `@tailwindcss/upgrade`: `tailwind.config.ts` removido (tema em `src/index.css`
  via `@theme`/`@plugin`), PostCSS → `@tailwindcss/postcss`, `autoprefixer`
  removido, renames de utilities v4 em ~45 componentes. A ferramenta reescreveu
  por engano a variante de botão `"outline"` → `"outline-solid"` em
  `pagination.tsx` (revertido); `components.json` → `tailwind.config: ""`.
  O #49 original fechou sozinho quando a sua base (`chore/deps-2026-11`) foi
  apagada no merge do #48 — lição: re-apontar PRs empilhados para `main` **antes**
  de fazer merge com `--delete-branch` na base.
- Verificação: `tsc` app + backend ✅ · lint 0 erros ✅ · `npm test` ✅ **444** ·
  `build` ✅ · `test:integration` ✅ **61** · CI verde nos dois PRs · smoke
  Playwright no stack Docker (cena 3D a renderizar `three.js r187`, cast e roleta
  com 200 no servidor, modais/sheet Radix, 0 erros de consola).
- **Riscos em aberto**: diferenças visuais subtis do Tailwind 4 (cabeçalho da
  seleção de locais ~7px mais compacto); ecrãs não exercitados no smoke: coleção,
  armazém, skins, ranking, aquário, submarino. `three` 0.187 avisa `THREE.Clock`
  deprecado (vem do `@react-three/fiber`) e `PCFSoftShadowMap` removido → cai para
  `PCFShadowMap`. Um teste unitário falhou uma vez de forma intermitente.
- **Docker dev**: o volume nomeado `frontend_node_modules` guarda as dependências
  antigas mesmo com `--build`. Após mudar `package.json`:
  `docker compose rm -sf frontend && docker volume rm deep-blue-lure_frontend_node_modules && docker compose up -d --build frontend`.
- **Follow-ups opcionais**: subir `@react-three/fiber` / ajustar tipo de sombra;
  trocar `tailwindcss-animate` por `tw-animate-css`; CI ainda em Node 20 (EOL
  desde abril de 2026) — subir para 22/24.

## Fase 11 · bloco 1 — Segurança da conta

Confirmação de email, login em 2 passos e recuperação de palavra-passe, em 3 PRs.

- **O que foi construído**
  - PR 1 (#51): pipeline de email — tabela `email_outbox`, RabbitMQ (`email.send`,
    `email.dead`), `email-worker` com SMTP (Mailpit em dev).
  - PR 2 (#52): confirmação de email obrigatória, 2 passos no login e política de
    palavras-passe NIST.
  - PR 3: recuperação de palavra-passe por código de email + limpeza periódica
    (contas nunca confirmadas após 7 dias; desafios, reais e isca, expirados há
    mais de 24 h), executada pelo `email-worker` no arranque e de hora a hora.
- **Decisões do utilizador**: 2 passos em todo o login com palavra-passe quando o
  refresh token expirou; confirmação de email obrigatória; RabbitMQ como broker;
  política NIST; códigos válidos 30 minutos.
- **Endurecimento vindo das revisões**: lease no outbox; worker sai se perder o
  broker (o supervisor reinicia); reserva atómica de tentativas; desafios isca
  guardados (sem enumeração de emails); limites por finalidade; rate limit e CSRF
  por rota correspondida (não pelo URL cru).
- **Migrações**: 0023 (`email_outbox`), 0024 (verificação + `auth_challenges`),
  0025 (desafios isca). Sem 0026: a limpeza de desafios filtra por `expires_at`
  numa tabela que a própria limpeza mantém pequena, sem índice novo.
- **Em aberto**: pequenos ajustes de UX; +45 kB no bundle da lista de palavras-passe
  comuns; os access tokens sobrevivem a um reset até 15 min; os testes de
  integração partilham a fila `email.send` com um worker local (parar o
  `email-worker` do Docker); textos dos emails sem revisão de nativos.

### Fase 11 — correções da revisão final (I1–I4)

- **Limite por endereço (I1)**: os códigos `login` já não contam para o limite de 10 emails/h por endereço (só são
  emitidos depois de a palavra-passe estar certa). O limite de 5/h por utilizador e
  finalidade continua. O `register_attempt_notice` é enviado no máximo 1 vez por
  endereço a cada 24 h, e a resposta do registo não muda.
- **Reset (I2)**: a política da palavra-passe (com o username) e `SAME_AS_CURRENT`
  correm depois de o código bater certo e antes de o consumir. Uma palavra-passe
  rejeitada gasta uma tentativa, não o código. O cliente valida também com o
  username e mostra a mensagem de `CHALLENGE_NOT_FOUND` no ecrã para onde volta.
- **Outbox (I3)**: `markSent`/`markFailed` substituem `payload.code` por
  `[redacted]`. A limpeza horária apaga as linhas `sent`/`failed` com mais de
  7 dias. Os backups feitos antes desta correção podem conter códigos em claro,
  todos expirados há muito (validade de 30 min).
- **Teto de tentativas (I4)**: no máximo 30 tentativas falhadas em 24 h (janela
  móvel) por (endereço normalizado, finalidade). Depois disso a verificação
  responde `TOO_MANY_ATTEMPTS` sem gastar tentativa, até a janela limpar. A conta
  e as iscas para o mesmo endereço partilham o orçamento, por isso não há oráculo.
  Esgotar o orçamento do reset não bloqueia `login` nem `verify_email`. Sem
  migração: o teto é calculado a partir de `auth_challenges.attempts`.
- **Login sempre com código `login` (N1, re-revisão)**: o `login()` emite sempre um
  código `login`, também para contas por confirmar (incl. legadas); o `verifyLogin`
  marca o email como confirmado. Os códigos `verify_email` só vêm do registo — assim
  falhar 30 iscas de registo para um endereço não bloqueia o login. Risco aceite: um
  anónimo pode bloquear o reset de um endereço por 24 h (o login continua a funcionar).

## Renomeação do jogo: Fishing Legends (2026-11-12)

Decisão do utilizador: o nome principal do jogo passa a ser **Fishing Legends**.
Mudado em tudo o que é visível: logótipo do menu (`MainMenu.tsx` `WORDMARK`), `<title>`/meta
de `index.html`, assuntos e textos dos emails (`backend/src/email/templates.ts`, 6 idiomas),
remetente `EMAIL_FROM` (default em `config/env.ts` + `.env.*.example`), título da OpenAPI,
temporada em memória (`Fishing Legends Season 1`), README, `CLAUDE.md`, `backend/docs/ARCHITECTURE.md`.
**Mantidos de propósito** (identificadores de infraestrutura, não marca): nome do repositório
GitHub/pasta, utilizador/base `deepbluelure` (compose, CI, `.env` examples), nomes de projeto
compose e volumes `deep_blue_lure_prod_*` (renomear órfãos os dados de produção), `service:
'deep-blue-lure-api'` do `/health`, e a semente interna do hash de timing do login. As
referências históricas neste ficheiro ficam como estão.
