# Ahoy frontend · progress

**Updated 2026-10-07 by lane 2C (pure domain), which merged `main` (phase 0, lane 1A and the lane 2A branch) into `lane/2c-domain`. Lane 2C is done and awaits review and merge. Lane 2A is built and tested but NOT finished: the three dev dependencies it is approved to add (`openapi-typescript`, `ajv`, `yaml`, plan §10) could not be installed, so the generated types, `api:types`, `api:check` and `contract.spec.ts` are missing.**

- **Ran for 2A, on the merged tree (offline, 0 AIU, Node 24.21.0 via `npx node@24`):** `npm run build`, `npm run typecheck`
  (`check-boundaries: ok`), `npm run lint` (with `tokens:check`), `npm test` (23 files, **582 tests**: 15 of phase 0, 83 of lane 1A
  and 484 of lane 2A) and `npm run format:check`, all green. On the lane's own tree before the merge: 499 tests; `npm start` in
  headless Chromium (the app boots with the new initializer and interceptor); the client over Angular's real `fetch` backend with a
  fake `fetch`; five mutation checks of the tests.
- **Did not run for 2A:** `scripts/smoke-api.mjs` and `scripts/capture-fixtures.mjs` (written, only syntax-checked: they need a
  local API, as the lane says); anything against the `ahoy-hosted` API (no Docker daemon, no Postgres server); `api:types`,
  `api:check`, `contract.spec.ts` (not delivered); the CI workflow (a pull request runs it).
- **Ran for 1A (offline, 0 AIU, Node 24.21.0 via `npx node@24`):** `npm ci`, `npm run build`, `npm run typecheck`,
  `npm run lint` (now also `tokens:check`), `npm test` (98 tests, 11 files), `npm run format:check`, all green;
  `/_kit` served by `ng serve` and screenshotted in headless Chromium in light and dark at 1100 px and 390 px, next to
  the design system's Button, Panel, Field, Banner and DataTable previews.
- **Did not run for 1A:** `npm run start:mock` against a mock backend (lane 2D has not built one; 1A calls no API);
  the wireframe boards in a browser; any API.
- **Phase 0:** see "Lane P0" below.

## Where we are

