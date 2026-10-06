# SectionTabs

Segmented tabs that switch between the sections of a voyage (Plan, Questions, Runs, Gates, Artifacts, Ship's log, Models), plus the pill variant used as a small segmented control.

- The selected item sits on `surface` with `shadow-selected`; the rest are `ink-soft` on `surface-sunken`.
- Counts are muted (`ah-tabs__count`) and come straight from the API.
- Items wrap rather than scroll.
- `ah-tabs--pill` is the compact segmented control for filters such as All / Not started / In Ahoy, or View / Compare.

## Markup
```html
<nav class="ah-tabs" aria-label="Voyage sections">
  <a class="ah-tabs__item" aria-current="page" href="#">Plan</a>
  <a class="ah-tabs__item" href="#">Questions <span class="ah-tabs__count">2</span></a>
</nav>
```

## Angular
Route-driven tabs: `<ah-section-tabs>` with child `routerLink`s, so each section has its own URL.
