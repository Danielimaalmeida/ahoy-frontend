# Ahoy frontend · architecture

The technical decisions of the Angular 22 front end. The plan they come from is
[docs/plan/00-overview.md](plan/00-overview.md) (§3 decisions, §5 architecture); this file records them as decided and
adds what phase 0 confirmed against the installed packages. When the plan and this file disagree on something phase 0
checked, this file wins.

## Decisions F1–F16

| #   | Decision                                                                                                                                           | Status in phase 0                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| F1  | Angular 22.2.x, standalone, `@angular/build`, zoneless with signals. Node `^22.22.3 \|\| ^24.15.0 \|\| >=26`, TypeScript `>=6.0 <6.1`.             | **Confirmed**: Angular 22.2.1, TypeScript 6.0.3, zoneless and OnPush are defaults (see below). |
| F2  | No UI library. The design system's CSS (`tokens.css` + `bundle.css`) with thin Angular wrappers; `@angular/cdk` only for Dialog, overlay and a11y. | Decided; lane 1A/1C.                                                                           |
| F3  | Lazy routes per feature; the URL is the state (status filter, tab, Set sail query).                                                                | **Done**: every route of §5.3 is lazy, with a placeholder.                                     |
| F4  | State in signals and services. No NgRx.                                                                                                            | Decided; lane 2B.                                                                              |
| F5  | Refetch on event, not local patching (300 ms debounce). Every command sends `expectedVersion`.                                                     | Decided; lanes 2B, 4A.                                                                         |
| F6  | One global SSE stream read with `fetch` (not `EventSource`), `Last-Event-ID` on reconnect, polling fallback.                                       | `FETCH` token created; lane 2B. Proxy streams SSE unbuffered (verified against a stub only).   |
| F7  | Types generated from the vendored OpenAPI + hand-written guards at the boundary; errors as values (`ApiResult`).                                   | Decided; lane 2A.                                                                              |
| F8  | No auth now; `AuthStrategy` as the extension point. `X-Ahoy-Actor` only in the dev-server proxy.                                                   | **Done** for the proxy (`proxy.conf.mjs`); `AuthStrategy` is lane 2A.                          |
| F9  | Same origin: the app always calls the relative `/api/v1`.                                                                                          | **Done**: `API_BASE` = `/api/v1`; dev proxy forwards it.                                       |
| F10 | Typed Reactive Forms.                                                                                                                              | Decided; lanes 3B, 4A–4D.                                                                      |
| F11 | Vitest (the Angular CLI runner via `@angular/build`) for unit and component tests; Playwright for e2e.                                             | **Confirmed**: `ng test` runs Vitest 5.0.3 with jsdom 30.1.2. Playwright is lane 6C.           |
| F12 | Markdown with `marked` → `[innerHTML]`, sanitised by Angular. No `bypassSecurityTrust*`; raw HTML and images off.                                  | Decided; lane 1C.                                                                              |
| F13 | Client-side diff (`diff`, jsdiff) to compare artifact revisions.                                                                                   | Decided; lanes 2C, 5C.                                                                         |
| F14 | AIU as integer nano-AIU; parse and format without floats (`domain/aiu`).                                                                           | Decided; lane 2C.                                                                              |
| F15 | UI text in English, like the design system. No i18n framework for now.                                                                             | Decided.                                                                                       |
| F16 | Light theme by default, dark via `data-theme="dark"` on `<html>`. No visible toggle yet.                                                           | Decided; lane 1A.                                                                              |

## What phase 0 confirmed (tasks 0.2 and 0.3)

Checked against `ng new --help` (CLI 22.2.1) and the typings in `node_modules/@angular/core` on 2026-10-06.

- **Scaffold.** `ng new ahoy-frontend --routing --style=scss --ssr=false --skip-git --package-manager=npm --zoneless
--test-runner=vitest --prefix=ah --standalone --strict --ai-config=none`, generated in a temporary folder and moved
  in. The CLI's file-name style guide is `2025` (`app.ts`, not `app.component.ts`); we keep it.
