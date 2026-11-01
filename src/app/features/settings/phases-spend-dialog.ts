import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { aiuLabel, phaseName, type CapChange } from '@domain/phase-settings';
import { DialogShell } from '@ui/dialog/dialog';

/** What the confirmation is opened with: the phases whose AIU cap the change raises. */
export interface PhasesSpendData {
  readonly raised: readonly CapChange[];
}

/**
 * Asks once before saving a change that raises a phase's AIU cap, since every run of that phase may then spend more.
 * Closes with true when the admin confirms; the page then saves with `confirmSpend`.
 */
@Component({
  selector: 'ah-phases-spend-dialog',
  imports: [DialogShell],
  styles: `
    ul {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    p {
      margin: 0 0 10px;
    }
  `,
  template: `
    <ah-dialog
      icon="bell"
      [heading]="heading"
      subtitle="Each run of the phase may then spend more AIU"
      confirmLabel="Raise and save"
      (confirm)="ref.close(true)"
    >
      <p>From the next run, for the whole team:</p>
      <ul>
        @for (c of lines; track c.phase) {
          <li>
            <strong>{{ c.name }}:</strong> {{ c.from }} → {{ c.to }} per run.
          </li>
        }
      </ul>
    </ah-dialog>
  `,
})
export class PhasesSpendDialog {
  protected readonly data = inject<PhasesSpendData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly lines = this.data.raised.map((c) => ({
    phase: c.phase,
    name: phaseName(c.phase),
    from: aiuLabel(c.from),
    to: aiuLabel(c.to),
  }));
  protected readonly heading =
    this.data.raised.length === 1
      ? 'Raise an AIU cap?'
      : `Raise ${this.data.raised.length} AIU caps?`;
}
