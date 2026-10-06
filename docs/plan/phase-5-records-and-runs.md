# Fase 5 · Runs, passos em direto, gates, ship's log e artefactos

Três lanes na Onda 4, **em paralelo com 4B, 4C e 4D**, todas sobre a 4A (`VoyageContext`, `CommandRunner`, tabs por rota).
Contexto geral em [00-overview.md](00-overview.md). Quadros: `Running`, `RunDetail`, `Records`.

As tabs vivem em `src/app/features/voyage/tabs/<tab>/`; o run detail em `src/app/features/run-detail/`.

---

## Lane 5A · Runs, run detail e passos em direto (L)

**Depende de:** 4A (e 2B: `RunProgressBuffer`, `StoryEventsFeed`). **Possui:** `src/app/features/voyage/tabs/runs/**`,
`src/app/features/run-detail/**`.

**Tab Runs** (quadro `Running`):

- **Painel em direto**, só quando a story está `running` e tem `currentRunId`: pulso `live` (respeita `prefers-reduced-motion`),
  "{Crew} is at work", `r-02 · model · effort`, "Live, a few seconds behind the agent".
  - **Run spend:** medidor com a última `spend` (`nanoAiu`) contra `run.budgetNanoAiu` ("**1.84** of this run's 28.6 AIU cap").
    Sem `spend` ainda, usa `run.usage.nanoAiu`.
  - **`ah-live-steps`** (`role="log"`): passos `tool` (nome + resumo) e `message` (200 caracteres), hora = `at` do payload ou o
    `createdAt` do evento, `[REDACTED]` realçado. **Linhas de intervalo:** os passos entre duas `spend` formam um lote; se
    `omitted` subiu nesse lote, a linha "**N steps not shown**" vai **antes** dele (N = a diferença). Nunca sugerir que a lista
    está completa. Rodapé do wireframe ("Newest at the bottom… not a control").
  - Quando chega `run.finished`, o resultado do run (`getRun`) substitui a `spend` ao vivo e os passos **ficam** como histórico.
- **Painel "This run"** (coluna direita): Agent, Model, Effort, Started ("10:40:51 · 3 m ago"), Started by, Requests (da `spend`)
  e a ligação **Open run detail**.
- **Tabela "Runs"** (oldest first), sempre visível: Run (`r-02`, ligação), Phase, Agent, Model · effort, **Status**
  (`ah-outcome-pill` com o estado do run), Started, Ended, AIU (o run ativo mostra "1.84 live"), **Gate** (pill com
  `run.gate.result`, "—" se não há), Started by (`ahoy-reconciler` → "Ahoy").
- Sem runs: "No runs yet" (a tab tem contagem 0).

**Run detail** (`/voyages/:key/runs/:runId`, quadro `RunDetail`):

- Breadcrumb "Voyages / PROJ-123 / Runs / r-04"; badge do estado, "planning · revision round 2" (a ronda só se for calculável
  a partir dos gates), H1 **"Run r-04 · Cartographer"**, "PROJ-123 · {título}"; **pager** "← r-03 / All runs / r-05 →"
  (pela ordem dos runs; o botão sem destino fica desativado).
- **4 tiles:** AIU spent (**2 casas**, medidor contra o cap do run), Requests, Tokens ("182k", "164k in · 18k out"), Duration
  ("16 m 12 s", "Tue 09:31 → 09:47"; run ativo: tempo até agora).
- **Painel "Details"** (lista de definição): Agent, Model, Reasoning effort (+ origem se existir), Status, Exit reason, Started
  by, Queued, Started, Ended, **Runtime** (`docker | k8s | replay | fake`), Agent config (sha completo, mono apagado). Para
  `replay`: "Offline replay of {replayOf}: usage is not charged again."
- **Painel "Automated gate":** pill do resultado, "{gate} · {message}". A linha "Output: … artifact revision 5" **não entra
  na v1** (a API não liga run a artefactos).
- **Painel "Steps":** os passos do run **como histórico** (de `StoryEventsFeed`, `run.progress` do `runId`), com as mesmas
  linhas de intervalo; "The live steps, kept as history".
- `404` do run → "This run doesn't exist" com ligação à viagem.

**Aceitação**

- No mock, PROJ-140: a página mostra o painel em direto com passos a chegar, a `spend` a subir, uma linha "38 steps not shown" e
  um passo com `[REDACTED]`. Terminar o run no mock substitui a `spend` pelo valor final e **mantém** os passos.
