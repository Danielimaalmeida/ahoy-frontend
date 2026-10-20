# ahoy-frontend

The web front end of Ahoy, in Angular 22. It talks to the `/api/v1` of
[`ahoy-hosted`](https://github.com/Danielimaalmeida/ahoy-hosted) and implements the Claude Design wireframes and design
system copied into [docs/design/](docs/design/SOURCES.md).

- Working rules for agents: [CLAUDE.md](CLAUDE.md).
- Architecture and decisions (F1–F16): [docs/architecture.md](docs/architecture.md).
- Handoff and proof of what ran: [docs/progress.md](docs/progress.md).
- Engineering review of the harness (2026-10-20):
  [ahoy-hosted/docs/harness-review-2026-10-20.md](https://github.com/Danielimaalmeida/ahoy-hosted/blob/main/docs/harness-review-2026-10-20.md).

## Requirements

- **Node `^22.22.3`, `^24.15.0` or `>=26`** (Angular 22's range). `.nvmrc` says 24. If `node -v` is older,
  `npx node@24` provides one.
- npm (the lockfile is `package-lock.json`) and access to the company's private registry for `@acme-fedev/*`. Without
  it `npm ci` fails, so nothing below can run (GitHub-hosted CI and cloud sessions included).

## Layout

```
src/
  main.ts, index.html, styles.scss
  styles/                 tokens.css (generated) and the design-system bundle
  environments/           environment.ts (default) | environment.test.ts | environment.local.test.ts
  testing/                fixtures/, mock-backend/ (tests only)
  app/
    app.ts, app.config.ts, app.routes.ts      composition root
    domain/               pure TypeScript: types, vocabulary, phases, AIU, time
    core/                 api/, auth/, config/, realtime/, stores/, commands/, mock/
    ui/                   design-system components (ah-*), placeholder/, _kit/ (dev-only gallery)
    features/             harbour/, voyages/, set-sail/, docks/, voyage/ (shell + tabs/), run-detail/, metrics/,
                          meetings/
scripts/check-boundaries.mjs                  layer rules, part of npm run typecheck
src/proxy.conf.json                           dev-server proxy to a local hosted API (proxy.conf.mjs is not read)
docs/design/                                  copies of the wireframes and the design system (don't edit)
```

## Commands

| Command                    | What it does                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm start`                | `ng serve` on <http://localhost:4200> with the API proxy (`src/proxy.conf.json`).                                     |
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

The browser only calls the relative `/api/v1`. `src/proxy.conf.json` forwards `/api` to `http://127.0.0.1:8080` with
`X-Ahoy-Actor: dev-user`, which the API needs in `AHOY_AUTH=dev`, and the WebEAM paths to the SSO host.

`AHOY_AUTH=dev` and the default proxy are for local development only; the proxy never ships to production. With a
WebEAM session the app sends `Authorization: Bearer` (F8, `docs/architecture.md`). `npm run start:test` is the explicit
exception for a local browser session against TEST; do not use it for unit/e2e validation or mutating actions without
approval.

## Status

What is proven, what only ran offline and what comes next is in [docs/progress.md](docs/progress.md). The status
changelog that used to be here is in git history (`git show b1f9b88:README.md`).
