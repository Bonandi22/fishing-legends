# Segurança da conta — confirmação de e-mail, 2 etapas e envio de e-mails

Data: 2026-11-11 · Bloco 1 de 3 (1: segurança da conta → 2: antifraude → 3: Fase 12 campeonatos)

## Intenção e porquê

Cada conta tem de pertencer a uma pessoa real que controla o e-mail associado. Hoje
qualquer pessoa cria uma conta com um e-mail falso ou alheio e entra só com a
palavra-passe. Isto é a base do bloco 2 (antifraude): quando uma conta for suspensa
para auditoria, a decisão final é comunicada **por e-mail** — o que só faz sentido se
o e-mail estiver confirmado. Também fecha a porta a roubo de conta só com a
palavra-passe.

Decidido pelo utilizador:

- Confirmação de e-mail **obrigatória** na criação da conta; **até confirmar, a conta
  fica bloqueada** (não joga com a conta, não aparece no ranking).
- Verificação em 2 etapas **obrigatória para todos os jogadores**, por código enviado
  por e-mail.
- O código de 2 etapas é pedido **sempre que o refresh token expira e a sessão cai**
  (i.e. em cada login com palavra-passe). Enquanto o refresh token for válido, não volta
  a ser pedido.
- Envio de e-mails assíncrono via **RabbitMQ** (escolha explícita do utilizador, a pensar
  em fiabilidade e escala).

## Objetivos

1. Infraestrutura de envio de e-mails fiável (não perde e-mails), reutilizável pelo bloco 2.
2. Confirmação de e-mail na criação de conta, com bloqueio até confirmar.
3. 2 etapas por código de e-mail em cada login com palavra-passe.
4. Recuperação de palavra-passe por e-mail ("esqueci-me da palavra-passe").
5. Contas existentes migram sem fricção extra.

## Não-objetivos

- Apps autenticadoras (TOTP), SMS, passkeys/WebAuthn.
- Mudar de e-mail, apagar conta, página de "dispositivos ligados".
- Mexer no modelo de cookies/refresh tokens (rotação, deteção de reutilização, família) —
  o `CLAUDE.md` exige alinhamento prévio para isso. O refresh continua exatamente igual.
- Suspensão/auditoria de contas e o e-mail da decisão — bloco 2 (este bloco só deixa o
  envio pronto a usar).
- Modo anónimo: continua a funcionar como hoje (guardado no browser, fora do ranking).

## Anti-objetivos (falha mesmo que "funcione")

- **Um jogador honesto ficar trancado fora da conta** — e-mail que não chega, código que
  expira antes de chegar, sem forma de pedir outro. O reenvio tem de existir e ser claro.
- **Enumeração de contas** — nenhuma resposta pode revelar se um e-mail está registado
  (registo, login, recuperação).
- **Códigos ou tokens em logs** fora do ambiente de desenvolvimento.
- Perder e-mails silenciosamente (pedido gravado mas nunca enviado, sem rasto).

## Restrições do projeto (do `CLAUDE.md`)

- Backend Fastify + PostgreSQL; módulo com `routes.ts` fino, implementação em memória e
  em PostgreSQL com **o mesmo comportamento observável**; `app.ts` escolhe por
  `DATABASE_URL`.
- Migração SQL escrita à mão (`backend/migrations/0023_*.sql`), refletida em
  `db/schema.ts`, sem drift no `backend:db:generate`.
- Zod em todo body/query/param. Erros com código estável `SNAKE_CASE` mapeado em
  `backend/src/http/errors.ts`; nunca vazar detalhe interno.
- Secrets só em variáveis de ambiente.
- Frontend com i18n em 6 línguas (`pt en es fr de ja`).
- Gate: typecheck ×2, lint, `npm test`, build, `test:integration` contra PostgreSQL real,
  e smoke no browser no stack Docker.

## Estado atual (relevante)

- Rotas: `POST /api/v1/auth/{register,login,refresh,logout}`.
- `users(id, email, password_hash, status ∈ {active, suspended, deleted}, …)`; sem campo
  de verificação.
