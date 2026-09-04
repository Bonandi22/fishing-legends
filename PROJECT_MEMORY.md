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
- Não iniciar backend, autenticação, ranking global ou Campeonato até concluir a revisão final do frontend.

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
