# Ahoy Hosted: working rules

Hosted control plane for the Ahoy delivery harness. Layout, commands and local
tooling are in [README.md](README.md); the architecture and decisions (D1–D13)
are in [docs/design.md](docs/design.md).

## Start of every session

1. Read `docs/progress.md` ("Where we are", "Start here next" and "Prompt for a
   new session"). It is the handoff and the source of truth for what is
   proven, what is only proven offline and what needs approval.
2. Check `git status` if this is a checkout (the redacted copy made by
   `npm run redact` has no `.git`, `.work/` or `.local/`).
3. Continue from the first open item unless the user says otherwise.

## Never without a specific, explicit approval from the user

Earlier approvals, unspent budget and the presence of credentials grant nothing.

- **Spend AIU.** That covers `AHOY_DISPATCH=docker` or `k8s`,
  `npm run dev -- --live`, and the worker CLI without `--check`
  (`npm run probe:k8s` uses a stub worker and is 0 AIU). Every live run needs its own approval
  and an AIU cap. Use a fresh `runId` for every run, including `--check`.
- **Answer an agent's question, approve or send back a human gate, or resume a
  halted story.** POC answers must be labelled "POC test answer, not a
  product decision".
- **Touch Azure.** Migrating a database needs connection details, explicit
  approval and `ahoy-migrate --dry-run` first.
- **Commit, push or rewrite history.** Preserve uncommitted changes.

## Evidence and secrets

- Never drop, reset or overwrite `ahoy_live_001`, `ahoy_dev_live`,
  `.work/hosted-live-001/`, `.work/dev-live/` or any `.work/<run>/` directory.
  Tests copy evidence; they never modify it.
- Never display, copy into docs or commit `.local/worker.env`,
  `.local/mcp-*.json` or tokens. `.local/` and `.work/` are gitignored and
  hold story data.
- `agents-github-repository` (agents, skills, knowledge, `phases.tsv`) and child repos are
  read-only here. Do not add application code or apply run outputs there.

## Code

- TypeScript and ESM throughout. Tests use `node:test`, and tests that need a
  database skip without the local Postgres
  (`packages/core/scripts/dev-postgres.sh start`, 127.0.0.1:55432).
- Before calling work done, run `npm run build && npm run typecheck && npm test`.
  `typecheck` also runs `scripts/check-boundaries.mjs` (D13):
  - `core` has no HTTP, Docker, SDK or Ajv code;
  - `apps/*` never import each other.
- Offline and 0 AIU by default. Prefer fakes (`FakeDispatcher`,
  `FakeGateRunner`), replayed runs and `alpine` probes over live runs.
- Match the surrounding code: short doc comments on exported symbols, and
  Python-parity notes where a port mirrors `agents-github-repository`.

## TypeScript

Every package extends `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`,
`noFallthroughCasesInSwitch` and `verbatimModuleSyntax`. Don't weaken it; a
package's own `tsconfig.json` only sets `outDir`, `rootDir` and `include`.
Prettier is the formatter (`npm run format` / `npm run format:check`); Husky
runs `lint-staged` on staged files before commits. Full-repository formatting
is not automatic; the remaining style conventions still apply.

- **Optional properties.** Under `exactOptionalPropertyTypes`, `x?: T` means
  "absent", not "`undefined`". Choose deliberately:
  - For an object you build (JSON, SDK options), leave the key out with
    `...(v !== undefined ? { v } : {})`.
  - Use `x?: T | undefined` only for types that really hold `undefined`,
    such as a validated `RunSpec` or an assembled `RunResult`.
  - Before changing an SDK call, check the SDK: it may spread your options
    over its defaults, where an explicit `undefined` overrides them.

- **Modules.** ESM with `NodeNext`:
  - relative imports end in `.js`;
  - built-ins use `node:`;
  - other packages are imported as `@ahoy/<pkg>/<path>.js`;
  - use `import type` for type-only imports.
- **No escape hatches.** Production code contains no `any`, no
  `@ts-ignore`/`@ts-expect-error`, and no new `as unknown as`.
  - Use `!` only where an invariant guarantees the value. Tests may use it
    freely.
  - Tests may loosen JSON fixtures, but prefer real types.
- **Untrusted data.** Treat everything from outside the process as `unknown`
  and validate it before use: `result.json`, `state.json`, `events.jsonl`,
  run outputs, HTTP bodies, env and config files.
  - Narrow with type guards (`isDict`, `Number.isSafeInteger`, and so on).
  - The API validates with Ajv against `openapi/ahoy-v1.yaml`.
  - An `as` cast comes only after the check it relies on.
- **No `enum`, `namespace` or default exports.** Use `as const` arrays and
  union types (`GATE_WORDS`, `PORTED_GATES`) and named exports.
- **Errors.** Catch variables are `unknown`; narrow with
  `e instanceof Error ? e.message : String(e)`.
  - Expected outcomes are values, not exceptions: gate verdicts, run
    statuses, `Problem` for API errors.
  - Never let a tooling failure look like a domain verdict.
- **Purity and I/O.** `packages/core` domain code and `gates/` are pure: no
  file system, network, clock or env. Time comes in as a parameter
  (`now = new Date()`). File, Docker and HTTP I/O live in `apps/*`.
- **Numbers.** AIU is counted in integer nano-AIU (`budgetNanoAiu`,
  `nanoAiu`). Validate with `Number.isSafeInteger` and never use floats for
  money-like values.
- **Dependencies.** Runtime dependencies are pinned exactly (`"pg": "8.23.0"`);
  dev dependencies use `^`. Ask before adding any dependency.
- **Style.** 2 spaces, double quotes, semicolons, lines up to about 120
  characters, `readonly` where a field never changes, and small exported
  functions with a one-line doc comment.
- **Tests.** Use `node:test` with `node:assert/strict`. They are compiled to
  `dist/` and run from there. Use hand-written fakes, not mocking libraries.
  Name each test after the behaviour it proves.

## Reporting and handoff

- After each item, update `docs/progress.md`: what changed, the test counts,
  what was skipped and why, and the remaining steps. Also update the header,
  "Prompt for a new session", the README "Status" section and the status in
  `design.md` §11.
- Be exact about proof. State whether something ran live, ran offline, was
  only unit-tested or was not run at all. Name every skipped suite. Never
  describe a check that did not run as passed.
