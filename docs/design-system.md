# Design system in the app

The design system is the Claude Design artifact "Ahoy", copied into `docs/design/design-system/` (version and re-sync
steps in [`design/SOURCES.md`](design/SOURCES.md)). That copy is the reference and is never edited here. This page is
the app's side: how `src/` uses it, what the app adds, and where the two differ. Accessibility rules are in
[accessibility.md](accessibility.md).

Checked against the code on 2026-11-10 (design system `1791619698-2405`).

## How it is loaded

`src/styles.scss` loads, in order:

1. `styles/tokens.css`: generated from `tokens.json` by `npm run tokens`. `node scripts/build-tokens.mjs --check` fails
   if it is stale or if a `var(--x)` in `src/` names a property nothing defines.
2. `styles/ahoy-bundle.css`: a copy of `components/bundle.css` (it imports the two Google Fonts).
3. `styles/_ahoy-angular.scss` and `styles/_ahoy-1b.scss`: the few rules the bundle can't know about (Angular host
   elements, inline styles of the previews, the extensions below). Each rule says why it exists.
4. `styles/_ahoy-a11y.scss`: contrast fixes to `focus`, `line-strong`, dark `danger` and a new `progress-current`, until
   the design system has them ([accessibility.md](accessibility.md#fixes-the-design-system-does-not-have-yet)).

The root component carries `class="ah"` (`<ah-root class="ah">`, the bundle's scope), and `data-theme` sits on `<html>` (`ThemeService`, light by
default, remembered in `localStorage`). The `/_kit` gallery (development builds only) shows every component in both
themes next to the `preview.html` files.

## Components

Each design-system component has a thin wrapper in `src/app/ui/` that renders the README markup.

| Design system | Angular                                                             |
| ------------- | ------------------------------------------------------------------- |
| ArtifactDiff  | `ah-artifact-diff`, `[ahMark]`                                      |
| Banner        | `ah-banner`                                                         |
| BudgetMeter   | `ah-budget-meter`                                                   |
| Button        | `button[ahButton]`, `a[ahButton]`                                   |
| ChoiceCard    | `ah-choice-card-group`                                              |
| DataTable     | `table[ahTable]`, `[ahNowrap]`, `[ahKey]`, `[ahApi]`, `[ahCellSub]` |
| Dialog        | `ah-dialog`, opened with `DialogService` (CDK `Dialog`)             |
| EmptyState    | `ah-empty-state`                                                    |
| Field         | `ah-field`, `input/textarea/select[ahInput]`                        |
| FilterChips   | `ah-filter-chips`                                                   |
| LiveSteps     | `ah-live-steps`                                                     |
| ModelChoice   | `ah-model-choice-table`, `ah-model-choice-row`                      |
| OutcomePill   | `ah-outcome-pill`                                                   |
| Panel         | `ah-panel`, `ah-panel-head`, `ah-panel-body`, `ah-panel-foot`       |
| PhaseStepper  | `ah-phase-stepper`                                                  |
| QuestionCard  | `ah-question-card`                                                  |
| SectionTabs   | `ah-section-tabs`                                                   |
| ShipsLog      | `ah-ships-log` (shown as the **Activity** tab)                      |
| Skeleton      | `ah-skeleton`, `ah-skeleton-rows`                                   |
| StatusBadge   | `ah-status-badge`                                                   |
| Toast         | `ah-toast-host` and `ToastService`                                  |
| TopBar        | `ah-top-bar`                                                        |
| (Icons)       | `ah-icon`: the 16 icons of `assets/Icons`, inlined, `currentColor`  |
| (Logos)       | `ah-logo`                                                           |

The app adds these, with no design-system counterpart. They use only tokens and bundle classes:

- `ah-markdown`: renders agent text (the only place API text becomes HTML), in the `reading` type style.
- `ah-source`: the model-source tag (`ah-source`, from the ModelChoice markup) on its own.
- `ah-access-denied`, `ah-setup-banner`, `ah-worker-startup`: app states built from Panel, Banner and EmptyState.
- `ah-placeholder`: a planned screen.
- Pipes: `ahAiu` (nano-AIU to "12.4"), `ahRelative` ("22 m ago"), `ahDateTime` ("Tue 09:48"), `ahActor`.
- `ThemeService` and `ChristmasService` (the seasonal decorations in the top bar, with a toggle).

## Extensions

Rules the app adds on top of the bundle, in `src/styles/`:

- **`ah-badge--cancelled`**: a cancelled voyage. Outlined, no fill, `ink-muted`. The design system has no such badge.
- **Pill section tabs as toggle buttons**: `aria-pressed="true"` gets the selected look, because `aria-selected` is not
  valid on a button.
- **Row headers** (`<th scope="row">` in a table body) read as a cell, not as a column header.
- **Links styled as buttons** keep each variant's text colour (the bundle's `.ah a` rule would make them link-blue).
- **Toast placement**: bottom centre, above dialogs (`z-index` 1100), not clickable.
- **Empty-state icon** at 40px with a 1.6 stroke.
- **Empty-state sizes** (`size` on `ah-empty-state`): `panel` (default, as the design system), `page` (the icon in a
  72px `accent-soft` circle, for a whole screen's first use: Voyages, Meetings, a meeting with no topics or no notes)
  and `compact` (a 24px icon, inside a table whose filter found nothing). Actions sit in `.ah-empty__actions`; an
  `[ahEmptyExtra]` slot after them holds a form or a list (the Meetings topic composer).

Feature-local custom properties (defined and used inside one feature, both themes set):

- `--metrics-s1` … `--metrics-s5`, `--metrics-pass`, `--metrics-fail`, `--metrics-reject`, `--metrics-error`: the chart
  series of the Metrics boards (`features/metrics/metrics.scss`).
- `--crew-lunch`, `--crew-on-lunch`: the lunch host's orange on the Crew page (`features/crew/crew-page.ts`).

## Labels

Since the design system's change of 2026-10-10, statuses, actions and navigation use plain words (Running, Needs
answers, Needs decision, Halted, Done, Blocked; Start voyage, Stop, Resume; Needs you, Backlog, Activity). The nautical
theme stays in names and headings (voyage, crew, the agents' names, "All hands on deck", "Calm seas"). The full list is
`design/design-system/vocabulary.md`.

Some code names still use the older words (`AllHandsPage`, `AnchoredBanner`, `isAground`, the `set-sail` and `harbour`
folders, spec titles). They are identifiers, not UI text; rename them only together with the code around them.

## Rules for new UI

- Use a wrapper from `src/app/ui/` before writing markup with bundle classes, and bundle classes before new CSS.
- Colours, spacing, radii and shadows come from tokens (`var(--…)`). `npm run lint` runs `npm run tokens:check`, which
  fails on an undefined `var(--x)` and on a colour written literally (hex, `rgb()`, `hsl()`…) in any style outside
  `RAW_COLOUR_FILES` in `scripts/build-tokens.mjs`. A file goes on that list only with its reason, and its colours are
  declared once per theme as feature-local properties (listed above).
- Only dialogs, toasts and the selected segment are raised (`shadow-*`). A small popover may use a light shadow, as the
  Meetings topic menu does.
- Keep the density: 34px controls (28px in rows), 7 × 14px table cells, 14 × 16px panel padding.
- A new component or variant that should exist everywhere belongs in the design system first; then re-sync it and wrap
  it here.

## Known differences

- **ModelChoice.** The design system's preview has an `intake` row with model and effort. Intake runs no model in the
  app (`domain/models.ts`), so the app shows no row for it.
- **Raw colours.** The Christmas decorations (`ui/top-bar/top-bar.scss`) use literal colours; the Teams settings preview
  card and the Meetings topic menu use literal shadows.
- **Theme switch.** The app has no theme button yet (F16); only `/_kit` switches theme.
- **Icons.** `calendar-plus`, `document` and `waves` (`APP_ICON_NAMES` in `ui/icon/icons.ts`) are drawn in the app,
  in the design system's line style, for the empty states; they should move into the design system's icon set.
- **Tokens.** Four colour tokens differ from the design system for contrast (`_ahoy-a11y.scss`); they should move into
  it, then the overrides go.