- `sessions` + `refresh_tokens` (migração `0013`), refresh TTL 30 dias
  (`REFRESH_TOKEN_TTL_SECONDS`), access 15 min.
- Cookies httpOnly + CSRF; `AuthProvider` no frontend; UI de conta em
  `src/components/game/menu/AccountModal.tsx`.
- Bucket de rate limit dedicado para `/auth/{login,register}` (`AUTH_RATE_LIMIT_*`).
- O ranking (`backend/src/leaderboard/rank.ts`) lista jogadores a partir do blob de
  `player_game_state`.
- Nenhum envio de e-mail existe hoje.

## Desenho

### 1. Envio de e-mails: outbox → RabbitMQ → worker

A garantia "não perde e-mails" vem da outbox; o RabbitMQ dá entrega assíncrona, retries
e escala.

1. Quem precisa de enviar um e-mail grava uma linha em `email_outbox` **na mesma
   transação** que a mudança de estado que o originou (ex.: criação do desafio de código).
2. Um *relay* lê linhas pendentes (`FOR UPDATE SKIP LOCKED`), publica no RabbitMQ com
   *publisher confirms* e mensagens persistentes, e marca-as como publicadas. Com o
   RabbitMQ em baixo, as linhas ficam pendentes e são publicadas quando voltar.
3. Um serviço **`email-worker`** (mesma imagem do backend, outro *entrypoint*) consome a
   fila, renderiza o template na língua do jogador e envia por **SMTP**. Falha temporária →
   nova tentativa com espera crescente; tentativas esgotadas → fila de *dead letter* e a
   linha da outbox marcada `failed` com o último erro (sem dados sensíveis).
4. A mensagem leva o `id` da outbox, para o worker poder deduplicar.
5. **Códigos já expirados não são enviados** (*escolha minha*): se, ao chegar a vez de
   enviar, o desafio do código já expirou (fila muito atrasada), o worker envia antes um
   e-mail curto "o teu código expirou, pede um novo na app" — o jogador nunca recebe um
   código morto sem explicação.

Fornecedor: **SMTP** como única interface de envio (*escolha minha*). Em desenvolvimento,
**Mailpit** no `compose.yaml` apanha todos os e-mails e mostra-os numa página local; em
produção, qualquer serviço transacional que aceite SMTP (ex.: Resend, Amazon SES),
configurado só por variáveis de ambiente — trocar de fornecedor não mexe no código.

Docker: `compose.yaml` ganha `rabbitmq` (imagem com consola de gestão), `mailpit` e
`email-worker`; `docker-compose.prod.yaml` ganha `rabbitmq` (volume persistente, sem porta
exposta ao host) e `email-worker`. CI: o job `integration` ganha `services: rabbitmq`.

Modo sem `DATABASE_URL` (memória, testes unitários): sem RabbitMQ; um *mailer* em memória
regista os e-mails "enviados" para os testes poderem ler o código.

### 2. Desafios por código (um mecanismo para os três fluxos)

Tabela `auth_challenges`: `id`, `user_id`, `purpose ∈ {verify_email, login, password_reset}`,
`code_hash`, `expires_at`, `attempts`, `consumed_at`, `created_at`.

Regras (valores são *escolha minha*, ajustáveis por variável de ambiente):

- Código de **6 dígitos**, gerado com `crypto.randomInt`, guardado só como HMAC-SHA256
  com um secret do servidor (`AUTH_CODE_SECRET`).
- Expira em **30 minutos** (decidido pelo utilizador: a validade conta a partir da
  criação, não da entrega — com a fila congestionada o e-mail pode chegar muitos minutos
  depois, e o jogador tem de ter tempo útil para o usar); **5 tentativas** por desafio,
  depois o desafio fica inválido.
- Um desafio novo do mesmo `purpose` para o mesmo utilizador invalida o anterior.
- **Reenvio**: no máximo 1 por minuto e um teto por hora por conta.
- O cliente refere-se ao desafio por `challengeId` (opaco); nunca envia o `user_id`.
- Comparação em tempo constante; um código só se consome uma vez.

### 3. Fluxos

