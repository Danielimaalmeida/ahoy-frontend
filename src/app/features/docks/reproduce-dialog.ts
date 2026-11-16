import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiClient } from '@core/api/api-client';
import {
  hasProblemCode,
  isInvalidState,
  isNotFound,
  isValidationFailed,
  type ApiError,
  type ApiResult,
} from '@core/api/api-error';
import type { Defect } from '@core/api/types';
import {
  apiErrorView,
  techLine,
  type CommandErrorView,
} from '@core/commands/command-error';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { DialogService, DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';

/** What the Reproduce dialog is opened with. */
export interface ReproduceDialogData {
  readonly key: string;
  /** The Jira summary, to say which defect is meant. */
  readonly summary: string;
  /** Team settings › Defects' environment, chosen to start with; null when none is set or it is unknown. */
  readonly defaultEnvironmentId: string | null;
}

/** The phase a reproduction runs as (`ahoy-hosted`'s `REPRODUCE_PHASE`): its AIU cap is in Team settings › Phases. */
const REPRODUCE_PHASE = 'reproduce';

/** The API's own words for a refusal, when it sent them; otherwise `fallback`. */
function detailOr(error: ApiError, fallback: string): string {
  return error.kind === 'problem' && error.detail?.trim()
    ? error.detail.trim()
    : fallback;
}

/**
 * What the dialog says when the reproduction was not queued. A refusal about the defect or the settings (one is in
 * progress, the day's cap is reached, the watch no longer lists it, the environment is gone, reproduction is not set
 * up in this deployment) gets the API's own words; anything else reads as any command's error.
 */
export function reproduceErrorView(
  error: ApiError,
  key: string
): CommandErrorView {
  const tech = techLine(error);
  if (hasProblemCode(error, 'unavailable') && detailOr(error, '') !== '')
    return {
      variant: 'error',
      heading: "Ahoy can't reproduce defects here yet",
      text: detailOr(error, ''),
      tech,
    };
  if (isInvalidState(error))
    return {
      variant: 'notice',
      heading: `Ahoy can't reproduce ${key} now`,
      text: detailOr(
        error,
        'A reproduction of it is in progress, or the day’s reproductions are used up.'
      ),
      tech,
    };
  if (isNotFound(error))
    return {
      variant: 'notice',
      heading: `${key} or its environment is no longer there`,
      text: detailOr(
        error,
        'The watch may no longer list the defect, or the environment was removed.'
      ),
      tech,
    };
  if (isValidationFailed(error))
    return {
      variant: 'error',
      heading: 'Ahoy refused that',
      text: detailOr(error, 'Choose an environment and try again.'),
      tech,
    };
  return apiErrorView(error);
}

/** What the dialog reads when it opens: the environments to choose from and the cap of one reproduction. */
type Choices =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly error: ApiError }
  | {
      readonly kind: 'ready';
      readonly environments: readonly {
        readonly id: string;
        readonly name: string;
      }[];
      /** The AIU cap of one reproduction, in nano-AIU; null when the phases could not be read or set none. */
      readonly capNanoAiu: number | null;
    };

/**
 * "Reproduce PROJ-207?": queues one run that opens the chosen environment in a browser, signs in, follows the
 * defect's steps and says whether it saw the defect (`reproduceDefect`). It spends AIU on the person's own Copilot
 * token, up to the Defect reproduction cap of Team settings › Phases, so the dialog says so before it is sent. It
 * writes nothing to Jira and starts no voyage. Closes with the defect, its reproduction queued.
 */
@Component({
  selector: 'ah-reproduce-dialog',
  imports: [
    Banner,
    DialogShell,
    Field,
    FieldControl,
    ReactiveFormsModule,
    RouterLink,
    Skeleton,
  ],
  template: `
    <ah-dialog
      icon="compass"
      [heading]="'Reproduce ' + key + '?'"
      [confirmLabel]="
        capText() === null
          ? 'Reproduce'
          : 'Reproduce · up to ' + capText() + ' AIU'
      "
      busyLabel="Queuing…"
      [busy]="busy()"
      [confirmDisabled]="environment.value === ''"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Ahoy opens the environment in a browser, signs in, follows the steps of
        <b>{{ key }}</b> ({{ summary }}) and says whether it saw the defect. It
        writes nothing to Jira and starts no voyage.</span
      >
      <ah-banner ahDialogCost variant="cost" [heading]="costHeading()"
        >It runs on your Copilot token and is charged to you. The cap is the
        Defect reproduction one of Team settings › Phases.</ah-banner
      >
      @switch (choices().kind) {
        @case ('loading') {
          <div role="status" aria-label="Loading the environments">
            <ah-skeleton width="60%" />
          </div>
        }
        @case ('failed') {
          <ah-banner
            variant="error"
            heading="Could not read the environments"
            [tech]="choicesTech()"
          >
            Close this and try again.
          </ah-banner>
        }
        @case ('ready') {
          @if (environments().length === 0) {
            <ah-banner variant="notice" heading="No environment yet">
              An admin adds one in
              <a routerLink="/settings/environments" (click)="close()"
                >Team settings › Environments</a
              >.
            </ah-banner>
          } @else {
            <form (ngSubmit)="submit()">
              <ah-field
                label="Environment"
                required
                hint="Where the defect is tried."
              >
                <select ahInput [formControl]="environment">
                  @if (chosen() === '') {
                    <option value="">Choose an environment</option>
                  }
                  @for (e of environments(); track e.id) {
                    <option [value]="e.id">{{ e.name }}</option>
                  }
                </select>
              </ah-field>
            </form>
          }
        }
      }
    </ah-dialog>
  `,
})
export class ReproduceDialog {
  private readonly data = inject<ReproduceDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<Defect>>(DialogRef);
  private readonly api = inject(ApiClient);
  private readonly toasts = inject(ToastService);
  private readonly last = signal<ApiResult<Defect> | null>(null);

