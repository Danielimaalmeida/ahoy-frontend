# Code review: ahoy-frontend PR #22 (2026-10-10)

Esta revisão foi feita com o skill `code-review`, em dois eixos separados: **Standards** (regras do repo) e **Spec**
(o que foi pedido). Os eixos não estão misturados nem reordenados entre si.

- **PR:** https://github.com/Danielimaalmeida/ahoy-frontend/pull/22. O título é só o nome do ramo e o PR não tem
  descrição.
- **Diff revisto:** `git diff f49c7da...ac26f85`, de `origin/main` ao head do PR. São 6 commits e 68 ficheiros.
- **Revisão irmã:** o PR do backend que define o contrato está em `ahoy-hosted`, em
  `docs/reviews/2026-10-10-pr30-code-review.md`.
- **Spec usada:**
  - não há issue ligada;
  - `docs/architecture.md` (F1–F16), `docs/plan/` e `docs/progress.md`;
  - o contrato e o design §4/§5 do `ahoy-hosted` no head `b58551a`;
  - as mensagens de commit.
- **Números de linha:** referem-se ao head `ac26f85`.

## Como usar numa sessão nova

1. Trabalha no ramo do PR (`claude/tender-johnson-pvbvmu`), não neste ficheiro. Este ficheiro está no ramo
   `claude/tender-johnson-pvbvmu-ovnjb2`, que é o head do PR mais este documento.
2. Antes de corrigir um achado, confirma-o no código atual. Só o achado marcado com ✔ foi confirmado à mão. Os restantes
   vêm dos sub-agentes e não foram confirmados à mão.
3. Usa Node 24 (`npx node@24` se `node -v` for mais antigo).
4. No fim, corre `npm run build && npm run typecheck && npm run lint && npm test && npm run format:check` e atualiza
   `docs/progress.md`.

## O que correu durante a revisão

- **Typecheck e lint:** com `npx node@24` (v24.21.0), `npm run typecheck` (inclui `check-boundaries`) e `npm run lint`
  (eslint e stylelint) passaram.
- **Não correu:** `npm run build`, `npm test` e `npm run format:check`.
- **Nada correu contra uma API:** nem contra `--simulate`, nem contra uma API real.

## Standards

### Verificado sem problemas

- **Escape hatches:** não há `any`, `@ts-*`, `as unknown as`, `vi.mock`, `innerHTML`, `bypassSecurityTrust*`, `enum` nem
  `export default`. Os `@enum` em `schema.d.ts` são gerados.
- **Fixtures:** só têm dados fictícios (PROJ-1xx, `*@example.com`).
- **Docs:** `docs/design/` não foi tocado. `progress.md` e a secção "Status" do README foram atualizados.

### Violações de regras documentadas

1. **Moderada: código partilhado entre features foi copiado.** A regra violada é a do CLAUDE.md, "Code": "what two
   features share moves to `core` or `ui`".
   - `maxTrimmed` e `requiredText` em `features/docks/refinement-dialogs.ts:53` e `:66` são cópias de
     `features/voyage/dialogs/dialog-support.ts:23,30`.
   - `serverFieldError`, em `refinement-dialogs.ts:116`, repete `CommandState.fieldError` (`dialog-support.ts:70`).
2. **Leve, de estilo.** O CLAUDE.md "Style" pede linhas até cerca de 120 colunas, e o Prettier não reformata
   comentários.
   - `voyage/dialogs/voyage-dialogs.ts:13` tem 132 colunas.
   - `harbour/row-details.ts:159` tem 124 colunas.
   - O comentário em `voyage/header/voyage-header.ts:20` ficou mal quebrado ("...and Stop, the" seguido de uma quebra
     de linha).
3. **Processo.**
   - O histórico inclui o commit `4d4c8b3 "WIP ... (uncompiled)"`. Deve ser squashed antes do merge.
   - O ramo não segue `lane/<id>-<slug>` (CLAUDE.md, "Start", ponto 3), e não há fase de plano que dê posse dos
     diretórios tocados.
   - O título do PR é só o nome do ramo e o PR não tem descrição.

