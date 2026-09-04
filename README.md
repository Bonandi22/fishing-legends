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

O projeto é uma SPA frontend-only baseada em Vite. O estado do jogador é controlado por `src/game/useGameState.ts`, as regras puras estão sendo extraídas para módulos de domínio, e a persistência usa `localStorage` por meio de uma abstração `KeyValueStorage`.

Ainda não existe backend, autenticação real ou ranking global. Conta, ranking e progresso local não devem ser considerados confiáveis para competição online. Os requisitos de segurança e a arquitetura online estão documentados em [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md).

## Desenvolvimento local

Requisitos: Node.js e npm.

```bash
git clone https://github.com/Bonandi22/deep-blue-lure.git
cd deep-blue-lure
npm install
npm run dev
```

## Scripts

| Comando | Finalidade |
|---|---|
| `npm run dev` | Inicia o servidor Vite |
| `npm run build` | Gera o build de produção |
| `npm run build:dev` | Gera o build em modo desenvolvimento |
| `npm test` | Executa os testes Vitest |
| `npm run test:watch` | Executa Vitest em modo watch |
| `npm run lint` | Executa o ESLint |

## Testes e qualidade

Os testes atuais cobrem regras de pesca, persistência, migração de saves, progressão, desbloqueios, capacidade do armazém e o adaptador de armazenamento. Playwright está configurado para a evolução dos testes E2E.

Antes de abrir um pull request:

```bash
npx tsc --noEmit -p tsconfig.app.json
npm test
npm run build
```

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

O trabalho atual está em `feature/task-02`, dedicada à refatoração arquitetural. A memória técnica, os commits e o roadmap completo estão em [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md).

## Roadmap resumido

1. **Task 1 — Estabilização do núcleo:** concluída.
2. **Task 2 — Refatoração arquitetural:** em andamento.
3. **Task 3 — Conteúdo e balanceamento:** em andamento.
4. **Task 4 — Backend e autenticação:** planejada.
5. **Task 5 — Campeonato e ranking global:** planejada.

## Origem

O protótipo inicial foi criado no [Lovable](https://lovable.dev) e atualmente é mantido localmente e versionado neste repositório GitHub.
