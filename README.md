# ahoy-frontend

The web front end of Ahoy, in Angular 22. It talks to the `/api/v1` of
[`ahoy-hosted`](https://github.com/Danielimaalmeida/ahoy-hosted) and implements the Claude Design wireframes and design
system copied into [docs/design/](docs/design/SOURCES.md).

- Working rules for agents: [CLAUDE.md](CLAUDE.md).
- Architecture and decisions (F1–F16): [docs/architecture.md](docs/architecture.md).
- Implementation plan, lanes and waves: [docs/plan/00-overview.md](docs/plan/00-overview.md).
- Handoff and proof of what ran: [docs/progress.md](docs/progress.md).

## Requirements

- **Node `^22.22.3`, `^24.15.0` or `>=26`** (Angular 22's range). `.nvmrc` says 24. If `node -v` is older,
  `npx node@24` provides one.
- npm (the lockfile is `package-lock.json`).

## Layout

```
src/
  main.ts, index.html, styles.scss
  styles/                 tokens.css (generated) and the design-system bundle (lane 1A)
  environments/           environment.ts (production) | environment.development.ts | environment.mock.ts (lane 2D)
  testing/                fixtures/, mock-backend/ (tests and the mock build only)
  app/
    app.ts, app.config.ts, app.routes.ts      composition root
    domain/               pure TypeScript: types, vocabulary, phases, AIU, time
    core/                 api/, auth/, config/, realtime/, stores/, commands/
    ui/                   design-system components (ah-*), placeholder/, _kit/ (dev-only gallery)
    features/             harbour/, voyages/, set-sail/, docks/, voyage/ (shell + tabs/), run-detail/
scripts/check-boundaries.mjs                  layer rules, part of npm run typecheck
proxy.conf.mjs                                dev-server proxy to the hosted API
docs/design/                                  copies of the wireframes and the design system (don't edit)
```

## Commands

| Command                    | What it does                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm start`                | `ng serve` on <http://localhost:4200> with the API proxy (`proxy.conf.mjs`).                                          |
| `npm run start:mock`       | Does not exist since commit `f49c7da`; see "Found" in `docs/progress.md` for what works instead.                      |
| `npm run start:test`       | `ng serve` with the `test` configuration and the checked-in TEST API proxy (`src/proxy.conf.test.json`).              |
| `npm run build`            | Production build into `dist/ahoy-frontend/`.                                                                          |
| `npm test`                 | Unit and component tests (Vitest through `ng test`, jsdom), once.                                                     |
| `npm run test:coverage`    | Unit tests without watch mode; writes `coverage/coverage-summary.json`, `coverage-final.json`, HTML and LCOV reports. |
| `npm run lint`             | ESLint (TypeScript, templates and accessibility rules).                                                               |
| `npm run typecheck`        | `tsc --noEmit` for app and specs, then `scripts/check-boundaries.mjs`.                                                |
| `npm run check:boundaries` | Only the layer rules.                                                                                                 |
| `npm run format`           | Prettier check on the whole repository (writes nothing); `npm run format:fix` writes.                                 |

Before calling work done: `npm run build && npm run typecheck && npm run lint && npm test && npm run format`.

## Running against the hosted API (local, 0 AIU)

```bash
cd ../ahoy-hosted && npm run dev -- --simulate   # local API with AHOY_AUTH=dev, simulated runs (0 AIU)
cd ../ahoy-frontend && npm start                 # http://localhost:4200
```

The browser only calls the relative `/api/v1`. `proxy.conf.mjs` forwards it and adds `X-Ahoy-Actor`, which the API needs
in `AHOY_AUTH=dev`:

| Variable          | Default                 | Meaning                                                         |
| ----------------- | ----------------------- | --------------------------------------------------------------- |
| `AHOY_API_TARGET` | `http://127.0.0.1:8080` | Where the proxy sends `/api/v1`.                                |
| `AHOY_ACTOR`      | `dev@example.com`       | Sent as `X-Ahoy-Actor`. Must match `actor` in the app's config. |

`AHOY_AUTH=dev` and the default proxy are for local development only; the proxy never ships to production, and the app
never sends `Authorization`. `npm run start:test` is the explicit exception for a local browser session against TEST;
do not use it for unit/e2e validation or mutating actions without approval.

## Status

- **Review fixes of PR #22 (2026-10-10, `claude/tender-johnson-pvbvmu`):** the refinement list no longer loses a refinement
  just asked for when an older read answers later, the halt diagnosis is read again only when the voyage's version moves,
  Back to intake waits for the runs, the Refinement buttons are named by their item, the dialogs share their text
  validators, and the Refine dialog stops at the 20 AIU cap the API now has. Offline build, typecheck, lint, 136 files /
  2,439 tests and formatting passed on Node 24.21.0 (public-registry install, auth library stubbed, nothing of that
  committed). The standalone mock server (`node scripts/mock-api.mjs`) does not start and `start:mock` does not exist
  (`docs/progress.md`). No browser, real API, `--simulate` or TEST check.
- **Halt diagnosis (2026-10-10, `claude/tender-johnson-pvbvmu`):** a halted voyage's Anchored banner adds the
  diagnosis from `GET /stories/{key}/diagnosis` (cause, action, who takes it, evidence as plain text), and "Needs you"
  adds its cause and who acts in one line per halted voyage. Contract, client, guard, fixture and mock included.
  Offline build, typecheck, lint, 134 files / 2,420 tests and formatting passed on Node 24.21.0 (same sandbox
  install); checked on the in-browser mock. No real API, `--simulate` or TEST check.
- **Backlog Refine (2026-10-10, `claude/tender-johnson-pvbvmu`):** each Backlog row offers "Refine" (optional notes,
  optional AIU limit, spend warning, `confirmSpend: true`) or "Refinement · <state>", which opens a detail row with the
  newest refinement's state, requester, spend, notes and exit reason, Cancel refinement (reason required) while it is
  queued or running, Refine again once it ended, and the agent's Markdown through `ah-markdown` when it succeeded. The
  list is read once with the page and polled every 5 s only while a refinement is in progress. Offline build,
  typecheck, lint, 132 files / 2,389 tests and formatting passed on Node 24.21.0 (same sandbox install as below); the
  flow was also clicked through in headless Chromium against the in-browser mock backend (a throwaway copy, external
  hosts blocked). No real API, `--simulate` API or TEST check was run.
- **Back to intake and the refinement contract (2026-10-10, `claude/tender-johnson-pvbvmu`):** vendored the hosted
  contract (refresh intake, superseded questions, backlog refinements), added the voyage header's Back to intake dialog
  (planning and plan review only, with the spend warning), read-only "Before the intake refresh" questions, the
  `ApiClient` refinement operations and their mock. Offline build, typecheck, lint, 130 files / 2,349 tests and
  formatting passed on Node 24.21.0 in a cloud sandbox (public-registry install, auth library stubbed, nothing of that
  committed). The Backlog's Refine action is not built yet; no browser, real API or TEST check was run.
- **Coverage summary workflow fix (2026-10-10):** `test:coverage` now generates both the JSON coverage report and
  `coverage/coverage-summary.md`. The converter is compatible with the repository's ESM package configuration and
  resolves paths independently of the runner's working directory.
- **Story budget units:** budget fields are entered and displayed in AIU; the frontend converts them to integer
  `budgetNanoAiu` values before API requests. The conversion is exact: **100 AIU = 100,000,000,000 nano-AIU**.
- **User-friendly nautical labels (2026-10-10):** updated visible status, navigation, action, dialog, error and activity
  copy to `Running`, `Needs answers`, `Needs decision`, `Halted`, `Done`, `Blocked`, `Finished`, `Needs you`, `Backlog`,
  `Activity`, `In progress`, `Start voyage` and the corresponding plain-language confirmations, while preserving API
  values, routes and CSS modifiers. Offline build, typecheck, lint, 126 files / 2,267 tests and formatting passed on
  Node 24.21.0. No browser/e2e, live API or TEST checks were run.
- **Set Sail model selection (2026-10-09):** native dropdowns now read the server's catalogue from `GET /models`,
  show per-phase defaults and retain Other model id for custom choices. Known effort support is respected; loading
  and catalogue failures have status/retry feedback. The catalogue is not an account entitlement check.
  Offline build, typecheck, lint, 126 files / 2,267 tests and formatting passed on Node 24.21.0. Browser/e2e and
  real API checks were not run. `api:check` has a pre-existing raw-generator/Prettier formatting mismatch, not a
  missing type change; the mirror check passes. The Models dialog keeps text inputs. See [docs/progress.md](docs/progress.md).
- **NGINX container fix (2026-10-09):** the document root now matches the Dockerfile's
  `/opt/app-root/src/ahoy-frontend`; logs go to stdout/stderr and `USER 1001` is retained. A local smoke check using
  cached NGINX 1.29.4 reproduced HTTP 500 with the old root and verified HTTP 200 for the production index, a SPA route
  and JavaScript with the corrected root. Offline build, typecheck, lint, 2,237 tests and formatting passed on Node 24.
  The released image and remote probes have not been verified; see [docs/progress.md](docs/progress.md).
- **Single-review contract migration (2026-10-09):** regenerated the OpenAPI types/mirror and updated the UI and mock
  workflow to use one `review` slot and one Lookout run; Set Sail and the Models dialog no longer require two distinct
  reviewer models. Offline checks on Node 26.0.0 passed: API artifact check, build, typecheck, lint, 126 test files /
  2,237 tests, and targeted formatting of changed source files. Repository-wide `npm run format` still warns on three
  copied wireframes and three OpenAPI/generated files; see [docs/progress.md](docs/progress.md). No browser, live API or
  TEST check was run. At that point, `GET /models` was not implemented; it is now covered above.
  Phase-7 `resolveReview` is still not implemented in `ApiClient`.
- **User menu (2026-10-08):** the header reads the reactive Fedev auth profile and shows initials, name, email and
  Log out using Ahoy tokens. The display name and initials use `given_name` and `family_name`. Full offline validation
  passes on Node 24.21.0: build, typecheck, lint, 126 test files / 2,256 tests, formatting and generated-token checks.
  No API or TEST environment was used; real SSO logout and browser comparison remain unproven. See
  [docs/progress.md](docs/progress.md).
- **CI coverage fix (2026-10-07):** installed the approved Vitest V8 provider and configured root-level JSON reports for
  the reusable coverage workflow. Report generation itself was proven offline with 222 pure-domain tests. The full
  Angular suite now also passes; the `field.spec.ts` case table has explicit types. See
  [docs/progress.md](docs/progress.md).
- **Phase 0 (foundation): done and merged into `main`.** Angular 22.2.1 scaffold, strict TypeScript, ESLint, Prettier,
  Husky, CI, proxy, every route as a placeholder, design references copied. The proxy was checked against a local stub,
  not the hosted API.
- **Wave 1, lane 1A (kit foundation): done and merged into `main`** (PR #4). Generated `tokens.css` (`npm run tokens`,
  `npm run tokens:check`), the design-system bundle on every page, `ThemeService`, `ah-icon`, `ah-logo`, `ahButton`,
  `ah-panel`, `ah-field`, `ah-banner`, table helpers, `ah-source`, and the dev-only `/_kit` gallery with a light/dark
  switch. Unit-tested and checked in headless Chromium; no API involved.
- **Wave 1, lane 2A (API client): done, offline, and merged into `main`** (PR #5 and PR #7): `ApiClient` with the 19 operations
  of phases 3 to 6, `ApiError`, guards, `AuthStrategy`, `CurrentUser`, the runtime `AppConfig`, fixtures, the vendored
  contract. The finishing pass (PR #7) added `openapi-typescript`,
  `ajv` and `yaml` installed, `schema.d.ts` generated (`npm run api:types`, checked by `npm run api:check`, which `npm run lint`
  runs), `core/api/types.ts` on the generated types, and `contract.spec.ts` (fixtures, problems and request bodies against the
  YAML with Ajv). Never run against a real API.
- **Lane 2C (pure domain): done and merged into `main`** (PR #3). `src/app/domain/` holds the vocabulary mappings, the AIU
  and time helpers and the project's only diff implementation. Its `types.ts` did not match the contract; the 2A finishing pass
  corrected it (the contract is sovereign) and `core/api/domain-types.spec.ts` keeps it identical (see
  [docs/progress.md](docs/progress.md)).
- **Wave 2, lane 2B (realtime and stores): done and merged into `main`** (PR #8). `FETCH`, `CLOCK`, `parseSseStream`, `EventStreamClient` (fetch, `Last-Event-ID`, back-off, terminal 4xx),
  `EventBus` (one global connection) with the polling fallback, `StoriesStore`, `StoryStore`, `RunProgressBuffer` and
  `StoryEventsFeed`, with 146 new tests on a fake `fetch`, a fake clock and a fake API. No screen uses them yet; never run
  against an API or the mock backend.
- **Wave 2, lane 1B (kit: state, progress and navigation): done and merged into `main`** (PR #9). `ah-status-badge`,
  `ah-phase-stepper`, `ah-budget-meter`, `ah-outcome-pill`, `ah-filter-chips`, `ah-section-tabs`, `ah-top-bar` (with the Live
  indicator), `ah-empty-state`, `ah-skeleton`, the toast and the pipes `ahAiu`, `ahRelative`, `ahDateTime`, `ahActor`, with 11
  more sections in `/_kit`. Unit-tested and compared with the design-system previews in headless Chromium; no data, mock or API
  involved.
- **Wave 2, lane 1C (kit: interaction and content): done and merged into `main`** (PR #10). `ah-dialog` on the CDK `Dialog`,
  `ah-choice-card-group`, `ah-question-card`, `ah-model-choice-table`, `ah-live-steps`, `ah-ships-log`, `ah-artifact-diff` and
  `ah-markdown` (untrusted markdown, XSS-tested), each in `/_kit`; adds `@angular/cdk` 22.2.1 and `marked` 18.1.0.
  Unit-tested and checked in headless Chromium; no API involved.
- **Wave 2, lane 2D (mock backend): done and merged into `main`** (PR #11).
  `MockAhoyServer` (`src/testing/mock-backend/`): the 19 operations with the contract's checks, versions and errors, a simulated
  reconciler, `/events/stream` with `Last-Event-ID`, switches (`latencyMs`, `failNext`, `conflictNext`, `dropStream`) and the
  eight voyages of the wireframes, checked against the YAML with Ajv; `npm run start:mock` serves it in the browser and
  `npm run mock:api` over HTTP on `127.0.0.1:8080` behind the real dev proxy, with no new dependency;
  `node scripts/mock-api.dist-check.mjs` proves the production build is free of it. 80 new tests; never run against a real API.
- **Wave 3, lane 3A (shell, All hands and Voyages): done and merged into `main`** (PR #12). `src/app/app.ts` is the shell (top bar with the needs-you count, the Live indicator and the user; search to
  `/voyages?q=`; one `main`; toasts; the saved theme), `src/app/features/harbour/` is All hands (`/`: tiles, "Needs you" with
  "What's needed" and an action by status, "At sea", "Calm seas") and `src/app/features/voyages/` is Voyages (`/voyages`: chips with
  `?status=`, table with stepper and Note, `?q=`, Load more, skeleton, empty and error states). Both follow the event stream. 143
  new tests; checked on `npm run start:mock` in headless Chromium against the `Main` and `Voyages` boards, light and dark, at
  1440 px and 390 px; never run against a real API.
- **Wave 3, lane 3B (Set sail): done on the mock backend and merged into `main`** (PR #13).
  `/voyages/new?key=&title=` is a typed Reactive Form on `ah-field` and `ah-model-choice-table`: the budget is read by `parseAiu`
  (never a float), only the models the user filled in are sent, a double click sends one request, and `story_exists`, `400` and
  the other refusals show beside the fields or in a banner without losing what was typed. 114 new tests (three agreed seams, 26 mutation checks, a two-axis review whose findings were fixed); driven in headless Chromium on `npm run start:mock`; never run against a real API.
- **Wave 3, lane 3C (The Docks, Jira backlog integration): integration pushed; sprint layout implemented locally.** `/docks` now reads
  `GET /api/v1/jira/backlog` through `JiraBacklogAdapter`; the existing filters, pagination and **Ahoy** column remain,
  joined to the real voyages in the `StoriesStore`. The offline mock serves fictional Jira issues for local validation;
  the `StubBacklogAdapter` remains available for tests and wireframe scenarios. The updated Backlog wireframe adds
  sprint groups, a sprint/no-sprint filter and Collapse all / Expand all; global pagination stays at 25 items.
  Tables use fluid columns on wide screens and labelled stacked rows on smaller screens, without horizontal scrolling.
  Sprint dates/goals are omitted because the API does not expose them. Offline validation passed with
  128 test files and 2,290 tests, plus a mock-only desktop/mobile browser check; no real API was used by the agent.
  Repository formatting reports only the user's untouched new `docs/design/wireframes/Backlog.html`.
- **Wave 4, lane 4B (Plan tab and decision): done on the mock backend, merged into `main` (PR #16)** (branch
  `claude/pensive-ritchie-9ja01b`). `src/app/features/voyage/tabs/plan/`: the plan with changed blocks marked, acceptance criteria,
  "Your decision" (Approve; Send back and Reject in dialogs) and the conflict panels. 54 new tests; never run against a real API.
  Details in [docs/progress.md](docs/progress.md).
- **Wave 3, lane 4A (voyage base): done on the mock backend, merged into `main`** (PR #15) (branch
  `claude/quirky-gates-t6b390`, with `main` and lanes 3A, 3B and 3C merged in; pull request into `main`). `/voyages/:key`
  shows the real voyage page:
  - header, primary action, Anchored banner, tabs with counts and the default tab;
  - `VoyageContext` and `CommandRunner` (`core/commands/`);
  - the Stop, Resume and Budget dialogs, which keep the text through a conflict and send one request per double click.

  Tested on the mock backend (120 new tests) and checked in headless Chromium; the tabs stay placeholders for wave 4. Never
  run against a real API.

- **Wave 4, lane 4C (Questions): done on the mock backend, committed and pushed, in review** (branch `claude/jolly-pascal-ngq59j`, PR #17,
  from `main` at 959a7b4, with lane 4B merged in). `/voyages/:key/questions` lists the questions by round (the newest
  open, earlier ones folded) with "{k} of {n} answered" and a meter, an `ah-question-card` each, and "What happens next".
  Answers are final: nothing is sent without a click on "Send answer", and "Use recommendation" only fills the field.
  Unsent answers are drafts in memory and `sessionStorage` (`ahoy.draft.{key}.{Qn}`) that survive a conflict, a refresh of the
  store and a page reload. 47 new tests; checked on `npm run start:mock` in headless Chromium; never run against a real API.
- **Wave 4, lane 4D (Models tab and Change models dialog): done on the mock backend, committed and pushed, in review** (branch
  `claude/gifted-einstein-2wo0ou`, PR #18, from `main` at 959a7b4, with `main` at f795359 (lanes 4B and 4C) merged in). `/voyages/:key/models` shows "Models per phase"
  (sources, "Chosen for this voyage", Change and Reset, "refused last run") and the Change models dialog, which sends only
  the changed slots (`null` resets; a model alone is `{model}`), blocks two Lookouts on one effective model and opens by
  itself with `?change=<slot>`. 45 new tests; checked in headless Chromium (light, dark, 390 px); never run against a real
  API.
- **Wave 4, lane 5A (Runs, run detail and live steps): done on the mock backend, committed on
  `claude/epic-albattani-81fip3`.** The Runs tab (`src/app/features/voyage/tabs/runs/`) has the live panel (run spend against the
  run's own cap, `ah-live-steps` with "N steps not shown" rows and `[REDACTED]`, "This run"), kept as history once the run
  ends, and the oldest-first table with the live AIU and the gate. Run detail
  (`src/app/features/run-detail/`, `/voyages/:key/runs/:runId`) has the pager, four tiles, Details, Automated gate and Steps.
  The steps are a view, not a control. 57 new tests on the mock backend; checked in headless Chromium (light, dark, 390 px).
  Never run against a real API.
- **Wave 4, lane 5C (Artifacts): implemented and unit-tested.** `/voyages/:key/artifacts` now has revision selection,
  View/Compare modes, lazy file reads with ETag caching, text/JSON/Markdown previews and change summaries. The external
  component template is `artifacts-tab.html`. Artifacts and routing: 10 tests passed on the in-memory mock. Build, typecheck,
  ESLint and formatting pass; full tests and stylelint have unrelated failures. Fractional-token Sass errors are repaired,
  and the preview spacing is corrected. Browser mock startup remains unwired; no browser verification was performed.
  Details and exact check status are in [docs/progress.md](docs/progress.md).

- Next: clear lane 5C's validation blockers before review, and review/merge lanes 4C, 4D and 5A; then the rest of wave 4
  (`docs/paralelos4.md`). Details in
  [docs/progress.md](docs/progress.md).

# r3da_neo_ahoy_frontend

# r3da_neo_ahoy_frontend

# r3da_neo_ahoy_frontend
