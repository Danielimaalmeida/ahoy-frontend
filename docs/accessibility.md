# Accessibility

How Ahoy stays usable with a keyboard, a screen reader, zoom and reduced motion. The target is **WCAG 2.2 AA**. These
rules apply the design system (`docs/design/design-system/`, "Focus and accessibility" in its README) to the Angular
components in `src/app/ui/`; where the two differ, this page says so under "Known gaps". How the app builds on the design
system is in [design-system.md](design-system.md).

ESLint's `angular-eslint` `templateAccessibility` rules (`npm run lint`) catch part of this. Nothing checks the rest
automatically yet: `@axe-core/playwright` is an approved dependency, but there is no Playwright suite in the repository.

## Contrast

Measured from `tokens.json` (WCAG relative luminance). Re-measure when a token changes.

| Pair                                                            | Light         | Dark        | Rule                         |
| --------------------------------------------------------------- | ------------- | ----------- | ---------------------------- |
| `ink` on `surface` / `bg`                                       | 15.2 / 14.3   | 13.9 / 15.4 | Body text, 4.5:1             |
| `ink-muted` on `surface` / `bg`                                 | 5.5 / 5.2     | 7.0 / 7.7   | Secondary text, 4.5:1        |
| `ink-muted` on `surface-sunken`                                 | 4.9           | 6.4         | Tab tracks, neutral tags     |
| `ink-soft` on `surface`                                         | 7.7           | 9.1         | Ghost buttons, captions      |
| `accent-text` on `surface`                                      | 8.4           | 8.2         | Links and Jira keys          |
| `on-accent` on `accent`                                         | 5.5           | 4.7         | Primary buttons              |
| `on-accent` on `danger`                                         | 6.6           | 5.5         | Destructive buttons          |
| `danger-text` on `surface`                                      | 7.7           | 6.8         | Danger-outline buttons       |
| Every `status-*-fg` on its `status-*-bg`                        | 6.2 – 11.7    | 7.6 – 12.3  | Badges, 4.5:1                |
| `notice-fg`, `error-fg`, `diff-*-fg` on their backgrounds       | 8.1 – 11.8    | 8.9 – 11.0  | Banners and diffs            |
| `accent` on `surface` (meters, selected chips, current phase)   | 5.5           | 3.5         | Non-text, 3:1                |
| `live` dot on `surface`                                         | 3.5           | 7.2         | Non-text, 3:1 (with "Live")  |
| `ink-disabled` on `surface`                                     | 3.1           | 3.8         | Disabled labels only, exempt |
| `focus` ring on `surface` / `bg`                                | **1.9 / 1.8** | 4.6 / 5.0   | Non-text, 3:1 (see gaps)     |
| `line-strong` (input and secondary-button borders) on `surface` | **1.4**       | **1.8**     | Non-text, 3:1 (see gaps)     |

Rules:

- Text uses `ink`, `ink-soft`, `ink-muted` or `accent-text` on `bg`, `surface`, `surface-raised` or `surface-sunken`,
  and a `status-*-fg` only on its own `status-*-bg`. Don't put `ink-muted` on a status or accent fill.
- `ink-disabled` is for disabled controls only, never for text someone has to read.
- A new colour pair, or a colour defined in a feature (`--metrics-*`, `--crew-lunch`), is measured in both themes
  before it ships: 4.5:1 for text (3:1 at 18.66px bold or 24px and up), 3:1 for an icon, a chart mark, a meter or a
  control's edge that is the only thing showing it.
- Check light **and** dark. A dark value is not a lighter version of the light one; measure it.

## Colour is never the only signal

The design system's rule, and how each component keeps it:

- **Status badges** carry the word ("Needs decision"); the dot repeats the colour. On a voyage header the API word sits
  beside it (`showApi`).
- **Phase stepper**: numbers and marks (✓, !), `aria-current="step"`, and an `aria-label` per step with its state. The
  compact bars have a `role="img"` label ("Phase 3 of 8").
