# Deep Blue Lure — Memória do Projeto

Este arquivo mantém o contexto técnico e o roadmap versionados no repositório. Ele deve ser atualizado ao concluir cada etapa relevante.

## Estado atual

- Data de referência: 2026-09-05.
- Projeto: jogo de pesca React/TypeScript com Vite, Vitest, Playwright e sistemas 3D.
- Arquitetura online: backend Fastify + PostgreSQL em construção na branch
  `feature/task-06-backend-foundation` (não integrado em `main`, não validado contra
  PostgreSQL real, sem runner de migração funcional, fora do CI). O frontend ainda
  **não** consome o backend. Ver `docs/analysis/` e a secção "Análise completa do
  backend — 2026-09-05".
- Persistência do frontend: `localStorage`, com saves versionados e validação Zod.
- Branch principal integrada: `main`.
- Último merge da revitalização de interfaces: `08a26b8`.
- Branch de trabalho pausada: `fix/menu-symmetry`.
- Último commit local: `94fa6c0` — `Record project pause point`.
- PRs das Tasks 2, 3 e 4: `Bonandi22/deep-blue-lure#1`, `#2` e `#3`, todos integrados.
- PR da revitalização de interfaces: `Bonandi22/deep-blue-lure#4`, integrado na `main`.
- Correção de CI publicada em `f16299d` — lockfile sincronizado com `package.json`.
- Permissão `actions: read` adicionada ao workflow em `472365a`.
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
- **Pendente (utilizador)**: repetir o fluxo no próprio browser (fisgar um peixe
  real → logout → login → peixe lembrado; fechar o separador → login → progresso
  mantido) e rever o diff.
