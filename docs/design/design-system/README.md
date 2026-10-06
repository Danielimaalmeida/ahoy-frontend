# Ahoy

Ahoy is the internal tool where team members start Jira story deliveries, watch AI agents work through them, answer the agents' questions and decide at human gates. This system is its look and voice: light, rounded, calm, and dense where people scan lists. It was built from the approved UI wireframes (palette A) and is the reference for the Angular front end.

## Principles

1. **A person always knows what needs them.** Status is shown in form as well as words: a coloured badge, a stepper, a dot. The three statuses people act on (Crew asks, Your orders, Anchored) are the loudest things on any screen.
2. **Nothing hides the API.** The nautical labels are a friendly layer. The real status, phase or outcome word is always one glance away, in mono, so people can match the UI with logs and support.
3. **Money is said out loud.** Any action that may spend AIU says how much and who is billed, before the click.
4. **Calm over clever.** Plain sentences, no exclamation marks, no blame. A tooling failure never reads like a verdict.
5. **Dense, not cramped.** 13px base text, ~38px table rows, 34px controls. Tables wrap; pages never scroll sideways.

## Content fundamentals

- **Voice.** A steady first mate: brief, specific, warm. Use the nautical words where they name a real thing (voyage, crew, anchored, set sail, ship's log, the Docks) and plain words everywhere else. Don't stack metaphors ("Batten down the hatches!" is out).
- **Name things the way people do.** "Owner · billed", "Waiting 22 m", "Run failed before any prompt". The vocabulary section maps every label to its API term.
- **Buttons are verbs** in sentence case and say exactly what happens: "Send back to Cartographer", "Resume · up to 10.2 AIU", "Stop voyage".
- **Errors** say what went wrong, what it means and what to do: "The owner's Copilot account can't use gpt-5.6-terra. Pick another planning model, then resume."
- **Numbers.** AIU with one decimal in lists (12.4 / 30 AIU) and two on run detail (3.84). Relative times in lists (22 m ago), absolute times in logs (Tue 09:48). Tabular numerals wherever digits stack.
- **People** appear by e-mail (alex@example.com); the system appears as "Ahoy". Agents keep their names: Navigator (intake), Cartographer (planning), Lookout (review).
- **Example data in designs is fictional** (PROJ-123, alex@example.com). Never paste real story content into design tools.

## Visual foundations

**Colour.** White surfaces (`surface`) on a cool grey ground (`bg`), one blue accent (`accent`) for every action and the current position, and semantic status pairs (`status-*-bg` / `status-*-fg`) that never double as the accent. Text is `ink`; secondary text `ink-muted` (5.3:1 on surface). Links and Jira keys use `accent-text`. Dark theme mirrors every token; check both.

**Type.** One sans, Plus Jakarta Sans, for everything (400/500/600/700), and JetBrains Mono 500 only for identifiers: Jira keys, run ids, API words, model ids, phases, hashes. Scale: page-title 24, voyage-title 22, dialog-title 17, section-title 15, body 13, small 12, caps-label 11. Headings are bold, never light.

**Shape.** Rounded, never sharp: `radius-md` 10px for controls, `radius-lg` 14px for panels and cards, `radius-xl` 18px for dialogs, `radius-pill` for badges, chips, tabs, meters and the search field.

**Elevation.** Panels use a 1px `line` border and no shadow. Only dialogs (`shadow-dialog`), toasts (`shadow-toast`) and the selected segment (`shadow-selected`) are raised.

**Layout.** A light top bar (no sidebar) with pill navigation. Content is centred up to `page-max` (1360px) with a 24px gutter (`space-6`), 16px on phones. Panels stack with 14–16px gaps. Detail pages: a header panel (key, status, title, stepper, meta), section tabs, then content with an optional right column of about 360px that wraps under it on narrow screens.

**Density.** Table cells 7 × 14px, controls 34px (28px in rows), panel padding 14 × 16px. Keep this density in new screens rather than switching to large cards.

**Motion.** Minimal: hover fills and the live pulse. Respect `prefers-reduced-motion`.

**Focus and accessibility.** Every interactive element shows a 2px `focus` outline with 1px offset. Real `<button>`, `<a href>` and labelled inputs only. Status never relies on colour alone: badges carry words, steppers carry numbers or marks, diffs carry +/−. Note: `line-strong` control borders are under 3:1 in light (kept from the wireframes); controls stay identifiable through their labels and fill.

## Iconography

16 line icons on a 24px grid, 1.8px stroke, round caps and joins (the **Icons** asset group). Inline them as SVG with `stroke="currentColor"` so they take the text colour; the uploaded files are drawn in `ink` (#1B2733) for reference. Icons always sit next to a word, except the close (×) and reset buttons, which need an `aria-label`. Nautical icons carry meaning: anchor = halted, sail = start or resume, wheel = the brand and models, compass = agent guidance, aground = blocked. No emoji.

## Logo

The mark is a ship's wheel drawn with the icon stroke (**Logos** group): blue on light, white on the accent. Set the word "Ahoy" beside it in Plus Jakarta Sans 700 at 17px in the top bar. The app icon is the white wheel on an `accent` square with 22/96 corner radius.

## Using it in Angular

- Load `tokens.css` and `components/bundle.css` in the global `styles.scss` (the bundle imports both Google Fonts).
- Components are CSS classes with the `ah-` prefix and documented markup; there is no JavaScript bundle. Wrap them in thin Angular components or attribute directives (each component's README suggests a selector) so the markup lives in one place.
- Theme switching: set `data-theme="dark"` or `"light"` on `<html>`; the first theme (light) is the default.
- AIU values arrive as integer nano-AIU; format them in a pipe, never store rounded values.
