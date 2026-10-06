# Fase 3 · O porto: shell, All hands, Voyages, Set sail, The Docks

Quatro lanes em paralelo na Onda 3: **3A**, **3B**, **3C** e a **4A** (fase 4). Contexto geral em
[00-overview.md](00-overview.md).

Quadros: `Main` (All hands), `Voyages`, `SetSail`, `Docks` em `docs/design/wireframes/`.

---

## Lane 3A · Shell, All hands e Voyages (M)

**Depende de:** 1B, 2B, 2D. **Possui:** `src/app/app.ts` (+ template), `src/app/features/harbour/**`,
`src/app/features/voyages/**`.

**Shell.** `ah-top-bar` com `needsYou` = contagem de `awaiting_input + awaiting_decision + halted` do `StoriesStore`,
`live` do `EventBus`, `user` do `CurrentUser`; pesquisa → navega para `/voyages?q=`; `<router-outlet>`; `ah-toast-host`; `<title>`
por rota. Largura máxima `page-max` (1360 px), gutter 24 px (16 px em telefones).

**All hands (`/`).** Por quadro `Main`:

- Título "All hands on deck" e a frase "Voyages waiting on a person. Anyone on the crew may answer, approve, send back or stop.
  Only the owner is billed."
- **3 tiles** com contagem: Crew asks, Your orders, Anchored; cada um liga a `/voyages?status=…`.
- Painel **"Needs you"** ("N voyages · longest wait first"): tabela Status, Voyage (chave + título), Phase, What's needed, Owner,
  Waiting, Budget (medidor + "9.8 / 20"), ação. Ordem: **mais antiga primeiro** (`updatedAt` crescente). A ação por estado:
  `awaiting_input` → **Answer** (primário); `awaiting_decision` → **Review plan** (primário; "Decide" se for outro gate);
  `halted` → **Review & resume** (secundário).
- **"What's needed"** por estado, com a linha pequena por baixo:
  - `awaiting_input`: "{Crew} asked N questions" / "Round R · k of N answered" (de `listQuestions`);
  - `awaiting_decision`: "The plan is ready for review" / "Gate plan_accepted · revision round x of 4" (de `getStoryState` e
    do evento `story.awaiting_decision`; G10, G11);
  - `halted`: texto curto de `explainHalt` / "`run_failed` · …detalhe do último `story.halted`" (G7), com cache e só para as
    viagens em halt.
- Painel **"At sea"** (running + ready): Status, Voyage, Phase, Crew member (+ "model · effort" quando há run), Owner,
  Updated, Budget; ligação "All voyages".
- Vazio: **"Calm seas"** ("Nothing needs you right now…", ação "See all voyages").
- Atualiza-se sozinho pelo stream (sem recarregar a página).

**Voyages (`/voyages`).**

- `ah-filter-chips`: All, Queued (`ready`), Under way (`running`), Crew asks, Your orders, Anchored, **In port** (`terminal`),
  cada um com a palavra da API e a contagem. O estado ativo vai para `?status=`.
- Tabela: Status, Voyage, Phase, **Progress** (stepper compacto), **Note** ("Cartographer at work", "Navigator goes next",
  "Plan waiting for approval · round 2 of 4", "2 open questions", "Stopped by priya@example.com", "Plan rejected by …",
  "Delivered"), Owner, Budget, **Updated ↓**. Para `blocked`, a posição no stepper vem do evento `story.phase_changed`
  (`from`), carregado só para as linhas visíveis (G12).