- O scroll não é sequestrado quando o utilizador subiu a lista; "N steps not shown" não aparece se `omitted = 0`.
- `omitted` é a **diferença** entre `spend` consecutivas (teste de unidade com 3 lotes).
- Run detail de r-04 (PROJ-123) tem os 4 tiles, os detalhes, o gate `pass` e os passos arquivados; o pager respeita os limites.
- Run `replay` mostra a nota; run sem `gate` mostra "—".
- Eventos `run.progress` de outro run **não** aparecem.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-5-records-and-runs.md`. Implementa **só a
lane 5A**. O progresso é uma vista, não um controlo: sem chat nem ações por passo. Nunca mostres a lista como completa. Usa o
`RunProgressBuffer` da 2B. Compara com `Running` e `RunDetail`. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 5B · Gates e ship's log (M)

**Depende de:** 4A (e 2B: `StoryEventsFeed`). **Possui:** `src/app/features/voyage/tabs/gates/**`,
`src/app/features/voyage/tabs/log/**`.

Quadro `Records`.

**Tab Gates** — "Gate history · Automated checks and human decisions, oldest first. Nothing passes on silence."

- Tabela: **When** (absoluto, "Mon 10:06"), Phase (mono), Gate (mono: `intake`, `plan`, `plan_accepted`), **Source**
  (Automated | Human, de `source: gate | human`), **Outcome** (`ah-outcome-pill` com a **palavra da API**: `pass`, `branch`,
  `send_back`…), Message, **Who** (`ahoy-reconciler` → "Ahoy"), Run (ligação a `r-0x`).
- **Linha final "waiting"** quando a story está `awaiting_decision`: "now · {fase} · {gate} · Human · waiting · Round {n} of {teto}
  is open. · **Decide** (→ Plan)".
- Vazio: "No gate records yet".

**Tab Ship's log** — "Every event, newest first. Updates arrive live."

- Lista `ah-ships-log` a partir de `StoryEventsFeed.newestFirst()`, **sem** `run.progress`. Indicador "Live" do stream.
- **Título e detalhe por tipo de evento** (tabela em `tabs/log/event-text.ts`, com testes):

  | Evento                                                                                                                                         | Título                              | Detalhe (do payload, quando existir)                             |
  | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
  | `story.started`                                                                                                                                | Voyage started                      | "budget {X} AIU · planning on {modelo · esforço}"                |
  | `story.halted`                                                                                                                                 | Anchored                            | `reason` + `detail`                                              |
  | `story.resumed`                                                                                                                                | Resumed                             | motivo                                                           |
  | `story.budget_changed`                                                                                                                         | Budget changed                      | "{antes} → {depois} AIU · "{motivo}""                            |
  | `story.models_changed`                                                                                                                         | Models changed                      | slots alterados                                                  |
  | `story.phase_changed`                                                                                                                          | Phase changed                       | "{from} → {to}"                                                  |
  | `story.awaiting_input`                                                                                                                         | Waiting for answers                 | —                                                                |
  | `story.awaiting_decision`                                                                                                                      | Waiting at the human gate           | "{gate}, round {n}"                                              |
  | `run.queued`                                                                                                                                   | Run queued                          | "{runId} · {agent} · {modelo · esforço}"                         |
  | `run.dispatched`                                                                                                                               | Run dispatched                      | "{runId} on {runtime}"                                           |
  | `run.finished`                                                                                                                                 | Run finished                        | "{runId} {Crew} · {status} · {AIU} AIU"                          |
  | `gate.evaluated`                                                                                                                               | Gate evaluated                      | "{gate} · {result} · {runId}"                                    |
  | `question.asked` / `question.answered`                                                                                                         | Questions asked / Question answered | "Q1, Q2 by {Crew}" / "Q2"                                        |
  | `decision.recorded`                                                                                                                            | Decision recorded                   | "{gate} · {decision} · round {n}"                                |
  | `artifacts.updated`                                                                                                                            | Artifacts updated                   | "revision {n}"                                                   |
  | `consensus.resolved`, `work_package.decided`, `work.reopened`, `story.unblocked`, `implementation.reported`, `review.reported`, `story.routed` | o nome legível                      | só campos escalares curtos                                       |
  | **qualquer tipo desconhecido**                                                                                                                 | o próprio `type`                    | só campos escalares até 120 caracteres; nunca um dump do payload |

  **Payloads confirmados no código do hosted** (`appendEvent(…)`, 2026-10-06): `story.started {phase, controlSha,
budgetNanoAiu, models?}`; `story.halted {reason, detail?, runId?, workerLog?, notes?}`; `story.awaiting_decision {phase,
gate}`; `decision.recorded {gate, decision, round, recordId}`; `story.phase_changed {from, to, notes?}`;
  `artifacts.updated {revision}`; `run.queued {runId, phase, agent, model, reasoningEffort, modelSource, effortSource}`;
  `run.dispatched {runId, runtime}`; `run.finished {runId, status, nanoAiu, requests}`; `gate.evaluated {gate, code, result,
message}`. Para **todos os outros** tipos a forma não foi verificada: usar o texto genérico e **registar a dúvida** em
  `docs/progress.md`; confirmar com respostas reais de `--simulate` quando houver.

- Ponto por tipo: `human` (ator humano), `pass` (`gate.evaluated` com `pass`), `wait` (`story.awaiting_*`), sistema.
- Ator: e-mail ou "Ahoy". Ligações para `r-0x` e para a viagem.
- **"Show 14 earlier events"**: mostra os 14 mais recentes e mais 20 por clique (paginação local do feed carregado).
- Desligado do stream: o indicador mostra "Reconnecting…" e a lista continua visível.

**Aceitação**

- No mock, PROJ-123: a tabela de gates tem as 5 linhas dos wireframes (intake pass, plan branch, plan pass, send_back de
  jordan, plan pass) mais a linha "waiting" com **Decide**; o ship's log abre em "Waiting at the human gate plan_accepted…".
- Um evento novo do stream aparece no topo do log sem recarregar; `run.progress` nunca aparece.
- Um evento de tipo desconhecido no mock aparece com o `type` e sem explodir.
- Testes: `event-text.ts` (todos os tipos acima), ordem, paginação local, linha "waiting".

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-5-records-and-runs.md`. Implementa **só a
lane 5B** (tabs Gates e Ship's log). Eventos desconhecidos nunca podem rebentar a UI nem mostrar o payload inteiro. Compara com
o quadro `Records`. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 5C · Artifacts: ver e comparar (M)

**Depende de:** 4A (e 1C: `ah-markdown`, `ah-artifact-diff`; 2C: `@domain/text-diff`). **Possui:**
`src/app/features/voyage/tabs/artifacts/**`.

Quadro `Records`, secção Artifacts.

**Dados (G9).** `listArtifacts` devolve só a revisão **corrente** (`revision`, `items[]`). Para uma revisão anterior só há
`getArtifactContent(path, revision=N)`. Portanto:

- **Revisões** `1..corrente`. Etiqueta de cada uma: "Revision 5 · current (r-04)", "Revision 4 (send-back)", "Revision 3
  (r-03)". Derivada do `StoryEventsFeed`: cada `artifacts.updated {revision}` + o evento imediatamente anterior (um
  `decision.recorded` com `send_back` → "(send-back)"; um `run.finished` → "({runId})"). Sem correspondência: "Revision N".
- **Ficheiros de uma revisão passada:** sondar os paths conhecidos (os da revisão corrente + os que aparecem em revisões já
  vistas); `404` = "não existia nessa revisão" (estado "new"/"removed"). Pedidos **só quando o utilizador abre ou compara**, com
  `If-None-Match` (ETag = sha256) para evitar repetir; cache em memória por `(path, revision)`.

**Entregáveis**

- Cabeçalho "Artifacts · Every change makes a new revision of the whole set."
- Seletor **Compare [Revision X] with [Revision Y]** e controlo pill **View | Compare** (`ah-section-tabs` pill).
- **Lista de ficheiros** (`path`, tamanho, tipo) com o estado face à revisão de comparação: `same`, `+9 −3`, `+2`, `new`,
  `changed` (JSON), e botões **View** e **Compare**.
- **Visualizador:** `.md` → `ah-markdown`; `.json` → `JSON.stringify(..., null, 2)` em `<pre>` (sem árvore); outros → texto.
  Mais de 1 MB → "Too large to preview". Conteúdo sempre como texto (nunca HTML).
- **Comparação:** diff por linhas com jsdiff (`diffLines`), hunks com 3 linhas de contexto; o cabeçalho de cada hunk nomeia a
  **secção** (o título markdown mais próximo acima: `@@ Summary @@`, `@@ WP1 Due date in the invoice API @@`);
  `ah-artifact-diff` com +/−. Ficheiros iguais: "No changes".
- Estados: loading, `404` de revisão, erro de rede.
- O diff, os hunks e o nome da secção vêm de `@domain/text-diff` (lane 2C); esta lane **não** escreve outra implementação.

**Aceitação**

- No mock, PROJ-123: revisão 5 contra 4 mostra `implementation-plan.md +9 −3`, `plan-sources.md +2`, `plan-round-1.md new`,
  `jira-snapshot.md same`, `questions.json same`, `state.json changed`; o diff do plano tem os hunks do wireframe
  (`Summary`, `Acceptance criteria`, `WP1…`, `WP2…`).
- Abrir a mesma comparação duas vezes não repete pedidos (cache/ETag).
- Markdown com `<script>` ou imagem remota **não** executa nem carrega (reutiliza os testes da 1C).
- Testes: rótulos de revisão a partir de eventos, estado de cada ficheiro face à revisão de comparação, cache/ETag, `404` por
  revisão. (O diff em si já é testado na 2C.)

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-5-records-and-runs.md`. Implementa **só a
lane 5C** (tab Artifacts). A API só lista a revisão corrente: sonda as anteriores com `getArtifactContent?revision=` e
`If-None-Match`. Usa `@domain/text-diff` (2C); não escrevas outro diff. Compara com `Records`. Sem commit nem push. Relatório
em `docs/progress.md`."