### Smells (heurísticos, não são violações)

- **Possível Duplicated Code.** Há duas implementações que leem `getStoryDiagnosis` e descartam respostas obsoletas:
  - `voyage/header/halt-diagnosis.ts:46` controla por `generation`;
  - `harbour/row-details.ts:141-164` controla por `asked` e versão.
  - Candidato a helper partilhado em `core`.
- **Possível Primitive Obsession.**
  - `domain/diagnosis.ts:13` declara `readonly kind: string`, apesar de existir `DiagnosisKind`.
  - `voyage/header/primary-action.ts:50` declara `REFRESHABLE_PHASES: readonly string[]`.
  - `testing/mock-backend/diagnosis.ts:15` usa `RULES: Record<string, ...>` em vez de `HaltReason`.
- **Possível Mysterious Name / Middle Man.**
  - `docks.ts:1030` define `refinementLabel(refinement)`, que só delega em `refinementStateLabel`. Esconde o export
    homónimo `refinementLabel(status)` em `backlog-refinements.ts:20`: os dois têm o mesmo nome e fazem coisas
    diferentes.
- **Possível Feature Envy / Data Clump.**
  - `RefineDialogData` e `CancelRefinementDialogData` (`refinement-dialogs.ts:133,273`) passam o serviço
    `BacklogRefinements` dentro de `DIALOG_DATA`.
  - `checkRefinementCap` (`:36`) é parsing puro de AIU e caberia em `domain/aiu`.
- **Possível Repeated Switches.** `isActiveRefinement` (`backlog-refinements.ts:15`) e `refinementLabel` (`:20`) decidem
  cada um sobre `RefinementStatus`. Um único mapa por estado juntaria as duas decisões.
- **Possível Mysterious Name.** Em `harbour/needs.ts:141-146`, os nomes `haltNeeded` e `haltReasonNeeded` não deixam
  perceber a diferença entre os dois.
- **Valor mágico.** Em `questions-tab.ts:378-386`, `historyView` usa `round: 0` como sentinela de "histórico" e recalcula
  `percent` à mão.

**Suprimido, porque o repo o endossa:** o `DiagnosisActor` duplicado entre `domain/types.ts:80` e
`core/api/types.ts:114`. Este espelho de tipos é verificado por `domain-types.spec.ts:26`.

## Spec

### Contrato

O openapi vendorizado é semanticamente idêntico ao do backend `b58551a` (comparado com um parse YAML profundo). Há só duas
diferenças:

- as aspas, por causa do Prettier;
- o exemplo de JQL, que foi redigido de propósito.

O `src/testing/fixtures/openapi.json` corresponde ao YAML.

### (a) Requisitos em falta ou parciais

- **Conformidade.** O commit 7b08164 diz que o diagnóstico é chamado "everywhere". O `getStoryDiagnosis` é chamado
  (`conformance.spec.ts:85,158`), mas não está na lista de operações exigidas (`conformance.spec.ts:267-291`). Se a rota
  deixar de ser chamada, o teste não o deteta.
- **O `docs/progress.md` contradiz-se.**
  - A linha 26 diz "Checked in headless Chromium" e a linha 33 diz "Not run: a browser session".
  - A secção "Halt diagnosis" não tem "Needs from other lanes", que o CLAUDE.md exige ("Needs from lane X").
- **`npm run start:mock` não existe no `package.json`.** O CLAUDE.md manda usá-lo. A falha está registada em
  `progress.md` ("Found"), mas não foi corrigida.

### (b) Comportamento que não foi pedido (scope creep)

- **Nada de relevante.** A mudança de `.docks__actions a` para `> *` (`docks.ts:322,382`) e o tratamento de
  `supersededAt` em Voyages, Needs e Plan vêm do contrato.
