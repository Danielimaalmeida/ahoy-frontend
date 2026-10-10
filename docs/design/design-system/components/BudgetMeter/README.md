# BudgetMeter

Shows AIU spent against a voyage's or a run's hard cap, always with the numbers beside the bar.

Write figures as "12.4 / 30 AIU" with tabular numerals; one decimal in lists, two on run detail (3.84). AIU is stored in integer nano-AIU: format on display, never round in storage. The bar is `accent` on `surface-sunken`; it does not change colour as it fills, because the cap is a limit the owner chose, not a warning. When a voyage halts on `budget_exhausted`, the Anchored badge says so.

## Markup

```html
<div class="ah-budget">
  <div class="ah-meter" style="width:120px" role="meter" aria-valuemin="0" aria-valuemax="30" aria-valuenow="12.4" aria-label="Budget">
    <i class="ah-meter__fill" style="width:41%"></i>
  </div>
  <span><b>12.4</b> / 30 AIU</span>
</div>
```

## Angular

`<ah-budget-meter [spentNanoAiu]="s.spent" [capNanoAiu]="s.budget" [decimals]="1">`.