Phase 0 and lane 1A are merged into `main` (PR #1 and PR #4): an Angular 22 app that builds, tests and serves, with the CLAUDE.md
conventions enforced by `tsc`, ESLint, Prettier and `scripts/check-boundaries.mjs`, the dev proxy, every route as a lazy placeholder,
the design references in `docs/design/`, the generated tokens and the design-system bundle on every page, `ThemeService`, `ah-icon`,
`ah-logo` and the primitives (`ahButton`, `ah-panel`, `ah-field`, `ah-banner`, table helpers, `ah-source`) with the dev-only `/_kit`
gallery.

Wave 1, lane 2A (API client) is on branch `claude/charming-clarke-tlb24e`: `ApiClient` with the 19 operations of phases 3 to 6,
`ApiError` and its predicates, the manual guards, `parseRunProgress`, `readStoryState`, the `AuthStrategy` seam, `CurrentUser`, the
runtime `AppConfig` (and `API_BASE` taken from it), the fixtures and the vendored contract. It is waiting on one approval to be
complete (see "Start here next"). Lane 2C of wave 1 is independent of it. No screen shows data yet and no call has ever reached a
real API (risk R1 is still open).

**Lane 2C (domínio puro)** is done, committed on branch `lane/2c-domain` (PR open, not merged): `src/app/domain/` now has the vocabulary
mappings (`statusPresentation`, `outcomePresentation`, `explainHalt`), the AIU and time helpers, `CREW` and the only
diff implementation of the project (`diff` 9.0.0), with **218 new tests** (233 in the suite). The API types are
provisional until lane 2A lands `schema.d.ts`. `npm run format:check` is green: the 24 skill files added by commit
132728f are ignored in `.prettierignore` (decided by the user on 2026-10-06).

## Start here next

1. **User, to finish lane 2A:** approve installing `openapi-typescript@7.13.0`, `ajv@8.20.0` and `yaml@2.9.1` as dev
   dependencies (all three are on the approved list in plan §10; versions from `npm view` on 2026-10-06). A permission
   classifier blocked `npm install` in the session that did lane 2A, so give the approval in a session that is allowed to
   run it (or allow `npm install` for it), or run
   `npm install --save-dev openapi-typescript@7.13.0 ajv@8.20.0 yaml@2.9.1` yourself. Expect npm to refuse, because
   `openapi-typescript@7.13.0` declares the peer `typescript ^5.x` and the project is on `~6.0.3`; the fix is an `overrides`
   entry in `package.json` (`"openapi-typescript": { "typescript": "$typescript" }`), and whether the generator works on
   TypeScript 6 is not yet known. The steps that follow are under "Not done" in the lane 2A section.
2. **User:** review the lane 2A pull request (`claude/charming-clarke-tlb24e` into `main`). The one edit outside the lane's
   directories is `src/app/app.config.ts` (see "Decisions and deviations", 2).
3. **User:** make the cloud environment's setup script install Node 24 (sessions still start on Node 22.22.0, which
   Angular 22 rejects). Until then each agent must put `npx node@24` first on its `PATH` (see "Prompt for a new
   session"). Proposed setup script, **untested**: `mkdir -p /opt/node24 && npm install --prefix /opt/node24 node@24` and
   `ln -sf /opt/node24/node_modules/node/bin/node /root/.local/bin/node` (`/root/.local/bin` comes before
   `/opt/node22/bin` in the sessions' `PATH`; `npm install -g node@24` is not an option, because npm's global bin is
   Node 22's own directory). Check with `node -v` in a new session.
4. **User, decided 2026-10-07:** keep the `.prettierignore` entries for the copied agent skills (they stay in `main`, and
   they make `npm run format:check` green), and report the two `bundle.css` defects to the design system (section
   "Lane 1A"). The report text was handed to the user; whether it was sent is not recorded here. When the design system
   has fixed them, re-sync `docs/design/` and `src/styles/ahoy-bundle.css` and delete the matching rules in
   `src/styles/_ahoy-angular.scss`.
5. **Wave 1:** **2C** (pure domain) is done on `lane/2c-domain`, awaiting review and merge; **6D** is optional (`docs/paralelos1.md`). With 1A and 2C in `main`, wave 2
   lanes **1B** and **1C** can start (`docs/paralelos2.md`). Lanes **2B** and **2D** need 2A _and_ 2C in `main`, and 2D reuses the
   Ajv helper that comes with `contract.spec.ts`, so finish 2A first.
6. Optional, whenever a session has Docker and Postgres: run `npm run dev -- --simulate` in `ahoy-hosted`, then `npm start`
   here, then `node scripts/smoke-api.mjs --confirm-simulate`, and `node scripts/capture-fixtures.mjs --confirm-simulate`
   after driving a story through the simulation. That is the first time the client would meet a real API, and it would
   confirm the `state.json` field names `readStoryState` reads. Also `curl -s localhost:4200/api/v1/health` and
   `curl -N localhost:4200/api/v1/events/stream` for the proxy (phase 0's open item).

## Prompt for a new session

> Read `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` and `docs/plan/<phase>.md`. Implement **only** lane
> `<id>`; follow the protocol in §9 of the overview. First run `node -v`: if it is below 22.22.3, run `npx -y node@24 -v`
> and put that binary first on your `PATH` for every command (see "Node in cloud sessions" below). Don't commit or push.
> Finish with your lane's report in `docs/progress.md`.

To finish lane 2A after the dependencies are approved:

> Read `CLAUDE.md`, `docs/progress.md` (the lane 2A section, "Not done") and `docs/plan/phase-2-data-layer.md`. Finish
> **only** lane 2A: install the three approved dev dependencies at the versions in the report, generate `schema.d.ts`, add
> `api:types` and `api:check`, switch `core/api/types.ts` to the generated types, add `contract.spec.ts` with the mirror of
> the contract as the report describes it, and update the lane section. Don't commit or push.

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

---

## Lane 2A · API client (2026-10-06)

**Built and tested, not finished.** The lane may add `openapi-typescript`, `ajv` and `yaml` (plan §10). The session's
permission classifier denied the `npm install` of them ("Untrusted Code Integration") and the lane did not try another way
round it: no `npx`, no hand-edited `package.json`, no use of the copies of `ajv` and `yaml` that other packages bring in
`node_modules`. Everything that does not need them is done and verified; what is left is under "Not done".

Two commits on branch `claude/charming-clarke-tlb24e`: the lane's own commit (from `main` at 132728f), pushed after the user
approved it in the session (CLAUDE.md requires that approval; the environment's stop hook had only asked for a push), and a merge
of `main` at d29002b (lane 1A, PR #4), made when the user asked for a pull request into `main`, ready for review. The merge had
three text conflicts, all places where both lanes added lines (`package.json` scripts, the README Status bullets,
`docs/progress.md`); both sides were kept. The contract was read from `Danielimaalmeida/ahoy-hosted` at commit
`1890d5aa84819480275f79060cae5d529be21ee8` (read-only; the repository was attached to the session and cloned outside this one).

### What changed

| #   | Deliverable                             | State                | Where                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Vendored contract                       | **partly**           | `openapi/ahoy-v1.yaml` (the hosted file, byte for byte, under a 3-line header with the source and the commit), `scripts/sync-openapi.mjs`, `npm run api:sync`. **Missing:** `api:types`, `api:check`, `schema.d.ts`.                                                   |
| 2   | `ApiClient`                             | done                 | `core/api/api-client.ts`: the 19 operations of phases 3 to 6, each `Promise<ApiResult<T>>`, never rejecting.                                                                                                                                                           |
| 3   | `ApiError`                              | done                 | `core/api/api-error.ts`: `ApiError` (`problem`, `network`, `invalid_response`), `ApiResult`, 12 predicates plus `isUnreachable`, `formControlPath`, `fieldErrors`.                                                                                                     |
| 4   | Guards                                  | done                 | `core/api/guard-kit.ts`, `guards.ts`, `run-progress.ts` (`parseRunProgress`), `story-state.ts` (`readStoryState`), `types.ts` (wire types, hand-written for now).                                                                                                      |
| 5   | Auth seam and `CurrentUser`             | done                 | `core/auth/auth-strategy.ts` (`AuthStrategy`, `NoAuthStrategy`, `AUTH_STRATEGY`), `auth.interceptor.ts`, `current-user.ts`. No request carries `Authorization`.                                                                                                        |
| 6   | `AppConfig`                             | done                 | `core/config/app-config.ts` (`parseAppConfig`, `loadAppConfig`, `AppConfigStore`, `initAppConfig`), `core/api/api-base.ts` (`API_BASE` from the config).                                                                                                               |
| 7   | Fixtures and `contract.spec.ts`         | **partly**           | `src/testing/fixtures/`: one JSON per operation (19) and `problems.json` (one per problem code, 15). **Missing:** `contract.spec.ts`.                                                                                                                                  |
| 8   | `smoke-api.mjs`, `capture-fixtures.mjs` | written, **not run** | `scripts/`. Both refuse any host but this machine, need `--confirm-simulate`, never send `Authorization`, and `capture-fixtures` only does GETs. Output of the capture goes to `src/testing/fixtures/captured/`, which a `.gitignore` keeps out of git until reviewed. |

The 19 methods: `getHealth`, `listStories`, `startStory`, `getStory`, `stopStory`, `resumeStory`, `setStoryBudget`,
`getStoryModels`, `setStoryModels`, `listStoryRuns`, `getRun`, `listQuestions`, `answerQuestion`, `listGateRecords`,
`decideHumanGate`, `getStoryState`, `listArtifacts`, `getArtifactContent`, `listStoryEvents`. The phase 7 operations and the
stream (2B) are not there, as the plan says.

### Not done (all of it needs the install)

1. `npm install --save-dev openapi-typescript@7.13.0 ajv@8.20.0 yaml@2.9.1` (exact versions from `npm view`, 2026-10-06; npm
   writes them with `^`, as CLAUDE.md wants for dev dependencies). `openapi-typescript@7.13.0` declares the peer
   `typescript ^5.x` and the project is on `~6.0.3`, so add `"overrides": { "openapi-typescript": { "typescript": "$typescript" } }`
   to `package.json`. **Not tested:** whether the generator works on TypeScript 6 (it uses the compiler API). If it does not, stop and ask.
2. Scripts `api:types` (`openapi-typescript openapi/ahoy-v1.yaml -o src/app/core/api/schema.d.ts --immutable`) and `api:check`
   (the same with `--check`; confirm the flag in 7.13.0, else regenerate to a temporary file and compare). `schema.d.ts` is already
   ignored by ESLint and Prettier.
3. In `core/api/types.ts`, turn each type into an alias of `components["schemas"][...]` and add type-level equality checks for
   the enum arrays (`STORY_STATUSES` and the others stay as runtime arrays). It is the only file that mentions the shape of the API.
4. `contract.spec.ts`. **How it has to read the YAML, from throw-away probes that were run and then removed:** a spec cannot
   read `openapi/ahoy-v1.yaml` itself. `node:fs` in a spec fails `tsc` and `ng test` (TS2591: `@types/node` is not installed, and
   is not on the approved list); a TypeScript import of a file outside `src/` fails `check-boundaries` ("imports from outside
   src/"); a `?raw` import fails too (TS2307, and the Angular build). A JSON import works (the fixtures prove it). Untested: a
   `loader` entry for `.yaml` in `angular.json`, which this lane does not own. So: let `sync-openapi.mjs` also write
   `src/testing/fixtures/openapi.json` (the YAML parsed with `yaml`), make `api:check` verify that this mirror still equals the YAML, and let
   the spec import the JSON and validate with `Ajv2020` from `ajv/dist/2020`, `{ strict: false, allErrors: true }`,
   `ajv.addSchema({ $id: "ahoy", components })` and the `#/components/` to `ahoy#/components/` rewrite that the hosted server's own
   `loadContract` and `wrap` use. `ajv-formats` is not on the approved list, so register `date-time` by hand with
   `ajv.addFormat`. What it must check: every fixture against the success response of its operation, every entry of
   `problems.json` against `Problem`, the request bodies of the `ApiClient` spec against the request schemas, and that the enum arrays of
   `types.ts` equal the YAML's. Put the Ajv helper in `src/testing/fixtures/` so that lane 2D can reuse it ("as 2A does").
5. Update this section and the README line, and run the whole chain again.

### Proof

All on Node 24.21.0, offline, 0 AIU.

- **Chain:** `npm run build`, `npm run typecheck` (`tsc` app and spec, then `check-boundaries: ok`), `npm run lint`,
  `npm test`, all exit 0. `npx prettier --check scripts/ openapi/ src/ package.json`: all files pass.
- **Tests:** 13 files, **499 tests, 0 failed, 0 skipped** (15 of phase 0). New:

  | File                                   | Tests | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
  | -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `core/api/api-client.spec.ts`          | 134   | Each of the 19 operations with `HttpTestingController`: method, URL and body, the value (the `items` for the plain lists), a `problem+json` answer, a network error, a body of the wrong shape (`invalid_response` naming the call), no `Authorization`, the timeout. Also: all 15 problem codes, gateway pages, 2xx that is not JSON, an interceptor that throws, path encoding, query building, base with a trailing slash, `getArtifactContent` (ETag, 304, empty file, error read from text). |
  | `core/api/api-client.fetch.spec.ts`    | 15    | The same client over Angular's **real** `fetch` backend with a fake `fetch` returning real `Response` objects: headers sent (only `Accept`, plus `Content-Type` for a POST), `problem+json` parsed, 502/503/504 HTML, HTML with a 200, a rejected fetch, the 30 s timeout (fake timers), a 304 with no body, UTF-8 text.                                                                                                                                                                          |
  | `core/api/guards.spec.ts`              | 101   | Every fixture accepted; all 13 fields of a story refused when missing or wrong; **fractional, negative, NaN, infinite and beyond-2^53 AIU amounts refused** in stories, runs and usage; enums, patterns, nulls, unknown fields tolerated.                                                                                                                                                                                                                                                         |
  | `core/api/guard-kit.spec.ts`           | 28    | The checks and combinators the guards are made of, and the message each refusal gives.                                                                                                                                                                                                                                                                                                                                                                                                            |
  | `core/api/run-progress.spec.ts`        | 34    | `parseRunProgress`: the three kinds, an unknown kind, every field of `spend`, fractional or negative amounts.                                                                                                                                                                                                                                                                                                                                                                                     |
  | `core/api/story-state.spec.ts`         | 18    | `readStoryState` on the fixture and on garbage (never throws, `__proto__` safe).                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | `core/api/api-error.spec.ts`           | 45    | Predicates, `problemToError`, `formControlPath` (both path styles, escapes, non-controls), `fieldErrors`, `ApiResult` helpers.                                                                                                                                                                                                                                                                                                                                                                    |
  | `core/api/api-base.spec.ts`            | 6     | `API_BASE` follows `AppConfig.apiBase`; `trimBase`.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | `core/auth/auth.interceptor.spec.ts`   | 14    | With `NoAuthStrategy` a request is left exactly as it was; a strategy with headers is applied to the API only and per request; a strategy that fails fails the request.                                                                                                                                                                                                                                                                                                                           |
  | `core/auth/current-user.spec.ts`       | 20    | `initialsOf` (`alex@example.com` gives `AL`, as in the design system), `CurrentUser` follows the config, `is()`.                                                                                                                                                                                                                                                                                                                                                                                  |
  | `core/config/app-config.spec.ts`       | 65    | `parseAppConfig` field by field (same-origin `apiBase`, `actor`, `jiraBaseUrl`), the start-up read with 404, HTML, bad JSON, network error, bad fields (one warning each).                                                                                                                                                                                                                                                                                                                        |
  | `core/config/app-config.fetch.spec.ts` | 4     | The start-up read over the real `fetch` backend, including a stalled server (5 s timeout).                                                                                                                                                                                                                                                                                                                                                                                                        |

- **Mutation checks:** five deliberate breaks of the production code were each caught, then restored (all 499 green again):
  AIU guard accepting fractions (6 tests failed), interceptor adding headers to every URL (6), client without the 304 branch (1),
  form paths ignoring the `body/` prefix (4), config accepting any `apiBase` (13).
- **Real browser:** `npm start`, then headless Chromium on `/`, `/voyages` and `/voyages/PROJ-123/plan`: each rendered its placeholder
  and title, so the app boots with the new initializer and the interceptor registered. The dev server answers `/config.json` with a
  404, so the app ran on the defaults, and the page logged no warning or error.
- **`sync-openapi.mjs`:** ran against the local clone; the body is identical to the hosted file, re-syncing from the vendored copy
  changes nothing, and it refuses a file outside a git checkout without `--commit`, a file that is not OpenAPI 3.1, a missing file,
  an `http:` URL and a malformed `--commit`.

### Did not run, skipped, and why

- **`scripts/smoke-api.mjs` and `scripts/capture-fixtures.mjs`:** not run, as the lane says (they need a local API). Checked with
  `node --check` only, so their logic, including the refusal of a non-local host, has not been exercised.
- **Nothing ran against the `ahoy-hosted` API.** This session has the `docker` and `psql` clients but no Docker daemon and no
  Postgres server. So the client has still never met a real API (risk R1 stays open), and the `state.json` field names that
  `readStoryState` reads (`acceptance_criteria`, `work_packages`, `human_gates`, `revisions`, `revision_ceiling`, and inside
  them `depends_on`, `open_pr`, `timestamp`) were **confirmed from the hosted renderer** (`encodeStory` in
  `packages/core/src/domain/story-document.ts` and its e2e test at 1890d5a), **not from a live `--simulate` answer**.
- **`api:types`, `api:check`, `contract.spec.ts`:** not delivered (see "Not done"). Consequently "`api:check` limpo" and
  "`contract.spec.ts` verde" of the acceptance criteria are **not met**.
- **`sync-openapi.mjs` with an https URL:** not run (only local paths).
- **CI on GitHub:** not run on the branch alone (the workflow runs on pull requests and on pushes to `main`); the pull request runs it.
- **`npm run format:check` on the whole repository:** it was red on `main` at 132728f, from 24 skill files under `.agents/skills`,
  `.github/skills` and `.opencode/skills` (the "Added skills" commit), which this lane did not touch. Lane 1A's `.prettierignore`
  entries, now in `main`, make it green again, and it is green on the merged tree.
- **Skipped test suites:** none.

### Decisions and deviations

1. **The wire types are hand-written** in `core/api/types.ts` until `schema.d.ts` can be generated, written to mirror the
   YAML field by field. `Shape<T>` in the guard kit makes a guard that forgets, or invents, a field of its type fail to compile.
2. **`API_BASE` now comes from `AppConfig.apiBase`** (the lane asked for a decision). `/config.json` can say
   `"apiBase": "/some/prefix/api/v1"`; the value is accepted only if it is a path on this origin (one leading `/`, no scheme or host,
   no `.` or `..` segment), else the default `/api/v1` is used and one warning is logged. F9 (same origin) still holds. To make it
   work, **`src/app/app.config.ts` was edited, outside the directories this lane owns:** it registers
   `withInterceptors([authInterceptor])` on `provideHttpClient(withFetch())` and no longer provides `API_BASE` itself (the token has
   a default that reads the config). Nothing else there changed. Without that edit neither the interceptor nor the decision would
   take effect.
3. **Guards are strict about the contract's closed enums** (`status`, run status, outcomes, slots, sources, efforts) and about
   patterns and AIU amounts, and tolerant about what the contract leaves open: `phase`, `haltReason`, `agent`, `runtime`, the event
   `type` and, for errors, the problem `code`. Extra fields are always tolerated. A status the vendored contract does not list
   makes the answer an `invalid_response` that names it, which is the signal to re-sync the contract.
4. **How an answer becomes an `ApiError`:** `status` 0 (offline, refused, aborted, **timed out**) is `{ kind: "network" }`; a
   502, 503 or 504 without problem details (a gateway page, the dev proxy with no API behind it) is `{ kind: "network", status }`
   (the optional `status` is an addition to the plan's `{ kind: "network" }`); any other error status without problem details is
   `invalid_response` (`getX: HTTP 401 without problem details`); a 2xx that is not JSON, a wrong shape and anything thrown inside the
   pipeline (an `AuthStrategy` that rejects) are `invalid_response` too. The problem's `status` is the HTTP status of the answer, and its
   `type` is not kept.
5. **Every request has a 30 s timeout** (`REQUEST_TIMEOUT_MS`), and the start-up read of `/config.json` 5 s, so a hung request
   becomes a network failure instead of a screen that spins for ever. Not in the plan; easy to change.
6. **Return shapes:** the three plain lists give an array (`listStoryRuns`, `listQuestions`, `listGateRecords` unwrap `items`);
   `listStories`, `listArtifacts` and `listStoryEvents` keep their envelope (`nextCursor`, `revision`, `lastEventId`);
   `getArtifactContent` gives `{ kind: "content", text, etag, mediaType }` or `{ kind: "not_modified" }` for a 304;
   `getStoryState` gives `state` as `Readonly<Record<string, unknown>>` (an object, checked), a refinement of the plan's `unknown`.
7. **`readStoryState`** gives maps (`humanGates`, `revisions`), applies the hosted default ceiling of 4 when the state sets none, reads an
   unset package status as `pending` (as the hosted code does) and never throws.
8. **`AuthStrategy`** is called per request by `authInterceptor` and only for URLs under `API_BASE`; `NoAuthStrategy` returns `{}`.
   The event stream (2B) must call `AUTH_STRATEGY` itself because it uses `fetch`.
9. **`CurrentUser`** has the signals `id` and `initials`, and `is(actor)`. Initials: the e-mail's local part as words, first letters of
   the first two (`alex.rivera@` gives `AR`), or the first two letters of a single word (`alex@` gives `AL`, as in the design system).
10. **Fixtures:** named by operation id. The text of an artifact is `getArtifactContent.json`
    (`{ path, mediaType, etag, text }`, the ETag being the quoted sha256 that `listArtifacts` lists for it) because a markdown file
    cannot be imported by a spec. `src/testing/fixtures/mutate.ts` breaks a fixture one field at a time for the guard tests. All data is
    fictional, from the wireframes (PROJ-123, alex@example.com). The `.gitkeep` files of `core/auth` and `testing/fixtures` were removed.
11. **`package.json`:** only the `api:sync` script was added. No dependency.
12. **`ahoy-hosted`'s own `CLAUDE.md` was not loaded:** it still holds the `node:test` and `NodeNext` conventions that plan §4 replaced.
13. **Merging `main` (lane 1A):** `package.json` keeps `api:sync` next to 1A's `tokens` and `tokens:check`, and `lint` stays `eslint . &&
npm run tokens:check`; the README Status has the three bullets (phase 0, 1A, 2A), with 1A's corrected to "merged, PR #4"; in this file the
    handoff sections (header, "Where we are", "Start here next", "Prompt for a new session") now cover both lanes. Lane 1A's own section
    is verbatim, including its sentence that it was not committed, which stopped being true when PR #4 merged.

### What the real API does that the plan did not say

From the hosted sources at 1890d5a (`apps/api/src/server.ts`, `packages/core`), not from a live answer:

- **`errors[].path` has two forms.** The contract check writes `body/budgetNanoAiu`, `body` (the whole body) and `query.limit`; the
  story's own rules write JSON pointers such as `/reason`, `/models` and `/models/review-defect`. `formControlPath` reads both.
- **A problem never has `instance`**, its `title` is the code with spaces (`stale version`, not display text) and its `type` is
  `urn:ahoy:problem:<code>`. So the "request id" of the plan's "Lost contact with the harbour" pattern is empty today.
- **Timestamps** are `toISOString()`, with milliseconds. `Date.parse` accepts 30 February, so the timestamp guard says "an RFC 3339
  date-time `Date` can read", no more.
- **An artifact's content** comes with the stored media type (no charset) and `ETag: "<sha256>"`; a 304 has no body.
- **A send-back deletes the gate's entry in `human_gates`** and counts the round in `revisions[<gate>]`; an approve or reject writes
  `status` there (`approved` is what the hosted e2e test checks). So the plan's "round x of 4" is `revisions[gate] + 1`, and the next
  send-back after the ceiling answers `revision_ceiling_reached`.
- **`lastEventId`** of `listStoryEvents` is null only when there is no event and no `after`; with `after` and nothing new it echoes `after`.

### Needs from other lanes

- **From the user:** the approval to install the three dev dependencies; the review and merge of the pull request; Node 24 in the
  setup script (still open from phase 0).
- **For lane 2C:** `check-boundaries` forbids `domain/` importing `@core`, so the plan's "re-export the types of `schema.d.ts`" cannot be
  done as written. Either `domain/` keeps its own structurally identical types (the types in `core/api/types.ts` are assignable to
  them, and the guards return those), or the boundary rule is relaxed for a type-only import. The names and shapes `core/api` exports:
  `Story`, `StoryPage`, `Run`, `Question`, `GateRecord`, `Artifact`, `AhoyEvent`, `ModelPlan`, `SlotModel`, `ModelChoice`, `Usage`,
  `GateVerdict`, and the unions `StoryStatus`, `RunStatus`, `GateOutcome`, `ModelSlot`, `ReasoningEffort`, `ModelSource`,
  `EffortSource`, with runtime arrays (`STORY_STATUSES`...). `DEFAULT_REVISION_CEILING` (4) is in `core/api/story-state.ts`.
- **For lane 2B:** inject `ApiClient`, `API_BASE` and `AUTH_STRATEGY` (the stream calls `headers()` itself); use `isEvent` and
  `parseRunProgress(event.payload)` for `run.progress`; `listStoryEvents` gives `lastEventId` for `after`. `FETCH` and
  `core/realtime/` are untouched.
- **For lane 2D:** the fixtures in `src/testing/fixtures/` are shaped like the real answers and can seed the mock. The mock should
  answer errors the way the real API does (`type: "urn:ahoy:problem:<code>"`, `title` the code with spaces, `errors[].path` in both
  forms, `currentVersion` on `stale_version`). The Ajv helper for conformance tests will be in `src/testing/fixtures/` when
  `contract.spec.ts` is done (see "Not done", 4); until then do not write a second one.
- **For lane 4A:** `CommandRunner` can switch on `isStale`, `isDecisionAlreadyRecorded`, `isAlreadyAnswered`, `isStoryExists`,
  `isInvalidState`, `isRevisionCeilingReached`, `isLegacyStory`, `isValidationFailed` (with `fieldErrors` for the form), `isNotFound`,
  `isUnauthenticated` and `isUnreachable` (network or `unavailable`); an `invalid_response` is never to be shown as a verdict.
- **For lane 3A and the voyage lanes:** `CurrentUser` (`id()`, `initials()`, `is(actor)`) and `readStoryState` for the plan screen.
- **For lane 6D:** `/config.json` takes `apiBase`, `actor` and `jiraBaseUrl` (all optional; `null` or missing means the default; an
  empty `jiraBaseUrl` means no Jira). `actor` must equal the `AHOY_ACTOR` of the dev proxy. Serve it with `Cache-Control: no-cache` and with a
  real 404 when there is none (the app also copes with an HTML page).
- **For the composition root and docs (P0, 6A):** the README "Commands" table has no row for `npm run api:sync` (this lane may only
  touch the Status line); `docs/architecture.md` still says `API_BASE` is provided by `app.config.ts`.

### Final check

Run at the end of the lane, on Node 24.21.0, on the lane's own commit (before `main` was merged in):

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle; 13 lazy chunks; main 219.55 kB raw)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (no problems)
$ npm test                    exit 0 (Test Files 13 passed (13); Tests 499 passed (499))
$ npx prettier --check scripts/ openapi/ src/ package.json   exit 0 (all files use Prettier code style)
$ npm run format:check        exit 1 (24 files, all under .agents/skills, .github/skills and .opencode/skills; none is from this lane)
```

After merging `main` (lane 1A, d29002b), on the merged tree:

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle; main 249.16 kB raw)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint, then build-tokens: ok)
$ npm test                    exit 0 (Test Files 23 passed (23); Tests 582 passed (582): 15 + 83 + 484)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```
