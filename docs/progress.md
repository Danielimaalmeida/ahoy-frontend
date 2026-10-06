# Ahoy frontend · progress

**Updated 2026-10-06 by lane 1A (wave 1, kit foundation). State: phase 0 is merged into `main`. Lane 1A is done in the
working tree of branch `claude/brave-keller-c1j5st`, not committed: commit and push wait for the user's approval. Lanes
2A and 2C (wave 1) run in other sessions; their state is in their own sections once they report.**

- **Ran for 1A (offline, 0 AIU, Node 24.21.0 via `npx node@24`):** `npm ci`, `npm run build`, `npm run typecheck`,
  `npm run lint` (now also `tokens:check`), `npm test` (98 tests, 11 files), `npm run format:check`, all green;
  `/_kit` served by `ng serve` and screenshotted in headless Chromium in light and dark at 1100 px and 390 px, next to
  the design system's Button, Panel, Field, Banner and DataTable previews.
- **Did not run for 1A:** `npm run start:mock` against a mock backend (lane 2D has not built one; 1A calls no API);
  the wireframe boards in a browser; any API.
- **Phase 0:** see "Lane P0" below.

## Where we are

Wave 0 (phase 0) is merged into `main`: an Angular 22 app that builds, tests and serves, with the CLAUDE.md conventions
enforced by `tsc`, ESLint, Prettier and `scripts/check-boundaries.mjs`, the dev proxy, every route as a lazy
placeholder, the design references in `docs/design/`, and the docs.

Wave 1, lane 1A (kit foundation) is done, uncommitted: generated `tokens.css`, the design-system bundle loaded
globally (every page, placeholders included, now has the DS font, colours and ground), `ThemeService`, `ah-icon` (16
icons), `ah-logo`, the favicon, the primitives (`ahButton`, `ah-panel`, `ah-field` + `ahInput`, `ah-banner`, table
helpers, `ah-source`) and the dev-only `/_kit` gallery with a light/dark switch. No screen and no API call exists yet.

## Start here next

1. **User:** review lane 1A (section "Lane 1A" below, and `/_kit` with `npm start`), then approve its commit and push
   to `claude/brave-keller-c1j5st` and a PR into `main`. Decide the two points it raises: the `.prettierignore` entries
   for the copied agent skills, and reporting the two `bundle.css` defects to the design system.
2. **User:** make the cloud environment's setup script install Node 24 (sessions still start on Node 22.22.0, which
   Angular 22 rejects). Until then each agent must put `npx node@24` first on its `PATH` (see "Prompt for a new
   session").
3. **Wave 1:** finish and merge **2A** (API client) and **2C** (pure domain). With 1A and 2C in `main`, wave 2 lanes
   **1B** and **1C** can start (`docs/paralelos2.md`).
4. Optional, whenever a session has Docker: verify the proxy against `ahoy-hosted` `npm run dev -- --simulate`
   (`curl -s localhost:4200/api/v1/health` and `curl -N localhost:4200/api/v1/events/stream`).

## Prompt for a new session

> Read `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` and `docs/plan/<phase>.md`. Implement **only** lane
> `<id>`; follow the protocol in §9 of the overview. First run `node -v`: if it is below 22.22.3, run `npx -y node@24 -v`
> and put that binary first on your `PATH` for every command (see "Node in cloud sessions" below). Don't commit or push.
> Finish with your lane's report in `docs/progress.md`.

Sessions are launched from `docs/paralelos1.md` to `docs/paralelos5.md`, one section each.

---

## Lane 1A · Kit foundation (2026-10-06)

Launched from `docs/paralelos1.md`, section A. **Not committed:** every change is in the working tree of
`claude/brave-keller-c1j5st` (the branch this session was given; plan §9 would call it `lane/1a-kit-foundation`),
waiting for the user's approval to commit and push. Phase 0 was already in `main` (pre-flight checked with
`git fetch origin` and `git log origin/main`).

### Node

`node -v` was v22.22.0. `npx -y node@24 -v` gave v24.21.0; that binary was copied into the session scratchpad and put
first on `PATH`. Every command below ran on Node 24.21.0 with npm 10.9.4.

