# Deep Blue Lure — Memória do Projeto

Este arquivo mantém o contexto técnico e o roadmap versionados no repositório. Ele deve ser atualizado ao concluir cada etapa relevante.

## Estado atual

- Data de referência: 2026-09-04.
- Projeto: jogo de pesca React/TypeScript com Vite, Vitest, Playwright e sistemas 3D.
- Arquitetura online: ainda não existe backend, autenticação real ou ranking global.
- Persistência atual: `localStorage`, com saves versionados e validação Zod.
- Branch atual: `feature/task-02`.
- Último commit: `9c1977b` — `Decouple player state from browser storage`.
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

Próximos passos:

- Separar operações de domínio de `useGameState`.
- Criar módulos puros para economia, redes, multiplicadores e recompensas.
- Validar contratos entre componentes e domínio.
- Revisar timers restantes e efeitos de ciclo de vida.
- Reduzir a responsabilidade de `Index.tsx` e `useGameState.ts`.
- Manter commits pequenos e reversíveis.
- Venda do armazém e colocação de peixes no aquário foram extraídas para regras puras e cobertas por testes.
- A próxima etapa será a `feature/task-03` para conteúdo e balanceamento.

### Task 3 — Conteúdo e balanceamento — planejada

- Validar automaticamente IDs de peixes e regiões.
- Revisar pools exibidos versus pools efetivamente sorteados.
- Corrigir e documentar probabilidades.
- Medir progressão de XP, moedas, pesos, raridades e capacidade do armazém.
- Criar testes de balanceamento e regressão de conteúdo.

### Task 4 — Backend e autenticação — planejada

- Introduzir API e persistência server-side.
- Implementar autenticação real e autorização por usuário.
- Migrar ranking e conta local para dados remotos.
- Remover confiança do cliente para moedas, XP, inventário e resultados competitivos.

### Task 5 — Campeonato — planejada

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
- `useGameState.ts` ainda concentra muitas regras de domínio e é o principal alvo da Task 2.
- Componentes 3D possuem arquivos com `@ts-nocheck` e devem ser tratados gradualmente.
- O bundle de produção é grande por causa dos assets 3D e imagens; code splitting será avaliado depois da separação arquitetural.
- Alterações devem ser feitas sem apagar mudanças de usuário e sem modificar backend inexistente.

## Validação registrada

Na conclusão da Task 1 e no início da Task 2:

- TypeScript passa com `npx tsc --noEmit -p tsconfig.app.json`.
- Vitest passa com 14 testes.
- Build de produção passa.
- O build ainda emite o alerta de chunks grandes do Vite.
