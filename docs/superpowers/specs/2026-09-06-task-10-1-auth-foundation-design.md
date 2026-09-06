# Task 10.1 — Auth foundation (httpOnly cookies + `/api` proxy + client auth)

Data: 2026-09-06 · Branch alvo: `feature/task-10-1-auth-foundation` (parte de `main`)

Primeiro sub-projeto da Task 10 (frontend como cliente da API). Estabelece a
autenticação real por cookie httpOnly, o proxy `/api` same-origin, e a camada de
cliente + contexto de auth no frontend. **Não** move o estado de jogo para o
servidor — isso é 10.2+.

## Contexto

- Backend pronto e validado (B1–B4 e S1–S10 tratados nas Tasks 6/7/M8; CI com job de
  integração contra Postgres real).
- Auth atual do backend: `POST /api/v1/auth/{register,login}` devolvem
  `{ accessToken, refreshToken, user }` no **corpo**; `refresh` recebe o refresh
  token no corpo; `logout` (com `preHandler: requireAuth`) revoga a sessão. Família
  de refresh tokens + reuse detection já existem.
- `auth/middleware.ts` `createRequireAuth` → `preHandler` que lê `Authorization:
  Bearer`, valida, popula `request.userId` e `request.sessionId`.
- Frontend: SPA puro. `useGameState` + localStorage. `src/components/game/menu/
  account.ts` e `src/game/leaderboard.ts` são stubs de localStorage. Zero `fetch`,
  zero `VITE_*` usados no browser. `AccountModal` (Task 8) tem 3 passos:
  `credentials` (email/password/**birthdate**) → `username` (username + país por
  emoji) → `login` (por **username**, contra o fake leaderboard).
- Topologia: SPA em `:8080` (nginx `docker/nginx.conf`, sem bloco `/api`), backend em
  `:8090`. `compose.yaml` passa `VITE_API_BASE_URL: http://localhost:8090` ao
  frontend. **Origens diferentes hoje.**

## Decisões (alinhadas com o utilizador)

1. **Cookies httpOnly** para os tokens (não corpo, não localStorage).
2. **Proxy `/api`** (nginx em prod, Vite em dev) → browser chama `/api/v1/...`
   relativo, same-origin. Sem CORS no caminho do browser.
3. **Jogo anónimo local continua a funcionar.** Login "anexa" a conta do servidor.
4. **1º login**: oferecer importar o save local via `/migration/local/import`
   (uma vez). Depois disso o servidor é autoridade.
5. Progresso da conta é carregado do servidor no login (hidratação one-shot no
   10.1; contínuo no 10.2).

## Arquitetura

```
Browser
  └─ SPA (mesma origem)
       ├─ /assets/*          → nginx estático / Vite
       ├─ /api/v1/*          → proxy → backend:8090   (cookies first-party)
       └─ resto              → index.html (SPA fallback)

apiFetch() ──cookies (dbl_at)──▶ requireAuth ──▶ rota
   │                                              │
   └─ 401 ──▶ POST /api/v1/auth/refresh (dbl_rt) ─┘ (1× retry)
```

### Componente A — Backend: auth por cookie

**Dependência nova:** `@fastify/cookie` (^11, compatível com Fastify 5).

**`config/env.ts`** — novos campos validados por Zod:
- `COOKIE_SECURE: boolean` (default `true`; `.env.docker` = `false`)
- `COOKIE_DOMAIN: string | undefined` (default undefined → host-only)

**`app.ts`** — `await app.register(cookiePlugin)` antes das rotas.

**Nomes e atributos dos cookies:**

| Cookie | Conteúdo | Atributos |
|---|---|---|
| `dbl_at` | access token (JWT) | `HttpOnly; Secure=COOKIE_SECURE; SameSite=Lax; Path=/api; Max-Age=ACCESS_TOKEN_TTL_SECONDS` |
| `dbl_rt` | refresh token | `HttpOnly; Secure=COOKIE_SECURE; SameSite=Strict; Path=/api/v1/auth; Max-Age=REFRESH_TOKEN_TTL_SECONDS` |
| `dbl_csrf` | random 32 bytes base64url | `Secure=COOKIE_SECURE; SameSite=Lax; Path=/api` (**não** HttpOnly — o JS lê-o) |

**`auth/routes.ts`:**
- `register` / `login` → em sucesso: `reply.setCookie` para os 3 cookies; corpo
  passa a `{ user }` (sem tokens). Resposta 201/200.
- `refresh` → lê `request.cookies.dbl_rt` (ignora o corpo; `refreshSchema` sai do
  `body`). Rotaciona. Re-emite `dbl_at` + `dbl_rt` + `dbl_csrf`. Resposta **204**,
  sem corpo.
- `logout` → `reply.clearCookie` para os 3 + `service.logout(sessionId)` (já existe).
  204.
- Erros de auth continuam a devolver `INVALID_CREDENTIALS` / `INVALID_REFRESH_TOKEN`
  genéricos, sem cookies novos.

**`auth/middleware.ts` `createRequireAuth`:**
- Ler o token nesta ordem: `request.cookies.dbl_at` → senão `Authorization: Bearer`
  (fallback para testes/ferramentas). Resto igual (`verifyAccessToken` → `userId` +
  `sessionId`).

**`security/http.ts` — CSRF (double-submit):**
- Novo `onRequest`/`preHandler` global: para métodos `POST|PUT|PATCH|DELETE` em
  `/api/v1/*` **exceto** `/api/v1/auth/login` e `/api/v1/auth/register` (ainda não
  existe cookie `dbl_csrf`, logo o double-submit não se aplica; um pedido forjado
  aqui só cria/usa credenciais que o atacante já conhece, sem dano para a vítima):
  - exigir header `X-CSRF-Token` === cookie `dbl_csrf`; senão `403 CSRF_FAILED`.
- `refresh` e `logout` **são** protegidos (já há `dbl_csrf` após login).
- Mapear `CSRF_FAILED` em `http/errors.ts` → 403.

**CORS (`security/http.ts`):** com o proxy, o browser é same-origin. Manter o
mecanismo para clientes diretos, mas o default continua a negar (S4 já corrigido).
Sem `Access-Control-Allow-Credentials` (não é preciso).

**Testes de integração (o trabalho grosso):**
- `testing/pgHarness.ts` (ou um novo `testing/authClient.ts`): helper
  `authedAgent()` que faz `login`, guarda os `set-cookie` (`dbl_at`, `dbl_rt`,
  `dbl_csrf`), e devolve um `request(method, path, { body, idempotencyKey })` que
  reenvia `Cookie:` + `X-CSRF-Token:` nas mutações.
- Migrar os ~39 testes de integração + `app.test.ts` (que hoje fazem
  `const { accessToken } = login(...)` e mandam `Authorization: Bearer`). Manter
  1–2 testes explícitos do caminho `Bearer` (o fallback).
- Testes novos: cookies emitidos no register/login (atributos), `refresh` via
  cookie, `logout` limpa, `X-CSRF-Token` ausente/errado → 403, `Bearer` fallback.

### Componente B — Proxy `/api`

**`vite.config.ts`:**
```ts
server: {
  // ... host/port existentes
  proxy: {
    '/api': {
      target: process.env.VITE_API_BASE_URL || 'http://localhost:8090',
      changeOrigin: true,
    },
  },
}
```

**`docker/nginx.conf`** — antes do `location /`:
```nginx
location /api/ {
  proxy_pass http://backend:8090;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```
(O `nginx.conf` de prod serve o build estático; o `Dockerfile` target `runtime` é
nginx. O target `dev` corre Vite — usa o proxy do Vite. `compose.yaml` frontend usa
`target: dev`.)

**`compose.yaml`:** `VITE_API_BASE_URL` do frontend passa a `http://backend:8090`
(nome do serviço, já que o proxy do Vite corre dentro do container). `backend`
`trustProxy` deve honrar o `X-Forwarded-*` do nginx/Vite (A2 já configurou
`trustProxy` — confirmar que aceita o proxy local).

**Backend CSP:** a API já manda `default-src 'none'`. O SPA é servido pelo nginx com
a sua própria resposta — sem CSP hoje. Fora de âmbito do 10.1 (nota para 10.5).

### Componente C — Frontend: cliente API (`src/api/`)

**`src/api/client.ts`:**
```ts
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function csrfToken(): string | null { /* lê cookie dbl_csrf */ }

