# Ahoy frontend: working rules

Angular 22 web front end for Ahoy, talking to the `/api/v1` of `ahoy-hosted`. Layout, commands and local tooling are in
[README.md](README.md); the architecture, decisions (F1–F16), layer rules (§5) and approved dependencies are in
[docs/architecture.md](docs/architecture.md). The engineering review of 2026-10-20 is `ahoy-hosted`'s
`docs/harness-review-2026-10-20.md`.

## Start of every session

1. Read `docs/progress.md` (one page). It is the handoff and the source of truth for what is proven, what is only
   proven offline and what needs approval.
2. Check `node -v`: Angular 22 needs `^22.22.3 || ^24.15.0 || >=26` (`.nvmrc` says 24). If it is older, use
   `npx node@24` and say so in the report.
3. Check `git status` and the branch: work on the branch the session names.
4. Continue from the first open item of "Next" in `docs/progress.md` unless the user says otherwise.

## Never without a specific, explicit approval from the user

Earlier approvals, unspent budget and the presence of credentials grant nothing.

- **Spend AIU.** Never run the app, tests or e2e against an API started with `--live` or against the TEST environment.
  Use a local `ahoy-hosted` started with `npm run dev -- --simulate` (0 AIU) or the fakes in `src/testing/` (the
  in-browser mock backend is not wired into any build configuration).
- **Answer an agent's question, approve or send back a human gate, stop or resume a voyage, or change its budget or
  models** on a real API. Test answers must be labelled "POC test answer, not a product decision".
- **Touch Azure or the TEST environment.**
- **Commit, push or rewrite history.** Preserve uncommitted changes.
- **Add a dependency.** Only the list in `docs/architecture.md` ("Approved dependencies") is approved; anything else
  needs a new approval.

## Evidence and secrets

- Never display, copy into docs or commit tokens, `.env` files or `.local/`.
- The app sends `Authorization: Bearer` only with the WebEAM token, through `FedevAuthStrategy` (F8). `X-Ahoy-Actor` is
  added by the dev-server proxy for `AHOY_AUTH=dev`, which is local only; the proxy never ships to production.
- Example data is fictional (PROJ-123, alex@example.com). Never put real story content in fixtures, docs or design
  tools; captured API responses are reviewed before any commit.
- `docs/design/` is a copy of the Claude Design artifacts (`docs/design/SOURCES.md`): re-sync it, don't edit it.
  `ahoy-hosted`, `agents-github-repository` and child repos are read-only from here.

## Code

- Angular 22 (standalone, zoneless, signals, OnPush by default), TypeScript 6.0, SCSS. Unit and component tests use
  Vitest through `ng test` (`@angular/build:unit-test`, jsdom); e2e uses Playwright.
- Before calling work done, run `npm run build && npm run typecheck && npm run lint && npm test && npm run format` on
  Node 24 (`npm run format` checks). They need the company's private npm registry (`@acme-fedev/*`): where it cannot be
  reached (cloud sessions, GitHub-hosted CI), none of them can run, so say so and do not call the work done.
  `typecheck` also runs `scripts/check-boundaries.mjs` (`docs/architecture.md` §5.2):
  - `domain/` is pure TypeScript: no Angular, rxjs, `node:`, `core`, `ui` or `features`;
  - `ui/` imports only `domain` and Angular, never `core` or `features`;
  - `core/` imports `domain` and Angular, never `ui` or `features`;
  - a feature never imports another feature; what two features share moves to `core` or `ui`;
  - production code never imports `src/testing/`.
- Offline and 0 AIU by default. Prefer fakes (the mock backend, a fake `FETCH`, `HttpTestingController`) over a running
  API.
- Match the surrounding code: short doc comments on exported symbols.

