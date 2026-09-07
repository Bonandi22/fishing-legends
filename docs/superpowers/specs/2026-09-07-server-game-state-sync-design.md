# Server-side game-state persistence (account save) — design

Data: 2026-09-07 · Branch alvo: `feature/task-10-1-auth-foundation` (continuação directa;
na prática abre o núcleo da **Task 10.2**)

Nasce de teste manual do 10.1: com o logout a zerar o jogo local (decisão do utilizador,
commit `aaf9247`), o progresso feito numa sessão autenticada não sobrevive ao
logout/login — o servidor ainda não guarda estado de jogo. Este design fá-lo.

## Objetivo

A conta passa a **lembrar-se do progresso de jogo** entre logout/login e **entre
dispositivos**. No login o estado é carregado do servidor automaticamente (sem
diálogo de importação). Enquanto se joga autenticado, o estado é gravado no
servidor de forma quase contínua.

## Decisões (alinhadas com o utilizador, 2026-09-07)

1. **Blob JSON do envelope de save completo** — uma coluna `jsonb` com exatamente o
   que `serializePlayerState` produz e `parseSavedState` consome:
   `{ schemaVersion: 1, player: <PlayerState> }`. O mesmo que já está no
   `localStorage`. Não estruturar em colunas (o 10.3 refá-lo).
2. **Sincronização:** no logout + *debounced* a cada mudança (~4 s) + ao fechar a aba
   (`pagehide` / `visibilitychange:hidden`).
3. **Conflito multi-dispositivo:** último a gravar ganha, sem guarda de versão. O
   10.2 completo trará sync periódico a sério.
4. **Sem diálogo de importação no fluxo logado.** No 1º login sem estado no
   servidor, o save local anónimo é **adotado automaticamente** para o servidor.
5. **Logout continua a zerar o jogo local** (decisão anterior); antes de zerar,
   faz-se flush do estado para o servidor.

## Fora de âmbito

- Sync periódico bidirecional / resolução de conflitos (10.2 completo).
- Economia/pesca/inventário como recursos server-autoritativos individuais (10.3/10.4).
- Migração das tabelas estruturadas existentes (`player_progress`, `warehouse_fish`,
  `aquarium_fish`) para o blob — ficam como estão; o blob é a fonte de verdade do
  **cliente**, as colunas continuam a servir `/me` e o `/leaderboard`.
- Geração de tipos do OpenAPI.

## Arquitetura

```
Browser (autenticado)
  useGameState.player  ──muda──▶  gameStateSync (debounce 4s / pagehide)
                                        │  PUT /api/v1/me/state  { state }
                                        ▼
                              player_game_state (jsonb, 1 linha/user)
                                        ▲
  login/afterAuth  ──GET /api/v1/me/state──┘  →  replace local  |  adopt local
```

### Componente A — Backend: `backend/src/gamestate/`

Módulo novo, mesmo padrão dos existentes (`routes.ts` fino, `service.ts` em
memória, `pgRepository.ts` transacional; `app.ts` escolhe por `DATABASE_URL`).

**Migração `backend/migrations/0015_player_game_state.sql`:**

