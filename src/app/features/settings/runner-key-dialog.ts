import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  Component,
  DOCUMENT,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { API_BASE } from '@core/api/api-base';
import type { FigmaSettings } from '@core/api/types';
import {
  AHOY_API_URL_VARIABLE,
  RUNNER_KEY_SECRET,
  ahoyApiUrl,
} from '@domain/figma-settings';
import { tokenLabel } from '@domain/settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { DialogSend } from './dialog-send';
import type { FigmaSettingsStore } from './figma-settings-store';

/** What the runner key dialog is opened with: the page's store and Figma's settings as they are. */
export interface RunnerKeyData {
  readonly store: FigmaSettingsStore;
  readonly figma: FigmaSettings;
}

/**
 * Generates the runner key, the first or one that ends the old at once, and shows it this once with where it goes in
 * GitHub; or removes it after a second press. Ahoy keeps only the key's digest and last four characters, so a key
 * that is closed without being copied is generated again.
 */
@Component({
  selector: 'ah-runner-key-dialog',
  imports: [Banner, Button, DialogShell, Field, FieldControl],
  styles: `
    p {
      margin: 0;
    }
    .steps {
      margin: 12px 0 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
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
  `,
  template: `
    <ah-dialog
      icon="lock"
      [heading]="heading()"
      [subtitle]="subtitle()"
      [confirmLabel]="confirmLabel()"
      [cancelLabel]="key() === null ? 'Cancel' : 'Done'"
      busyLabel="Generating…"
      [busy]="send.busy()"
      [error]="send.error()"
      (confirm)="confirm()"
    >
      @if (key(); as shown) {
        <ah-field
          label="Runner key"
          hint="Shown this once. Copy it before you close this dialog."
        >
          <input
            #keyField
            ahInput
            mono
            readonly
            type="text"
            spellcheck="false"
            autocomplete="off"
            [value]="shown"
          />
        </ah-field>
        <ol class="steps">
          <li>
            In GitHub, save it as the organisation secret
            <span class="ah-mono">{{ secret }}</span> of the child repositories.
          </li>
          <li>
            Set the organisation variable
            <span class="ah-mono">{{ variable }}</span> to
            @if (apiUrl; as url) {
              <span class="ah-mono">{{ url }}</span
              >.
            } @else {
              Ahoy's https address, without /api/v1.
            }
            The runners must be able to reach it.
          </li>
        </ol>
      } @else {
        <p>
          With it, a run fetches from Ahoy the design's node trees that did not
          fit in its context. It opens nothing else, and only while the run is
          queued or running.
        </p>
        @if (current; as old) {
          <ah-banner
            variant="notice"
            announce="off"
            [heading]="'The key ' + label(old.hint) + ' stops working at once'"
          >
            Runs fetch no node trees until {{ secret }} holds the new key.
          </ah-banner>
          <div class="remove">
            @if (confirmingRemove()) {
              <p>
                Remove the runner key {{ label(old.hint) }}? Runs then work only
                with the node trees that fit in their context, as without a key.
              </p>
              <button
                ahButton="danger-outline"
                size="sm"
                type="button"
                [disabled]="send.busy()"
                (click)="remove()"
              >
                Remove the key
              </button>
            } @else {
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                (click)="confirmingRemove.set(true)"
              >
                Remove the key…
              </button>
            }
          </div>
        }
      }
    </ah-dialog>
  `,
})
export class RunnerKeyDialog {
  protected readonly data = inject<RunnerKeyData>(DIALOG_DATA);
  protected readonly send = new DialogSend(
    inject<DialogRef<boolean>>(DialogRef),
    inject(ToastService)
  );
  private readonly toasts = inject(ToastService);
  protected readonly current = this.data.figma.runnerKey;
  protected readonly label = tokenLabel;
  protected readonly secret = RUNNER_KEY_SECRET;
  protected readonly variable = AHOY_API_URL_VARIABLE;
  /** What `AHOY_API_URL` should hold for this Ahoy, or null when the page cannot tell. */
  protected readonly apiUrl = ahoyApiUrl(
    inject(DOCUMENT).location.origin,
    inject(API_BASE)
  );
  /** The new key, once generated; never stored anywhere else. */
  protected readonly key = signal<string | null>(null);
  protected readonly confirmingRemove = signal(false);
  private readonly keyField =
    viewChild<ElementRef<HTMLInputElement>>('keyField');

  protected readonly heading = computed(() => {
    if (this.key() !== null) return 'Copy the runner key now';
    return this.current ? 'Replace the runner key' : 'Generate a runner key';
  });
  protected readonly subtitle = computed(() =>
    this.key() === null
      ? 'For the implementation workflow only'
      : 'Ahoy keeps only its last four characters'
  );
  protected readonly confirmLabel = computed(() => {
    if (this.key() !== null) return 'Copy key';
    return this.current ? 'Replace key' : 'Generate key';
  });

  constructor() {
    // The key replaces the form under the same buttons: the focus moves to it, selected, so it is read out and copied.
    afterRenderEffect(() => {
      const field = this.keyField()?.nativeElement;
      if (field === undefined) return;
      field.focus();
      field.select();
    });
  }

  /** Generates the key, or copies the one shown. */
  protected async confirm(): Promise<void> {
    const shown = this.key();
    if (shown !== null) {
      await this.copy(shown);
      return;
    }
    const result = await this.send.keepOpen(() =>
      this.data.store.generateRunnerKey()
    );
    if (result?.ok) this.key.set(result.value.key);
  }

  /** Copies the key; the Clipboard API can be missing or refused, and the key stays selectable. */
  private async copy(key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(key);
      this.toasts.show(`Runner key copied. Save it as ${this.secret}.`);
    } catch {
      this.toasts.show(
        "Couldn't copy to the clipboard. Select the key and copy it."
      );
    }
  }

  /** Removes the key and closes. */
  protected async remove(): Promise<void> {
    await this.send.run(
      () => this.data.store.removeRunnerKey(),
      'The runner key is removed.'
    );
  }
}