## TypeScript

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature` and `verbatimModuleSyntax`, and
Angular's `strictTemplates`, `strictInjectionParameters` and `strictInputAccessModifiers`. Don't weaken it; if a flag
clashes with an Angular type, stop and ask. `tsconfig.app.json` and `tsconfig.spec.json` only set `outDir`, `types`,
`include` and `exclude`. Prettier is the formatter (`npm run format` checks, `npm run format:fix` writes); Husky runs
`lint-staged` on staged files before commits. ESLint (`npm run lint`) enforces the rules below that a tool can check.

- **Optional properties.** Under `exactOptionalPropertyTypes`, `x?: T` means "absent", not "`undefined`". Choose
  deliberately:
  - For an object you build (a request body, options), leave the key out with `...(v !== undefined ? { v } : {})`.
  - Use `x?: T | undefined` only for types that really hold `undefined`.
  - Before passing options to an Angular or library API, check whether it spreads them over its defaults, where an
    explicit `undefined` overrides them.
- **Modules.** ES modules with `"moduleResolution": "bundler"` (the Angular CLI default):
  - relative imports have **no** extension (`./app.routes`, not `./app.routes.js`);
  - across layers use the aliases `@domain/*`, `@core/*`, `@ui/*`, `@features/*`, `@testing/*`; no top-level barrels;
  - built-ins use `node:` (scripts only);
  - use `import type` for type-only imports.
- **No escape hatches.** Production code contains no `any`, no `@ts-ignore`/`@ts-expect-error`, and no new
  `as unknown as`.
  - Use `!` only where an invariant guarantees the value. Tests may use it freely.
  - Tests may loosen JSON fixtures, but prefer real types.
- **Untrusted data.** Treat everything from outside the app as `unknown` and validate it before use: API responses, SSE
  events, `config.json`, `localStorage`, route params and query strings.
  - Narrow with type guards (`isStory`, `Number.isSafeInteger`, and so on) in `core/api`; types are generated from the
    vendored `openapi/ahoy-v1.yaml`.
  - An `as` cast comes only after the check it relies on.
  - Agent text (plans, questions, logs) is untrusted: no `innerHTML` with API text outside the markdown component, never
    `bypassSecurityTrust*`.
- **No `enum`, `namespace` or default exports** (tool config files excepted). Use `as const` arrays and union types, and
  named exports.
- **Errors.** Catch variables are `unknown`; narrow with `e instanceof Error ? e.message : String(e)`.
  - Expected outcomes are values, not exceptions: API results (`ApiResult`), conflicts, run statuses.
  - Never let a tooling failure look like a domain verdict (`invalid_response` is not `gate_rejected`).
- **Purity and I/O.** `domain/` is pure: no Angular, network, storage, clock or env. Time comes in as a parameter
  (`now = new Date()`). HTTP, SSE and storage live in `core/`.
- **Numbers.** AIU is counted in integer nano-AIU (`budgetNanoAiu`, `nanoAiu`). Validate with `Number.isSafeInteger`,
  parse typed amounts from text without floats, and never use floats for money-like values.
- **Angular.** Standalone components with the `ah` selector prefix, `input()`/`output()`/`model()`, signals for state,
  OnPush (the default; ESLint forbids opting out), typed Reactive Forms, real `<button>`/`<a href>`/labelled inputs;
  templates pass the `angular-eslint` accessibility rules.
- **Dependencies.** Runtime dependencies are pinned exactly (`"@angular/core": "22.2.1"`); dev dependencies use `^`,
  except `typescript` (`~6.0.x`: Angular 22 needs `>=6.0 <6.1`). Ask before adding any dependency.
- **Style.** 2 spaces, double quotes, semicolons, trailing commas, lines up to about 120 characters, `readonly` where a
  field never changes, and small exported functions with a one-line doc comment.
- **Tests.** Vitest (`describe`/`it`/`expect`) with Angular's `TestBed`, in `*.spec.ts` next to the code. Use
  hand-written fakes, not module mocking (`vi.mock`). Name each test after the behaviour it proves.

## Reporting and handoff

- After each item, rewrite `docs/progress.md` (it stays one page): what is proven and how, the test counts, what was
  skipped or did not run and why, and "Next". The detail of a change goes in its commit message and pull request, not
  in the page. Git history is the archive: never keep old versions or changelogs as files.
- Be exact about proof. State whether something ran against the local API (`--simulate`), ran against the mock backend,
  was only unit-tested or was not run at all. Name every skipped suite. Never describe a check that did not run as
  passed.
