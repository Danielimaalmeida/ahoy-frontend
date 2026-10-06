# Fase 4 · A viagem: header, diálogos, plan review, questions, models

**4A** corre na Onda 3 (ao lado da fase 3) e é **a base de todas as tabs**. **4B, 4C e 4D** correm na Onda 4, em paralelo com
a fase 5, depois de a 4A estar integrada. Contexto geral em [00-overview.md](00-overview.md).

Quadros: `PlanReview`, `Questions`, `Running`, `Halted`, `Dialogs`, `States` em `docs/design/wireframes/`.

**Regras da fase.** Toda a viagem lê de `VoyageContext` (4A), nunca chama o `ApiClient` diretamente para a story. Todo o comando
passa pelo `CommandRunner`. As tabs vivem em `src/app/features/voyage/tabs/<tab>/`, uma lane por tab; podem importar o que é
**da mesma feature** (`voyage/`), nunca outra feature.

---

## Lane 4A · Shell da viagem, header, ações e diálogos (L)

**Depende de:** 1B, 1C, 2B, 2D. **Possui:** `src/app/features/voyage/{shell,header,context,dialogs}/**`,
`src/app/features/voyage/voyage.routes.ts`, `src/app/core/commands/**`.

**Entregáveis**

1. **`VoyageContext`** (serviço por rota `/voyages/:key`): sinais `story`, `version`, `state` (via `readStoryState`),
   `models`, `gateKey` (G11), `revisionRound`/`revisionCeiling` (G10), `isOwner`, `stoppedAt` (G12), `counts` das tabs
   (questions, runs, gates), `lastHalt` (último `story.halted`, G7), `refresh()`. Estados `loading | ready | error | notFound`.
