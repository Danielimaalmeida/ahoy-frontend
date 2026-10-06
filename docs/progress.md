# Ahoy frontend · progress

**Updated 2026-10-06 by lane 2C (pure domain). State: phase 0 is in `main`; lane 2C is committed on branch
`lane/2c-domain` with an open PR (not merged).**

- **Ran (offline, 0 AIU, Node 24.21.0 via `npx node@24`):** `npm ci`, `npm run build`, `npm run typecheck`,
  `npm run lint`, `npm test` (15 tests, 1 file), `npm run format:check`, all green; `npm start` with every §5.3 route
  rendered in headless Chromium; the proxy against a **local stub** on port 8080.
- **Did not run:** the proxy against the `ahoy-hosted` API (no Docker daemon and no Postgres server in this session);
  the CI workflow on GitHub (nothing pushed); the wireframes opened in a browser.
- **`CLAUDE.md`:** the adapted text was shown to the user as a diff, approved on 2026-10-06 and applied.

## Where we are

Wave 0 (phase 0) is complete on branch `ccr-be69922d-w5i04m`: an Angular 22 app that builds, tests
and serves, with the CLAUDE.md conventions enforced by `tsc`, ESLint, Prettier and `scripts/check-boundaries.mjs`, the
dev proxy, every route as a lazy placeholder, the design references in `docs/design/`, and the docs. No screen, no
design-system component and no API call exists yet.

**Lane 2C (domínio puro)** is done, committed on branch `lane/2c-domain` (PR open, not merged): `src/app/domain/` now has the vocabulary
mappings (`statusPresentation`, `outcomePresentation`, `explainHalt`), the AIU and time helpers, `CREW` and the only
diff implementation of the project (`diff` 9.0.0), with **218 new tests** (233 in the suite). The API types are
provisional until lane 2A lands `schema.d.ts`. `npm run format:check` is green: the 24 skill files added by commit
132728f are ignored in `.prettierignore` (decided by the user on 2026-10-06).

## Start here next