- **Zoneless is the default** since Angular 21 (`provideZonelessChangeDetection` docs: "Zoneless is enabled by default in
  Angular v21+"). There is no `zone.js` dependency and no provider in `app.config.ts`. Never add
  `provideZoneChangeDetection`.
- **OnPush is the default** in Angular 22: `ChangeDetectionStrategy.OnPush = 0`, and the old `Default` is now a deprecated
  alias of the new `Eager`. ESLint's `prefer-on-push-component-change-detection` (angular-eslint 22.5) forbids opting out;
  writing `changeDetection: ChangeDetectionStrategy.OnPush` explicitly is allowed (the phase 1 rule asks for it) but
  redundant.
- **Standalone is the default**; components omit `standalone: true`.
- **TypeScript 6.0.3**, pinned `~6.0.3`. The npm `latest` is 7.0.2, which `@angular/build` 22.2.1 rejects
  (`typescript: ">=6.0 <6.1"`); `typescript-eslint` 8.71.1 also needs `<6.1.0`. `~` keeps upgrades inside 6.0.x.
- **TypeScript flags.** `tsconfig.json` sets `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, plus the scaffold's
  `noPropertyAccessFromIndexSignature` (kept: stricter) and the Angular `strictTemplates`, `strictInjectionParameters`,
  `strictInputAccessModifiers`. **No flag clashed with Angular's types**: the scaffold, the router, `HttpClient` and the
  tests compile with all of them. Each flag was proven by a throw-away file that `tsc` rejected (see `docs/progress.md`).
- **Modules.** `"module": "preserve"` with `"moduleResolution": "bundler"` (the CLI default). Relative imports have no
  extension. Cross-layer imports use the aliases `@domain/*`, `@core/*`, `@ui/*`, `@features/*`, `@testing/*`
  (`paths` without `baseUrl`, which TypeScript 6 deprecates). `package.json` has `"type": "module"`, so the `.js`/`.mjs`
  tool files are ES modules.
- **Typecheck.** `npm run typecheck` runs `tsc --noEmit` on `tsconfig.app.json` and `tsconfig.spec.json`, then
  `scripts/check-boundaries.mjs`. `tsc` does not check templates; `ng build` does (`strictTemplates`).
- **Tests.** `@angular/build:unit-test` with the Vitest runner and jsdom, `tsconfig.spec.json` (types `vitest/globals`).
  `npm test` = `ng test --watch=false`. Specs live next to the code; helpers live in `src/testing/`.
- **Root element.** `<ah-root class="ah">`, not the plan's `<app-root class="ah">`: the component prefix is `ah` and
  ESLint enforces it. The `ah` class is the design system's scope.

## Layout and boundaries

Folders as in plan §5.1. `scripts/check-boundaries.mjs` (part of `npm run typecheck`) enforces plan §5.2:

- `domain/` imports only `domain/`: no Angular, rxjs, `node:`, `core`, `ui`, `features` or `testing`.
- `ui/` imports `domain/`, `ui/`, Angular and third-party packages; never `core`, `features` or `testing`.
- `core/` imports `domain/`, `core/` and Angular; never `ui` or `features`. `core/mock/` (lane 2D) may import
  `src/testing/`.
- `features/<x>/` import `domain`, `ui` and `core`; never another feature, nor the app root or environment files.
- Production code (anything but `*.spec.ts` and `src/testing/`) never imports `src/testing/`. The one exception is
  `src/environments/environment.mock.ts` (lane 2D).
- The composition root (`src/main.ts`, `src/app/app*.ts`) and `src/environments/` may import any layer.

## Routing (task 0.7)

- `app.routes.ts` has one lazy `loadChildren` per feature. Order matters: `voyages/new` and
  `voyages/:key/runs/:runId` come before `voyages/:key`, and `voyages/:key` before `voyages`. Lanes never edit it.
- `voyages/:key` loads `features/voyage/voyage.routes.ts` (lane 4A): a `VoyageShell` with a `<router-outlet>` and one
  lazy `loadChildren` per tab (`tabs/<tab>/<tab>.routes.ts`, one lane each). Until 4A, the shell redirects to `plan`.
- The run detail is a top-level route owned by `features/run-detail/` (lane 5A), outside the voyage shell.
- Placeholders are `ah-placeholder` (`src/app/ui/placeholder/`), fed by route `data` (`heading`, `lane`) through
  `withComponentInputBinding()`. Each lane replaces its own; lane 6A deletes the component when nothing uses it.
- `**` shows a "Not found" placeholder (lane 6A). This is an addition to §5.3.
- **Dev-only routes** (`/_kit`) come from `environment.devRoutes`. `environment.ts` (production) has none;
  `environment.development.ts` (used by `development` and, until lane 2D, `mock`) adds `_kit`. Because the production
  file never references the kit, its chunk is absent from `ng build` output (checked: no `kit-routes` chunk).
- Each route sets its `title` (`<Name> · Ahoy`) through the router's default `TitleStrategy`.

## Application config (task 0.7)

`app.config.ts` provides `provideRouter(routes, withComponentInputBinding())`, `provideHttpClient(withFetch())`,
`API_BASE` (`/api/v1`, `core/api/api-base.ts`, lane 2A), `FETCH` (`globalThis.fetch`, `core/realtime/fetch.ts`, lane 2B)
and `provideAppInitializer(initAppConfig)` (`core/config/app-config.ts`, a no-op until lane 2A reads `/config.json`).

## Dev server and proxy (task 0.6)

`npm start` = `ng serve --proxy-config proxy.conf.mjs`. The proxy forwards `/api/v1` to `AHOY_API_TARGET` (default
`http://127.0.0.1:8080`) with `secure: false` and `changeOrigin: true`, and adds `X-Ahoy-Actor: $AHOY_ACTOR` (default
`dev@example.com`, which must match `AppConfig.actor`). The app never sends `Authorization`.

- `AHOY_AUTH=dev` (which makes the API trust `X-Ahoy-Actor`) is for a local API only. The proxy is part of `ng serve`
  and never reaches production, where the Ingress routes `/api/v1` and real authentication applies.
- Only a local API started with `npm run dev -- --simulate` (0 AIU). **Never** `--live`, never the TEST environment.
- `npm run start:mock` serves the `mock` configuration (lane 2D adds the mock backend; until then it equals
  `development`).
- `npm run start:test` explicitly serves the `test` configuration with `src/proxy.conf.test.json`, forwarding the
  browser's API calls to the TEST API. Do not use it for automated validation or mutating actions without approval.

## Tooling (tasks 0.4, 0.5, 0.8)

- **Prettier** (`.prettierrc.json`): `printWidth 120`, double quotes (`singleQuote: false` set explicitly, because
  Prettier also reads `.editorconfig`), `trailingComma: all`, `proseWrap: preserve`, the
  `angular` parser for HTML. `.prettierignore` skips `docs/design/`, generated files and build output.
- **ESLint** (`eslint.config.js`, flat config): `typescript-eslint` `strict` + `stylistic`, `angular-eslint`
  `tsRecommended`, `templateRecommended` and `templateAccessibility`, plus `no-explicit-any`, `ban-ts-comment`,
  `consistent-type-imports`, `no-restricted-syntax` (enum, namespace, `as unknown as`), `no-restricted-exports` (no
  default exports except tool config files), selector prefix `ah`, and the OnPush rule. `no-non-null-assertion` is off in
  specs and `src/testing/`. Empty classes are allowed only with a decorator (Angular components).
- **Husky + lint-staged**: the pre-commit hook runs `prettier --write --ignore-unknown` on staged files.
- **CI** (`.github/workflows/ci.yml`): Node from `.nvmrc` (24), `npm ci`, `format:check`, `lint`, `typecheck`, `build`,
  `test`. It publishes nothing.
