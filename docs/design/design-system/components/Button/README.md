# Button

Buttons start an action: one primary per view, for the thing the screen is for.

## Variants
- `ah-btn--primary` (accent fill): the one main action, such as **Review plan**, **Send answer** or **Set sail**. At most one per panel or dialog.
- default (surface, `line-strong` border): secondary actions such as **Budget** or **Models**.
- `ah-btn--soft` (accent-soft): an action that belongs to an item, such as **Use recommendation** or **Open voyage**.
- `ah-btn--ghost`: low-emphasis links in dense rows, such as **Jira ↗** or **Reset**.
- `ah-btn--danger` (filled): confirms a destructive step inside a dialog only (**Stop voyage**, **Reject plan**).
- `ah-btn--danger-outline`: opens a destructive dialog from a page header (**Stop**).

Sizes: default 34px (`control-md`), `ah-btn--sm` 28px for table rows and panel headers, `ah-btn--lg` 40px for the single confirm in a form summary.

## Copy
Verb first, sentence case, saying exactly what happens: "Send back to Cartographer", "Resume · up to 10.2 AIU". When an action can spend AIU, the label or the line next to it says how much.

## Markup
```html
<button class="ah-btn ah-btn--primary" type="button">Review plan</button>
<a class="ah-btn ah-btn--sm" href="/voyages/PROJ-118">Review &amp; resume</a>
```

## Angular
`<button ahButton="primary" size="sm">` as an attribute directive that adds the classes, so native `<button>` and `<a>` semantics stay.