- **Artifact diffs** mark lines with + and −, not only green and red.
- **Outcome pills, toasts and banners** have a word or a title; the icon is decorative.
- **Charts** (Metrics) label their series in a legend and give the values in text or a table. Several light series
  colours are under 3:1 on white (see gaps), so a chart can't rely on telling two of them apart by colour.
- **Trends verdicts** say "better", "worse" or "about the same" in words next to the green or red.

## Focus

- Every interactive element shows the 2px `focus` outline with a 1px offset. The bundle sets it on `.ah :focus-visible`;
  inputs show it on `:focus`. Don't remove an outline without replacing it, and don't set `outline: none` on a
  component's host.
- Focus order follows reading order. Don't use a positive `tabindex`. `tabindex="-1"` is only for an element that
  receives focus from code (a dialog container, a heading moved to after navigation).
- Nothing sticky may cover the focused element (WCAG 2.4.11). The top bar is not sticky; if that changes, add
  `scroll-padding-top` for its height.
- **Dialogs** (`DialogService` on the CDK `Dialog`) are modal, trap focus, focus the dialog on open (`autoFocus:
'dialog'`) and return focus to the trigger on close (`restoreFocus: true`). Escape closes them, except while they are busy (`disableClose`).
- **Menus and popovers** close on Escape and return focus to their trigger, as the account menu in the top bar does
  (`closeMenu(true)`).
- When a whole view changes without a route change (a tab that swaps content, a step in a form), move focus to the new
  view's heading, or announce the change (see "Live regions").

## Keyboard

- Use real elements: `<button>` for actions, `<a href>` (or `routerLink`) for navigation, labelled `<input>`, `<select>`
  and `<textarea>`. Never a clickable `<div>` or `<span>`; the lint rules (`click-events-have-key-events`,
  `interactive-supports-focus`) flag it.
- A link styled as a button (`a[ahButton]`) is still a link: it navigates. An action that changes data is a `<button>`.
- Composite widgets follow the WAI-ARIA Authoring Practices:
  - **Choice cards** (`ah-choice-card-group`) are a `radiogroup`: Tab enters the group at the checked card, arrow keys
    move and select.
  - **Filter chips** and the pill **section tabs** are groups of toggle buttons (`aria-pressed`): Tab moves between
    them, Enter or Space presses.
  - **Section tabs with links** are a `nav` of links with `aria-current="page"`, not an ARIA `tablist`, because each
    tab is a route.
- Disabled-while-busy buttons use `aria-disabled="true"` and ignore clicks, so they keep focus and the screen reader
  can still read them. Use the `disabled` attribute only when the control is not available at all.
- Every action has a keyboard path. If drag and drop is ever added, it needs a button or menu alternative (WCAG 2.5.7).

## Names, roles and states (ARIA)

- Prefer native semantics; add ARIA only where HTML has no element for it. No `role="button"` on a `<div>`.
- **Icons** (`ah-icon`) are `aria-hidden` by default. An icon-only button (close ×, reset) needs an `aria-label` on the
  button: `<button ahButton aria-label="Close">`. Emoji in the UI (the Christmas toggle) sit in `aria-hidden` spans.
- **Fields** (`ah-field` with `ahInput`) wire `id`, `aria-describedby` (hint and error), `aria-invalid` and
  `aria-required`. A field outside `ah-field` needs a `<label for>` or an `aria-label`. Placeholder text is never the
  label.
- **Errors** say what went wrong and what to do (README, "Errors"); they are linked to the field through
  `aria-describedby` and announced when they appear after submit.
- **Tables** (`table[ahTable]`) have `<th scope="col">` headers; a row's name cell is `<th scope="row">`. A table that
  is not obvious from its panel heading gets a `<caption>` (it can be `ah-sr`).
- **Meters** (`ah-budget-meter`) are `role="meter"` with `aria-valuenow`, `aria-valuemax` and an `aria-valuetext` in
  words ("12.4 of 30 AIU").
- **Navigation**: the top bar is `<nav aria-label="Main">` with `aria-current="page"` on the current destination. A
  page has one `<main>` and one `<h1>` (the page-title style), and headings don't skip levels.
