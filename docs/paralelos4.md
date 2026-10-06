# Paralelos 4 · Onda 4

**Seis sessões ao mesmo tempo, todas depois de a lane 4A estar fundida em `main`.** Vem depois de
[paralelos3.md](paralelos3.md). Se preferires menos sessões em simultâneo, abre só algumas: são independentes.

| Secção | Lane | O que é                                 | Modelo sugerido                  | Precisa de em `main` |
| ------ | ---- | --------------------------------------- | -------------------------------- | -------------------- |
| A      | 4B   | Tab Plan e decisão no gate              | Sonnet 5.5                       | **4A** (e 1C, 2C)    |
| B      | 4C   | Tab Questions                           | Sonnet 5.5                       | **4A**               |
| C      | 4D   | Tab Models e diálogo Change models      | Sonnet 5.5                       | **4A**               |
| D      | 5A   | Tab Runs, run detail e passos em direto | Sonnet 5.5                       | **4A** (e 2B)        |
| E      | 5B   | Tabs Gates e Ship's log                 | DeepSeek Flash 4.1 ou Sonnet 5.5 | **4A** (e 2B)        |
| F      | 5C   | Tab Artifacts: ver e comparar           | Sonnet 5.5                       | **4A** (e 1C, 2C)    |

## Como usar este ficheiro

Numa sessão nova no repositório `ahoy-frontend`, na branch `main`, escreve só isto (com a letra da secção):

> Implementa a partir de docs/paralelos4.md a secção A

A sessão que receber isto **faz só essa secção**. As outras secções são de outras sessões que correm ao mesmo tempo.

## Regras comuns (valem para todas as secções)

1. **Lê, por esta ordem:** `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e o ficheiro da fase que a tua secção
   indica.
2. **Faz só a lane da tua secção** e só edita os diretórios que ela possui (ver o ficheiro da fase): cada lane tem a sua pasta
   em `src/app/features/voyage/tabs/<tab>/`. Não faças as outras secções deste ficheiro nem toques nos diretórios delas.
   **Nunca importes outra feature** (podes importar o que é da própria feature `voyage/`, como o `VoyageContext`). Se
   precisares de algo de outra lane, escreve-o em "Needs from lane X" em `docs/progress.md`.
3. **Node:** corre `node -v`. Se for inferior a 22.22.3, usa `npx -y node@24` e põe esse binário à frente do `PATH` em todos
   os comandos (ver "Node in cloud sessions" em `docs/progress.md`).
4. **Pré-voo, antes de escrever código:** confirma que os pré-requisitos da tua secção já estão em `main` (`git fetch origin`
   e vê os ficheiros indicados). **Se faltar algum, pára e diz-me qual. Não inventes, não copies nem refaças o trabalho de
   outra lane.** Todas precisam de `VoyageContext` e `CommandRunner` (lane 4A).
5. **Dependências:** só as aprovadas no §10 de `docs/plan/00-overview.md`. Nenhuma lane desta onda precisa de instalar novas.
6. **Nunca** contra `--live` nem contra o TEST. **Nunca** aprovar, rejeitar, enviar de volta, responder a perguntas, parar,
   retomar ou alterar orçamento ou modelos fora do backend falso ou de `npm run dev -- --simulate` (0 AIU). Qualquer resposta de
   teste a uma pergunta de agente leva "POC test answer, not a product decision".
7. **Verifica no backend falso** (`npm run start:mock`) e compara cada ecrã com o quadro do wireframe em
   `docs/design/wireframes/`, em tema claro, escuro e a 390 px de largura.
8. **Git:** trabalha na branch que a sessão designar. Antes de abrir PR, traz `main` para a tua branch e resolve os
   conflitos aí. **Não faças commit nem push até eu aprovar.**
9. **Fecho:** escreve a secção da tua lane em `docs/progress.md` (o que mudou, contagens de testes, o que não correu e
   porquê, "Needs from lane X", próximos passos) e deixa `npm run build && npm run typecheck && npm run lint && npm test &&
