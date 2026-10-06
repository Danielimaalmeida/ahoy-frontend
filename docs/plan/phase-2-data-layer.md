# Fase 2 · Camada de dados

Quatro lanes, sem UI. **2A** e **2C** na Onda 1 (a 1A corre ao lado); **2B** e **2D** na Onda 2. Contexto geral em
[00-overview.md](00-overview.md). Contrato: `openapi/ahoy-v1.yaml` do `ahoy-hosted`.

**Regra transversal.** Tudo o que vem da rede entra como `unknown` e só passa a tipo depois de validado. Falhas de rede,
`4xx/5xx` e respostas com forma errada são **valores** (`ApiResult`), nunca exceções, e **uma falha de tooling nunca se mostra
como veredicto de domínio** (`invalid_response` ≠ `gate_rejected`).

---

## Lane 2A · Cliente da API (M, Onda 1)

**Depende de:** P0. **Possui:** `openapi/**`, `scripts/sync-openapi.mjs`, `scripts/smoke-api.mjs`,
`scripts/capture-fixtures.mjs`, `src/app/core/api/**`, `src/app/core/auth/**`, `src/app/core/config/**`,
`src/testing/fixtures/**`.

**Entregáveis**

1. **Contrato vendored.** `openapi/ahoy-v1.yaml` (cópia, com cabeçalho a dizer o commit de origem);
   `scripts/sync-openapi.mjs [caminho|url]` (omissão `../ahoy-hosted/openapi/ahoy-v1.yaml`); `npm run api:types` gera
   `src/app/core/api/schema.d.ts` com `openapi-typescript`; `npm run api:check` regenera e compara (para o CI).
2. **`ApiClient`** (`HttpClient` com `withFetch`, base `API_BASE`), um método por operação usada nas fases 3 a 6:
   `getHealth`, `listStories`, `startStory`, `getStory`, `stopStory`, `resumeStory`, `setStoryBudget`, `getStoryModels`,
   `setStoryModels`, `listStoryRuns`, `getRun`, `listQuestions`, `answerQuestion`, `listGateRecords`, `decideHumanGate`,
   `getStoryState`, `listArtifacts`, `getArtifactContent` (texto; `If-None-Match`/ETag opcional), `listStoryEvents`.
   Cada um devolve `Promise<ApiResult<T>>`. Os da fase 7 (`resolveConsensus`, `decideWorkPackage`, `reopenWork`,
   `unblockStory`) ficam para essa fase.
3. **`ApiError`**: `{kind:'problem', status, code, title, detail?, errors?, currentVersion?, instance?}` |
   `{kind:'network'}` | `{kind:'invalid_response', what}`. Predicados (`isStale`, `isDecisionAlreadyRecorded`,
   `isAlreadyAnswered`, `isStoryExists`…) e conversão de `errors[].path` em caminhos de controlo de formulário.
4. **Guards** manuais: `isStory`, `isStoryPage`, `isRun`, `isQuestion`, `isGateRecord`, `isArtifact`, `isEvent`,
   `isModelPlan`, `isProblem` e `parseRunProgress(payload)` (união por `kind`: `tool`, `message`, `spend`). Só os campos que a UI
   lê; campos extra são tolerados. Valores AIU e contagens com `Number.isSafeInteger`. `getStoryState` devolve
   `{key, version, state: unknown}` mais um leitor defensivo `readStoryState(state)` →
   `{ criteria, packages, humanGates, revisions, revisionCeiling }` (campos em snake_case como no `state.json`:
   `acceptance_criteria`, `work_packages`, `human_gates`, `revisions`, `revision_ceiling`). **Confirmar os nomes com uma
   resposta real de `--simulate`** (ou registar que não foi possível).
5. **Auth (ponto de extensão).** Token `AuthStrategy` com `headers(): Promise<Record<string,string>>`; `NoAuthStrategy`
   devolve `{}`; um `authInterceptor` aplica-o. **Nenhum `Authorization` hoje.** `CurrentUser` (`id`, `initials`) a partir do
   `AppConfig.actor`.
6. **`AppConfig`** (`apiBase`, `actor`, `jiraBaseUrl?`) lido de `/config.json` no arranque (`provideAppInitializer`);
   `404` ou JSON inválido → omissões. Documentar que `actor` tem de coincidir com o `AHOY_ACTOR` do proxy.