- Rodapé "Showing N of M" e **Load more** (cursor da API), se a lista não estiver toda carregada.
- `?q=` filtra no cliente por chave ou título (desvio 3).
- Estados: skeleton (linhas com a altura real), vazio por filtro ("No anchored voyages · Every voyage is moving or in port ·
  Show all statuses"), erro "Lost contact with the harbour".

**Aceitação**

- Contra o mock (`start:mock`): as 8 viagens semeadas aparecem nos sítios dos wireframes; os contadores batem
  (1 / 1 / 2 nos tiles; All hands 4).
- Um evento do stream (ex.: responder à pergunta de PROJ-131) move a linha entre painéis sem recarregar.
- Teclado: tabs, chips e linhas acionáveis acessíveis; foco visível.
- Testes: ordenação "longest wait first"; texto de "What's needed" por estado; URL ↔ chip; `?q=`.
- A 390 px: top bar a quebrar linha, tabelas a rolar **dentro** de uma caixa, página sem scroll horizontal.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-3-harbour.md`. Implementa **só a lane
3A** (shell, All hands, Voyages) usando `@ui`, `@core` e `@domain` já integrados. Compara cada ecrã com os quadros `Main` e
`Voyages`, em claro, escuro e 390 px. Nunca importes outra feature. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 3B · Set sail (M)

**Depende de:** 1A, 1C, 2D. **Possui:** `src/app/features/set-sail/**`.

Quadro `SetSail`. Rota `/voyages/new?key=&title=`.

- **Formulário tipado (Reactive Forms)**:
  - **Jira key** (mono): `^[A-Z][A-Z0-9]+-[0-9]+$`, máx. 40; dica "Like PROJ-123. One voyage per key."; maiúsculas
    automáticas.
  - **Title (optional)**, máx. 500, pré-preenchido por `?title=` (desvio 1).
  - **Total budget** (AIU, `inputmode="decimal"`, sufixo AIU): > 0, lido por `parseAiu` → `budgetNanoAiu` inteiro;
    dica "A hard cap for every run of this voyage together. You can raise it later."
- Painel **"Crew and models"**: `ah-model-choice-table` com 5 linhas (`intake` Navigator, `planning` Cartographer,
  `implementation` Implementer, `pr_review` Lookout · design = `review-design`, Lookout · defects = `review-defect`). Todos os
  campos opcionais; **sem defaults concretos** (G5): placeholder "Default" e a etiqueta "Server default"/"Your choice" só quando
  o utilizador escolhe. Nota: "Type a Copilot model id. Ahoy can't list the models your account may use; the worker checks the
  model and effort before the first prompt (0 AIU) and anchors the voyage if they're refused." e "The two Lookouts must use
  different models." Só vão no pedido os slots **preenchidos** (`models` omitido se vazio).
- Coluna direita **"Before you sail"** (vive com o formulário): Voyage, Owner (`CurrentUser` + "(you)"), Budget cap,
  First crew; três pontos "Runs bill **your** Copilot account, up to X AIU…", "The crew stops for questions and at every human
  gate…", "Anyone on the crew can stop the voyage at any time." Botão **"Set sail · up to {X} AIU"** (40 px, primário) e Cancelar;
  o cartão "How a voyage goes" com as 7 fases.
- Pill "Filled in from The Docks" quando chega com `?key=` (e `← Back to The Docks`).
- **Submissão:** `startStory`. `201` → toast "Voyage PROJ-145 set sail." e navegação para `/voyages/:key`. `409 story_exists` →
  erro no campo da chave com ligação "Open PROJ-145". `400 validation_failed` → erros por campo (`/budgetNanoAiu`,
  `/models/review-defect`…). `422` e outros → banner com o `detail`. **O botão fica desativado durante o pedido** (sem duplo
  envio).
- Texto do utilizador nunca se perde em erro.

**Aceitação**

- Validação: chave inválida, orçamento vazio, `0`, `1e3`, `-5`, `25.5` (válido → 25 500 000 000 nano), mais de 9 casas.
- Revisores com o mesmo modelo → erro nas duas linhas e submissão bloqueada; um só preenchido → vai (a API decide).
- Teste de integração no mock: criar `PROJ-145` com orçamento 25 e `planning` = `claude-sonnet-5` / `high` → corpo do pedido
  exato `{key, budgetNanoAiu: 25000000000, models:{planning:{model, reasoningEffort}}}`.
- `story_exists` mostrado; duplo clique envia um pedido.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-3-harbour.md`. Implementa **só a lane
3B**. O orçamento nunca passa por `float`: usa `parseAiu`. Só envias no pedido os modelos que o utilizador preencheu. Compara
com o quadro `SetSail`. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 3C · The Docks, planeado (S)

**Depende de:** 1B, 2B. **Possui:** `src/app/features/docks/**`.

Quadro `Docks`. Rota `/docks`. **A API não tem backlog (G3).**

- **`BacklogPort`** (interface em `features/docks/`): `list({q, jiraStatus, assignee, scope, cursor})` →
  `{items: BacklogItem[], total, nextCursor}`; `BacklogItem` = `{key, summary, type, jiraStatus, priority, assignee,
updatedAt}`. **`StubBacklogAdapter`** com os 9 itens do wireframe (fictícios) e os filtros a funcionar no cliente. Trocar o
  adaptador quando a API tiver o endpoint não deve tocar na UI.
- Banner `notice` "Planned screen. The backlog is not in the API yet…".
- Pesquisa, selects de Jira status e Assignee, `ah-section-tabs` pill **All / Not started / In Ahoy**; contador
  "142 stories · 9 in Ahoy".
- Tabela: Key (mono), Summary, Type, Jira status, Priority, Assignee, Updated, **Ahoy**, Actions. **A coluna Ahoy é real**: faz
  join com `StoriesStore` — "Not started", ou o badge + fase com ligação à viagem.
- Ações: **Jira ↗** (só se `jiraBaseUrl` estiver configurado, G13); **Set sail** → `/voyages/new?key=&title=` para os "Not started";
  **Open voyage** para os que já estão no Ahoy. Sem arranque em massa (nota no rodapé).

**Aceitação**

- Com o stub, os filtros e os três estados da coluna Ahoy funcionam; "In Ahoy" reflete as viagens do mock.
- Trocar o adaptador por um falso nos testes não altera nenhum componente.
- Sem `jiraBaseUrl`, "Jira ↗" não aparece.
- O ecrã diz "planned" de forma visível; nada nele finge ser dado real.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-3-harbour.md`. Implementa **só a lane
3C**. O backlog **não existe** na API: tudo passa por `BacklogPort`, com um adaptador de dados de exemplo claramente marcado
como planeado. A coluna Ahoy usa dados reais. Sem commit nem push. Relatório em `docs/progress.md`."
