import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import type { AgentJobWords } from '@domain/agent-settings';
import { DialogShell } from '@ui/dialog/dialog';

/** What the confirmation is opened with: the jobs the change turns on. */
export interface AgentsSpendData {
  readonly jobs: readonly AgentJobWords[];
}

/**
 * Asks once before saving a change that turns on Story drafts or Business-rule review, since from then on they spend
 * AIU outside a story's budget. Closes with true when the admin confirms; the page then saves with `confirmSpend`.
 */
@Component({
  selector: 'ah-agents-spend-dialog',
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
      [subtitle]="subtitle"
      confirmLabel="Turn on and save"
      (confirm)="ref.close(true)"
    >
      <p>
        Once on, {{ data.jobs.length === 1 ? 'it runs' : 'they run' }} for the
        whole team:
      </p>
      <ul>
        @for (job of data.jobs; track job.key) {
          <li>
            <strong>{{ job.name }}.</strong> {{ job.warning }}
          </li>
        }
      </ul>
    </ah-dialog>
  `,
})
export class AgentsSpendDialog {
  protected readonly data = inject<AgentsSpendData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly subtitle =
    this.data.jobs.length === 1
      ? "It spends AIU outside a story's budget"
      : "They spend AIU outside a story's budget";
  protected readonly heading = `Turn on ${this.data.jobs.map((j) => j.name).join(' and ')}?`;
}