**Registo**: `POST /auth/register` cria o utilizador com `email_verified_at = null`, cria um
desafio `verify_email`, grava o e-mail na outbox e responde `{ challengeId }` — **sem
sessão**. `POST /auth/verify-email { challengeId, code }` marca `email_verified_at` e só
então emite a sessão (cookies). Se o e-mail já estiver registado, a resposta tem a mesma
forma (um `challengeId` que nunca valida) e o dono do e-mail recebe um aviso de "alguém
tentou criar uma conta com este e-mail" em vez de um código.

**Login**: `POST /auth/login { email, password }`:
- palavra-passe errada → erro genérico como hoje;
- palavra-passe certa e e-mail confirmado → desafio `login`, e-mail com código, resposta
  `{ challengeId }`;
- palavra-passe certa e e-mail **não** confirmado → desafio `verify_email` (mesmo ecrã de
  código); ao confirmar, a conta fica verificada e entra.

`POST /auth/login/verify { challengeId, code }` emite a sessão.

**Refresh**: sem mudança. Enquanto o refresh token for válido, nenhum código é pedido.

**Reenvio**: `POST /auth/challenges/resend { challengeId }` cria um desafio novo do mesmo
tipo para o mesmo utilizador (respeitando os limites) e devolve o novo `challengeId`. Um
`challengeId` "falso" (do registo com e-mail repetido) responde da mesma forma.

**Recuperação de palavra-passe**: `POST /auth/password/forgot { email }` responde sempre
igual; se o e-mail existir, cria desafio `password_reset` e envia código.
`POST /auth/password/reset { challengeId, code, newPassword }` troca a palavra-passe,
**revoga todas as sessões** do utilizador e não inicia sessão (o jogador faz login, com
2 etapas). Concluir a recuperação também marca o e-mail como confirmado (o código provou-o).

**Bloqueio até confirmar**: um utilizador com `email_verified_at = null` nunca recebe
sessão, logo não chega a nenhuma rota autenticada, nunca cria `player_game_state` e por
isso nunca aparece no ranking. *Escolha minha*: o ranking passa a listar só utilizadores
que têm `player_game_state` (hoje uma conta sem estado aparece com valores por omissão,
nível 1) — isto exclui naturalmente as contas por confirmar sem esconder os jogadores
atuais.

**Contas por confirmar abandonadas** (*escolha minha*): uma conta criada depois desta
migração que nunca confirme o e-mail é apagada ao fim de **7 dias**, libertando o e-mail
e o nome de utilizador. Não tem dados de jogo, por isso nada se perde.

**E-mail "ocupado" por outra pessoa**: se alguém registou o teu e-mail e nunca confirmou,
o dono real recupera a conta por "esqueci-me da palavra-passe" (o código prova a posse do
e-mail e marca-o como confirmado) ou espera os 7 dias.

**Nome de utilizador repetido**: continua a dar erro explícito como hoje — os nomes são
públicos (aparecem no ranking), por isso não há enumeração a proteger aí.

### 4. Contas existentes

Ficam com `email_verified_at = null` após a migração e **continuam no ranking** (têm estado
de jogo). Sessões já abertas continuam válidas até o refresh expirar. No próximo login, a
palavra-passe certa leva ao fluxo de confirmação (código por e-mail); ao introduzir o
código, a conta fica verificada e entra — um único passo, igual ao 2 etapas normal.

### 4b. Política de palavra-passe (decidida pelo utilizador: abordagem NIST 800-63B)

Comprimento conta mais do que composição; **sem** regras de "maiúscula + número +
símbolo". Aplica-se no **registo** e na **recuperação** (`/auth/password/reset`):

- **12 a 128 caracteres** (como hoje).
- **Rejeitar palavras-passe comuns/vazadas** — lista embutida no código (*escolha minha*:
  uma lista offline das mais comuns, ~10 mil entradas, comparação sem distinguir
  maiúsculas; **sem** chamadas a serviços externos, para não enviar nada para fora nem
  depender da disponibilidade deles).
- **Rejeitar se contiver o e-mail (parte antes do `@`) ou o nome de utilizador**, sem
  distinguir maiúsculas.