### What changed

| Area          | Files                                                                                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens        | `scripts/build-tokens.mjs`, `src/styles/tokens.css` (generated), `package.json` scripts `tokens`, `tokens:check`                      | Every colour, spacing, radius, shadow and size token becomes `--<name>`; `.` is escaped (`--space-1\.5`); `type.families` → `--font-sans`, `--font-mono`. Light in `:root, [data-theme="light"]` (83 properties), dark in `[data-theme="dark"]` (59: the 56 colours and 3 shadows; the rest inherit light). Each block also sets `color-scheme`, so native controls follow the theme. Values are checked to be plain CSS (no `;`, `{`, `}`, `\`, comments). `--check` writes nothing and fails when `tokens.css` is missing or differs from what `tokens.json` produces, or when any `var(--x)` in `src/styles/` or `src/app/` names a property nothing defines. |
| Styles        | `src/styles/ahoy-bundle.css`, `src/styles/_ahoy-angular.scss`, `src/styles.scss`                                                      | The bundle is a byte-for-byte copy of `components/bundle.css` under a header naming its source and version; its Google Fonts `@import` stays. `_ahoy-angular.scss` holds only what the bundle can't: `body { margin: 0 }`, `display: contents` for wrapper hosts, the link-button colour fix (below), `ah-panel__actions`, `ah-field__optional`, `ah-banner__body`; each rule says why.                                                                                                                                                                                                                                                                          |
| Theme         | `src/app/ui/theme/theme.service.ts`                                                                                                   | `ThemeService` (`theme` signal, `set`, `toggle`): `data-theme` on `<html>`, light by default, remembered under `ahoy.theme` in `localStorage`. Every storage access is in `try/catch`; a stored value that is not a theme is ignored. `THEME_STORAGE` token so tests use a fake. No button in the app (F16).                                                                                                                                                                                                                                                                                                                                                     |
| Icons         | `src/app/ui/icon/icons.ts`, `icon.ts`                                                                                                 | `ICON_NAMES` (16, in the README's order), closed `IconName`, `ICONS: Record<IconName, IconShape[]>` (exhaustive by type), `isIconName`. `<ah-icon name size label>`: inline SVG, `stroke="currentColor"`, 1.8 stroke, sizes 16 (default), 12, 18; `aria-hidden` unless `label` is set, then `role="img"` + `aria-label`. Shapes are data rendered with `@switch`: no `innerHTML`.                                                                                                                                                                                                                                                                                |
| Logo, favicon | `src/app/ui/logo/logo.ts`, `public/favicon.svg`, `src/index.html`, `public/favicon.ico` (deleted)                                     | `<ah-logo [link]>`: the wheel mark and "Ahoy" in `ah-logo`, a `routerLink` to `/` by default, plain text with `link = null`. The favicon is a copy of `ahoy-app-icon.svg`; the Angular default `favicon.ico` is gone.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Button        | `src/app/ui/button/button.ts`                                                                                                         | `button[ahButton], a[ahButton]` directive: `ahButton="default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | primary | soft | ghost | danger | danger-outline"`(bare = default),`size="sm | md  | lg"`; adds the bundle classes and leaves the element's own type, disabled state and classes alone. `buttonClasses(variant, size)` is exported. |
| Panel         | `src/app/ui/panel/panel.ts`                                                                                                           | `ah-panel` (the `<section class="ah-panel">`), `ah-panel-head` (`heading`, `subtitle`, `level` 2 or 3, free content, actions marked `ahPanelActions` pushed right), `ah-panel-body`, `ah-panel-foot`. With a heading, the section gets `aria-labelledby` to a unique id.                                                                                                                                                                                                                                                                                                                                                                                         |
| Field         | `src/app/ui/field/field.ts`                                                                                                           | `ah-field` (`label`, `required`, `optional`, `hint`, `unit`, `errorText`, `errorMessages`) around one `input/select/textarea[ahInput]` (`mono` for keys and model ids). Label `for`, `aria-required`, `aria-invalid` and `aria-describedby` (error, unit, hint ids, only those shown) go on the control; the asterisk is `aria-hidden`. Shows the first error of the `NgControl` once it is touched or changed, kept current through `control.events`; message = `errorMessages[key]`, else the validator's own string, else a default. `errorText` (a server error) shows whatever the state. Ids are unique; a control's own `id` is kept.                     |
| Banner        | `src/app/ui/banner/banner.ts`                                                                                                         | `<ah-banner variant heading tech icon announce>`: `notice` (refresh icon), `error` (anchor icon), `info` (info icon) and `cost` (the `ah-cost` box: bold amount, projected "who is billed" as a hint). Icons at 18px; `tech` adds `ah-tech` last. `announce` defaults follow the preview (`notice` → `role="alert"`, `error` → `role="status"`, others none) and can be overridden.                                                                                                                                                                                                                                                                              |
| Table, tags   | `src/app/ui/table/table.ts`, `src/app/ui/tags/source.ts`                                                                              | Directives `table[ahTable]`, `td/th[ahNowrap]`, `[ahKey]`, `[ahApi]`, `[ahCellSub]` (they add the bundle class); `<ah-source [chosen]>` (`ah-source`, `ah-source--chosen`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Gallery       | `src/app/ui/_kit/kit.routes.ts`, `kit.ts`, `kit-section.ts`, `sections/1a-*.ts`, `sections/1b-sections.ts`, `sections/1c-sections.ts` | `/_kit` (dev builds only, as in phase 0) shows the logo, a Light/Dark switch (`aria-pressed` buttons, through `ThemeService`) and one labelled section per component: Logo and icons, Button, Panel, Field (a typed reactive form; the cap starts touched so its error shows, as in the preview), Banner, DataTable and tags. Each lane lists its sections in its own `sections/<lane>-sections.ts`; the 1B and 1C files exist and are empty, so those lanes never edit `kit.ts`.                                                                                                                                                                                |
| Tooling       | `package.json`, `.prettierignore`                                                                                                     | `npm run lint` = `eslint . && npm run tokens:check`, so CI (which runs `lint`) enforces fresh tokens without touching `ci.yml`. `.prettierignore` also skips the bundle copy and the agent-skill copies (below).                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Using the kit (for 1B, 1C and the feature lanes):**

```html
<button ahButton="primary" size="sm" type="button"><ah-icon name="sail" />Set sail</button>
<ah-panel>
  <ah-panel-head heading="Needs you" subtitle="4 voyages"
    ><a ahButton size="sm" ahPanelActions routerLink="…">All</a></ah-panel-head
  >
  <ah-panel-body>…</ah-panel-body>
</ah-panel>
<ah-field
  label="Total budget"
  required
  unit="AIU"
  hint="…"
  [errorMessages]="{ min: 'At least 12.4 AIU, what’s already spent.' }"
>
  <input ahInput formControlName="budget" inputmode="decimal" />
</ah-field>
<ah-banner variant="error" heading="Anchored: …" tech="run_failed · r-03">Plain words first.</ah-banner>
```

### Proof

All on Node 24.21.0, offline, 0 AIU. No API, mock or real, was involved: lane 1A has no data.

- **`tokens:check`**, run on a scratch copy of `tokens.json`, `tokens.css` and the bundle (`node scripts/build-tokens.mjs
--check <root>`), so `docs/design/` was never edited:
  1. as generated: `ok`, exit 0;
  2. `bg` changed in `tokens.json`, not regenerated: "tokens.css is out of date", exit 1;
  3. regenerated: `ok`, exit 0;
  4. `avatar` and `badge-height` removed from `tokens.json` and regenerated: "undefined custom property
     src/styles/ahoy-bundle.css: --avatar" and "--badge-height", exit 1;
  5. `space-1.5` renamed: "--space-1.5" undefined (the bundle's escaped `var(--space-1\.5)` is matched), exit 1;
  6. `tokens.css` deleted: "is missing", exit 1;
  7. a value of `red; } body { x: y`: "token bg has an unexpected value", exit 1, nothing written.
- **Icons against the sources:** a throw-away script (session scratchpad, not in the repo) parsed the 16 files in
  `assets/Icons/` and compared every `path`, `circle` and `rect` with `ICONS`: 16 files, 16 names, 0 mismatches.
- **Tests: 11 files, 98 tests** (83 new; P0's 15 unchanged): `icon` 21 (the 16 icons render on the 24px grid in the
  SVG namespace, geometry copied, sizes, `aria-hidden` vs label; `ICON_NAMES` equals the README table, which is typed
  `satisfies Record<IconName, string>`, so a missing or extra name fails to compile), `button` 21 (the 18
  variant × size cases, native button and link kept, input changes), `field` 17 (label `for`, asterisk hidden,
  `aria-required`, `aria-describedby` ids exist, no error until touched, first error with a valid
  `aria-describedby`, validator text, cleared when valid, `markAllAsTouched`, server error, own id, textarea, unique
  ids, and 7 `firstErrorMessage` cases), `theme.service` 7 (default light, stored dark, invalid value, set/toggle and
  storage, refused storage, no storage), `panel` 5, `banner` 4, `kit` 4 (every section labelled, the theme switch
  changes `<html>` and `aria-pressed`, the preview's field error, 16 icons), `logo` 2, `table` 1, `source` 1.
- **The a11y tests catch regressions:** removing the Field's `aria-invalid` binding and the Panel's `aria-labelledby`
  made 4 tests fail (restored afterwards).
- **Visual check, `/_kit` against the previews:** `ng serve` (development configuration) and headless Chromium 1194
  driven over the DevTools protocol by a throw-away script. `/_kit` at 1100 px in light and dark, and at 390 px in
  light and dark; the Button, Panel, Field, Banner and DataTable `preview.html` files, wrapped with the generated
  `tokens.css` and the bundle, at 900 px in light and dark. Compared by eye: Button, Panel, Field and Banner match in
  both themes, except the deliberate differences below. Google Fonts loaded in the browser (`document.fonts`:
  Plus Jakarta Sans 600 loaded). At 390 px the page has no sideways scroll (`scrollWidth` 375 with the scrollbar); the
  table scrolls inside its own box, as the DataTable README allows.
- **Every page uses the DS:** on `/voyages` (a P0 placeholder) the body's computed `font-family` is the DS sans stack
  and its background is `bg` (`rgb(246, 248, 250)`).
- **Production build:** `npm run build` has no `kit-routes` chunk and `grep` finds no `_kit`, `Kit · Ahoy`, `ah-kit` or
  `kit__` in `dist/ahoy-frontend/`; `styles.css` holds the tokens (`--space-1\.5: 6px`) and the bundle;
  `index.html` links `favicon.svg`.

### Deliberate differences from the previews, and two bundle defects

- **Bundle defect 1, links styled as buttons.** `bundle.css` has `.ah a { color: var(--accent-text) }`, which is more
  specific than `.ah-btn--primary`, so `<a class="ah-btn ah-btn--primary">` shows blue text on blue: the DataTable
  preview's own "Answer" and "Review plan" are unreadable. `_ahoy-angular.scss` restores each variant's text colour on
  `.ah a.ah-btn`. The bundle copy itself is untouched. **For the design system:** fix it in `bundle.css`, then delete
  these rules here.
- **Bundle defect 2, `.ah-sr` escapes scroll boxes.** It is `position: absolute` with no positioned ancestor, so inside
  a table wrapped in an `overflow-x: auto` box it widened the page at 390 px. The gallery's scroll box has
  `position: relative`; every lane that wraps a table should do the same.
- Icons follow the Icons README (1.8 stroke, 16/12/18 px); the Button preview draws its icon at 15 px with a 2 stroke
  and the Banner preview at 18 px with a 2 stroke.
- The Field preview's textarea has an inline `min-height: 60px`; `ah-field` keeps the bundle's 84 px.
- The gallery adds an `info` banner (not in the preview) and shows the table without budget meters (lane 1B's
  `ah-budget-meter`); its badges are the bundle's raw classes until lane 1B's `ah-status-badge`.

### Decisions

- **Wrapper hosts add no box.** `ah-icon`, `ah-logo`, `ah-panel*`, `ah-field` and `ah-banner` render the README markup
  inside a `display: contents` host, so flex and grid layouts see the README element (the banner's icon is the
  flex item, a field is the grid cell). ARIA attributes are always on the inner element. `ah-source` puts the class on
  its host instead, because `.ah-source` is already `inline-flex`.
- **Table helpers are attribute directives** (`ahKey`, `ahApi`, `ahCellSub`), not elements, so a key can be an
  `<a routerLink>` and keep link semantics.
- **`ThemeService` lives in `src/app/ui/theme/`**, a folder the lane list does not name: `ui/` is the only layer `_kit`
  may import, and the service is not specific to the gallery. It applies the stored theme only once something
  injects it (today only `/_kit`); see "Needs from lane 3A".
- **Gallery layout CSS** (`kit-*`) sits in the `Kit` component with `ViewEncapsulation.None`, not in `src/styles/`, so
  it only loads with the lazy, dev-only page and never reaches production CSS.
- **`lint` runs `tokens:check`**, so a stale `tokens.css` fails CI without editing `.github/workflows/ci.yml` (lane 6D
  appends to it).

### Files outside the lane's list, and why

- `package.json`: the `tokens` and `tokens:check` scripts the plan asks for, and `lint` running `tokens:check`.
- `src/index.html`, `public/favicon.svg`, `public/favicon.ico` (deleted): the favicon deliverable.
- `src/app/ui/theme/`: see Decisions.
- `src/app/ui/_kit/sections/1b-sections.ts` and `1c-sections.ts`: empty lists, the seam that keeps 1B and 1C out of
  `kit.ts`; they now belong to those lanes.
- `.prettierignore`: the bundle copy (a re-synced copy, like `docs/design/`), and **`.agents/`, `.github/skills/`,
  `.opencode/`**. The "Added skills" commit on `main` brought 24 Markdown files there that Prettier would rewrite, so
  `npm run format:check` (and CI) already failed on `main` before this lane. They are copied agent skills, so they are
  ignored rather than reformatted. **The user decides:** keep the ignore, or reformat them at the source.

### Did not run, skipped, and why

- **`npm run start:mock`:** the definition of done asks UI lanes to check on the mock backend; lane 2D has not built it
  (until then `mock` equals `development`), and lane 1A shows no data. `/_kit` was checked with `ng serve`
  (development) instead.
- **Wireframe boards:** not opened; this lane was compared with the design system's previews only.
- **Not checked:** other browsers than Chromium, real phones (390 px was viewport emulation), and a pixel diff (the
  comparison was by eye).
- **`build-tokens.mjs` has no automated test:** it is a Node script outside `ng test`; the 7 runs above are its proof.
- **Skipped test suites:** none.

### Needs from other lanes

- **From the user / the design system:** fix the two `bundle.css` defects above, then re-sync `docs/design/` and
  `src/styles/ahoy-bundle.css` (lane 1A's copy) and remove the matching rules from `_ahoy-angular.scss`.
- **For lane 3A:** inject `ThemeService` once at start-up (in `App` or an app initializer) if a theme chosen in `/_kit`
  should apply on every page after a reload; without it, pages are light until `/_kit` is opened.
- **For lanes 1B and 1C:** add gallery sections to `src/app/ui/_kit/sections/<lane>-sections.ts` only. A wrapper
  component whose host must not add a box needs a `display: contents` rule in `src/styles/` (ask 1A, or add your own
  partial and one `@use` line in `src/styles.scss`). Use `ah-icon` for icons and `ahButton` for buttons.
- **For lanes that wrap a table in a scroll box (3A, 3C, 5A, 5B):** give the box `position: relative` (bundle defect 2).
- **For lane 6D:** the production build **inlines the Google Fonts CSS** (Angular's font inlining), so `ng build` needs
  network access to `fonts.googleapis.com`, and at run time the page loads font files from `fonts.gstatic.com` only.
  The favicon is now `favicon.svg`.

### Final check

Run at the end of the lane, on Node 24.21.0:

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle, no kit-routes chunk)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (no problems; build-tokens: ok)
$ npm test                    exit 0 (Test Files 11 passed (11); Tests 98 passed (98))
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

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
