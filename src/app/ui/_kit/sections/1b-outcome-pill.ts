import { Component } from '@angular/core';
import { OutcomePill } from '@ui/outcome-pill/outcome-pill';

/** Gallery: the OutcomePill preview, then every gate verdict and run status the vocabulary knows. */
@Component({
  selector: 'ah-kit-outcome-pill',
  imports: [OutcomePill],
  template: `
    <div class="kit-row">
      @for (value of verdicts; track value) {
        <ah-outcome-pill [value]="value" />
      }
    </div>
    <div class="kit-row">
      @for (value of runs; track value) {
        <ah-outcome-pill [value]="value" />
      }
    </div>
  `,
})
export class KitOutcomePill {
  protected readonly verdicts = [
    'pass',
    'approve',
    'branch',
    'send_back',
    'fail',
    'error',
    'reject',
    'halt',
    'waiting',
  ];
  protected readonly runs = [
    'queued',
    'running',
    'awaiting_input',
    'succeeded',
    'failed',
    'lost',
    'cancelled',
    'timed_out',
    'auth_failed',
    'output_violation',
    'budget_exceeded',
  ];
}
