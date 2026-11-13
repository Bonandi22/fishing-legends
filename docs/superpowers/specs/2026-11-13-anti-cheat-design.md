# Antifraude — deteção de batota, suspensão, banimento e página de admin

Data: 2026-11-13 · Bloco 2 de 3 da Fase 11 (1: segurança da conta ✅ → 2: antifraude → 3: Fase 12 campeonatos)

## Intenção e porquê

O receio do dono do jogo é alguém **viciar o jogo para pescar peixes melhores e fazer
mais pontos do que o normal**. Jogar muito tempo e acumular bons peixes é legítimo; o
que denuncia batota é uma **combinação de resultados estatisticamente muito improvável
num período curto**.

Fluxo pedido: um sinal suspeito marca a conta → verificação rápida e automática contra
regras de batota → se a conta atingir o limite, é **bloqueada** e o jogador é informado
no jogo do que se passa ("vai receber uma notificação em breve"). A decisão final
(banir ou repor) é do dono, numa página de admin, e o jogador é avisado por e-mail.
Batota confirmada → **banimento definitivo**.

Prioridade explícita do dono: **é preferível um batoteiro jogar alguns dias do que
bloquear um jogador honesto.** Isto governa todos os limites deste documento.

## Objetivos

- Tornar impossível no servidor o que é fisicamente impossível para um humano
  (regras duras, rejeitadas na hora).
- Medir estatisticamente, por janela de tempo, o que é improvável para um humano honesto,
  e transformar isso em **sinalização** (revisão humana) ou, só em casos esmagadores,
  em **suspensão automática**.
- Dar ao dono uma página de admin com a evidência numérica de cada caso e as ações
  banir / repor / arquivar.
- Informar o jogador: ecrã no jogo quando suspenso/banido; e-mail na suspensão e na
  decisão final.

## Não-objetivos (decididos)

- **Políticas e termos de adesão**: tarefa própria, futura (documentos de política, termos,
  regras do jogo, aceitação no registo). Este bloco deixa a mensagem de banimento a falar
  em "regras do jogo" genericamente, com um ponto de ligação para a futura página.
- **Submarino**: continua sem custo nem limite. Não é batota; só ritmo anormal conta.
- **Venda de moedas / pacotes** (futuro): comprar moedas para subir de nível mais depressa
  é legítimo. Consequência de desenho: **nenhum sinal usa moedas, XP ou nível** — só
  resultados de pesca.
- Minijogo decidido no servidor: continua decidido no cliente (buraco aceite desde a
  slice 6a). Este bloco **deteta** o abuso em vez de o tornar impossível.

## Anti-objetivos (falhar mesmo que "funcione")

- Um jogador honesto, mesmo muito bom, muito persistente ou com um dia de sorte, ser
  **suspenso** automaticamente.
- A pesca ficar mais lenta ou mais frágil por causa da análise.
- Um jogador que compra moedas/multiplicadores ser tratado como suspeito por isso.

## O que existe hoje (recon)

- O servidor sorteia peixe/raridade/peso em `POST /me/fishing/cast` (`crypto.randomInt`)
  e cria uma linha em `fishing_sessions` (`created_at`, `completed_at`, `status`
  `open|completed|expired`, `mode`, `result_fish_id`). TTL de sessão 5 min
  (`backend/src/fishing/session.ts`).
- `land` não tem resultado de minijogo: o cliente só chama `land` quando ganha. **Uma
  derrota é uma sessão que nunca foi completada.** Logo, a taxa de vitória por raridade
  já é calculável no servidor: `completed / (completed + expired/abandonadas)`.
- **Achado F1 — escolher a dedo:** o peixe é revelado na resposta do `cast` e o servidor
  aceita várias sessões abertas em simultâneo. Um bot pode lançar repetidamente e só
  completar as raras.
- **Achado F2 — ritmo não verificado:** a espera antes de morder (0,8 s + 3–10 s,
  `getWaitTime`) acontece só no cliente, antes do `cast`. O servidor aceita `cast`s
  seguidos sem intervalo mínimo.