- **Nota:** as alterações não estão numa lane com posse dos diretórios tocados (CLAUDE.md: "Only edit the directories
  your lane owns").

### (c) Implementado, mas com sinais de erro

1. **Corrida em `BacklogRefinements.load()` ✔** (`features/docks/backlog-refinements.ts:113-116`).
   - Uma leitura da lista que já estava em curso substitui o `latestByKey` inteiro. Isso apaga o refinamento que
     `accept()` acabou de inserir a seguir a um `request()`.
   - Se nessa resposta nada estiver ativo, `schedule()` cancela o polling (`:233-236`).
   - A linha volta a mostrar "Refine", e o refinamento em fila deixa de ser acompanhado.
   - Isto contraria a spec: "polled every 5 s only while a refinement is queued or running".
   - Correção provável: ignorar respostas mais antigas do que o último `accept()` (por geração ou contador), ou juntar
     a resposta com as entradas aceites localmente.
2. **`HaltDiagnosis` relê sempre que muda o objeto `story`** (`halt-diagnosis.ts:37-43`).
   - O comentário em `:16` diz que só volta a ler "again when its version moves".
   - O `RowDetails` faz isto bem, por versão (`row-details.ts:141-157`).
3. **Acessibilidade** (`docks.ts:704-720`).
   - O botão "Refinement · <estado>" não inclui a chave do item no nome acessível, ao contrário de "Refine", que tem
     `aria-label="Refine KEY"`.
   - Por isso, várias linhas ficam com nomes iguais, por exemplo "Refinement · Refined".
4. **`canRefreshIntake`** (`primary-action.ts:56-66`).
   - Usa `context.runs()`, que é `[]` antes de ser lido. O botão pode aparecer por instantes antes de se saber que já
     houve implementação.
   - A spec diz "before implementation has ever started".
   - O impacto é baixo, porque o backend responde 409.

### Conforme à spec

- **Gasto:** o `confirmSpend: true` é enviado através de um diálogo explícito.
- **Limite opcional:** é lido com `parseAiu` como nano-AIU inteiro e tem de ser ≥ 1, conforme `minimum: 1`.
- **Nota e razão de cancelamento:** a nota (máximo de 2000 caracteres, `\S`) e a razão de cancelamento obrigatória
  respeitam o contrato.
- **Erros:** 409 e 503 têm mensagens próprias.
- **Markdown:** é renderizado através de `ah-markdown`.
- **Refresh-intake:** exige razão e tem `expectedVersion`. Fica bloqueado sem orçamento, o que corresponde a
  `spent >= budget → invalid_state`.
- **Diagnóstico:** aparece no banner "Anchored" e em "Needs you".

## Resumo

- **Standards:** 3 violações e cerca de 8 smells. A pior são os helpers de diálogo copiados entre features.
- **Spec:** 3 requisitos em falta ou parciais e 4 com sinais de erro. O pior é a corrida em
  `BacklogRefinements.load()`, que deixa de acompanhar um refinamento em fila.

## Checklist sugerida (por ordem)

- [ ] Corrigir a corrida em `BacklogRefinements.load()` e acrescentar um teste com um relógio e uma API falsos: uma
      leitura da lista fica pendente durante um `request()` e resolve-se a seguir.
- [ ] Fazer o `HaltDiagnosis` reler só quando a versão muda, como o `RowDetails`.
- [ ] Pôr a chave do item no nome acessível do botão "Refinement · <estado>".
- [ ] Esconder `canRefreshIntake` até os runs terem sido lidos.
- [ ] Mover `maxTrimmed`, `requiredText` e `fieldError` para `core` ou `ui` e reutilizá-los nos dois diálogos.
- [ ] Acrescentar `getStoryDiagnosis` à lista obrigatória de `conformance.spec.ts`.
- [ ] Corrigir a contradição no `progress.md`, acrescentar "Needs from other lanes" e acrescentar ou documentar
      `start:mock`.
- [ ] Corrigir as linhas compridas e o comentário mal quebrado.
- [ ] Antes do merge: fazer squash do commit WIP, e dar ao PR um título e uma descrição.
- [ ] Opcional (smells): usar `DiagnosisKind` e `HaltReason` em vez de `string`, dar outro nome a `refinementLabel`,
      criar um mapa único por `RefinementStatus` e tirar o sentinela `round: 0`.