- **Page titles**: every route sets a `title` ("Needs you · Ahoy"), so the tab and the screen reader name the page.
- **Visually hidden text** uses the bundle's `ah-sr` class, for example a count's meaning ("4 voyages need you").
- Agent text (plans, questions, logs) is rendered only by `ah-markdown`; keep its headings and lists as real elements.

## Live regions

- Toasts render in one `role="status"` host (`ah-toast-host`): only new toasts are announced. Toasts never hold
  something to press, and anything important also stays on the page.
- A status line that changes after an action (saving, exporting, "Searching…") is `role="status"`. Use
  `role="alert"` only for an error that interrupts, such as a failed save the person must act on.
- Live data (the event stream, the Under way strip, live steps) is **not** announced on every event; that would drown a
  screen reader. Announce what needs the person (a new question, a halt) and leave the rest to the page.
- A busy dialog announces its busy label (`ah-sr` `role="status"`) and sets `aria-busy`.

## Motion

- Motion is minimal: hover fills, the live pulse, the voyage header sweep and the Christmas decorations.
- Every `@keyframes` and transition longer than a hover fill is turned off under `@media (prefers-reduced-motion:
reduce)`. Today the status badge, phase stepper, section tabs, Under way strip, voyage header, Runs tab and the top
  bar's decorations do this; a new animation must too.
- Nothing flashes more than three times a second, and nothing moves on its own for more than five seconds without a way
  to stop it (the decorations have their toggle).

## Zoom, reflow and targets

- Pages never scroll sideways at 320 CSS px (WCAG 1.4.10): tables wrap, the right column moves under the content, the
  top bar folds its search. Check new screens at 390px and at 200% zoom.
- Sizes are in px, but the browser zoom scales them; don't fix heights on text containers, so text can grow (1.4.4) and
  letter or line spacing can change (1.4.12) without clipping.
- Targets are at least 24 × 24px (WCAG 2.5.8): controls are 34px, 28px in table rows (`control-sm`). An icon-only button
  keeps the control height, not the icon's 16px.

## Content

- `<html lang="en">`; UI text is English (F15). Quoted Portuguese or other text from Jira can carry its own `lang`.
- Buttons are verbs that say what happens, and links say where they go; no "click here".
- Times: relative in lists with the absolute time in a `title` or `<time datetime>`; absolute in logs.

## Checking a change

1. `npm run lint` (template accessibility rules) and the component's unit tests, which query by role and label.
2. Tab through the change with the keyboard only: everything reachable, focus visible, order sensible, Escape closes.
3. Turn on reduced motion and check nothing animates.
4. Zoom to 200% and resize to 390px: no sideways scroll, nothing clipped.
5. Check light and dark.
6. With a screen reader (VoiceOver or NVDA), check that new controls, statuses and errors are named and announced.

## Known gaps

These need a change in the design system (re-synced into `docs/design/`) or a decision; they are not fixed here.

- **The light focus ring is too faint.** `focus` `#9DBDF1` is 1.9:1 on `surface` and 1.8:1 on `bg`; WCAG 1.4.11 asks
  3:1 for a focus indicator. Using `accent` (`#1A64D6`, 5.5:1 on `surface`, 5.1:1 on `bg`) in light would pass. Dark
  passes (4.6:1).
- **Control borders.** `line-strong` is 1.4:1 (light) and 1.8:1 (dark) on `surface`. The design system keeps it from the
  wireframes and relies on labels and fills; an empty input on a white panel is still hard to see.
- **Light chart colours.** In light, `--metrics-s3` (2.8:1), `--metrics-s4` and `--metrics-fail` (2.2:1) and
  `--metrics-s5` (2.8:1) are under 3:1 on `surface`. Dark passes.
- **Dark danger fill.** `danger` is 3.0:1 on the dark `surface`; the white label passes (5.5:1), so the button still reads.
- **No skip link.** The top bar has about ten stops before the content; a "Skip to content" link to `<main>` would help.
- **No automated audit.** No axe run in CI; add one to the Playwright suite when it exists.