- **Achado F3 — minijogo** (`src/components/game/PullMinigame.tsx`): vitória por toque
  com a linha na zona verde, ou por 10 s acumulados na verde; derrota com 15 s na
  vermelha. A linha começa no centro (dentro da verde). Zona verde de 55% (comum) a 8%
  (cósmica), velocidade 1 → 2,9. O **multiplicador de força** (comprável) reduz a
  velocidade para ×0,5 ou ×0,25 → um honesto com força ativa ganha mais. As expectativas
  têm de separar "com força" de "sem força".
- **Achado F4 — submarino:** `land` renova `created_at` e só preenche `completed_at` no
  fim do roster, por isso os tempos por captura perdem-se.
- `users.status` já admite `'suspended'` (check `active|suspended|deleted`). O login e o
  refresh recusam não-`active` com `INVALID_CREDENTIALS` — não há forma de o cliente
  distinguir "suspenso" de "senha errada".
- `email-worker` já corre trabalho periódico (`runAuthCleanup`, de hora a hora) e envia
  e-mails localizados pela outbox (`backend/src/email/templates.ts`, por `users.locale`).
- Não existe noção de admin nem de papéis.

## Abordagens consideradas

| | Como | Troca |
|---|---|---|
| A. Análise periódica | Um trabalho de fundo (~10 min) lê sessões recentes, calcula sinais, sinaliza/suspende | Zero impacto na pesca, fácil de afinar e reprocessar; um bot pesca até ao próximo ciclo |
| B. Verificação a cada captura | Cada `land` atualiza contadores e avalia regras na hora | Reação imediata; estatística no caminho quente, mais frágil e difícil de afinar |
| **C. Misto — escolhida** | Regras duras na hora para o fisicamente impossível + estatística periódica (A) | Trava o bot grosseiro já; a estatística decide com tempo e amostra, sem tocar na pesca |

Escolhida **C** pelo dono. Encaixa na prioridade "não bloquear honestos": nada
estatístico bloqueia de forma síncrona.

## Desenho

### 1. Regras duras (no servidor, síncronas)

Rejeitam a ação e **registam um evento de violação**. Uma violação sozinha **não**
suspende (pode ser falha de rede/relógio); só contam como sinal (secção 3, S4).

- **H1 — uma sessão aberta por modo, para `rod` e `net`.** Um novo `cast` desse modo marca
  como `expired` as sessões `open` anteriores do mesmo utilizador e modo (contam como
  derrota). Não é rejeição — fecha o buraco F1 sem afetar o fluxo honesto, que nunca tem
  duas abertas. *Submarino excluído*: o roster tem reposição em fundo; o builder confirma
  se esse fluxo abre sessões sobrepostas antes de decidir incluí-lo.
- **H0 — só uma janela pesca de cada vez (decisão do dono).** Cada separador/aparelho
  gera um `clientId` aleatório e envia-o no `cast`. Se outro `clientId` do mesmo
  utilizador fez um `cast` nos últimos **60 s**, o `cast` é recusado com
  `409 FISHING_ELSEWHERE` e o cliente mostra "Já estás a pescar noutro lado". **Não
  regista violação** — é um uso honesto, não batota. Passados 60 s sem atividade da outra
  janela, esta pode pescar. Um bot que troque de `clientId` só consegue
  `FISHING_ELSEWHERE`; um bot com um único `clientId` cai em H2.
- **H2 — intervalo mínimo entre `cast`s de `rod` do mesmo `clientId`.** Valor provisório
  **3,5 s** entre o `created_at` de dois `cast`s consecutivos (o cliente honesto nunca faz
  menos de 3,8 s). Rejeita com `429 CAST_TOO_FAST`. Como H0 já separa as janelas, uma
  violação de H2 não pode vir de jogar em dois sítios.
- **H3 — tempo mínimo `cast` → `land` em `rod`.** Valor provisório **300 ms** (o humano
  tem de ver o peixe, carregar em "puxar" e tocar; o RTT de rede soma-se sempre). Rejeita
  com `409 LAND_TOO_FAST`; o peixe perde-se (sessão `expired`).

Os valores de H2/H3 vivem num único módulo de configuração; o builder deve **medir** o
mínimo real a jogar depressa no browser antes de os fixar, e errar para o lado permissivo.

