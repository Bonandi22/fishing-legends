# Deep Blue Lure — Memória do Projeto

Este arquivo mantém o contexto técnico e o roadmap versionados no repositório. Ele deve ser atualizado ao concluir cada etapa relevante.

## Estado atual

- Data de referência: 2026-09-04.
- Projeto: jogo de pesca React/TypeScript com Vite, Vitest, Playwright e sistemas 3D.
- Arquitetura online: ainda não existe backend, autenticação real ou ranking global.
- Persistência atual: `localStorage`, com saves versionados e validação Zod.
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