- Na recuperação, **rejeitar a palavra-passe atual** (comparada contra o hash guardado).
- O servidor é a autoridade (Zod + verificação no serviço, erro `WEAK_PASSWORD` com um
  motivo estável: `TOO_SHORT`, `TOO_COMMON`, `CONTAINS_PERSONAL_INFO`, `SAME_AS_CURRENT`).
  O frontend replica as mesmas regras para dar feedback imediato e mostra uma **barra de
  força** enquanto se escreve (*escolha minha*: estimador de força no cliente, ex.
  `zxcvbn-ts`, só como ajuda visual — não bloqueia além das regras acima).
- As regras partilhadas (comprimento, lista, verificação de dados pessoais) vivem num
  módulo partilhado em `src/game/` importado pelos dois lados, como o resto do domínio.
- Contas existentes com palavras-passe fracas **não** são obrigadas a trocar (*escolha
  minha*); a regra aplica-se na próxima vez que definirem uma.

### 5. E-mails

Templates: código de confirmação, código de login, código de recuperação, aviso de
tentativa de registo com o e-mail. Texto simples + HTML mínimo, nas 6 línguas da app.
A língua vem do cliente (`locale` no body de registo, login e forgot, validado contra a
lista; default `en`) e fica guardada no utilizador (`users.locale`) para os e-mails
futuros, incluindo os do bloco 2.

### 6. Frontend

`AccountModal` ganha: ecrã de código (6 dígitos, botão "reenviar" com contagem
decrescente, mensagens de código errado/expirado/tentativas esgotadas) e "esqueci-me da
palavra-passe" (pedir código → código + nova palavra-passe). Registo e login passam a
terminar no ecrã de código. Textos nas 6 línguas. O `AuthProvider` só considera o jogador
autenticado depois do código aceite.

### 7. Erros novos (`http/errors.ts`)

`INVALID_CODE` (400), `CHALLENGE_EXPIRED` (410), `TOO_MANY_ATTEMPTS` (429),
`CHALLENGE_NOT_FOUND` (404), `RESEND_TOO_SOON` (429), `WEAK_PASSWORD` (400, com motivo).
Mensagens genéricas.

### 8. Rate limiting

Os novos endpoints de auth entram no bucket `AUTH_RATE_LIMIT_*`, além dos limites por
desafio/conta da secção 2. Um teto de e-mails por endereço por hora impede usar o jogo
para inundar a caixa de alguém.

## Variáveis de ambiente novas

`RABBITMQ_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`,
`EMAIL_FROM`, `AUTH_CODE_SECRET` (≥32 chars), `AUTH_CODE_TTL_SECONDS` (1800),
`AUTH_CODE_MAX_ATTEMPTS` (5), `AUTH_CODE_RESEND_COOLDOWN_SECONDS` (60). Validadas em
`config/env.ts`; exemplos em `.env.docker.example` e `.env.production.example`; runbook de
produção atualizado.

## Testes e verificação

- Unitários: geração/validação de códigos, expiração, tentativas, reenvio, respostas
  idênticas (sem enumeração), revogação de sessões no reset, ranking só com estado de jogo.
- Integração (PostgreSQL + RabbitMQ reais): outbox na mesma transação, relay publica,
  RabbitMQ em baixo não perde e-mails, worker consome e envia para um SMTP de teste.
- Smoke no browser (Docker): registar → ler o código no Mailpit → confirmar → jogar;
  logout → login → código → entrar; esqueci-me da palavra-passe; conta antiga confirma no
  primeiro login.

## Deixado ao construtor

- Topologia exata do RabbitMQ (exchange/filas/DLQ, como fazer a espera crescente) e a
  biblioteca cliente (`amqplib` é o default razoável).
- Intervalo e lote do relay; se corre dentro do processo do backend ou à parte.
- Mecanismo de deduplicação no worker.
- Biblioteca SMTP (`nodemailer` é o default razoável) e formato dos templates.
- Forma exata das respostas e nomes de colunas/índices, seguindo as convenções existentes.
- Divisão em fatias/PRs (sugestão: 1 infraestrutura de e-mail; 2 confirmação + 2 etapas +
  contas existentes; 3 recuperação de palavra-passe + polimento).