```sql
CREATE TABLE IF NOT EXISTS player_game_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Refletir em `backend/src/db/schema.ts` (`playerGameState`), e correr
`npm run backend:db:generate` para confirmar zero drift.

**Contrato (`gamestate/routes.ts`):**

- `GET /api/v1/me/state` — `preHandler: app.requireAuth`.
  - Resposta `200 { state: unknown | null, updatedAt: string | null }`.
  - `state` é o objeto guardado tal e qual (o cliente valida). `null` quando não há linha.
- `PUT /api/v1/me/state` — `preHandler: app.requireAuth`, protegido por CSRF (é
  mutação sob `/api/v1/`, não isento).
  - Body: `{ state: { schemaVersion: 1, player: <PlayerState> } }` — o **envelope**
    completo, validado com o `saveSchema` de `src/game/persistence.ts` (não só o
    `playerSchema`). Exportar `saveSchema` de `src/game/persistence.ts` e importá-lo
    no backend (o backend já importa domínio de `src/game/*`). Se a importação for
    problemática (ciclo de imports, `@ts-nocheck` transitivo, etc.), replicar em
    `backend/src/gamestate/schema.ts` com um teste que garante paridade de chaves
    contra `PlayerState` de `src/game/types.ts`.
  - `bodyLimit` do route: `2 * 1024 * 1024` (como as rotas de migração).
  - Upsert por `user_id` (`INSERT ... ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`).
  - Resposta `204`, sem corpo.
  - Body inválido → o handler central devolve `400 VALIDATION_ERROR` (já existe).
- Sem `Idempotency-Key`: é last-write-wins, não concede valor.

**`app.ts`:** `const gameStateService = database ? createPgGameStateService(database) : createMemoryGameStateService();` + `registerGameStateRoutes(app, gameStateService)`.

**`http/errors.ts`:** sem alterações (nenhum código novo).

### Componente B — Frontend: cliente + hidratação

**`src/api/endpoints.ts`:**

```ts
export function getGameState(): Promise<{ state: unknown; updatedAt: string | null }> {
  return apiFetch('/me/state');
}
export function putGameState(state: unknown): Promise<void> {
  return apiFetch('/me/state', { method: 'PUT', body: { state } });
}
```

**`src/api/types.ts`:** `GameStateEnvelope = { state: unknown; updatedAt: string | null }`
(o `state` fica `unknown` — a validação forte é o Zod da persistência).

**`src/game/auth/hydrate.ts` — reescrito:**

```ts
type HydrateResult = { kind: 'loaded' | 'empty' | 'error' };

export async function hydrateFromServer(
  replace: (updater: (prev: PlayerState) => Partial<PlayerState>) => void,
): Promise<HydrateResult> {
  let envelope: unknown;
  try {
    ({ state: envelope } = await getGameState());
  } catch {
    return { kind: 'error' };            // GET falhou → o chamador entra em só-leitura
  }
  if (envelope == null) return { kind: 'empty' };
  const parsed = saveSchema.safeParse(envelope);   // saveSchema exportado da persistência
  if (!parsed.success) {
    console.warn('game state blob failed validation; treating as empty');
    return { kind: 'empty' };            // blob corrupto/mais novo → re-adota
  }
  replace(() => parsed.data.player);     // REPLACE total, não merge
  return { kind: 'loaded' };
}
```

- `hydrateFromServer` faz o seu próprio try/catch e devolve `'error'` — o `afterAuth`
  não precisa de `.catch`.
- Deixa de usar `Math.max` / união — no 10.1 a hidratação era um merge defensivo
  porque `/me` vinha a zeros; agora o blob é autoritativo (replace).

**`src/pages/Index.tsx` — `afterAuth`:**

`IndexInner` já tem `player` e `replaceFromServer` de `useGameState()`. `afterAuth`
fecha sobre eles:

```ts
const afterAuth = async () => {
  const res = await hydrateFromServer(replaceFromServer);
  if (res.kind === 'loaded' || res.kind === 'empty') setSyncEnabled(true);
  else setSyncEnabled(false);                       // 'error' → só-leitura esta sessão

  if (res.kind === 'empty') {
    // 1º login sem estado no servidor → adota o que o browser tem agora
    await putGameState({ schemaVersion: SAVE_SCHEMA_VERSION, player }).catch(() => {});
  }
};
```

- O adopt no `empty` é **incondicional** (default ou não — o estado da conta passa a
  ser "o que o browser tinha no 1º login").
- `SAVE_SCHEMA_VERSION` e o `player` object vêm de `@/game/persistence` /
  `useGameState`. `putGameState` recebe o envelope como objeto (não string).
- `maybeOfferImport`, `<ImportSaveDialog>`, `confirmImport`, `importPreview` **saem**
  do `IndexInner`. Os ficheiros `importFlow.ts` / `ImportSaveDialog.tsx` e as rotas
  `/api/v1/migration/local/*` ficam no repo **sem uso no fluxo logado** (nota de
  deprecação; o 10.2 decide se remove).

### Componente C — Sincronização (`src/game/auth/gameStateSync.ts`)

Um hook `useGameStateSync({ player, enabled }): { flushNow: () => Promise<void> }`
usado no `IndexInner`. O "estado a gravar" é sempre o envelope
`{ schemaVersion: SAVE_SCHEMA_VERSION, player }`.

- **Debounce:** `useEffect` em `[player, enabled]`; se `!enabled` não faz nada; senão
  agenda `putGameState({ schemaVersion: SAVE_SCHEMA_VERSION, player })` para ~4 s
  depois da última mudança (limpa o timer anterior a cada mudança).
- **Flush ao fechar:** listener de `pagehide` e `visibilitychange` (quando
  `document.visibilityState === 'hidden'`); envia já, com
  `fetch('/api/v1/me/state', { method:'PUT', keepalive:true, credentials:'same-origin', headers:{ 'Content-Type':'application/json', 'X-CSRF-Token': <cookie> }, body: JSON.stringify({ state }) })`.
  (Não usar `navigator.sendBeacon` — não deixa pôr o header CSRF.)
- **Flush no logout:** o hook expõe `flushNow()`; o `AuthProvider` chama
  `onBeforeLogout` (novo, awaited) antes de `endpoints.logout()`, e o `IndexInner`
  liga `onBeforeLogout` a `flushNow()`.
- Não corre quando `status !== 'authenticated'` (o `enabled` cobre isto).
- Erros de `PUT` são engolidos; a próxima mudança volta a tentar. Um 401 é tratado
  pelo `apiFetch` (refresh→retry); se o refresh falhar, `loggedOut` → `enabled`
  passa a `false`.

### Componente D — `AuthProvider` (`onBeforeLogout`)

- Nova prop opcional `onBeforeLogout?: () => void | Promise<void>`, guardada em ref.
- Em `logout()`: `await onBeforeLogoutRef.current?.()` **antes** de
  `await endpoints.logout()`. Se lançar, ignora-se (best-effort) e segue-se o logout.
- `onLoggedOut` (já existe) continua a disparar no fim, só no logout explícito.
- Expiração de sessão (`setLoggedOutHandler`) **não** dispara nem `onBeforeLogout`
  nem `onLoggedOut`.

## Fluxo de dados

| Momento | Ação |
|---|---|
| `afterAuth` (login/register OU restauro no mount) | `GET /me/state` → `loaded` (replace) \| `empty` (adota local, `PUT`) \| `error` (só-leitura) |
| a jogar (autenticado, `enabled`) | cada mudança de `player` → `PUT` debounced 4 s |
| `pagehide` / aba oculta | `PUT` imediato (`keepalive`) |
| clique em "Sair" | `onBeforeLogout` → `flushNow()` (`PUT`) → `endpoints.logout()` → limpa cookies → `onLoggedOut` → `resetProgress()` |
| expiração de sessão | `loggedOut` → `enabled=false`, jogo local intacto (pode voltar a entrar) |
| próximo login | `GET /me/state` devolve o estado gravado → `loaded` |

## Casos de erro

- **`GET /me/state` falha** (rede / 5xx): `afterAuth` → `error` → `enabled=false`
  (nenhum `PUT` esta sessão). O utilizador recarrega para tentar de novo. Evita
  sobrescrever um estado real que só falhou a carregar.
- **Blob não valida** (corrupto, ou de um cliente mais novo): `hydrateFromServer`
  trata como `empty`; a adoção subsequente sobrescreve com o estado local válido.
  Registar `console.warn`.
- **`PUT` falha:** engolido; retenta na próxima mudança/flush.
- **`PUT` 401 → refresh falha:** `apiFetch` chama `loggedOut` → `enabled=false`.
- **Fechar a aba durante um `PUT` normal em curso:** o `keepalive` do flush de
  `pagehide` garante o último estado; um `PUT` debounced a meio pode ser cortado,
  sem problema (o `pagehide` manda o estado final).

## Testes

**Backend:**
- `backend/src/gamestate/routes.test.ts` (memória, corre em `npm test`):
  `GET` → `{ state: null }` quando não há; `PUT` válido → `204`; `GET` a seguir
  devolve o mesmo objeto; `PUT` com shape inválido → `400 VALIDATION_ERROR`;
  `GET`/`PUT` sem cookie → `401`; `PUT` sem `X-CSRF-Token` (com cookie) → `403`.
- `backend/src/gamestate/pgRepository.integration.test.ts`: upsert real, `ON DELETE
  CASCADE` ao apagar o user, `updated_at` muda no 2º `PUT`.
- Se o schema for replicado: `backend/src/gamestate/schema.test.ts` — paridade de
  chaves entre o schema do backend e `PlayerState`.

**Frontend:**
- `src/api/endpoints.test.ts`: `getGameState` → `GET /me/state`; `putGameState` →
  `PUT /me/state` com `{ state }`.
- `src/game/auth/hydrate.test.ts` (reescrito): `state` não-nulo válido → `replace`
  chamado com o estado, devolve `loaded`; `state: null` → `empty`, `replace` não
  chamado; `state` inválido → `empty`.
- `src/game/auth/gameStateSync.test.ts` (novo, fake timers): mudança de `player` →
  `PUT` após o debounce; mudanças seguidas → só um `PUT`; `enabled: false` → zero
  `PUT`; `pagehide` → `PUT` imediato com `keepalive: true`; `flushNow()` → `PUT` já.
- `src/game/auth/AuthProvider.test.tsx` (+): `logout()` chama `onBeforeLogout`
  (awaited) **antes** de `endpoints.logout()`; ordem verificada; expiração de sessão
  não chama `onBeforeLogout`.

**Verificação manual (utilizador, no Docker):** login → pescar → logout → login de
novo → o peixe está lá. Fechar a aba a meio de uma sessão → reabrir/login → progresso
até ao fecho preservado.

## Ficheiros

**Backend:**
- `backend/migrations/0015_player_game_state.sql` (novo)
- `backend/src/db/schema.ts` (+`playerGameState`)
- `backend/src/gamestate/{routes,service,pgRepository}.ts` (novos) + testes
- `backend/src/app.ts` (liga as rotas)
- `src/game/persistence.ts` (extrair `playerStateSchema` para export — ou schema
  replicado no backend)

**Frontend:**
- `src/api/endpoints.ts` (+2 funções), `src/api/types.ts` (+`GameStateEnvelope`)
- `src/game/auth/hydrate.ts` (reescrito), `src/game/auth/hydrate.test.ts` (reescrito)
- `src/game/auth/gameStateSync.ts` (novo) + `.test.ts`
- `src/game/auth/AuthProvider.tsx` (+`onBeforeLogout`) + `.test.tsx`
- `src/pages/Index.tsx` (afterAuth reescrito, sync montado, import dialog removido do fluxo)
- `src/game/auth/importFlow.ts` / `src/components/game/menu/ImportSaveDialog.tsx` —
  sem uso no fluxo logado (nota de deprecação; não removidos)

## Riscos

| Risco | Mitigação |
|---|---|
| Reutilizar o Zod da persistência no backend cria ciclo de imports / puxa `@ts-nocheck` | Fallback: schema replicado em `backend/src/gamestate/schema.ts` + teste de paridade de chaves |
| `PUT` a cada 4 s gera muitos pedidos numa sessão longa | Debounce só dispara após a última mudança; uma sessão de pesca real muda o estado a cada captura, não continuamente |
| `keepalive: true` tem limite de 64 KB por request nalguns browsers | O `PlayerState` serializado típico é pequeno; se exceder, o `pagehide` cai para um `PUT` normal best-effort |
| Último-a-gravar-ganha faz perder progresso multi-dispositivo | Aceite para o 10.1; o 10.2 completo traz guarda de versão |
| Blob de um cliente mais novo abre num cliente mais antigo | `parseSavedState` já ignora campos desconhecidos e valida os conhecidos; pior caso cai para `empty` e re-adota |
| `GET /me/state` falha silenciosamente e o utilizador joga em "só-leitura" sem saber | 10.1: aceitável (recarrega). Melhoria futura: um toast "sem ligação — progresso não está a ser guardado" |
