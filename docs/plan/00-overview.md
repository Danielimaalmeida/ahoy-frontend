# Ahoy frontend · plano de implementação (Angular 22)

Estado: **proposta de 2026-10-06, para aprovação.** Nada foi implementado, instalado ou commitado. Escrito a partir dos
wireframes e do design system criados hoje no Claude Design, do contrato `openapi/ahoy-v1.yaml` do `ahoy-hosted` e dos
docs desse repositório (`README.md`, `docs/ui-design-brief.md`, `docs/strategy.md`).

**Como usar este plano**

1. Ler este ficheiro e responder às perguntas do [§12](#12-perguntas-antes-de-lançar-a-onda-0).
2. Lançar a **Onda 0** ([fase 0](phase-0-foundation.md)): um agente, bloqueia tudo o resto.
3. Lançar as lanes de cada onda em paralelo ([§8](#8-fases-lanes-e-ondas)). Cada fase tem o seu ficheiro, com lanes
   autónomas e um **prompt pronto a colar** num agente.
4. Cada lane regista o que fez e o que provou em `docs/progress.md` (criado na fase 0).

| Ficheiro                                                     | Conteúdo                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| [phase-0-foundation.md](phase-0-foundation.md)               | Scaffold Angular 22, tooling, proxy, esqueleto, docs, design     |
| [phase-1-design-system.md](phase-1-design-system.md)         | Tokens, estilos, ícones e os 22 componentes do design system     |
| [phase-2-data-layer.md](phase-2-data-layer.md)               | Cliente da API, tempo real, stores, domínio puro, backend falso  |
| [phase-3-harbour.md](phase-3-harbour.md)                     | Shell, All hands, Voyages, Set sail, The Docks                   |
| [phase-4-voyage-core.md](phase-4-voyage-core.md)             | Página da viagem, diálogos, Plan review, Questions, Models       |
| [phase-5-records-and-runs.md](phase-5-records-and-runs.md)   | Runs, run detail, passos em direto, Gates, Ship's log, Artifacts |
| [phase-6-hardening-release.md](phase-6-hardening-release.md) | Estados, a11y, e2e, imagem e configuração de release             |
| [phase-7-delivery-phases.md](phase-7-delivery-phases.md)     | Fases após `plan_review` (sem wireframes ainda): esboço          |

---

## 1. Âmbito

**Dentro.** O front-end web do Ahoy, em Angular 22, a falar com a API `/api/v1` do `ahoy-hosted`. Os 12 quadros dos
wireframes: _All hands_ (inbox), _Voyages_ (lista), _The Docks_ (backlog, planeado), _Set sail_ (iniciar story), a página
de uma viagem (plan review, questions, running, halted, gates, artifacts, ship's log, models), run detail, diálogos
(stop, resume, budget, models, send back, reject) e os estados (vazio, loading, erro, conflito).

**Fora, por agora.**

- **Autorização.** A app não envia `Authorization`. Quem trata disso é o utilizador, mais tarde; o código deixa um ponto de
  extensão pronto (`AuthStrategy`, [§5.6](#56-aiu-tempo-e-identidade)). Atenção: localmente a API tem de correr com
  `AHOY_AUTH=dev`, que exige o header `X-Ahoy-Actor`. **Esse header é acrescentado pelo proxy do dev server, não pelo código
  da app.**
- **Backlog real do Jira.** Não existe na API (`docs/progress.md` do hosted, item 9). _The Docks_ fica atrás de uma interface
  com dados de exemplo e a nota "planned" que o wireframe já tem.
- **Ecrãs das fases `implementation`, `pr_review` e `delivery_gate`.** A API já os suporta, mas não há wireframes. O brief diz
  "mostrar as fases no indicador, sem ecrãs dedicados". [Fase 7](phase-7-delivery-phases.md) é só um esboço.
- O que a API não suporta e o brief proíbe: editar planos, chat com agentes, apagar stories, retry que não seja `resume`.

## 2. Fontes de verdade

| O quê                   | Onde                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wireframes (12 quadros) | Claude Design "Ahoy UI wireframes", <https://claude.ai/artifact/LTbtxVqPbLAodmy4Vr44dY>, versão `1791303315-8e37`                                                                                 |
| Design system           | Claude Design "Ahoy", <https://claude.ai/artifact/LAzfVgbze8zdoaShrSabtf>, versão `1791303933-1d4d`: `README.md`, `vocabulary.md`, `tokens.json`, 22 componentes (CSS `ah-*`), 16 ícones, 3 logos |
| Contrato da API         | `ahoy-hosted/openapi/ahoy-v1.yaml` (1.0.0-poc) e o README do hosted, §2 e "A running agent's progress"                                                                                            |
| Brief funcional         | `ahoy-hosted/docs/ui-design-brief.md` (ações 1 a 15)                                                                                                                                              |
| Front-end ↔ API         | `ahoy-hosted/docs/strategy.md` §2.2 (sem CORS, proxy, SSE com `fetch`)                                                                                                                            |

A fase 0 copia as referências de design para `docs/design/` (para os agentes não dependerem de acesso aos artefactos).

**Precedência quando há conflito:** contrato da API > `vocabulary.md` e `tokens.json` > wireframes (o que mostrar e onde)

> brief. Os wireframes dizem **o que** aparece; o design system diz **como** se constrói: usar as classes `ah-*` do
> `bundle.css`, não o CSS ad hoc de cada quadro.

> Não usei o canvas "Ahoy UI" (de 2026-10-05), que parece uma versão anterior, nem o "Ahoy Path Map". Se o certo for outro,
> avisar antes da Onda 0.

## 3. Decisões técnicas (propostas)

| #   | Decisão                                                                                                                                                                                                                                                        | Porquê                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| F1  | **Angular 22.2.x** (`latest` no npm é 22.2.1), standalone, `@angular/build`. **Zoneless com signals** (confirmar os defaults do `ng new` 22.x). **Node `^22.22.3 \|\| ^24.15.0 \|\| >=26`** e **TypeScript `>=6.0 <6.1`**, que são o que o Angular 22 declara. | O ambiente cloud de hoje tem Node 22.22.0, que o Angular 22 recusa. A fase 0 fixa `.nvmrc` em 24 e verifica.      |
| F2  | **Sem biblioteca de UI** (nem Material nem Tailwind). CSS do design system (`tokens.css` + `bundle.css`) e wrappers Angular finos. `@angular/cdk` só para Dialog, overlay e a11y.                                                                              | O DS é feito de classes CSS `ah-*` e diz "use CDK Dialog". Densidade 13px/38px não é a de Material.               |
| F3  | **Rotas lazy por feature; o URL é o estado** (filtro de estado, tab, query de _Set sail_).                                                                                                                                                                     | Ligações partilháveis; as tabs do DS são route-driven.                                                            |
| F4  | **Estado com signals e serviços.** Sem NgRx.                                                                                                                                                                                                                   | A app é leitura + comandos; o servidor é a fonte de verdade.                                                      |
| F5  | **Refetch por evento, não patch local.** Um evento do stream marca o recurso como velho e refaz o GET (debounce 300 ms). Todo o comando leva `expectedVersion`.                                                                                                | Mais simples e correto: a API versiona tudo; evita divergências.                                                  |
| F6  | **Um stream SSE global lido com `fetch`** (não `EventSource`), `Last-Event-ID` ao reconectar e fallback para polling.                                                                                                                                          | `EventSource` não envia headers (`401` no TEST). `fetch` deixa pôr o `Authorization` mais tarde sem mexer na app. |
| F7  | **Tipos gerados do OpenAPI** (cópia vendored) **+ guards manuais** no limite; erros como valores (`ApiResult`), nunca exceções.                                                                                                                                | CLAUDE.md: dados externos são `unknown` até validados; falha de tooling não pode parecer veredicto.               |
| F8  | **Sem auth agora; `AuthStrategy` como ponto de extensão.** `X-Ahoy-Actor` só no proxy do dev server.                                                                                                                                                           | Pedido do utilizador; a API local corre em `AHOY_AUTH=dev`.                                                       |
| F9  | **Mesma origem:** a app chama sempre `/api/v1` relativo. A API não tem CORS e no TEST o Ingress já encaminha `/api/v1` para a API e `/` para o front-end.                                                                                                      | Verificado em `docs/strategy.md` §2.1; não exige alterações à API.                                                |
| F10 | **Reactive Forms tipados.**                                                                                                                                                                                                                                    | É o que o README do componente `Field` recomenda.                                                                 |
| F11 | **Vitest** (o runner do Angular CLI via `@angular/build`) para unit e componentes; **Playwright** para e2e.                                                                                                                                                    | Conflita com o CLAUDE.md copiado do hosted (`node:test`): ver [§4](#4-claudemd-do-frontend).                      |
| F12 | **Markdown:** `marked` → `[innerHTML]`, sanitizado pelo Angular. Sem `bypassSecurityTrust*`. HTML cru e imagens do markdown ficam desligados.                                                                                                                  | O texto vem de agentes: é não fiável.                                                                             |
| F13 | **Diff no cliente** (`diff`, jsdiff) para comparar revisões de artefactos.                                                                                                                                                                                     | A API só devolve o conteúdo de cada revisão.                                                                      |
| F14 | **AIU em inteiros nano-AIU.** Ler e escrever sem floats (`parseAiu`/`formatAiu` em `domain/`).                                                                                                                                                                 | CLAUDE.md: valores tipo dinheiro nunca em float.                                                                  |
| F15 | **Texto da UI em inglês**, tal como o design system. Sem framework de i18n por agora.                                                                                                                                                                          | O vocabulário (`vocabulary.md`) é em inglês e mapeia termos da API.                                               |
| F16 | **Tema:** claro por omissão, escuro via `data-theme="dark"` no `<html>`. Sem botão visível até o design o prever.                                                                                                                                              | O DS tem os dois temas; os wireframes só o claro.                                                                 |

## 4. CLAUDE.md do frontend

O `CLAUDE.md` do `ahoy-frontend` é uma **cópia literal** do do `ahoy-hosted`: fala de AIU gasto por dispatch, worker, Azure,
`.work/`, `docs/design.md` D1–D13 e `node:test`. Até a fase 0 o adaptar (**com a tua aprovação do texto**), os agentes
seguem isto:

**Mantém-se tal e qual**

- Nada de gastar AIU, responder a perguntas, aprovar gates, retomar stories, tocar em Azure, **commit, push ou reescrever
  histórico** sem aprovação específica e explícita. No front-end isto significa: **nunca** correr contra `--live` nem contra
  o TEST; testes e e2e só contra o backend falso (2D) ou `npm run dev -- --simulate` do hosted (0 AIU). Respostas de teste
  levam "POC test answer, not a product decision".
- Segredos: nunca mostrar, copiar para docs ou commitar tokens.
- TypeScript estrito: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`. **Não enfraquecer.** Sem `any`,
  `@ts-ignore`, `@ts-expect-error`, novo `as unknown as`; sem `enum`/`namespace`; sem default exports (exceto ficheiros de
  configuração das ferramentas). Dados externos entram como `unknown` e são validados antes de uso.
- Erros: `catch (e: unknown)`; resultados esperados são valores; **uma falha de tooling nunca se mostra como veredicto de
  domínio**.
- `domain/` é puro: sem Angular, sem I/O, sem relógio (o tempo entra por parâmetro).
- Dependências de runtime em versão exata, devDependencies com `^`, **perguntar antes de adicionar qualquer uma** (lista no
  [§10](#10-dependências-a-aprovar)).
- Prettier com a config do hosted (120 colunas, aspas duplas, `trailingComma: all`). Husky + lint-staged.
- Provas exatas: dizer o que correu, o que só teve teste unitário, o que não correu; nomear cada suite saltada.

**Muda (fase 0 propõe o texto)**

- Runner de testes: Vitest, não `node:test`.
- Resolução de módulos: `bundler` (padrão do Angular CLI), imports relativos **sem** `.js`. `node:` mantém-se nos scripts.
- Comandos: `npm run build && npm run typecheck && npm run lint && npm test && npm run format:check`.
- Remover o que é só do hosted (dispatch, worker, `.work/`, Postgres local). Ver `docs/architecture.md` em vez de
  `docs/design.md` D1–D13.

## 5. Arquitetura alvo

### 5.1 Camadas e pastas

```
src/
  styles.scss, styles/            tokens.css (gerado), ahoy-bundle.css (cópia do DS), base
  environments/                   dev | production | mock
  testing/                        fixtures/, mock-backend/ (só dev/teste, fora do build de produção)
  app/
    domain/                       TS puro: tipos, vocabulário, fases, AIU, tempo, textos de halt
    core/
      api/                        ApiClient, ApiError, guards, schema.d.ts (gerado)
      auth/                       AuthStrategy, CurrentUser
      config/                     AppConfig (config.json em runtime)
      realtime/                   EventStreamClient, EventBus, polling fallback
      stores/                     StoriesStore, StoryStore, RunProgressBuffer, StoryEventsFeed
      commands/                   CommandRunner (conflitos, duplo envio) — lane 4A
    ui/                           design system em Angular (selectores ah-*), sem API
    features/
      harbour/                    All hands (home)
      voyages/                    lista
      set-sail/                   formulário
      docks/                      backlog (planeado)
      voyage/                     shell da viagem, header, diálogos, tabs: plan, questions, runs, gates, artifacts, log, models
      run-detail/
```

### 5.2 Fronteiras (impostas por `scripts/check-boundaries.mjs`, parte de `npm run typecheck`)

- `domain` não importa nada de Angular, `ui`, `core` nem `features`.
- `ui` importa só `domain` e Angular (e `RouterLink` onde o README do componente o pede). Nunca `core/api`.
- `core` importa `domain` e Angular.
- `features/*` importam `domain`, `ui` e `core`. **Uma feature nunca importa outra** (o equivalente de "`apps/*` nunca se
  importam" do hosted). O que duas features partilham sobe para `core` ou `ui`.
- `testing/` pode importar tudo; nada de produção importa `testing/`.
- Aliases: `@domain/*`, `@core/*`, `@ui/*`, `@features/*`, `@testing/*`. Sem barrels de topo.

### 5.3 Rotas

```
/                                  All hands
/voyages                           lista        ?status=ready|running|awaiting_input|awaiting_decision|halted|terminal  ?q=
/voyages/new                       Set sail     ?key=PROJ-123&title=...
/docks                             The Docks (planeado)
/voyages/:key                      shell da viagem; redireciona para a tab por omissão
/voyages/:key/plan | questions | runs | gates | artifacts | log | models
/voyages/:key/runs/:runId          run detail
/_kit                              galeria de componentes (só em dev)
```

Tab por omissão: `awaiting_input` → questions; `awaiting_decision` → plan; `running` e `ready` → runs; `halted` → models;
outros → plan. (Proposta; confirmar com o wireframe _Halted_, que abre em Models.) A fase 0 cria **todas** estas rotas com
componentes placeholder; cada lane substitui o seu. Assim `app.routes.ts` não gera conflitos.

### 5.4 Fluxo de dados

```
 browser ── /api/v1 ──► (proxy dev: + X-Ahoy-Actor)  ──►  ahoy-hosted API
   │                                                          │
   │  GET/POST (HttpClient withFetch, ApiClient → ApiResult)   │
   │  GET /events/stream (fetch + SSE parser, Last-Event-ID)   │
   ▼                                                          ▼
 EventBus (1 ligação global) ──► StoriesStore / StoryStore ──► features (signals)
                                  refetch(debounce 300 ms)
```

- **Lista e inbox:** `StoriesStore.loadAll()` pagina `limit=500` até `nextCursor = null` e mantém-se por eventos. Daí saem
  as contagens (chips, tiles, "All hands 4") e a inbox "Needs you" (`awaiting_input` + `awaiting_decision` + `halted`).
- **Viagem:** `StoryStore.for(key)` expõe `story`, `state`, `runs`, `questions`, `gates`, `models`, `artifacts`, `events`
  como recursos (`loading | ready | error`, `refresh()`). Só se mantêm vivos os que alguém observa.
- **`run.progress`** não passa pelo refetch: vai para o `RunProgressBuffer` (dedupe por `line`, `omitted`, última `spend`).
- Eventos de tipo desconhecido são ignorados (o contrato diz que podem surgir novos).

### 5.5 Comandos, concorrência e erros → UX

Todo o comando é `POST` com `expectedVersion` = versão da story que o utilizador viu. `CommandRunner` (fase 4A) trata o
resultado de forma uniforme:

| Resposta                                                          | UX (banners e textos do DS)                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `202`/`201`                                                       | A story devolvida passa a ser a verdade (atualiza o store). Toast no passado: "Answer to Q2 sent. 1 question left."                                                             |
| `409 stale_version` (`currentVersion` no corpo)                   | Banner `notice` "This voyage changed since you opened it": refresca, **mantém o texto escrito**, deixa reenviar.                                                                |
| `409 decision_already_recorded`                                   | Painel "X already approved this plan": "Your send-back wasn't recorded", texto mantido, ações "Copy my text" e "See the decision".                                              |
| `409 already_answered`                                            | Mostra a resposta de quem respondeu primeiro; o texto do utilizador fica visível.                                                                                               |
| `409 invalid_state` / `revision_ceiling_reached` / `legacy_story` | Banner `error` com o `detail` em linguagem simples; o código técnico na linha `ah-tech`.                                                                                        |
| `409 story_exists` (Set sail)                                     | Erro no campo da chave com ligação para a viagem existente.                                                                                                                     |
| `400 validation_failed` (`errors[].path`)                         | Erros junto dos campos (`aria-invalid`); caminho `/models/review-defect` → linha do modelo.                                                                                     |
| `404 not_found`                                                   | Página "This voyage doesn't exist".                                                                                                                                             |
| `401 unauthenticated`                                             | Banner genérico "Sign-in needed". Sem fluxo de login (SSO é do utilizador).                                                                                                     |
| `503 unavailable`, falha de rede                                  | Padrão "Lost contact with the harbour": explicação, "Try again", `status · code · request id` (campo `instance` do Problem, se existir). Nada do que o utilizador fez se perde. |
| Resposta com forma inesperada                                     | `invalid_response`: "Ahoy sent something unexpected". É falha de tooling, **nunca** um veredicto.                                                                               |

### 5.6 AIU, tempo e identidade

- **AIU:** nano-AIU inteiros (`Number.isSafeInteger`). Mostrar 1 casa decimal nas listas, 2 no run detail (`ahAiu` pipe sobre
  `domain/aiu`). Ler o campo "Total budget" por texto decimal → inteiros, **sem passar por float**. "May spend up to X AIU" =
  `budget − spent`. O medidor não muda de cor ao encher.
- **Tempo:** relativo nas listas ("22 m ago"), absoluto nos registos ("Tue 09:48"). "Waiting 22 m" é o tempo desde
  `updatedAt` (aproximação: a API não dá o instante em que entrou no estado).
- **Identidade:** a API não tem `/me`. `CurrentUser` lê `actor` do `AppConfig` (por omissão `dev@example.com`, que tem de ser o
  mesmo valor que o proxy injeta em `X-Ahoy-Actor`). Serve para "Recorded as …", "(you)", iniciais do avatar e saber se se
  é o owner. Mais tarde: do `sub` do token ou de um `GET /me`. O ator do sistema `ahoy-reconciler` mostra-se como "Ahoy".
- **Auth futura:** `AuthStrategy.headers(): Promise<Record<string,string>>`, hoje devolve `{}`. O `ApiClient` e o stream SSE
  usam-no. Trocar por uma estratégia WebEAM (Bearer) não toca em mais nada.

### 5.7 Conteúdo não fiável

Planos, snapshots, perguntas, mensagens do agente e `workerLog` vêm de agentes. Nunca `innerHTML` direto, nunca
`bypassSecurityTrust*`; `[REDACTED]` vem já mascarado pela API e mostra-se tal como está. Ligações de markdown abrem com
`rel="noopener noreferrer"`; imagens remotas não se carregam.

## 6. Mapa de ecrãs → rotas → API → lane

| Quadro dos wireframes        | Rota            | Operações da API                                                                              | Lane |
| ---------------------------- | --------------- | --------------------------------------------------------------------------------------------- | ---- |
| `Main` All hands             | `/`             | `listStories`, `listQuestions`, `getStoryState`, `listStoryEvents`, `/events/stream`          | 3A   |
| `Voyages`                    | `/voyages`      | `listStories` (`status`, `limit`, `cursor`)                                                   | 3A   |
| `SetSail`                    | `/voyages/new`  | `startStory`                                                                                  | 3B   |
| `Docks` (planeado)           | `/docks`        | nenhuma para o backlog; `listStories` para a coluna Ahoy                                      | 3C   |
| `PlanReview` (header)        | `/voyages/:key` | `getStory`, `getStoryState`, `listStoryEvents`                                                | 4A   |
| `Dialogs` stop/resume/budget | diálogos        | `stopStory`, `resumeStory`, `setStoryBudget`                                                  | 4A   |
| `PlanReview`                 | `…/plan`        | `getArtifactContent`, `getStoryState`, `listGateRecords`, `getStoryModels`, `decideHumanGate` | 4B   |
| `Questions`                  | `…/questions`   | `listQuestions`, `answerQuestion`, `listStoryRuns`, `getStoryModels`                          | 4C   |
| `Halted`, `Dialogs` models   | `…/models`      | `getStoryModels`, `setStoryModels`                                                            | 4D   |
| `Running`                    | `…/runs`        | `listStoryRuns`, `getRun`, `run.progress` do stream                                           | 5A   |
| `RunDetail`                  | `…/runs/:runId` | `getRun`, `listStoryRuns`, `listStoryEvents`                                                  | 5A   |
| `Records` gates              | `…/gates`       | `listGateRecords`                                                                             | 5B   |
| `Records` ship's log         | `…/log`         | `listStoryEvents`, stream                                                                     | 5B   |
| `Records` artifacts          | `…/artifacts`   | `listArtifacts`, `getArtifactContent` (`revision`)                                            | 5C   |
| `States`                     | transversal     | nenhuma                                                                                       | 6A   |

Operações da API **sem** wireframe, para a [fase 7](phase-7-delivery-phases.md): `resolveConsensus`, `decideWorkPackage`,
`reopenWork`, `unblockStory`, e a decisão `delivery_accepted` de `decideHumanGate`.

## 7. Lacunas da API e desvios dos wireframes

Nenhuma bloqueia a Onda 0. As propostas para a v1 não exigem alterações ao `ahoy-hosted`; a coluna "Pedir ao backend" é
opcional e serve para o utilizador decidir.

| #   | Lacuna (verificada em `openapi/ahoy-v1.yaml` e no código do hosted)                                                                                                  | Proposta para a v1                                                                                                                      | Pedir ao backend (opcional)                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| G1  | A API não tem CORS; o `OPTIONS` responde `400`.                                                                                                                      | Same-origin: proxy no dev server, Ingress no TEST.                                                                                      | Nada.                                                              |
| G2  | `GET /events/stream` exige o header de auth; `EventSource` não o envia.                                                                                              | SSE com `fetch` (F6).                                                                                                                   | Nada.                                                              |
| G3  | O backlog (The Docks) não tem endpoint.                                                                                                                              | `BacklogPort` + adaptador de dados de exemplo, com a nota "planned". A coluna "Ahoy" usa dados reais de `listStories`.                  | `GET /backlog` (item 9 do progress do hosted).                     |
| G4  | `listStories` filtra por **um** estado, sem contagens.                                                                                                               | Carregar tudo (`limit=500`, paginar) e contar no cliente; mantido por eventos.                                                          | `GET /stories/summary` (contagens por estado), se a lista crescer. |
| G5  | O formulário _Set sail_ mostra defaults concretos ("Default: gpt-5.6-terra", "Server default"), mas `GET /stories/{key}/models` só existe depois de a story existir. | Mostrar "Default" sem valor e a nota "the server decides"; os valores reais aparecem em Models depois de criar.                         | `GET /config/models` com os defaults por slot.                     |
| G6  | Não há `GET /me`.                                                                                                                                                    | `CurrentUser` a partir do `AppConfig`.                                                                                                  | `GET /me`.                                                         |
| G7  | O detalhe de um halt (`detail`, `workerLog`) só está no evento `story.halted`; o `Story` só tem `haltReason`.                                                        | Ler o último `story.halted` por viagem em halt (poucas), com cache.                                                                     | `haltDetail` no `Story`.                                           |
| G8  | Eventos só em ordem crescente, sem filtro por tipo nem por run; `run.progress` pode ser centenas por run.                                                            | Paginar do início (`limit=500`), filtrar no cliente, cache e stream. Ship's log mostra "newest first" invertendo no cliente.            | `type=`, `runId=` e `order=desc` em `listStoryEvents`.             |
| G9  | `listArtifacts` só lista a revisão **corrente**; versões antigas só por `getArtifactContent?revision=N`.                                                             | Sondar os paths conhecidos em cada revisão (`404` = não existia); mapa revisão → run a partir de `artifacts.updated`.                   | `GET /artifacts?revision=N`.                                       |
| G10 | O número da ronda e o teto ("round 2 of 4") não estão no `Story`.                                                                                                    | `getStoryState`: `revisions[gate]` e `revision_ceiling` (por omissão 4, `DEFAULT_REVISION_CEILING`).                                    | —                                                                  |
| G11 | A chave do gate aberto (`plan_accepted`, `delivery_accepted`) não está no `Story`.                                                                                   | Último evento `story.awaiting_decision` (`{phase, gate}`); reserva: `plan_review → plan_accepted`, `delivery_gate → delivery_accepted`. | —                                                                  |
| G12 | As fases (`phases.tsv`) não têm endpoint. Para uma story `blocked`, `phase` é `"blocked"` e a fase onde parou só está no evento `story.phase_changed` (`from`).      | Lista fixa de 7 fases + `blocked` em `domain/`; fase de bloqueio pelo evento, com reserva sem posição.                                  | `GET /phases`.                                                     |
| G13 | "Open in Jira" precisa do URL base do Jira.                                                                                                                          | `jiraBaseUrl` no `AppConfig`; sem ele, o botão não aparece.                                                                             | —                                                                  |
| G14 | `Run.agent` é texto livre.                                                                                                                                           | Mapa fase/slot → Navigator, Cartographer, Implementer, Lookout; reserva: o texto da API.                                                | —                                                                  |

**Desvios que proponho em relação aos wireframes** (para confirmares):

1. _Set sail_: campo **Title (optional)** pré-preenchido por `?title=` (a API aceita `title`; o wireframe só mostra a chave).
2. _Set sail_: sem defaults concretos nos placeholders (G5).
3. Pesquisa da top bar: filtro **no cliente** sobre a lista (a API não tem pesquisa); leva a `/voyages?q=`.
4. Realce de "changed since last revision" no plano: ao nível do **bloco** (parágrafo/item), não da palavra.
5. _Approve_ sem diálogo de confirmação, como no wireframe (só _Send back_ e _Reject_ têm diálogo).
6. Fontes: o `bundle.css` importa Google Fonts. Para o TEST (rede privada) deve passar a self-host (pergunta 4).
7. Sem botão de tema (o DS tem tema escuro, os wireframes não têm controlo para ele).

## 8. Fases, lanes e ondas

Tamanho relativo: **S** pequeno, **M** médio, **L** grande. Cada lane é uma unidade que um agente faz sozinho, com ficheiros
próprios.

```
Onda 0   P0 ───────────────────────────────────────────────────────────────┐
                                                                           ▼
Onda 1   1A kit (tokens, base)      2A cliente API        2C domínio puro
                   │                    │   │                  │
Onda 2   1B estado/nav ◄──(1A,2C)       │   └──► 2B tempo real ◄(2A,2C)
         1C interação  ◄──(1A,2C)       └──────► 2D backend falso ◄(2A,2C)
                   │                              │
Onda 3   3A shell+home+lista ◄(1B,2B,2D)   3B set sail ◄(1A,1C,2D)   3C docks ◄(1B,2B)
         4A shell da viagem+diálogos ◄(1B,1C,2B,2D)
                   │
Onda 4   4B plan ◄4A   4C questions ◄4A   4D models ◄4A
         5A runs ◄4A   5B gates+log ◄4A   5C artifacts ◄4A
                   │
Onda 5   6A estados   6B a11y/perf   6C e2e   6D release (6D pode começar na Onda 2)
Onda 6   P7 fases de entrega (precisa de wireframes novos)
```

| Onda | Lane | Nome                                             | Tam. | Depende de       | Pode correr em paralelo com |
| ---- | ---- | ------------------------------------------------ | ---- | ---------------- | --------------------------- |
| 0    | P0   | Fundação                                         | M    | pergunta §12     | nada                        |
| 1    | 1A   | Kit: tokens, estilos, ícones, primitivas         | M    | P0               | 2A, 2C                      |
| 1    | 2A   | Cliente da API, erros, guards, auth seam         | M    | P0               | 1A, 2C                      |
| 1    | 2C   | Domínio puro                                     | S    | P0               | 1A, 2A                      |
| 2    | 1B   | Kit: estado, progresso, navegação                | M    | 1A, 2C           | 1C, 2B, 2D                  |
| 2    | 1C   | Kit: diálogo, cartões, passos, diff, markdown    | L    | 1A, 2C           | 1B, 2B, 2D                  |
| 2    | 2B   | Tempo real, stores, progresso                    | L    | 2A, 2C           | 1B, 1C, 2D                  |
| 2    | 2D   | Backend falso + fixtures                         | L    | 2A, 2C           | 1B, 1C, 2B                  |
| 3    | 3A   | Shell, All hands, Voyages                        | M    | 1B, 2B, 2D       | 3B, 3C, 4A                  |
| 3    | 3B   | Set sail                                         | M    | 1A, 1C, 2D       | 3A, 3C, 4A                  |
| 3    | 3C   | The Docks (planeado)                             | S    | 1B, 2B           | 3A, 3B, 4A                  |
| 3    | 4A   | Viagem: shell, header, ações, diálogos, conflito | L    | 1B, 1C, 2B, 2D   | 3A, 3B, 3C                  |
| 4    | 4B   | Plan review e decisão                            | L    | 4A               | 4C, 4D, 5A, 5B, 5C          |
| 4    | 4C   | Questions                                        | M    | 4A               | 4B, 4D, 5A, 5B, 5C          |
| 4    | 4D   | Models                                           | M    | 4A               | 4B, 4C, 5A, 5B, 5C          |
| 4    | 5A   | Runs, run detail, passos em direto               | L    | 4A               | 4B, 4C, 4D, 5B, 5C          |
| 4    | 5B   | Gates e ship's log                               | M    | 4A               | 4B, 4C, 4D, 5A, 5C          |
| 4    | 5C   | Artifacts: ver e comparar                        | M    | 4A               | 4B, 4C, 4D, 5A, 5B          |
| 5    | 6A   | Estados e acabamento                             | M    | 3A–5C            | 6B, 6C, 6D                  |
| 5    | 6B   | Acessibilidade e performance                     | M    | 3A–5C            | 6A, 6C, 6D                  |
| 5    | 6C   | e2e (mock e `--simulate`)                        | L    | 2D, ecrãs        | 6A, 6B, 6D                  |
| 5    | 6D   | Release: imagem, config, CSP                     | S    | P0               | quase tudo                  |
| 6    | 7    | Fases de entrega                                 | —    | wireframes novos | —                           |

Máximo de agentes em simultâneo: 4 (Onda 2), 4 (Onda 3), **6** (Onda 4). Se preferires menos, junta lanes da mesma onda
na ordem da tabela. Não juntes lanes de ondas diferentes.

### 8.1 Modelo sugerido por lane

Modelos disponíveis: **Opus 5.5**, **Sonnet 5.5** e **DeepSeek Flash 4.1**. O critério é o custo de um erro: onde um erro se
propaga a todas as lanes seguintes, ou é de segurança ou de concorrência, usa o mais forte; onde a tarefa é mecânica, está
inteiramente especificada e tem testes que a provam, usa o mais barato.

| Modelo                 | Lanes                                             | Porquê                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opus 5.5**           | P0, 1C, 2B, 4A                                    | P0 e 4A são a base de tudo o resto (flags de TypeScript, fronteiras, `CommandRunner`, conflitos). 2B é a mais difícil (parser SSE, reconexão, estado em signals). 1C tem o markdown de agentes (XSS) e o foco dos diálogos.                                                                                                         |
| **Sonnet 5.5**         | 1A, 1B, 2A, 2D, 3A, 3B, 4B, 4C, 4D, 5A, 5C, 6A–6D | O grosso do trabalho: especificado ao pormenor, com wireframe e testes. 4B tem decisões de gate com conflitos: o Sonnet chega, com revisão antes de integrar.                                                                                                                                                                       |
| **DeepSeek Flash 4.1** | 2C, 3C, 5B                                        | Mecânicas e testáveis: tabelas de domínio copiadas de `vocabulary.md`, o stub do backlog, a tabela de títulos de eventos. **Não tenho informação sobre as capacidades deste modelo**: é uma atribuição pela forma da tarefa. Começa pela 3C (a mais pequena); se correr bem, passa as outras. Revisão por Sonnet antes de integrar. |

Regras para qualquer modelo:

- **Angular 22 é recente.** Nenhum modelo o conhece bem. Em dúvida sobre uma API, consultar os tipos em `node_modules/@angular/*`
  e as decisões registadas em `docs/architecture.md` (fase 0), nunca inventar.
- **Uma lane feita por um modelo mais fraco passa por revisão de um mais forte** antes de integrar (a skill `code-review` do
  repositório serve), com os critérios de aceitação da lane como lista de verificação.
- **Não trocar de modelo a meio de uma lane.** O relatório em `docs/progress.md` é a passagem de testemunho entre sessões.

## 9. Protocolo para agentes

1. **Ler primeiro:** `CLAUDE.md`, `docs/progress.md`, este ficheiro e o ficheiro da fase da lane. Nada mais é pré-requisito.
2. **Uma lane = um branch** `lane/<id>-<slug>` criado a partir do `main` atual, salvo se a sessão designar outro. **Não fazer
   commit nem push sem aprovação do utilizador** (CLAUDE.md). Sem aprovação, deixar as alterações na árvore de trabalho e
   dizer quais são.
3. **Só editar os diretórios que a lane "possui".** Se precisares de algo de outra lane, escreve-o em `docs/progress.md`,
   secção "Needs from lane X", e continua com o que podes fazer. Exceções: acrescentar a tua secção a `docs/progress.md`; uma
   linha em `README.md` na secção Status; e, **só na fase 6**, retoques transversais em qualquer feature (ver o ficheiro da
   fase).
4. **Contratos entre lanes são só os tipos exportados** (`@domain`, `@ui`, `@core`). Alterar um tipo exportado por outra lane
   é pedir-lhe, não editar.
5. **Definição de pronto** (todas as lanes):
   - `npm run build && npm run typecheck && npm run lint && npm test && npm run format:check` verde em Node 24;
   - cada critério de aceitação da lane demonstrado (teste ou verificação descrita);
   - lanes de UI: verificado no backend falso (`npm run start:mock`) **lado a lado com o quadro do wireframe**, em tema claro
     e escuro, e a 390 px de largura;
   - `docs/progress.md` atualizado: o que mudou, contagens de testes, **o que foi saltado e porquê**, o que não correu
     (por exemplo "não corri contra a API real") e os próximos passos.
6. **Os wireframes são referência, não código.** Abrir `docs/design/wireframes/<Quadro>.dc.html` (tende a abrir como HTML
   estático no browser; não verifiquei) ou o artefacto no Claude Design. Copiar conteúdo e estrutura; reconstruir o estilo com
   as classes `ah-*`.
7. **Nada de live.** Ver [§4](#4-claudemd-do-frontend).
8. **Prompt padrão** (cada lane tem o seu em cima, no ficheiro da fase): "Lê `CLAUDE.md`, `docs/progress.md`,
   `docs/plan/00-overview.md` e `docs/plan/<fase>.md`. Implementa **só** a lane `<id>`. Segue o protocolo do §9. Não faças
   commit nem push. Termina com o relatório de `docs/progress.md`."

## 10. Dependências a aprovar

Versões consultadas hoje no npm. Confirmar antes de instalar; fixar o exato que o `npm view` devolver. Runtime em versão
exata, dev com `^`.

| Pacote                                                                                          | Tipo        | Para quê                                                      | Lane   |
| ----------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------- | ------ |
| `@angular/*` 22.2.1, `rxjs` 7.x, `tslib`, `typescript` 6.0.x, `@angular/cli`/`build` 22.2.1     | runtime/dev | O próprio Angular 22 (o `build` pede `typescript >=6.0 <6.1`) | P0     |
| `vitest` (5.x; o `@angular/build` aceita `^4.0.8 \|\| ^5`) + o ambiente DOM que o builder pedir | dev         | Testes unitários e de componentes (F11)                       | P0     |
| `angular-eslint`, `eslint`, `typescript-eslint`                                                 | dev         | Lint com as regras do CLAUDE.md                               | P0     |
| `prettier`, `husky`, `lint-staged`                                                              | dev         | Como no hosted                                                | P0     |
| `@angular/cdk` 22.x                                                                             | runtime     | Dialog, overlay, a11y (F2)                                    | 1C     |
| `marked` 18.1.0                                                                                 | runtime     | Markdown de planos e artefactos (F12)                         | 1C     |
| `diff` 9.0.0                                                                                    | runtime     | Comparar revisões de artefactos e realçar o plano (F13)       | 2C     |
| `openapi-typescript` 7.13.0                                                                     | dev         | Tipos a partir do `ahoy-v1.yaml`                              | 2A     |
| `ajv`, `yaml`                                                                                   | dev         | Testes de contrato: fixtures e mock contra o OpenAPI          | 2A, 2D |
| `@playwright/test` 1.63.0, `@axe-core/playwright`                                               | dev         | e2e e acessibilidade                                          | 6B, 6C |
| `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono` (opcional)                        | runtime     | Self-host das fontes (pergunta 4)                             | 6D     |

Sem alternativa razoável para markdown e diff sem dependência própria; se recusares, a 1C e a 5C precisam de um renderer e
de um diff escritos à mão (mais código, mais superfície de segurança).

## 11. Riscos

| #   | Risco                                                                                                            | Mitigação                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| R1  | O front-end real **nunca correu contra a API real** (`docs/strategy.md` §1). Pode haver surpresas de integração. | `scripts/smoke-api.mjs` logo na 2A; e2e `--simulate` na 6C; backend falso validado contra o OpenAPI.             |
| R2  | Node das sessões cloud abaixo de 22.22.3: o Angular 22 recusa.                                                   | Passo de pré-voo da fase 0; `.nvmrc` 24; `engines`.                                                              |
| R3  | `exactOptionalPropertyTypes` e outras flags podem colidir com tipos do Angular.                                  | Parar e perguntar; não enfraquecer em silêncio (CLAUDE.md).                                                      |
| R4  | SSE através do proxy do dev server ou do Ingress pode ser bufferizado.                                           | Verificar na fase 0 com `curl -N`; fallback automático para polling na 2B.                                       |
| R5  | O backend falso diverge da API real.                                                                             | Testes de contrato com Ajv contra o YAML; cada desvio documentado.                                               |
| R6  | Volume de `run.progress` num stream global.                                                                      | Buffer limitado; contado em `omitted`; se pesar, stream por story.                                               |
| R7  | Merge conflicts entre 6 agentes em paralelo.                                                                     | Posse de diretórios, rotas pré-criadas na fase 0, tipos partilhados só pelo dono.                                |
| R8  | Angular 22 é recente: APIs (zoneless por omissão, runner de testes, `httpResource`) podem diferir do esperado.   | Fase 0 confirma com `ng new --help` e regista as decisões em `docs/architecture.md`.                             |
| R9  | Fontes via Google Fonts em rede privada.                                                                         | Pergunta 4; self-host na 6D.                                                                                     |
| R10 | Os wireframes e o brief podem deriver da API (a lista de eventos, estados e motivos de halt cresce).             | Eventos e estados desconhecidos têm sempre reserva; `docs/ui-design-brief.md` do hosted manda atualizar o brief. |

## 12. Perguntas antes de lançar a Onda 0

1. **Os artefactos certos são "Ahoy UI wireframes" e "Ahoy" (design system)?** (Ignorei "Ahoy UI" de ontem.)
2. **Vitest em vez de `node:test`**, e `bundler` em vez de `NodeNext` nos imports? São os padrões do Angular CLI. Implica
   adaptar o `CLAUDE.md` do frontend (a fase 0 propõe o texto; não o altero sem a tua aprovação).
3. **Aprovas as dependências do §10?** Em especial `@angular/cdk`, `marked` e `diff`.
4. **Fontes:** manter o Google Fonts do `bundle.css` por agora e passar a self-host na 6D antes do TEST?
5. **URL base do Jira** (para "Open in Jira"): qual é, ou deixamos o botão escondido?
6. **Política de commits:** uma branch por lane com PR para o `main` quando aprovares, ou tudo numa só branch?
7. **Node 24 está disponível** nas sessões onde vão correr os agentes? Se não, a fase 0 pára no pré-voo.
8. **Pedes já ao backend** algum dos itens opcionais do §7 (`GET /me`, `GET /config/models`, filtros de eventos)? Nenhum é
   necessário para a v1.