1. **User:** merge phase 0 into `main` (a PR from `ccr-be69922d-w5i04m` when you approve it), so wave 1 branches from it.
2. **User:** make the cloud environment's setup script install Node 24 (sessions still start on Node 22.22.0, which
   Angular 22 rejects). Until then each agent must put `npx node@24` first on its `PATH` (see "Prompt for a new
   session").
3. **Wave 1**, in parallel, one branch per lane from `main`: **1A** (kit foundation) and **2A** (API client) still to
   do; **2C** (pure domain) is done on `lane/2c-domain`, awaiting review and merge. Prompts are in
   `docs/plan/phase-1-design-system.md` and `docs/plan/phase-2-data-layer.md`.
4. Optional, whenever a session has Docker: verify the proxy against `ahoy-hosted` `npm run dev -- --simulate`
   (`curl -s localhost:4200/api/v1/health` and `curl -N localhost:4200/api/v1/events/stream`).

## Prompt for a new session

> Read `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` and `docs/plan/<phase>.md`. Implement **only** lane
> `<id>`; follow the protocol in §9 of the overview. First run `node -v`: if it is below 22.22.3, run `npx -y node@24 -v`
> and put that binary first on your `PATH` for every command (see "Node in cloud sessions" below). Don't commit or push.
> Finish with your lane's report in `docs/progress.md`.

---

## Lane P0 · Foundation (2026-10-06)

Committed and pushed to `ccr-be69922d-w5i04m` with the user's approval.

### Node in cloud sessions (0.1)

- `node -v` was **v22.22.0**, below Angular 22's `^22.22.3 || ^24.15.0 || >=26.0.0`. `npx -y node@24 -v` gave
  **v24.21.0**. The binary from the npx cache was copied into the session scratchpad and put first on `PATH`; npm
  10.9.4 (the system one) ran under it. Every command below ran on Node 24.21.0.
- **The environment's setup script must install Node 24** so sessions don't depend on this workaround (the plan's
  `npm install -g node@24` is still untested).
- `.nvmrc` = `24`; `package.json` `engines.node` = `^22.22.3 || ^24.15.0 || >=26.0.0` (Angular 22's range).

### What changed

| Task | Result                                                                                                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.2  | Scaffold with `ng new` 22.2.1 in a temporary folder (flags in `docs/architecture.md`), moved in without its README and `.vscode/`. `CLAUDE.md`, `.claude/` and `.git/` untouched. `package.json`: name `ahoy-frontend`, `private`, `"type": "module"`; runtime dependencies exact, dev `^` (TypeScript `~`, see below). |
| 0.3  | `tsconfig.json` with every CLAUDE.md flag plus `noPropertyAccessFromIndexSignature` and Angular's three strict options; aliases `@domain/*`, `@core/*`, `@ui/*`, `@features/*`, `@testing/*`. **No flag clashed with Angular's types.**                                                                                 |
| 0.4  | `.prettierrc.json` (120, double quotes, `trailingComma: all`, `proseWrap: preserve`), `.prettierignore`; `eslint.config.js` (rules in `docs/architecture.md`); Husky `pre-commit` → `lint-staged` (`prettier --write --ignore-unknown`).                                                                                |
| 0.5  | Scripts `start`, `start:mock`, `build`, `test`, `lint`, `typecheck`, `check:boundaries`, `format`, `format:check` (plus `ng`, `watch`, `prepare`).                                                                                                                                                                      |
| 0.6  | `proxy.conf.mjs`: `/api/v1` → `AHOY_API_TARGET` (default `http://127.0.0.1:8080`), `secure: false`, `changeOrigin: true`, header `X-Ahoy-Actor: $AHOY_ACTOR` (default `dev@example.com`); rejects a malformed or non-http(s) target at start-up. Documented in README and `docs/architecture.md`.                       |
| 0.7  | Folders of §5.1; `scripts/check-boundaries.mjs`; every §5.3 route lazy with a placeholder and its own `<title>`; `app.config.ts` with router (`withComponentInputBinding`), `HttpClient` (`withFetch`), `API_BASE`, `FETCH`, `provideAppInitializer`; `index.html` with `<title>Ahoy</title>`, `lang="en"`.             |
| 0.8  | `.github/workflows/ci.yml`: Node from `.nvmrc`, `npm ci`, `format:check`, `lint`, `typecheck`, `build`, `test`. Publishes nothing.                                                                                                                                                                                      |
| 0.9  | `docs/design/`: 12 wireframes + `canvas.json`; DS `README.md`, `vocabulary.md`, `tokens.json`, `design-system.json`, `bundle.css`, 22 components (`README.md` + `preview.html`) plus the `Cover` preview, 16 icons and 3 logos; `SOURCES.md` with versions and how to re-sync.                                          |
| 0.10 | `docs/architecture.md`, this file, `README.md`. `CLAUDE.md` adapted (diff approved by the user, applied).                                                                                                                                                                                                               |

### Proof

All on Node 24.21.0, offline, 0 AIU.

- **Acceptance chain:** `npm ci && npm run build && npm run typecheck && npm run lint && npm test && npm run format:check`
  green (see "Final check" below for the exact output).
- **Tests:** 1 file, **15 tests** (`src/app/app.routes.spec.ts`): each of the 14 URLs (13 routes of §5.3, one with query
  parameters, plus `**`) shows its placeholder, its lane and its document title; `/voyages/PROJ-123` redirects to
  `/voyages/PROJ-123/plan` and the shell receives the key. `/_kit` is not in the unit tests (its presence depends on the
  build configuration); it was checked in the browser and in the build output instead.
- **`npm start`:** served on `localhost:4200`; headless Chromium (`--dump-dom`) rendered `/`, `/voyages`,
  `/voyages/new`, `/docks`, `/voyages/PROJ-123` (→ Plan), `/voyages/PROJ-123/models`, `/voyages/PROJ-123/runs/r-02`
  and `/_kit`, each with its placeholder and title.
- **`/_kit` only in dev:** `ng build --configuration development` and `--configuration mock` emit a `kit-routes` chunk;
  the production build does not, and `grep` finds no `_kit` or `Kit · Ahoy` in `dist/ahoy-frontend/`.
- **Boundaries:** with three throw-away files (since removed), `check-boundaries` reported 7 violations and exited 1:
  `ui` → `@core/api/api-base` and → `../../core/realtime/fetch`; `domain` → `@angular/core` and → `@ui/...`; feature
  `docks` → `@features/harbour/...` (re-export) and → `../voyages/...` (dynamic import); a feature → `@testing/...`.
  After removal: `check-boundaries: ok`.
- **TypeScript flags:** a throw-away `domain/` file (since removed) made `tsc -p tsconfig.app.json` fail with TS2375
  (`exactOptionalPropertyTypes`), TS2322 (`noUncheckedIndexedAccess`), TS2366 (`noImplicitReturns`), TS4114
  (`noImplicitOverride`), TS4111 (`noPropertyAccessFromIndexSignature`) and TS1484 (`verbatimModuleSyntax`).
- **ESLint rules:** throw-away files (since removed) were rejected for `@ts-ignore`, `any`, `enum`, `namespace`,
  `as unknown as`, `export default`, a non-`ah` selector, `ChangeDetectionStrategy.Eager`, `<img>` without `alt`, and a
  `(click)` on a `<div>` without keyboard handler or focus (12 errors).
- **Proxy, against a stub only:** with `npm start` running and a throw-away Node server on `127.0.0.1:8080` (not the
  Ahoy API; it echoed headers and sent one SSE event per second):
  - `curl -s localhost:4200/api/v1/health` reached the stub with `X-Ahoy-Actor: dev@example.com`, no `Authorization`,
    and `Host: 127.0.0.1:8080` (`changeOrigin`);
  - `curl -N localhost:4200/api/v1/events/stream` delivered events at 1.01 s, 2.02 s, 3.02 s and 4.02 s: **no
    buffering** through the dev-server proxy (risk R4, for the dev server only; the Ingress is not tested);
  - with nothing on 8080 the proxy answered `502` (`ECONNREFUSED`).
- **No secrets:** no token, `.env` or `.local/` in the tree; `.gitignore` now ignores `.env`, `.env.*`, `/.local` and
  `/.work`.

### Did not run, skipped, and why

- **Proxy against `ahoy-hosted`:** not run. The session has the Docker CLI but no daemon (`/var/run/docker.sock`
  missing) and no Postgres server, which the hosted API needs; the hosted repository was not cloned. Only the stub
  check above ran.
- **CI on GitHub:** the workflow was not run (nothing pushed).
- **Wireframes in a browser:** not opened. They reference `./support.js` (the Claude Design runtime), which the artifact
  does not publish; see `docs/design/SOURCES.md`.
- **`tokens.css`:** not in the artifacts; lane 1A generates it.
- **Skipped test suites:** none. Template type-checking is covered by `ng build`, not by `npm run typecheck`.

### Installed versions

Versions from `npm view` on 2026-10-06, installed with `npm install` and checked with `npm ls --depth=0`.

| Package                                                                           | Version  | Kind           | Approval                          |
| --------------------------------------------------------------------------------- | -------- | -------------- | --------------------------------- |
| `@angular/common`, `compiler`, `core`, `forms`, `platform-browser`, `router`      | 22.2.1   | runtime, exact | §10 row 1 (Angular)               |
| `rxjs`                                                                            | 7.8.2    | runtime, exact | §10 row 1                         |
| `tslib`                                                                           | 2.8.1    | runtime, exact | §10 row 1                         |
| `@angular/build`, `@angular/cli`, `@angular/compiler-cli`                         | ^22.2.1  | dev            | §10 row 1                         |
| `typescript`                                                                      | ~6.0.3   | dev            | §10 row 1 ("6.0.x")               |
| `vitest`                                                                          | ^5.0.3   | dev            | §10 row 2                         |
| `jsdom` (the DOM environment the `ng new --test-runner=vitest` scaffold asks for) | ^30.1.2  | dev            | §10 row 2 ("the DOM environment") |
| `angular-eslint`                                                                  | ^22.5.0  | dev            | §10 row 3                         |
| `eslint`                                                                          | ^10.12.0 | dev            | §10 row 3                         |
| `typescript-eslint`                                                               | ^8.71.1  | dev            | §10 row 3                         |
| `prettier`                                                                        | ^3.9.9   | dev            | §10 row 4                         |
| `husky`                                                                           | ^9.1.7   | dev            | §10 row 4                         |
| `lint-staged`                                                                     | ^17.6.0  | dev            | §10 row 4                         |

Notes:

- **TypeScript:** npm `latest` is 7.0.2, but `@angular/build` 22.2.1 requires `>=6.0 <6.1` and `typescript-eslint`
  8.71.1 `<6.1.0`, so 6.0.3 (the newest 6.0) is installed with `~` instead of `^`. This is the one dev dependency not
  on `^`; `CLAUDE.md` says so.
- **Not installed** (approved, but for later lanes): `@angular/cdk` (1C), `marked` (1C), `diff` (2C),
  `openapi-typescript` (2A), `ajv` and `yaml` (2A, 2D), `@playwright/test` and `@axe-core/playwright` (6B, 6C).
- No `zone.js` (zoneless) and no `@eslint/js` (not on the list; ESLint's core recommended rules are therefore not
  enabled, only typescript-eslint's and angular-eslint's).

### Decisions and deviations from the plan

- `<ah-root class="ah">` instead of `<app-root class="ah">`: the component prefix is `ah`.
- A `**` route with a "Not found" placeholder for lane 6A (not in §5.3).
- `/voyages/:key` redirects to `plan` until lane 4A adds the status-based default tab.
- The run detail is a top-level route (before `voyages/:key`), not a child of the voyage shell.
- `API_BASE` lives in `core/api/api-base.ts` (lane 2A owns it), `FETCH` in `core/realtime/fetch.ts` (2B), `AppConfig`
  and the no-op `initAppConfig` in `core/config/app-config.ts` (2A).
- The shared placeholder `ah-placeholder` is in `src/app/ui/placeholder/` (owned by P0; lane 6A removes it).
- `start:mock` uses the `mock` configuration, which until lane 2D is a copy of `development` (same environment file).
- The scaffold's `app.spec.ts` (it checked the demo page) was replaced by `app.routes.spec.ts`.
- The scaffold's `.editorconfig` set `quote_type = single` for `.ts`, and Prettier 3 reads it: the first format pass
  produced single quotes. Fixed to `double`, and `.prettierrc.json` now sets `"singleQuote": false` explicitly so the
  editor config can't override the hosted style again.
- Full detail in `docs/architecture.md`.

### Needs from other lanes

- **From the user:** merge of phase 0 into `main`; Node 24 in the environment's
  setup script.
- **For lane 1A:** `src/styles.scss` and `src/styles/` are empty; `index.html` has no fonts or icon yet (the bundle
  imports Google Fonts, decision §12 q4). `src/app/ui/_kit/kit.routes.ts` is a placeholder to replace.
- **For lane 2A:** fill `initAppConfig` (`/config.json`) and decide whether `API_BASE` comes from `AppConfig.apiBase`.
- **For lane 2D:** add `src/environments/environment.mock.ts` and point the `mock` configuration's `fileReplacements`
  at it (it may import `src/testing/`; `check-boundaries` already allows that one file and `src/app/core/mock/`).
- **For lane 2D (decided by the user on 2026-10-06):** no `json-server`. The same `MockAhoyServer` also runs as an HTTP
  server through a dependency-free `node:http` adapter (`npm run mock:api` on `127.0.0.1:8080`), so `npm start` can use
  it through the real proxy. Added to deliverable 9 and the acceptance of lane 2D in `docs/plan/phase-2-data-layer.md`.

### Final check

Run at the end of the lane, on Node 24.21.0, after `npm ci` (the five `npm run` steps were repeated after the quote
fix above, with the same results):

```
$ node -v                     v24.21.0
$ npm ci                      exit 0 (383 packages)
$ npm run build               exit 0 (production bundle, 13 lazy chunks, no kit-routes)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (no problems)
$ npm test                    exit 0 (Test Files 1 passed (1); Tests 15 passed (15))
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

---

## Lane 2C · Domínio puro (2026-10-06)

Branch `lane/2c-domain`, a partir de `main` (fase 0 já fundida). Commit e push aprovados pelo utilizador a
2026-10-06; PR aberto para `main`.

### O que mudou

| Ficheiro                  | Resultado                                                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/domain/types.ts` | Tipos provisórios da API com nomes de domínio (`Story`, `Run`, `Question`, `GateRecord`, `Artifact`, `AhoyEvent`, `ModelPlan`, `SlotModel`, `StoryStatus`, `RunStatus`, `GateOutcome`, `ModelSlot`, `ReasoningEffort`, …). A 2A troca por reexports do `schema.d.ts`. |
| `phases.ts`               | `PHASES` (7, por ordem), `phaseIndex` (1-based; `null` para `blocked` e desconhecidas), `GATE_FOR_PHASE` (G11).                                                                                                                                                       |
| `status.ts`               | `statusPresentation(status, phase)` → `{label, modifier, api}` com os 7 estados do `vocabulary.md`; `IN_PORT`.                                                                                                                                                        |
| `halt.ts`                 | `HALT_REASONS` com os 9 textos exatos do `vocabulary.md`, `isHaltReason`, `explainHalt(reason, detail?)`.                                                                                                                                                             |
| `outcome.ts`              | `outcomePresentation(value)` para gates e runs; desconhecido fica neutro (`queued`).                                                                                                                                                                                  |
| `models.ts`               | `MODEL_SLOTS`, `CREW`, `MODEL_SOURCE_LABELS`, `EFFORT_SOURCE_LABELS`, `crewLabel` (reserva: texto da API, G14), `reviewersConflict`.                                                                                                                                  |
| `aiu.ts`                  | `formatAiu`/`parseAiu` só com aritmética inteira, `remainingNano`, `budgetPercent`, `capCoversSpent`.                                                                                                                                                                 |
| `time.ts`                 | `relativeTime`, `absoluteTime`, `waitingTime`, `formatDuration`; `now` por parâmetro.                                                                                                                                                                                 |
| `identifiers.ts`          | `STORY_KEY_PATTERN`/`isStoryKey`, `shortSha`, `actorLabel`, `formatTokens`.                                                                                                                                                                                           |
| `text-diff.ts`            | `diffLines`, `hunks`, `changedBlocks` e `markdownBlocks` sobre `diff` 9.0.0 (jsdiff). Única implementação de diff do projeto.                                                                                                                                         |
| `package.json`            | `diff` `9.0.0` (runtime, exato; aprovado no §10). O `package-lock.json` só ganhou essa entrada.                                                                                                                                                                       |
| `.prettierignore`         | As cópias de skills (`.agents/`, `.opencode/`, `.github/skills/`) ficam fora do Prettier (decidido pelo utilizador a 2026-10-06), para o `format:check` do CI ficar verde.                                                                                            |

Decisões que convém rever:

- `explainHalt().short` é sempre um prefixo exato do texto do `vocabulary.md` (a primeira frase quando há mais do que
  uma; o texto todo quando não há), para não inventar palavras. Onde o wireframe tem rótulo próprio ("The run failed
  before any prompt"), a 3A pode usá-lo na coluna "What's needed".
- `formatAiu` imprime exatamente `decimals` casas; quem mostra caps inteiros passa `0` ("12.4 / 30 AIU").
- Estado ou outcome desconhecidos ficam neutros; um motivo de halt desconhecido mostra o código da API tal como está.
- Os índices de `changedBlocks` referem-se a `markdownBlocks(next)`; `markdownBlocks` fica exportada para a 1C/4B
  partirem o markdown da mesma maneira.
- `types.ts` é provisório: não há `schema.d.ts` em `main` (a 2A ainda não correu).

### Provas (offline, 0 AIU, Node 24.21.0)

- `npm run build` exit 0; `npm run typecheck` exit 0 (`check-boundaries: ok`); `npm run lint` exit 0;
  `npm run format:check` exit 0 (depois de ignorar as cópias de skills no `.prettierignore`).
- `npm test`: **10 ficheiros, 233 testes, 0 falhas** — 218 novos: `aiu` 53, `time` 32, `identifiers` 27, `text-diff`
  26, `halt` 24, `outcome` 21, `models` 15, `phases` 11, `status` 9.
- `parseAiu`/`formatAiu`: ida e volta exata em `0.1`, `12.4`, `24.06`, `30`, `0.000000001`; recusa `1e3`, `-1`, `+1`,
  `25.`, `.5`, `25,5`, 10 casas e valores fora de `Number.isSafeInteger`; `formatAiu` recusa não-inteiros e `NaN`.
- `text-diff`: igual, só adições, só remoções, linha alterada, linha movida, vazio, hunks com 3 de contexto,
  merge/split de hunks, secção `@@ Summary @@`/`@@ WP1 … @@`, `@@ @@` sem secção; `changedBlocks` (bloco novo,
  alterado, removido, igual, sem revisão anterior, documento anterior vazio).
- `check-boundaries: ok` confirma que `domain/` não importa Angular, rxjs, `node:`, `core`, `ui` nem `features`; a
  única importação externa é o `diff`.
- `npx prettier --check src/app/domain` verde.

### Não correu / saltado, e porquê

- **`npm run format:check` (repo inteiro): estava vermelho antes desta lane**, por 24 ficheiros `.md` em `.agents/`,
  `.opencode/` e `.github/skills/` (commit 132728f "Added skills"). Resolvido neste PR com a decisão do utilizador:
  essas cópias passam a estar no `.prettierignore`, como `docs/design/`. Agora verde.
- **Nada contra a API, o mock ou `--simulate`:** a lane é TypeScript puro, sem I/O; não havia nada para correr.

### Needs from lane 2A

- Substituir `src/app/domain/types.ts` por reexports do `schema.d.ts` gerado, com os nomes de domínio, e confirmar os
  nomes dos campos e os valores dos enums (`RunStatus`, `GateOutcome`, `ModelSlot`, `SlotModel`/`ModelPlan`,
  `HaltReason`) contra o contrato real. Até lá são provisórios.
- Confirmar a forma de `ModelPlan` que o `reviewersConflict` lê (`slots["review-design"|"review-defect"].model`).

### Needs from lanes 1B/1C/4B/4C/4D/5A/5C (contrato a consumir)

- `changedBlocks` devolve índices para `markdownBlocks(next)`; a 1C deve partir o markdown com a mesma função.
- `explainHalt` devolve `{short, text, detail}`; o `detail` vem separado para o banner o poder citar (4A).
- `reviewersConflict(plan)` devolve o modelo em conflito ou `null` (4D).
- `outcomePresentation` devolve `{label, modifier}` com a palavra da API no label (1B/5A/5B).

### Próximos passos

- Revisão da lane (alimenta quatro lanes da Onda 2) e merge em `main` quando aprovada.