7. **Fixtures** em `src/testing/fixtures/`: um JSON por operação, escritos à mão a partir do OpenAPI e dos dados dos
   wireframes (fictícios). **`contract.spec.ts`** valida cada fixture contra o schema do YAML com Ajv (só em testes).
   `scripts/capture-fixtures.mjs` (opcional, **para o utilizador correr** contra um `--simulate` local) grava respostas reais
   em `src/testing/fixtures/captured/`; nunca committar dados reais sem revisão.
8. **`scripts/smoke-api.mjs`**: contra `http://localhost:4200/api/v1` (via proxy) faz `getHealth`, `startStory` com uma chave
   `DEMO-<n>`, `getStory`, `listStories`. Só contra `--simulate` (0 AIU). Documentar; **não correr em sessões cloud**.

**Aceitação**

- Cada método coberto com `HttpTestingController`: sucesso, `problem+json` (cada `code` do enum), erro de rede, corpo com
  forma errada → `invalid_response`.
- `api:check` limpo; nenhum `any`; os guards rejeitam `spentNanoAiu` fracionário, negativo ou `NaN`.
- `contract.spec.ts` verde.
- `NoAuthStrategy` provado: nenhum pedido leva `Authorization`.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-2-data-layer.md`. Implementa **só a
lane 2A**. Pede aprovação para `openapi-typescript`, `ajv` e `yaml` antes de os instalar. Não escrevas `Authorization` em lado
nenhum. Não corras `smoke-api.mjs` nem `capture-fixtures.mjs` (precisam de uma API local). Sem commit nem push. Relatório em
`docs/progress.md`, incluindo o que **não** correu."

---

## Lane 2B · Tempo real e stores (L, Onda 2)

**Depende de:** 2A, 2C. **Possui:** `src/app/core/realtime/**`, `src/app/core/stores/**`.

**Entregáveis**

1. **`FETCH`** (token; omissão `globalThis.fetch`). Permite trocar por um falso nos testes e no backend falso.
2. **`parseSseStream`** (função pura, assíncrona): quadros `id:`, `event:`, `data:` (várias linhas), comentários
   `: keepalive`, `\r\n`, BOM, campos desconhecidos ignorados, **blocos que cortam uma linha ou um carácter UTF-8 ao meio**.
3. **`EventStreamClient`**: `fetch('/api/v1/events/stream[?story=&after=]')` com `Accept: text/event-stream`, headers do
   `AuthStrategy`, `Last-Event-ID` ao reconectar. Reconexão com recuo exponencial 1 s → 30 s com _jitter_, reposto após 30 s
   estáveis. `401/403/4xx` são **terminais** (`offline`, sem martelar a API); `5xx` e rede reconectam. Depois de 3 falhas
   seguidas em 60 s passa a `degraded` e arranca o polling. `status`: `connecting | live | reconnecting | offline`.
   Cada `data:` passa por `isEvent`; tipos desconhecidos são ignorados.
4. **`EventBus`**: **uma** ligação global (sem `story=`), com contagem de subscritores (abre ao primeiro, fecha ao último),
   `eventsFor(key)`, `lastEventId`. É daqui que a top bar tira o estado Live.
5. **Polling de reserva** (`degraded`): `listStoryEvents?after=` da viagem aberta (3 s) e `listStories` (10 s); termina
   quando o stream recupera.
6. **Stores com signals:**
   - `StoriesStore`: `loadAll()` pagina `limit=500` até `nextCursor = null`; `counts` por estado (e "In port" = `terminal`),
     `needsYou` (`awaiting_input` + `awaiting_decision` + `halted`, **mais antiga primeiro**), `atSea` (`running` + `ready`),
     `find(key)`. Mantém-se por eventos: `story.started` insere; qualquer outro evento da story faz `getStory` (debounce 300 ms).
   - `StoryStore.for(key)`: recursos `story`, `state`, `runs`, `questions`, `gates`, `models`, `artifacts`, `events`, cada um
     `loading | ready | error` com `refresh()`. Só refaz o que alguém observa. Um comando que devolve `202` com a story nova
     atualiza `story` já (a resposta é a verdade).
   - `RunProgressBuffer`: por `runId`, passos (dedupe por `line`), `omitted` e última `spend` (`nanoAiu`, `requests`),
     **marcadores de intervalo** por lote (os passos entre duas `spend`; se `omitted` subiu, o intervalo vai **antes** desse
     lote); limite de retenção 1000; hidratação a partir de `listStoryEvents` para runs já terminados, sob pedido.
   - `StoryEventsFeed`: todos os eventos da story (paginados desde o início, G8), `newestFirst()` sem `run.progress`, atualizado
     pelo stream.
   - Token `CLOCK` (partilhado com a 1B).
7. **Sem dependência de zone.js**; ao destruir, cancela subscrições e aborta o `fetch` (`AbortController`).

**Aceitação**

- `parseSseStream`: tabela de casos com cortes em todas as posições de um quadro (incluindo UTF-8 multibyte).
- Cliente com `fetch` falso e fluxos programados: reconecta com `Last-Event-ID`; `401` termina em `offline` sem repetir;
  `5xx` repete com recuo; 3 falhas → polling; recupera → polling para.
- Dedupe por `line`; `omitted` e intervalos; limite de 1000.
- `StoriesStore`: contagens e `needsYou` ordenados; um evento provoca **um** `getStory` com debounce (relógio falso).
- Memória limitada: buffers e feeds têm teto; nada fica subscrito depois de destruir.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-2-data-layer.md`. Implementa **só a
lane 2B**, sobre a 2A e o `@domain` da 2C. Não uses `EventSource`. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 2C · Domínio puro (S, Onda 1)

**Depende de:** P0. **Possui:** `src/app/domain/**`. **Sem Angular, sem I/O, sem relógio** (o tempo entra por parâmetro).

**Entregáveis**

- **Tipos:** reexporta os de `schema.d.ts` (2A) com nomes de domínio (`Story`, `Run`, `Question`, `GateRecord`, `Artifact`,
  `AhoyEvent`, `ModelPlan`, `SlotModel`…) e `StoryStatus`, `RunStatus`, `GateOutcome`, `ModelSlot`, `ReasoningEffort`.
  Até a 2A integrar, definir o mínimo localmente e trocar depois.
- **`PHASES`** (`intake, planning, plan_review, implementation, pr_review, delivery_gate, done`) + `blocked`; `phaseIndex`;
  `GATE_FOR_PHASE` (`plan_review → plan_accepted`, `delivery_gate → delivery_accepted`) como reserva (G11).
- **`statusPresentation(status, phase)`** → `{label, modifier, api}`: Queued/ready, Under way/running, Crew asks/
  awaiting_input, Your orders/awaiting_decision, Anchored/halted, Docked (`terminal` + `done`), Aground (`terminal` +
  `blocked`); `IN_PORT` = `terminal`.
- **`HALT_REASONS`** e **`explainHalt(reason, detail?)`**: os 9 textos **exatamente** como em `vocabulary.md`
  (`stopped_by_user`, `gate_rejected`, `budget_exhausted`, `run_failed`, `run_lost`, `run_result_invalid`,
  `dispatch_failed`, `revision_ceiling_reached`, `reconciler_error`) e reserva para um motivo desconhecido (mostra o código).
  Versão curta para a coluna "What's needed".
- **`MODEL_SOURCE_LABELS`** (`revision` → "This revision only", `story` → "Chosen for this voyage", `configuration` →
  "Server default", `phase_table` → "Agent config", `agent_profile` → "Agent's own") e `EFFORT_SOURCE_LABELS` (`model_default`
  → "Model's own").
- **`outcomePresentation(value)`**: gate (`pass`, `approve` → done; `branch` → input; `send_back` → sendback; `fail`, `error`,
  `reject`, `halt` → halted; `waiting` → decision) e run (`succeeded` → done; `queued`, `cancelled` → queued; `running`;
  `failed`, `lost`, `timed_out`, `auth_failed`, `output_violation`, `budget_exceeded` → halted).
- **`CREW`**: fase/slot → Navigator, Cartographer, Implementer, "Lookout · design", "Lookout · defects"; reserva: o texto da API (G14).
- **AIU:** `formatAiu(nano, decimals)` por aritmética inteira, `parseAiu(texto)` → `number | null` **sem floats** (aceita
  `25`, `25.5`, rejeita `1e3`, `-1`, mais de 9 casas), `remainingNano`, `budgetPercent`, `capCoversSpent`.
- **Tempo** (`now` por parâmetro): `relativeTime`, `absoluteTime` ("Tue 09:48"), `waitingTime`, `formatDuration`.
- **`text-diff.ts`** (usa `diff`/jsdiff; ainda é TypeScript puro): `diffLines`, `hunks(diff, context)` (3 linhas de contexto;
  o cabeçalho nomeia a secção markdown mais próxima acima: `@@ Summary @@`) e `changedBlocks(prev, next)` (índices dos blocos
  de topo de markdown novos ou alterados). É a **única** implementação: a 4B (realce do plano) e a 5C (comparar artefactos)
  só a consomem. Fica na 2C para não haver dois donos.
- **Outros:** `actorLabel` (`ahoy-reconciler` → "Ahoy"), `STORY_KEY_PATTERN`, `reviewersConflict(plan)`,
  `shortSha(controlSha)` (7), `formatTokens` ("182k").

**Aceitação**

- Testes de tabela para cada função; os textos de `HALT_REASONS`, estados e origens comparados com `vocabulary.md`.
- `parseAiu`/`formatAiu`: ida e volta sem erro de float em 0.1, 12.4, 24.06, 30, 0.000000001; recusa não inteiros em nano.
- `text-diff`: igual, só adições, só remoções, linhas movidas, ficheiro vazio, hunks com contexto, secção do hunk,
  `changedBlocks` (bloco novo, alterado, removido, igual, sem revisão anterior).
- `check-boundaries` confirma que `domain/` não importa Angular nem `core`/`ui`.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-2-data-layer.md`. Implementa **só a
lane 2C**: TypeScript puro, sem Angular, sem I/O, sem relógio. Copia os textos de `docs/design/design-system/vocabulary.md`
sem os reescrever. Pede aprovação para `diff` antes de o instalar. Sem commit nem push. Relatório em `docs/progress.md`."

---

## Lane 2D · Backend falso e fixtures (L, Onda 2)

**Depende de:** 2A, 2C. **Possui:** `src/testing/mock-backend/**`, `src/app/core/mock/**` (providers só de dev),
`src/environments/environment.mock.ts`, e a configuração `mock` do `angular.json` (só acrescentar).

Serve para desenvolver e testar **sem API nem Docker**. É um duplo do contrato, não a fonte de verdade.

**Entregáveis**

1. **`MockAhoyServer`** em memória, determinístico (relógio e ids semeados), a implementar todas as operações da 2A com
   versões e as respostas `201/202` e de erro do contrato: `409 stale_version` (com `currentVersion`),
   `decision_already_recorded`, `already_answered`, `invalid_state`, `story_exists`, `400 validation_failed` (com `errors`) e
   `404`.
2. **Ciclo de vida simulado:** responder à última pergunta → `ready` → run de planning simulado com ticks de `run.progress`
   → nova revisão de `implementation-plan.md` (markdown) → `awaiting_decision`; `send_back` → ronda seguinte (teto 4 →
   `revision_ceiling_reached`); `approve` → fases seguintes avançam depressa até `done`; `reject` → `blocked`; stop, resume,
   budget e models com as regras do contrato (o orçamento não desce abaixo do gasto; revisores com modelos distintos).
3. **`GET /events/stream`** como `ReadableStream`: ids crescentes, `Last-Event-ID` com repetição, `: keepalive`.
4. **Adaptadores:** interceptor de `HttpClient` e um `FETCH` que serve o stream. Só entram na configuração `mock` e em testes.
5. **Interruptores** (query string ou `localStorage` `ahoy.mock.*`): `latencyMs`, `failNext=503`, `conflictNext`, `dropStream`.
6. **Cenários semeados** com os dados dos wireframes (8 viagens): PROJ-123 `plan_review` ronda 2 (2 perguntas respondidas,
   um send-back de jordan, plano rev. 2); PROJ-131 `awaiting_input` (1 de 3 respondidas); PROJ-140 `running` com
   `run.progress` em curso (run r-02, intervalo de 38 passos, uma linha com `[REDACTED]`); PROJ-118 `halted`/`run_failed`
   (com `workerLog`); PROJ-126 `halted`/`stopped_by_user`; PROJ-109 `ready`; PROJ-097 `terminal` done; PROJ-102 `terminal`
   blocked (rejeitada por jordan).
7. **Testes de conformidade:** cada resposta do mock validada contra o YAML com Ajv (como a 2A).
8. **Fora do build de produção:** `fileReplacements`/`environment`; um teste ou script confirma que `dist/` não contém
   `mock-backend`.

**Aceitação**

- `npm run start:mock` arranca; a história completa corre no mock **por chamadas ao `ApiClient`** (set sail → pergunta →
  plano → send-back → aprovação → done) num teste de integração sem browser.
- Conformidade com o OpenAPI verde; um desvio **intencional** do contrato fica documentado em `docs/progress.md`.
- `dist/` de produção sem rasto do mock.

**Prompt:** "Lê `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` e `docs/plan/phase-2-data-layer.md`. Implementa **só a
lane 2D**. O mock não é a API: valida sempre as respostas contra `openapi/ahoy-v1.yaml`. Não entra no build de produção.
Sem commit nem push. Relatório em `docs/progress.md`."
