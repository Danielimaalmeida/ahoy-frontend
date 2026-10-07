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

| Command                    | What it does                                                                      |
| -------------------------- | --------------------------------------------------------------------------------- |
| `npm start`                | `ng serve` on <http://localhost:4200> with the API proxy (`proxy.conf.mjs`).      |
| `npm run start:mock`       | `ng serve` with the `mock` configuration (the mock backend arrives with lane 2D). |
| `npm run build`            | Production build into `dist/ahoy-frontend/`.                                      |
| `npm test`                 | Unit and component tests (Vitest through `ng test`, jsdom), once.                 |
| `npm run lint`             | ESLint (TypeScript, templates and accessibility rules).                           |
| `npm run typecheck`        | `tsc --noEmit` for app and specs, then `scripts/check-boundaries.mjs`.            |
| `npm run check:boundaries` | Only the layer rules.                                                             |
| `npm run format`           | Prettier on the whole repository (`format:check` only checks).                    |

Before calling work done: `npm run build && npm run typecheck && npm run lint && npm test && npm run format:check`.

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

`AHOY_AUTH=dev` and this proxy are for local development only; the proxy never ships to production, and the app never
sends `Authorization`. **Never** point the proxy at an API started with `--live` or at the TEST environment.

## Status

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
- **Wave 2, lane 2D (mock backend): done, not committed** (working tree of `claude/blissful-wozniak-qr2816`, waiting for review).
  `MockAhoyServer` (`src/testing/mock-backend/`): the 19 operations with the contract's checks, versions and errors, a simulated
  reconciler, `/events/stream` with `Last-Event-ID`, switches (`latencyMs`, `failNext`, `conflictNext`, `dropStream`) and the
  eight voyages of the wireframes, checked against the YAML with Ajv; `npm run start:mock` serves it in the browser and
  `npm run mock:api` over HTTP on `127.0.0.1:8080` behind the real dev proxy, with no new dependency;
  `node scripts/mock-api.dist-check.mjs` proves the production build is free of it. 80 new tests; never run against a real API.
- Next: review and merge lane 2D, then wave 3 (`docs/paralelos3.md`). Details in [docs/progress.md](docs/progress.md).
