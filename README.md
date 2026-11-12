# ahoy-frontend

The web front end of Ahoy, in Angular 22. It talks to the `/api/v1` of
[`ahoy-hosted`](https://github.com/Danielimaalmeida/ahoy-hosted) and implements the Claude Design wireframes and design
system copied into [docs/design/](docs/design/SOURCES.md).

- Working rules for agents: [CLAUDE.md](CLAUDE.md).
- Architecture and decisions (F1–F18): [docs/architecture.md](docs/architecture.md).
- How the app uses the design system: [docs/design-system.md](docs/design-system.md); accessibility rules:
  [docs/accessibility.md](docs/accessibility.md).
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
scripts/redact.mjs                            redacted copy for an external model, and --unredact (as in ahoy-hosted)
src/proxy.conf.json                           dev-server proxy to a local hosted API
docs/design/                                  copies of the wireframes and the design system (don't edit)
```

## Commands

| Command                    | What it does                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm start`                | `ng serve` on <http://localhost:4200> with the API proxy (`src/proxy.conf.json`).                                     |
| `npm run start:local`      | `ng serve` with the `local` configuration: the same proxy, signed in as a fixed local user, no WebEAM (below).        |
| `npm run start:test`       | `ng serve` with the `test` configuration and the checked-in TEST API proxy (`src/proxy.conf.test.json`).              |
| `npm run build`            | Production build into `dist/ahoy-frontend/`.                                                                          |
| `npm test`                 | Unit and component tests (Vitest through `ng test`, jsdom), once.                                                     |
| `npm run test:coverage`    | Unit tests without watch mode; writes `coverage/coverage-summary.json`, `coverage-final.json`, HTML and LCOV reports. |
| `npm run lint`             | ESLint (TypeScript, templates and accessibility rules).                                                               |
| `npm run typecheck`        | `tsc --noEmit` for app and specs, then `scripts/check-boundaries.mjs`.                                                |
| `npm run check:boundaries` | Only the layer rules.                                                                                                 |
| `npm run format`           | Prettier check on the whole repository (writes nothing); `npm run format:fix` writes.                                 |
| `npm run test:scripts`     | The tests of `scripts/redact.mjs` (`node:test`, throwaway git repositories, made-up terms); needs no `npm ci`.        |

Before calling work done: `npm run build && npm run typecheck && npm run lint && npm test && npm run format`.

`scripts/redact.mjs` works as in `ahoy-hosted` (its `docs/developing.md`, "Sharing code with an external model"):
`node scripts/redact.mjs --force` writes `.work/redacted/`, `node scripts/redact.mjs --unredact --force [--in DIR]`
writes `.work/unredacted/`, with the rules in `scripts/redact-rules.txt` and `.local/redact-rules.txt`.

## Running against the hosted API (local, 0 AIU)

```bash
cd ../ahoy-hosted && npm run dev -- --simulate --web   # the local API (AHOY_AUTH=dev, 0 AIU) and this app, together
```

Or on their own: `npm run dev -- --simulate` in `ahoy-hosted`, then `npm run start:local` here (or `npm start` to sign
in through WebEAM). `--web` runs `ng serve --configuration local` in this clone (`AHOY_FRONTEND_DIR`, or the folder
next to `ahoy-hosted`) as its `[web]` process, and Ctrl-C stops it with the API. Run `npm ci` here first.

The `local` configuration (`src/environments/environment.local.ts`, `mockAuth: true`) gives the auth library's own
mock (`MockAuthService`) the user `LOCAL_USER` of `app.config.ts`: signed in at once, no company network needed. The
library refuses the mock when `production` is true. The local API ignores its token and takes the actor from the
proxy's `X-Ahoy-Actor`.

The browser only calls the relative `/api/v1`. `src/proxy.conf.json` forwards `/api` to `http://127.0.0.1:8080` with
`X-Ahoy-Actor: dev-user`, which the API needs in `AHOY_AUTH=dev`, and the WebEAM paths to the SSO host.

`AHOY_AUTH=dev` and the default proxy are for local development only; the proxy never ships to production. With a
WebEAM session the app sends `Authorization: Bearer` (F8, `docs/architecture.md`). `npm run start:test` is the explicit
exception for a local browser session against TEST; do not use it for unit/e2e validation or mutating actions without
approval.

## Status

What is proven, what only ran offline and what comes next is in [docs/progress.md](docs/progress.md). The status
changelog that used to be here is in git history (`git show b1f9b88:README.md`).