let refreshing: Promise<void> | null = null;

export async function apiFetch<T>(path: string, opts: {
  method?: string; body?: unknown; idempotencyKey?: string; _retry?: boolean;
} = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET' && method !== 'HEAD') {
    const t = csrfToken(); if (t) headers['X-CSRF-Token'] = t;
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`/api/v1${path}`, {
    method, headers, credentials: 'same-origin',
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (res.status === 401 && !opts._retry && !path.startsWith('/auth/')) {
    await (refreshing ??= doRefresh().finally(() => { refreshing = null; }));
    return apiFetch<T>(path, { ...opts, _retry: true });
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new ApiError(res.status, e.code ?? 'UNKNOWN', e.message ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
```
- `doRefresh()` → `POST /auth/refresh`; se falhar (401/403) → `emitLoggedOut()`
  (evento/callback que o `AuthProvider` ouve) e re-lança.
- Sem base URL configurável no browser — sempre `/api/v1` relativo.

**`src/api/endpoints.ts`** (só o 10.1):
```ts
register(input: RegisterInput): Promise<{ user: ApiUser }>
login(input: { email: string; password: string }): Promise<{ user: ApiUser }>
logout(): Promise<void>
getMe(): Promise<{ user: PlayerProfile }>
previewMigration(save: unknown): Promise<MigrationPreview>
importMigration(save: unknown, idempotencyKey: string): Promise<MigrationResult>
```
Tipos (`src/api/types.ts`) escritos à mão a espelhar as schemas Zod do backend:
`ApiUser = { id, email, username, country }`,
`PlayerProfile = { userId, email, username, country, level, xp, totalFishCaught, coins, unlockedLocations }`,
`MigrationPreview = { sourceVersion, summary: { accepted, rejected }, rejected: unknown[] }`,
`MigrationResult = { imported: boolean, sourceVersion, summary }`.
(Geração a partir do `/openapi.json` fica para 10.5.)

### Componente D — Frontend: `AuthContext` + UI

**`src/game/auth/AuthProvider.tsx`:**
```ts
type AuthStatus = 'loading' | 'anonymous' | 'authenticated';
useAuth(): {
  status: AuthStatus;
  user: ApiUser | null;
  login(email, password): Promise<void>;      // throws ApiError
  register(input): Promise<void>;
  logout(): Promise<void>;
}
```
- No mount: `getMe()` → 200 = `authenticated` + `user`; `ApiError 401` = `anonymous`.
- Ouve o evento `loggedOut` do `client.ts` → volta a `anonymous`, limpa `user`.
- `register`/`login` → em sucesso, guarda `user`, status `authenticated`, e dispara
  a **hidratação** (Componente E) + o **fluxo de importação** (abaixo).
- `logout` → `endpoints.logout()`, status `anonymous`, `user = null`. (Não apaga o
  save local — o jogo anónimo continua.)
- Montado em `Index.tsx` à volta do `I18nProvider`/`IndexInner`.

**`AccountModal` (`src/components/game/menu/AccountModal.tsx`) — religar:**
- Passos reduzidos a **2**: `signup` (email, password, username, country) e `login`
  (email, password). O passo `username` separado desaparece. **`birthdate` sai** —
  o backend não modela idade nem tem age gate; se for preciso um, é uma mudança de
  backend própria (campo + validação no `registerSchema`).
- País: o grid de bandeiras emoji → mapa `emoji → ISO-2` (`account.ts`), envia ISO-2.
- `signup` → `useAuth().register({ email, password, username, country })`.
- `login` → `useAuth().login(email, password)`.
- Erros `ApiError` → mensagens i18n por `code` (`INVALID_CREDENTIALS`,
  `EMAIL_TAKEN`, `USERNAME_TAKEN`, `VALIDATION_ERROR`, `CSRF_FAILED`, rede).
- Autenticado: o modal mostra `user.username` + país + botão **Sair** (`logout`).
- `account.ts` `loadAccount`/`saveAccount` (localStorage) → **removidos**; o
  `MainMenu` passa a ler `useAuth().user` para o chip de conta.
- `TUTORIAL_KEY` (banner de tutorial no modal) fica — não é auth.

**Fluxo de importação (1º login):**
- Após `register` (ou `login` bem-sucedido), se `localStorage['fishing-game-state']`
  existe **e** ainda não foi importado (`localStorage['dbl-import-done'] !== '1'`):
  - `previewMigration(save)` → mini-diálogo: "Importar o teu progresso local?
    Nível {n}, {coins} moedas, {accepted} peixes." + [Importar] / [Agora não]
  - [Importar] → `importMigration(save, crypto.randomUUID())` → em sucesso marca
    `dbl-import-done = '1'` e re-hidrata.
  - [Agora não] → não marca; volta a oferecer no próximo login.
- `LOCAL_SAVE_BODY_LIMIT` = 2 MB no backend; o save típico é pequeno.

### Componente E — Hidratação no login

**`src/game/auth/hydrate.ts`:** `hydrateFromServer()` → `getMe()` → constrói um
`Partial<PlayerState>` (`level`, `xp`, `coins`, `totalFishCaught`,
`unlockedLocations`; `xpToNextLevel` derivado de `getXpForLevel(level)`) e chama um
novo `useGameState().replaceFromServer(partial)` que faz merge com o estado atual.
Campos que o `/me` não traz (skins, aquário, armazém, multiplicadores ativos,
redes, coleção) ficam do local/default — **10.2** trata do armazém/inventário.
- Chamado pelo `AuthProvider` após auth e após import.
- **One-shot.** Sem polling nem write-back no 10.1.

`useGameState.ts` ganha `replaceFromServer(partial: Partial<PlayerState>)` que
funde e persiste (o localStorage continua a ser o armazenamento vivo do jogo no
10.1).

## O que NÃO muda no 10.1

- `useGameState` continua localStorage-driven durante o jogo (pesca, compras, venda
  escrevem local). 10.2+ move isto.
- `leaderboard.ts` continua o fake local. 10.5 troca.
- Nenhuma rota de economia/pesca/inventário é chamada em runtime (só no
  `hydrate`/`import`).
- Componentes 3D, regras de jogo, i18n existente.

## Ficheiros

**Backend:**
- `package.json` (+`@fastify/cookie`), `backend/src/config/env.ts`, `app.ts`,
  `auth/routes.ts`, `auth/middleware.ts`, `auth/schemas.ts`, `security/http.ts`,
  `http/errors.ts`
- `testing/authClient.ts` (novo), + migração de `*.integration.test.ts` e
  `app.test.ts`
- `.env.docker`, `.env.docker.example`, `.env.example` (+`COOKIE_SECURE`,
  `COOKIE_DOMAIN`)

**Proxy:**
- `vite.config.ts`, `docker/nginx.conf`, `compose.yaml`

**Frontend:**
- `src/api/{client,endpoints,types}.ts` (novos)
- `src/game/auth/{AuthProvider,hydrate}.tsx` (novos)
- `src/game/useGameState.ts` (+`replaceFromServer`)
- `src/pages/Index.tsx` (montar `AuthProvider`)
- `src/components/game/menu/{AccountModal,account}.tsx` (religar, `account.ts`
  passa a só ter `emoji↔ISO-2` + `COUNTRIES` + `TUTORIAL_KEY`)
- `src/components/game/MainMenu.tsx` (chip de conta via `useAuth`)
- `src/game/i18n.tsx` (+chaves de erro de auth / import, 6 idiomas)
- `src/test/` — `AuthProvider.test.tsx`, `apiClient.test.tsx` (mock `fetch`),
  `AccountModal.test.tsx` (reescrito), migração da `MainMenu.test.tsx`

## Testes / verificação

- `npm run backend:typecheck` · `npx tsc --noEmit -p tsconfig.app.json`
- `npm test` (frontend + backend memória) — novos testes de `AuthProvider`,
  `apiFetch` (mock fetch: 401→refresh→retry, CSRF header, erro tipado),
  `AccountModal` reescrito
- `npm run test:integration` — com o `authClient` helper; cookies, CSRF, refresh,
  logout, Bearer fallback
- `npm run build`
- **Smoke no container**: `docker compose up --build` → registar, ver `Set-Cookie`
  (DevTools), recarregar (sessão persiste), `refresh` automático após 15 min (ou
  forçar), importar save local, `logout` limpa cookies, jogar anónimo depois.
- **Teste manual do utilizador**: fluxo completo no browser.

## Riscos

| Risco | Mitigação |
|---|---|
| Migração dos 39 testes de integração (churn grande) | helper `authClient` primeiro, com 2 testes a validá-lo; depois migração mecânica |
| CSRF mal configurado bloqueia todas as mutações | testar o middleware isoladamente antes; allowlist explícita (`login`/`register` fora) |
| `AccountModal` muda de contrato (username→email no login) | testes reescritos primeiro (TDD); a UI da Task 8 é recente e pequena |
| Cookies não chegam por causa de `Path`/`SameSite` | `dbl_rt` com `Path=/api/v1/auth` (não `/refresh` — o `refresh` e um futuro `logout`/rotate precisam); smoke no container cedo |
| `trustProxy` do backend não aceita o proxy Vite/nginx local | confirmar a config da A2; `X-Forwarded-For` do proxy local tem de ser honrado |
| Vite proxy em container (`target: http://backend:8090`) vs host (`localhost:8090`) | `VITE_API_BASE_URL` cobre ambos; documentar |

## Fora de âmbito (sub-projetos seguintes)

- 10.2 — leitura contínua (`/me`, `/wallet`, `/catalog`, `/leaderboard`,
  `/inventory/*` como fonte de verdade; sync periódico)
- 10.3 — escrita de economia (compras, venda, recompensa diária via API)
- 10.4 — escrita de pesca (sessões start/complete, servidor sorteia)
- 10.5 — aquário, temporadas, ranking real; geração de tipos do OpenAPI; CSP no SPA