2. **`CommandRunner`** (`src/app/core/commands/`): `run(fn)` com a `version` atual; devolve `ok` ou um estado de
   **conflito** (`stale`, `decided`, `answered`, `other`), mantém `pending` (sem duplo envio) e, em `stale`, refresca a story.
   É a implementação do [§5.5](00-overview.md#55-comandos-concorrência-e-erros--ux): o texto escrito **nunca** se perde.
3. **Shell** em `/voyages/:key`: breadcrumb "Voyages / PROJ-123"; **header** em painel:
   - linha 1: chave (`ah-key`), `ah-status-badge` com `showApi`, e a palavra da API composta (`awaiting_decision ·
plan_accepted`, `halted · run_failed`); título H1 (se `title` for `null`, a chave);
   - ações à direita: **primária por estado** (tabela abaixo), **Budget**, **Models**, **Stop** (danger-outline);
   - `ah-phase-stepper` completo (`stopped` em halt e blocked);
   - meta: Owner · billed, Budget (medidor 120 px, "12.4 / 30 AIU"), Current run ("none · last r-04" / "r-02 · Cartographer" /
     "none · last r-03 (failed)", ligação ao run), Revision round ("2 of 4", só quando há gate aberto ou ronda > 0), Agent
     config (sha curto, completo no `title`).
4. **Ação primária por estado:**

   | Estado              | Primária                                        |
   | ------------------- | ----------------------------------------------- |
   | `awaiting_input`    | **Answer questions** → tab Questions            |
   | `awaiting_decision` | **Decide on the plan** (ou "Decide") → tab Plan |
   | `halted`            | **Resume…** → diálogo; ver banner abaixo        |
   | `running`, `ready`  | nenhuma (só Budget, Models, Stop)               |
   | `terminal`          | nenhuma; Stop, Budget e Resume não aparecem     |

5. **Banner "Anchored"** (`halted`), por baixo do header: ícone âncora, título "Anchored: {explicação}", corpo em linguagem
   simples (`explainHalt` + `detail` do evento), **"To get under way again: …"** por motivo (texto em
   `header/halt-guidance.ts`, com testes), e a **linha técnica** `reason · runId · phase · há quanto tempo · "detail"`.
   `workerLog` (≤ 4 KB, últimas 20 linhas) numa área recolhida em `<pre>`, **só texto**. Botões: com `run_failed`,
   **Change planning model** (leva a `…/models?change=<slot>`; a 4D abre o diálogo) e **Resume as is**.
6. **Tabs** (`ah-section-tabs`, por rota): Plan, Questions {n}, Runs {n}, Gates {n}, Artifacts, Ship's log, Models. A tab por
   omissão do [§5.3](00-overview.md#53-rotas) quando se abre `/voyages/:key`. Cada tab renderiza num `<router-outlet>`; as lanes
   4B–5C só preenchem os seus componentes.
7. **Diálogos** (sobre `ah-dialog`), todos com o texto do quadro `Dialogs` e `CommandRunner`:
   - **Stop** — "Drop anchor on PROJ-140?": "The voyage halts in {phase}. {Crew}'s run {r-02} is cancelled in the background;
     the {1.84} AIU it has used stays spent." (a segunda frase só se houver run ativo). **Reason \*** (≤ 2000, "Shown to the
     crew on the voyage. Recorded as {actor}."). Botões "Keep sailing" e **"Stop voyage"** (danger). `stopStory`.
   - **Resume** — "Weigh anchor and resume?": "Ahoy retries {phase} with {Crew} on {model · effort}." Caixa de custo
     `ah-cost` **"This may spend up to {restante} AIU"** — "The rest of the voyage's {orçamento} AIU budget, billed to
     {owner}'s Copilot account. Anyone can stop it again." Reason (opcional, ≤ 2000). Botão **"Resume · up to {restante} AIU"**.
     Se `restante = 0`: sem confirmação possível e aviso "No budget left: raise the budget first." `resumeStory`.
   - **Budget** — "Change the budget": "Spent so far {12.4} of {30} AIU"; **New total cap \*** (AIU, `parseAiu`); erro "At least
     {gasto} AIU, what's already spent."; Reason \* (≤ 2000); caixa "Allows up to {delta} AIU more · Billed to {owner}. Raising
     the budget doesn't resume an anchored voyage."; nota "An active run keeps the cap it started with." Botão **"Set cap to
     {X} AIU"**. `setStoryBudget`.
   - Após sucesso: toast no passado, store atualizado pela resposta `202`.
8. **Estados da página:** skeleton do header; `404` → "This voyage doesn't exist" com ligação a Voyages; erro de rede →
   padrão "Lost contact with the harbour" (6A refina).

**Aceitação**

- No mock, cada uma das 8 viagens mostra o header, a ação primária e o banner certos (halted com `run_failed` e com
  `stopped_by_user`, running, awaiting\_\*, terminal done e blocked).
- Stop, Resume e Budget enviam o corpo exato (`expectedVersion` = versão vista) e atualizam a página sem recarregar.
- **Conflito:** com `conflictNext` ligado, o diálogo fica aberto, mostra o banner "This voyage changed since you opened it",
  refresca a story e **mantém o texto**; reenviar com a versão nova funciona. Duplo clique envia um pedido.
- Budget abaixo do gasto: erro no campo, sem pedido. Resume sem orçamento: bloqueado.
- `halt-guidance` testado para os 9 motivos e um desconhecido.
- Tema claro e escuro e 390 px, comparados com `PlanReview` (header), `Halted` (banner) e `Dialogs`.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-4-voyage-core.md`. Implementa **só a
lane 4A**: a base de todas as tabs (`VoyageContext`, `CommandRunner`, header, banner, tabs por rota, diálogos stop/resume/
budget). Deixa as tabs como placeholders. O texto escrito pelo utilizador nunca se perde num conflito. Compara com os quadros
`PlanReview`, `Halted` e `Dialogs`. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 4B · Plan review e decisão (L)

**Depende de:** 4A. **Possui:** `src/app/features/voyage/tabs/plan/**`.

Quadro `PlanReview`; diálogos `Send back` e `Reject` do quadro `Dialogs`; estados do quadro `States`.

**Entregáveis**

- **Plano** (`getArtifactContent('implementation-plan.md')`) em `ah-markdown`, painel "Implementation plan" com a tag
  `revision {n}` (n = `revisions[gate] + 1`), "by {Crew} · run {r-04} · {há quanto tempo}" e a ligação **"Compare with
  revision {n−1}"** (→ tab Artifacts, 5C). **Sem plano ainda** (`404`): estado vazio "No plan yet".
- **Realce das alterações:** `changedBlocks(anterior, atual)` de `@domain/text-diff` (2C), com o plano da revisão anterior
  **em que o conteúdo mudou** (sondar no máximo 5 revisões para trás com `getArtifactContent?revision=`); os índices vão para
  `ah-markdown` (`ah-mark`). Legenda: "Highlighted blocks changed since the last plan revision."
- **Painel "Acceptance criteria"** (`state.acceptance_criteria`: id e texto) com a contagem.
- **Painel "Your decision"** (palavra da API `plan_accepted`; `gateKey` do contexto):
  - `ah-choice-card-group` **Approve** ("The voyage moves on to implementation."), **Send back** ("{Crew} revises the plan.
    This would be round {n+1} of {teto}."), **Reject** ("The voyage runs aground (blocked). This can't be undone here.");
  - Reason: **"Reason for Cartographer \***" (obrigatório em send back e reject; ≤ 5000), "Recorded as {actor}.";
  - caixa: "The revision runs on **{model · effort}** · {origem} for planning · **Change**" (→ `…/models?change=planning`) e
    "Spends from the remaining {restante} AIU, billed to {owner}.";
  - botão com o rótulo da escolha: **Approve plan** → `decideHumanGate` **direto**; **Send back to {Crew}** e **Reject plan**
    abrem o diálogo respetivo.
- **Diálogo Send back:** "Send the plan back to Cartographer", "This starts revision round {n+1} of {teto}. After round {teto}
  the voyage anchors and needs a person to decide.", campo **"What should change \*"** (traz o texto já escrito), linha do modelo,
  custo, botão "Send back".
- **Diálogo Reject** (`danger`): "Reject the plan?" "The voyage runs aground. It becomes blocked and no crew member works on
  it again. Use Send back if the plan only needs changes." Reason \*; botão **"Reject plan"**.
- **Painel "Earlier round":** o último send-back humano de `listGateRecords` (quem, quando, motivo entre aspas) e a ligação
  "{n} questions answered before this plan" (→ Questions).
- **Só leitura** quando não há decisão aberta: o painel de decisão dá lugar a "No decision needed now" ou ao resultado
  ("Approved by {quem} · {quando}"). Gate desconhecido (não `plan_accepted`): painel genérico com o `gateKey`, as mesmas três
  escolhas e a nota de que o resumo desse gate chega na fase 7.
- **Conflitos:** `stale_version` → banner "This voyage changed since you opened it", texto mantido, "Send back again";
  **`decision_already_recorded`** → painel "{actor} already {approved|sent back|rejected} this plan": "Your send-back wasn't
  recorded. The voyage moved on to {fase}. Your text is kept below in case you want to raise it with the crew." com **Copy my
  text** (Clipboard API em `try/catch`) e **See the decision** (→ Gates); `revision_ceiling_reached` → banner `error` simples.
- Toast no passado após cada decisão ("Plan sent back to Cartographer. Round 3 of 4 is under way.").

> Nota: o diff e o cálculo de blocos alterados vivem em `@domain/text-diff` (**lane 2C**). A 4B só os consome; se faltarem,
> escreve a falta em `docs/progress.md` ("Needs from lane 2C") em vez de criar uma segunda implementação.

**Aceitação**

- Contra o mock, PROJ-123: plano rev. 2 com os blocos alterados realçados; os 5 AC; "Earlier round" com o send-back de jordan.
- **Send back:** o pedido é `{gate:"plan_accepted", decision:"send_back", reason, expectedVersion}`; o texto escrito no painel
  chega ao diálogo; depois, a viagem passa a "Under way" e o plano mostra a ronda 3.
- **Reject** exige motivo; Approve envia sem diálogo; **Send back/Reject sem motivo não enviam**.
- `decision_already_recorded` com `conflictNext`: o painel mostra o texto, "Copy my text" copia, "See the decision" navega.
- Teto: na ronda 4 o texto explica o que acontece depois; o mock devolve `revision_ceiling_reached` e a UI mostra-o.
- Testes da escolha da revisão de comparação (sondagem até 5 revisões, plano sem revisão anterior, `404`).

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-4-voyage-core.md`. Implementa **só a
lane 4B** (tab Plan e decisão), sobre o `VoyageContext` e o `CommandRunner` da 4A e o `@domain/text-diff` da 2C. Approve não
tem diálogo; Send back e Reject têm. **Nunca** aprovar nem rejeitar nada fora do mock ou de `--simulate`. Compara com os
quadros `PlanReview`, `Dialogs` e `States`. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 4C · Questions (M)

**Depende de:** 4A. **Possui:** `src/app/features/voyage/tabs/questions/**`.

Quadro `Questions`.

**Entregáveis**

- Lista de `listQuestions`, agrupada por `round`: a ronda mais recente aberta, as anteriores recolhidas (`<details>`).
  Cabeçalho **"Round {r} · {Crew} asks"** (o agente vem do run da pergunta, `runId`, ou da fase), "{k} of {n} answered" e medidor.
- **`ah-question-card`** por pergunta: `Q1` em mono, badge **Answered** (com cadeado "Final", quem e quando, texto) ou **Needs an
  answer** (anel); a recomendação do agente com **Use recommendation** (copia para o campo, não envia); textarea "Your answer";
  botão **Send answer** (desativado sem texto, 1 a 20 000 caracteres, com `trim`); dica "Answers are final once sent: they
  can't be edited. Recorded as {actor}." `answerQuestion` com `expectedVersion`.
- **Rascunhos:** cada resposta por enviar guarda-se em memória e em `sessionStorage` (`ahoy.draft.{key}.{Qn}`, em
  `try/catch`); só se apaga ao enviar. Um conflito, um refresh do store ou um refresh da página não os perdem.
- **Painel lateral "What happens next":** "When every question in this round is answered, the voyage is queued and {Crew}'s next
  run reads all the answers." e "That run spends from the remaining {restante} AIU, billed to {owner}, on {model · effort}."
  (de `getStoryModels`, slot da fase). "Anyone on the crew may answer. There's no chat with the agent: the answer is the whole
  message."
- Toasts: "Answer to Q2 sent. 1 question left." / "Answer to Q3 sent. All questions answered: {Crew} is queued."
- **Conflitos:** `stale_version` (banner, texto mantido); **`already_answered`** → o cartão passa a mostrar a resposta de quem
  respondeu primeiro e o texto do utilizador continua visível por baixo.
- Sem perguntas: estado vazio "No questions" (tab com contagem 0).

**Aceitação**

- No mock, PROJ-131: Q1 respondida (final, bloqueada), Q2 aberta com recomendação, Q3 aberta. "Use recommendation" preenche mas
  não envia. Enviar Q2 → toast "1 question left"; enviar Q3 → toast "All questions answered", a viagem passa a Queued/Under way
  sem recarregar.
- O rascunho de Q3 sobrevive a recarregar a página e a um conflito; é apagado depois de enviado.
- `already_answered` forçado no mock: aparece a resposta do outro e o texto mantém-se.
- Testes: contagem "k of n", agrupamento por ronda, limites de comprimento, botão desativado, rascunho.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-4-voyage-core.md`. Implementa **só a
lane 4C** (tab Questions). As respostas são finais: nunca envies sem clique explícito e nunca respondas a perguntas fora do
mock ou de `--simulate` (se testares com `--simulate`, escreve "POC test answer, not a product decision"). Compara com o quadro
`Questions`. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 4D · Models (M)

**Depende de:** 4A. **Possui:** `src/app/features/voyage/tabs/models/**`.

Quadros `Halted` (tabela Models) e `Dialogs` (Change models).

**Entregáveis**

- **Tabela "Models per phase"** (`getStoryModels`): Phase, Crew member, **Next run gets** ("model · effort", ou "model · default"),
  Model from, Effort from (tags `ah-source` com `MODEL_SOURCE_LABELS`/`EFFORT_SOURCE_LABELS`; `chosen` destacado), **Chosen
  for this voyage**, ações **Change** e **Reset** (só nos slots com `chosen`). Cinco linhas: `intake`, `planning`,
  `implementation`, `review-design`, `review-defect`. Rodapé: "Sources, strongest first: this revision only · chosen for this
  voyage · server default · agent config (pinned) · the agent's own profile. A model chosen without an effort runs at its own
  default effort. The two Lookouts must use different models."
- **Marca "refused last run"** numa linha quando a viagem está `halted` com `run_failed`, o último run dessa fase falhou e usou
  o mesmo modelo.
- **Diálogo "Change models"** (`ah-model-choice-table` dentro de `ah-dialog`): uma linha por slot, modelo (mono) e esforço;
  "Blank means the default. Changes apply from each phase's next run." Motivo opcional (≤ 2000). Botão "Save models". O pedido leva
  **só os slots alterados**; um slot a "default" vai `null`; uma escolha nunca é um objeto vazio (`minProperties: 1`).
  Um modelo sem esforço vai só `{model}`.
- **Erro dos revisores:** comparar os modelos **efetivos** depois da alteração (os atuais, de `getStoryModels`, para os slots
  não tocados); se coincidirem, "The two Lookouts must use different models: both would run on {modelo}." **nas duas linhas**
  e o botão bloqueado. Se um deles voltar a "default" (desconhecido), deixar o servidor decidir e mostrar o `400` na linha
  certa (`errors[].path`).
- Aviso junto ao botão: "A change applies from that phase's next run; an active run keeps its model."
- **Abre sozinho** com `?change=<slot>` (usado pelo banner Anchored e pelo painel de decisão), com o foco nesse slot.
- Depois de gravar: toast "Models saved. Applies from each phase's next run.", tabela atualizada pela resposta `202`.
  Em halt, o banner Anchored (4A) já tem "Resume…"; o diálogo Resume mostra o modelo novo.

**Aceitação**

- No mock, PROJ-118: a linha `planning` com "refused last run"; mudar `planning` para `claude-sonnet-5` / `high` envia
  `{expectedVersion, models:{planning:{model:"claude-sonnet-5", reasoningEffort:"high"}}}`; Reset envia `{planning:null}`.
- Revisores iguais: erro nas duas linhas, sem pedido; um conflito `stale_version` mantém o que foi escrito.
- `?change=planning` abre o diálogo com o foco na linha certa.
- Testes: construção do corpo (só alterados, `null`, só `model`), deteção de revisores iguais com efetivos.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-4-voyage-core.md`. Implementa **só a
lane 4D** (tab Models e o diálogo Change models). O pedido leva só os slots alterados; `null` repõe o default; nunca um objeto
de escolha vazio. Compara com `Halted` e `Dialogs`. Sem commit nem push. Relatório em `docs/progress.md`."
