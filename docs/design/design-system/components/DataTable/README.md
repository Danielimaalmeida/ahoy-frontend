# DataTable

The dense table for lists of voyages, runs, gates and backlog items.

## Rules
- Rows are about 38px; cell padding is 7px × `space-3.5`.
- **No horizontal scrolling at desktop widths.** Cells wrap by default; only short cells (badges, dates, buttons, e-mail) get `ah-nowrap`. Put the Jira key and title in one cell, the key in `ah-key`.
- Column headers use `caps-label` on `surface-raised`. Mark the sorted column with an arrow in its header ("Updated ↓").
- Secondary detail goes under the main text with `ah-cell-sub`, not in another column.
- Row actions sit in the last cell, right-aligned, small buttons, with the primary only for the row's main task.
- Below tablet width, the page may wrap the table in an `overflow-x:auto` box; nothing else may scroll sideways.

## Markup
```html
<table class="ah-table">
  <thead><tr><th>Status</th><th>Voyage</th><th>Budget (AIU)</th><th></th></tr></thead>
  <tbody><tr>
    <td class="ah-nowrap"><span class="ah-badge ah-badge--input"><i class="ah-badge__dot"></i>Crew asks</span></td>
    <td><a class="ah-key" href="#">PROJ-131</a>Let customers download receipts as PDF<span class="ah-cell-sub">Round 1 · 1 of 3 answered</span></td>
    <td class="ah-nowrap">…</td><td class="ah-nowrap"><a class="ah-btn ah-btn--sm ah-btn--primary" href="#">Answer</a></td>
  </tr></tbody>
</table>
```
