import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import { DialogShell } from '@ui/dialog/dialog';
import { ToastService } from '@ui/toast/toast';
import { settingsErrorView } from './settings-errors';
import type { TeamsSettingsStore } from './teams-settings-store';

/** What the test card dialog is opened with: the page's store and where the card goes. */
export interface TeamsTestCardData {
  readonly store: TeamsSettingsStore;
  readonly host: string;
  /** Whether the card has the "Open Crew" button. */
  readonly withButton: boolean;
}

/**
 * Asks once before a test card goes to the crew's channel, since everyone in it sees the card. 0 AIU. Closes with true
 * once the card was sent, whether Teams took it or not: the page shows the outcome as the last card.
 */
@Component({
  selector: 'ah-teams-test-card-dialog',
  imports: [DialogShell],
  styles: `
    p {
      margin: 0;
    }
  `,
  template: `
    <ah-dialog
      icon="sail"
      heading="Send a test card?"
      [subtitle]="'To the crew’s channel, through ' + data.host"
      confirmLabel="Send test card"
      busyLabel="Sending…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="send()"
    >
      <p>
        Everyone in the channel sees it. It says it is a test sent by you from
        Team settings{{
          data.withButton ? ', with an “Open Crew” button' : ''
        }}.
      </p>
    </ah-dialog>
  `,
})
export class TeamsTestCardDialog {
  protected readonly data = inject<TeamsTestCardData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);
  protected readonly busy = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : settingsErrorView(failure);
  });

  /** Sends the card; a refusal by Ahoy keeps the dialog open, one by Teams closes it and shows on the page. */
  protected async send(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.failure.set(null);
    const result = await this.data.store.sendTestCard();
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    if (result.value.result === 'posted')
      this.toasts.show('Test card posted to the channel.');
    this.ref.close(true);
  }
}
