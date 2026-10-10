import { Component } from '@angular/core';
import { BudgetMeter } from '@ui/budget-meter/budget-meter';

/** Gallery: the BudgetMeter preview (header and run forms), then empty, 41 % and full, which never change colour. */
@Component({
  selector: 'ah-kit-budget-meter',
  imports: [BudgetMeter],
  template: `
    <ah-budget-meter [spentNanoAiu]="spent" [capNanoAiu]="cap" />
    <div class="kit-row">
      <ah-budget-meter
        [spentNanoAiu]="runSpent"
        [capNanoAiu]="runCap"
        [decimals]="2"
        [width]="70"
        variant="compact"
        label="Run budget"
      />
      <span class="ah-hint">this run, live</span>
    </div>
    <div class="kit-row">
      <ah-budget-meter
        [spentNanoAiu]="0"
        [capNanoAiu]="cap"
        [width]="64"
        variant="compact"
      />
      <ah-budget-meter
        [spentNanoAiu]="spent"
        [capNanoAiu]="cap"
        [width]="64"
        variant="compact"
      />
      <ah-budget-meter
        [spentNanoAiu]="cap"
        [capNanoAiu]="cap"
        [width]="64"
        variant="compact"
      />
    </div>
  `,
})
export class KitBudgetMeter {
  /** Integer nano-AIU, as the API sends them: 12.4 of 30 AIU, and 1.84 of 28.6 AIU for a run. */
  protected readonly spent = 12_400_000_000;
  protected readonly cap = 30_000_000_000;
  protected readonly runSpent = 1_840_000_000;
  protected readonly runCap = 28_600_000_000;
}