### 2. Registo de dados para análise

- `fishing_sessions` ganha `strength_active boolean` (gravado no `cast`, a partir do
  blob) e, para o submarino, os tempos por captura passam a ser preservados (F4) — ou num
  evento por `land`, ou noutra forma à escolha do builder.
- Nova tabela append-only `anti_cheat_events` (`id`, `user_id`, `type`
  `cast_too_fast|land_too_fast`, `session_id?`, `created_at`, `detail jsonb`) para as
  violações das regras duras.
- O builder confirma a retenção de `fishing_sessions` (não pode haver limpeza que apague
  sessões dentro da janela de análise; janela máxima 7 dias).

### 3. Análise periódica (no `email-worker`)

Corre a cada **10 min** no processo do `email-worker` (como `runAuthCleanup`). Considera
os utilizadores `active` com atividade de pesca nas últimas 24 h. Lógica num módulo puro
`backend/src/anticheat/rules.ts` (`evaluatePlayer(stats) → { level, signals[] }`),
testável sem base de dados; a recolha de estatísticas fica num repositório (PG + memória,
mesmo comportamento observável).

Sinais (cada um produz `none | flag | suspend`):

- **S1 — taxa de vitória por raridade (rod, e net se o builder confirmar que o minijogo
  da rede é igualmente decidido no cliente).** Para cada raridade e cada condição
  (com/sem força), teste binomial: probabilidade de um honesto, no **melhor caso
  plausível** (taxa-teto `p0` por raridade/condição, tabela provisória num módulo de
  configuração), obter ≥ k vitórias em n tentativas.
  - `flag`: p < 1e-3 com n ≥ 15.
  - `suspend`: p < 1e-6 com n ≥ 30.
  - Os tetos `p0` são provisórios e **generosos** (a errar a favor do jogador) até haver
    dados reais para calibrar.
  - **Vitória no primeiro toque:** a linha começa no centro, dentro da zona verde, mas
    sai dela em ~340 ms no comum, ~120 ms no lendário e ~17 ms no cósmico (sem força).
    Um humano só consegue isto em comuns/incomuns; nos raros tem de acertar a passagem
    da linha. Por isso os `p0` dos comuns são altos e os dos raros têm de ser **medidos a
    jogar no browser** (com e sem força) antes de fixados. Não se muda o minijogo neste
    bloco. *(Decisão do autor do design.)*
- **S2 — ritmo.** Capturas por hora acima do máximo humano sustentado, ou atividade de
  pesca contínua sem pausas por muitas horas seguidas numa janela de 24 h (padrão de
  bot). Só `flag`.
- **S3 — raridade sorteada vs esperada.** Distribuição das raridades **sorteadas** nos
  `cast`s face a `RARITY_CONFIG.chance` (com modo sortudo e catálogo do local). Como o
  sorteio é do servidor, isto não deveria ser manipulável: é um **alarme de bug ou
  exploit desconhecido**. Só `flag`.
- **S4 — violações das regras duras** (`anti_cheat_events`) nas últimas 24 h.
  - `flag`: ≥ 5. `suspend`: ≥ 50 (já não é rede instável, é um script).

Nível da conta = o máximo dos sinais. Vários `flag`s **não** somam até `suspend` — só a
evidência esmagadora suspende. Os números que levaram ao nível são guardados no caso.

### 4. Casos de fraude e estados da conta

- Nova tabela `fraud_cases`: `id`, `user_id`, `status`
  `flagged|suspended|banned|restored|dismissed`, `opened_at`, `updated_at`,
  `evidence jsonb` (snapshot dos sinais e números), `decided_at`, `decided_by`, `note`.
  No máximo **um caso aberto** (`flagged|suspended`) por utilizador (índice único parcial).
  Uma nova avaliação atualiza a evidência do caso aberto e pode escalar `flagged → suspended`.
- `users.status`: acrescentar `'banned'` ao check. Suspensão automática → `suspended`;
  decisão de banir → `banned`; repor → `active`.
