import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { ok, type ApiResult } from '@core/api/api-error';
import type { TeamsSettings } from '@core/api/types';
import {
  MAX_UI_URL_CHARS,
  MAX_WEBHOOK_CHARS,
  uiUrlProblem,
  webhookHost,
  webhookProblem,
} from '@domain/teams-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { DialogSend } from './jira-dialog-send';
import type { TeamsSettingsStore } from './teams-settings-store';

/** What the channel dialog is opened with: the page's store and the channel as set, or null to connect it. */
export interface TeamsChannelData {
  readonly store: TeamsSettingsStore;
  readonly teams: TeamsSettings | null;
  /** Whether the API's key opens the stored webhook; when it does not, the webhook must be pasted again. */
  readonly webhookReadable: boolean;
}

/** The UI's address as the API keeps it: trimmed, without trailing slashes. */
function uiUrlOf(typed: string): string {
  return typed.trim().replace(/\/+$/, '');
}

/**
 * Connects the crew's channel or changes it: the Workflows webhook (pasted once and never shown again, only its host),
 * the UI's address the cards' "Open Crew" button opens, and disconnecting. Closes with true once something was saved.
 */
@Component({
  selector: 'ah-teams-channel-dialog',
  imports: [Banner, Button, DialogShell, Field, FieldControl],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .remove {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
    .remove p {
      margin: 0;
    }
  `,
  template: `
    <ah-dialog
      icon="lock"
      [heading]="
        connected() ? 'Edit the crew’s channel' : 'Connect the crew’s channel'
      "
      [subtitle]="subtitle"
      [confirmLabel]="connected() ? 'Save' : 'Connect'"
      busyLabel="Saving…"
      [busy]="send.busy()"
      [confirmDisabled]="invalid()"
      [error]="send.error()"
      (confirm)="submit()"
    >
      @if (lostWebhook) {
        <ah-banner variant="notice" heading="Paste the webhook again">
          The API's key no longer opens the stored webhook, so no card is posted
          until it is pasted again.
        </ah-banner>
      }
      <form (submit)="$event.preventDefault(); submit()">
        <ah-field
          [label]="connected() ? 'New webhook' : 'Webhook'"
          [required]="webhookRequired()"
          [hint]="webhookHint()"
          [errorText]="touched() ? (webhookError() ?? '') : ''"
        >
          <input
            ahInput
            mono
            type="password"
            autocomplete="off"
            spellcheck="false"
            [attr.maxlength]="maxWebhook"
            [attr.placeholder]="
              connected() && !lostWebhook
                ? 'Leave empty to keep the webhook on ' +
                  (teams?.webhook?.host ?? '')
                : null
            "
            [value]="webhook()"
            (input)="typed($event, 'webhook')"
          />
        </ah-field>
        <ah-field
          label="Card links open"
          optional
          hint="The Ahoy address, such as https://ahoy.example.com. The cards' Open Crew button goes to its Crew page; empty, the cards have no button."
          [errorText]="touched() ? (uiUrlError() ?? '') : ''"
        >
          <input
            ahInput
            mono
            type="url"
            autocomplete="off"
            spellcheck="false"
            [attr.maxlength]="maxUiUrl"
            [value]="uiUrl()"
            (input)="typed($event, 'uiUrl')"
          />
        </ah-field>
      </form>
      @if (teams) {
        <div class="remove">
          @if (confirmingOff()) {
            <p>
              Disconnect the crew's channel? No card is posted until it is
              connected again. Its webhook is deleted.
            </p>
            <button
              ahButton="danger-outline"
              size="sm"
              type="button"
              [disabled]="send.busy()"
              (click)="disconnect()"
            >
              Disconnect the channel
            </button>
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="confirmingOff.set(true)"
            >
              Disconnect the channel…
            </button>
          }
        </div>
      }
    </ah-dialog>
  `,
})
export class TeamsChannelDialog {
  private readonly data = inject<TeamsChannelData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly send = new DialogSend(this.ref, inject(ToastService));

  protected readonly teams = this.data.teams;
  protected readonly maxWebhook = MAX_WEBHOOK_CHARS;
  protected readonly maxUiUrl = MAX_UI_URL_CHARS;
  protected readonly subtitle = this.teams
    ? `Cards go to ${this.teams.webhook.host}`
    : 'A Teams Workflows webhook: “Post to a channel when a webhook request is received”';
  /** Whether the stored webhook can no longer be opened, so keeping it keeps the channel off. */
  protected readonly lostWebhook =
    this.teams !== null && !this.data.webhookReadable;

  protected readonly webhook = signal('');
  protected readonly uiUrl = signal(this.teams?.uiUrl ?? '');
  protected readonly touched = signal(false);
  protected readonly confirmingOff = signal(false);
  /** The channel's version once saved: a webhook saved by this dialog moves it on before the address is saved. */
  private readonly version = signal<number | null>(this.teams?.version ?? null);
  /** The address as saved, so an unchanged one is not sent. */
  private readonly savedUiUrl = signal(this.teams?.uiUrl ?? null);
  protected readonly connected = computed(() => this.version() !== null);

  protected readonly webhookRequired = computed(
    () => !this.connected() || this.lostWebhook
  );
  protected readonly webhookError = computed(() =>
    this.webhook().trim() === '' && !this.webhookRequired()
      ? null
      : webhookProblem(this.webhook())
  );
  protected readonly uiUrlError = computed(() => uiUrlProblem(this.uiUrl()));
  protected readonly invalid = computed(
    () => this.webhookError() !== null || this.uiUrlError() !== null
  );
  protected readonly webhookHint = computed(() => {
    const host = webhookHost(this.webhook());
    return host !== null && webhookProblem(this.webhook()) === null
      ? `Cards will go to ${host}. Stored encrypted; only its host is shown again.`
      : 'Anyone who has it can post to the channel, so it is stored encrypted and only its host is shown again.';
  });

  protected typed(event: Event, field: 'webhook' | 'uiUrl'): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    (field === 'webhook' ? this.webhook : this.uiUrl).set(target.value);
  }

  /** Saves the webhook, then the address, and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.touched.set(true);
    if (this.invalid() || this.send.busy()) return;
    const webhookUrl = this.webhook().trim();
    const typedUiUrl = uiUrlOf(this.uiUrl());
    const uiUrl = typedUiUrl === '' ? null : typedUiUrl;
    const uiChanged = uiUrl !== this.savedUiUrl();
    if (webhookUrl === '' && !uiChanged) {
      this.ref.close(false);
      return;
    }
    const store = this.data.store;
    await this.send.run(
      async (): Promise<ApiResult<unknown>> => {
        if (webhookUrl !== '') {
          const version = this.version();
          const put = await store.putWebhook({
            webhookUrl,
            ...(version !== null ? { version } : {}),
          });
          if (!put.ok) {
            await store.refresh();
            return put;
          }
          this.version.set(put.value.version);
          this.savedUiUrl.set(put.value.uiUrl);
          this.webhook.set('');
        }
        const version = this.version();
        if (uiUrl !== this.savedUiUrl() && version !== null) {
          const patch = await store.changeUiUrl({ version, uiUrl });
          await store.refresh();
          return patch;
        }
        await store.refresh();
        return ok(null);
      },
      this.teams ? 'Teams settings saved.' : 'The crew’s channel is connected.'
    );
  }

  /** Disconnects the channel and closes. */
  protected async disconnect(): Promise<void> {
    await this.send.run(
      () => this.data.store.disconnect(),
      'The crew’s channel is disconnected.'
    );
  }
}