  protected readonly key = this.data.key;
  protected readonly summary = this.data.summary;
  protected readonly choices = signal<Choices>({ kind: 'loading' });
  protected readonly environments = computed(() => {
    const choices = this.choices();
    return choices.kind === 'ready' ? choices.environments : [];
  });
  protected readonly choicesTech = computed(() => {
    const choices = this.choices();
    return choices.kind === 'failed' ? techLine(choices.error) : '';
  });
  /** The id of the environment chosen; '' until the environments are read or when there is none. */
  protected readonly environment = new FormControl('', { nonNullable: true });
  protected readonly chosen = toSignal(this.environment.valueChanges, {
    initialValue: this.environment.value,
  });
  /** The cap of one reproduction as text ("5"), or null while it is unknown. */
  protected readonly capText = computed(() => {
    const choices = this.choices();
    return choices.kind === 'ready' && choices.capNanoAiu !== null
      ? formatCap(choices.capNanoAiu, 9)
      : null;
  });
  protected readonly costHeading = computed(() => {
    const cap = this.capText();
    return cap === null
      ? 'This spends AIU, up to the cap of one reproduction'
      : `This may spend up to ${cap} AIU`;
  });
  protected readonly busy = signal(false);
  protected readonly error = computed(() => {
    const last = this.last();
    return last === null || last.ok
      ? null
      : reproduceErrorView(last.error, this.key);
  });

  constructor() {
    void this.load();
  }

  /** Reads the environments to choose from and, beside them, the cap of one reproduction, which may stay unknown. */
  private async load(): Promise<void> {
    const [environments, phases] = await Promise.all([
      this.api.getEnvironments(),
      this.api.getPhaseSettings(),
    ]);
    if (!environments.ok) {
      this.choices.set({ kind: 'failed', error: environments.error });
      return;
    }
    const list = environments.value.environments;
    const preferred = list.find((e) => e.id === this.data.defaultEnvironmentId);
    // The settings' environment, or the only one there is: among several, the person says where it spends.
    const only = list.length === 1 ? list[0] : undefined;
    this.environment.setValue((preferred ?? only)?.id ?? '');
    this.choices.set({
      kind: 'ready',
      environments: list,
      capNanoAiu: phases.ok
        ? (phases.value.phases.find((p) => p.phase === REPRODUCE_PHASE)?.runsOn
            .budgetNanoAiu ?? null)
        : null,
    });
  }

  protected close(): void {
    this.ref.close();
  }

  protected async submit(): Promise<void> {
    const environmentId = this.chosen();
    if (environmentId === '' || this.busy()) return;
    const name =
      this.environments().find((e) => e.id === environmentId)?.name ??
      'the environment';
    this.busy.set(true);
    const result = await this.api.reproduceDefect(this.key, environmentId);
    this.busy.set(false);
    this.last.set(result);
    if (!result.ok) return;
    this.toasts.show(
      `Reproducing ${this.key} on ${name}. The verdict shows here when the run ends.`
    );
    this.ref.close(result.value);
  }
}

/** Opens the Defects tab's Reproduce dialog. It closes with the defect, or `undefined`. */
@Injectable({ providedIn: 'root' })
export class ReproduceDialogs {
  private readonly dialogs = inject(DialogService);

  /** "Reproduce PROJ-207?" */
  open(data: ReproduceDialogData): DialogRef<Defect, ReproduceDialog> {
    return this.dialogs.open<Defect, ReproduceDialogData, ReproduceDialog>(
      ReproduceDialog,
      { data }
    );
  }
}