- **Arquivar** (falso alarme) fecha o caso como `dismissed`; **repor** fecha-o como
  `restored`. Em ambos, a análise dessa conta passa a ignorar **toda** a atividade
  anterior à data da decisão (as estatísticas das janelas começam nessa data, não só a
  reabertura de casos) — senão o ciclo seguinte voltava a suspender quem acabou de ser
  reposto. *(Decisão do autor do design, a confirmar na leitura.)*
- Efeitos de `suspended`/`banned`:
  - Login e refresh: depois de a palavra-passe estar certa (para não revelar estado a
    quem não a sabe), devolvem `403 ACCOUNT_SUSPENDED` / `403 ACCOUNT_BANNED`
    (novos códigos em `http/errors.ts`).
  - Uma sessão já autenticada deixa de conseguir jogar no máximo em ~1 min: as rotas de
    mutação de jogo (economia, pesca) recusam com o mesmo código; os refresh tokens são
    revogados ao suspender/banir. O mecanismo exato é do builder.
  - Fora do ranking e da temporada enquanto não estiverem `active`.
  - Dados guardados, não apagados (prova). A limpeza de contas não confirmadas nunca toca
    em `suspended`/`banned`.
  - O e-mail continua ocupado (índice único existente) → não se volta a registar com ele.
- Memória e PostgreSQL com o mesmo comportamento observável.

### 5. Admin

- `users.is_admin boolean default false`. Atribuído **só por script**
  (`npm run backend:admin:grant -- <email>`); não há ecrã nem rota para promover.
  O primeiro e único admin previsto é o dono.
- `GET /me` passa a expor `isAdmin`.
- Rotas (todas exigem admin; não-admin → 404 para não revelar a existência):
  - `GET /api/v1/admin/fraud-cases?status=` — lista (paginada).
  - `GET /api/v1/admin/fraud-cases/:id` — detalhe com a evidência.
  - `POST /api/v1/admin/fraud-cases/:id/decision` — `{ action: 'ban'|'restore'|'dismiss', note? }`,
    com `Idempotency-Key`, transacional (caso + `users.status` + e-mail na outbox).
- Página de admin no frontend, acessível pelo menu só quando `isAdmin`:
  - Lista de casos `flagged` e `suspended` (mais graves primeiro), com conta, data, nível.
  - Detalhe: os números de cada sinal (vitórias/tentativas por raridade e condição,
    probabilidade, ritmo, raridades sorteadas, violações) e os três botões, com confirmação.

### 6. Comunicação ao jogador

- **Ecrã no jogo** quando o login/ação devolve `ACCOUNT_SUSPENDED`: "A tua conta está em
  revisão por atividade fora do normal. Vais receber um e-mail com a decisão." Para
  `ACCOUNT_BANNED`: "Esta conta foi banida por violar as regras do jogo." (i18n nas 6
  línguas existentes; ligação futura para a página de regras.)
- **E-mails** (outbox existente, localizados por `users.locale`):
  - suspensão automática → "conta em revisão";
  - decisão `ban` → "conta banida";
  - decisão `restore` → "conta reposta, pedimos desculpa pelo incómodo".
  - `flagged` e `dismiss` de um caso só sinalizado → **nenhum** e-mail (o jogador nunca
    soube).

## Critério de aceitação central

Uma **simulação de honestos** faz parte dos testes: Monte Carlo de muitos jogadores
honestos no teto `p0` (com e sem força), a jogar ao ritmo humano máximo durante 24 h
(e 7 dias), passa por `evaluatePlayer` — **zero suspensões**, e a taxa de `flag`
reportada. Um batoteiro simulado (100% de vitórias nas raridades difíceis) tem de chegar
a `suspend` dentro de um número de lançamentos razoável, também reportado.

## Deixado ao builder

- Valores exatos de H2/H3 (medidos no browser), tetos `p0`, limites de S2.
  Tudo num único módulo de configuração, com os provisórios acima como ponto de partida.
- Inclusão do `net` em H1/S1 e do submarino em H1, após confirmar os fluxos.
- Forma de preservar os tempos por captura do submarino.
- Mecanismo de corte de sessões já autenticadas (desde que ≤ ~1 min).
- Paginação, ordenação e layout da página de admin dentro do estilo existente.