npm run format:check` verde.

---

## Secção A · Lane 4B · Plan review e decisão

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-4-voyage-core.md](plan/phase-4-voyage-core.md), lane 4B.
**Quadros:** `PlanReview`, `Dialogs`, `States`.

**Pré-requisitos em `main` (verifica):** **4A** (`VoyageContext`, `CommandRunner`, shell da viagem em
`src/app/features/voyage/`), **1C** (`ah-markdown`, `ah-choice-card-group`, `ah-dialog`) e **2C** (`@domain/text-diff`).

**Possui (só edita):** `src/app/features/voyage/tabs/plan/**`.

**O que fazer**

1. Tab Plan: o plano (`implementation-plan.md`) em `ah-markdown`, com os blocos alterados realçados via
   `changedBlocks` de `@domain/text-diff`; painel "Acceptance criteria"; painel "Earlier round".
2. Painel "Your decision" com **Approve**, **Send back** e **Reject**: razão obrigatória em send back e reject; a linha do
   modelo; o custo.
3. **Approve não tem diálogo. Send back e Reject têm.** Conflitos: `stale_version` mantém o texto;
   `decision_already_recorded` mostra o painel "{actor} already …" com "Copy my text" e "See the decision";
   `revision_ceiling_reached` mostra o banner.
4. **Nunca aprovar nem rejeitar nada fora do backend falso ou de `--simulate`.**
5. **Não instalas dependências novas.**

**Pronto quando:** no mock, PROJ-123 mostra o plano rev. 2 com os blocos alterados, os 5 AC e o send-back de jordan; o pedido
de send back é `{gate:"plan_accepted", decision:"send_back", reason, expectedVersion}`; send back e reject sem motivo não
enviam; `decision_already_recorded` forçado mostra o texto e os botões. Critérios completos na lane 4B do ficheiro da fase.

---

## Secção B · Lane 4C · Questions

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-4-voyage-core.md](plan/phase-4-voyage-core.md), lane 4C.
**Quadro:** `Questions`.

**Pré-requisitos em `main` (verifica):** **4A** e **1C** (`ah-question-card`).

**Possui (só edita):** `src/app/features/voyage/tabs/questions/**`.

**O que fazer**

1. Lista de `listQuestions` agrupada por ronda (a mais recente aberta), cabeçalho "Round {r} · {Crew} asks" com
   "{k} of {n} answered" e medidor, `ah-question-card` por pergunta, painel "What happens next".
2. **As respostas são finais:** nunca envies sem clique explícito. "Use recommendation" preenche mas não envia.
3. **Rascunhos** em memória e em `sessionStorage` (`ahoy.draft.{key}.{Qn}`, em `try/catch`): sobrevivem a um conflito, a um
   refresh do store e a recarregar a página; só se apagam ao enviar.
4. Toasts: "Answer to Q2 sent. 1 question left." / "… All questions answered: {Crew} is queued." `already_answered` mostra a
   resposta de quem respondeu primeiro e mantém o texto do utilizador.
5. **Nunca respondas a perguntas fora do backend falso ou de `--simulate`** (e aí escreve "POC test answer, not a product
   decision").
6. **Não instalas dependências novas.**

**Pronto quando:** no mock, PROJ-131 tem Q1 respondida (final), Q2 e Q3 abertas; enviar Q2 e depois Q3 dá os toasts certos e a
viagem avança sem recarregar; o rascunho de Q3 sobrevive a recarregar a página. Critérios completos na lane 4C do ficheiro da
fase.

---

## Secção C · Lane 4D · Models

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-4-voyage-core.md](plan/phase-4-voyage-core.md), lane 4D.
**Quadros:** `Halted` (tabela Models) e `Dialogs` (Change models).

**Pré-requisitos em `main` (verifica):** **4A** e **1C** (`ah-model-choice-table`, `ah-dialog`).

**Possui (só edita):** `src/app/features/voyage/tabs/models/**`.

**O que fazer**

1. Tabela "Models per phase" (`getStoryModels`) com as origens do modelo e do esforço, "Chosen for this voyage", ações Change
   e Reset, e a marca "refused last run".
2. Diálogo **Change models**: **o pedido leva só os slots alterados; `null` repõe o default; nunca um objeto de escolha
   vazio** (`minProperties: 1`); um modelo sem esforço vai só `{model}`.
3. **Os dois revisores têm de usar modelos diferentes:** compara os modelos **efetivos** e mostra o erro nas duas linhas.
4. Abre sozinho com `?change=<slot>` (usado pelo banner Anchored e pelo painel de decisão).
5. **Não instalas dependências novas.**

**Pronto quando:** no mock, PROJ-118 mostra "refused last run" em `planning`; mudar `planning` para `claude-sonnet-5` / `high`
envia `{expectedVersion, models:{planning:{...}}}`; Reset envia `{planning:null}`; revisores iguais dão erro sem pedido.
Critérios completos na lane 4D do ficheiro da fase.

---

## Secção D · Lane 5A · Runs, run detail e passos em direto

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-5-records-and-runs.md](plan/phase-5-records-and-runs.md), lane 5A.
**Quadros:** `Running` e `RunDetail`.

**Pré-requisitos em `main` (verifica):** **4A**, **1C** (`ah-live-steps`) e **2B** (`RunProgressBuffer`,
`StoryEventsFeed`).

**Possui (só edita):** `src/app/features/voyage/tabs/runs/**` e `src/app/features/run-detail/**`.

**O que fazer**

1. Tab Runs: painel em direto quando a story está `running` (spend contra o cap do run, `ah-live-steps`, painel "This run") e
   a tabela de runs (oldest first) com o estado, o gate e o AIU ao vivo.
2. Run detail em `/voyages/:key/runs/:runId`: pager, 4 tiles, painel Details, painel "Automated gate", e os passos como
   histórico.
3. **O progresso é uma vista, não um controlo:** sem chat nem ações por passo. **Nunca mostres a lista como completa:** "N steps
   not shown", com N = a **diferença** entre `spend` consecutivas. Usa o `RunProgressBuffer` da 2B.
4. **Não instalas dependências novas.**

**Pronto quando:** no mock, PROJ-140 mostra os passos a chegar, a `spend` a subir, uma linha "38 steps not shown" e um
`[REDACTED]`; terminar o run substitui a `spend` pelo valor final e mantém os passos; o scroll não é sequestrado; eventos de
outro run não aparecem. Critérios completos na lane 5A do ficheiro da fase.

---

## Secção E · Lane 5B · Gates e Ship's log

**Modelo sugerido:** DeepSeek Flash 4.1, ou Sonnet 5.5 se não confiares. **Revê antes de integrar.**
**Fase:** [docs/plan/phase-5-records-and-runs.md](plan/phase-5-records-and-runs.md), lane 5B. **Quadro:** `Records`.

**Pré-requisitos em `main` (verifica):** **4A**, **1B** (`ah-outcome-pill`), **1C** (`ah-ships-log`) e **2B**
(`StoryEventsFeed`).

**Possui (só edita):** `src/app/features/voyage/tabs/gates/**` e `src/app/features/voyage/tabs/log/**`.

**O que fazer**

1. Tab Gates: tabela oldest first (When, Phase, Gate, Source, Outcome com a palavra da API, Message, Who, Run) e a linha final
   "waiting" quando há um gate aberto.
2. Tab Ship's log: eventos mais recentes primeiro, **sem** `run.progress`, com o título e o detalhe por tipo de evento (tabela
   em `tabs/log/event-text.ts`, com testes), e "Show N earlier events".
3. **Eventos desconhecidos nunca podem rebentar a UI nem mostrar o payload inteiro.** Onde a forma do payload não esteja
   confirmada em `docs/plan/phase-5-records-and-runs.md`, usa o texto genérico e regista a dúvida no relatório.
4. **Não instalas dependências novas.**

**Pronto quando:** no mock, PROJ-123 tem as 5 linhas de gates mais a linha "waiting" com **Decide**; um evento novo aparece
no topo do log sem recarregar; um evento de tipo desconhecido aparece com o seu `type` e sem explodir. Critérios completos na
lane 5B do ficheiro da fase.

---

## Secção F · Lane 5C · Artifacts

**Modelo sugerido:** Sonnet 5.5. **Fase:** [docs/plan/phase-5-records-and-runs.md](plan/phase-5-records-and-runs.md), lane 5C.
**Quadro:** `Records` (secção Artifacts).

**Pré-requisitos em `main` (verifica):** **4A**, **1C** (`ah-markdown`, `ah-artifact-diff`) e **2C** (`@domain/text-diff`).

**Possui (só edita):** `src/app/features/voyage/tabs/artifacts/**`.

**O que fazer**

1. **A API só lista a revisão corrente.** Para as anteriores, sonda os paths conhecidos com
   `getArtifactContent?revision=` e `If-None-Match` (ETag); `404` = não existia nessa revisão.
2. Seletor "Compare … with …", lista de ficheiros com o estado face à revisão de comparação (`same`, `+9 −3`, `new`,
   `changed`), visualizador (markdown, JSON, texto; mais de 1 MB = "Too large to preview") e comparação por linhas com o nome da
   secção em cada hunk.
3. **Usa `@domain/text-diff` (2C): não escrevas outro diff.**
4. **O conteúdo dos artefactos vem de agentes: nunca como HTML.**
5. **Não instalas dependências novas.**

**Pronto quando:** no mock, a revisão 5 contra a 4 mostra `implementation-plan.md +9 −3`, `plan-sources.md +2`,
`plan-round-1.md new`, `jira-snapshot.md same`; abrir a mesma comparação duas vezes não repete pedidos; markdown com `<script>`
não executa. Critérios completos na lane 5C do ficheiro da fase.

---

## Depois desta onda

Funde cada lane em `main` quando a tiveres revisto e aprovado. **Quando A a F estiverem em `main`, abre
[paralelos5.md](paralelos5.md).**
