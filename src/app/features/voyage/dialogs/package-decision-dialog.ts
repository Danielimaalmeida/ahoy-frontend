import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { Story, WorkPackageDecision } from '@core/api/types';
import { formatAiu } from '@domain/aiu';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { ToastService } from '@ui/toast/toast';
import type { VoyageContext } from '../context/voyage-context';
import { canDecidePackage, packageStatusView } from '../context/work-packages';
import { CommandState } from './dialog-support';

/** The longest reason `decideWorkPackage` takes (`WorkPackageDecisionRequest.reason`, `maxLength: 5000`). */
export const PACKAGE_REASON_MAX = 5000;

/** The messages of the reason field. */
const MESSAGES: Readonly<Record<string, string>> = {
  required: 'A reason is required.',
  maxlength: `At most ${PACKAGE_REASON_MAX} characters.`,
};

/** What the dialog is opened with: the page's context, the package and the decision. */
export interface PackageDecisionDialogData {
  readonly context: VoyageContext;
  readonly workPackageId: string;
  readonly decision: WorkPackageDecision;
}

/**
 * "Retry WP2?" or "Accept WP2 as it stands?": a person's decision on a work package nothing else will move
 * (`decideWorkPackage`). Retry sends the package round again with the reason as its rework note and may spend AIU; accept
 * marks it done as it is, which approves neither the voyage nor its pull request: `child_ready`, `pr` (CI) and the review
 * still judge it. Both need a reason and a ticked confirmation.
 *
 * One request at a time: the confirm button is busy while it is in flight, and a second click sends nothing. On
 * `409 stale_version` the voyage has been read again: the reason is kept, the confirmation is cleared, and the person
 * confirms again (nothing is resent on its own). When the package or the voyage no longer allows the decision, the
 * dialog says so and cannot be confirmed.
 */
@Component({
  selector: 'ah-package-decision-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    .decision__confirm {
      align-items: flex-start;
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .decision__confirm input {
      margin-top: 3px;
      min-height: 16px;
      min-width: 16px;
    }
  `,
  template: `
    <ah-dialog
      [heading]="heading()"
      [icon]="retry() ? 'refresh' : 'check'"
      [confirmLabel]="confirmLabel()"
      [busyLabel]="retry() ? 'Retrying…' : 'Accepting…'"
      [busy]="busy()"
      [confirmDisabled]="!allowed() || noBudget() || !isConfirmed()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead>
        @if (retry()) {
          Ahoy runs <b>{{ wp }}</b> again, with your reason as its rework note,
          and the voyage carries on with implementation.
        } @else {
          Ahoy marks <b>{{ wp }}</b> done as it stands and carries on. This does
          not approve the voyage and does not skip anything: the pull request is
          still checked by its gates (CI included) and by the review.
        }
      </span>
      @if (!allowed()) {
        <ah-banner
          ahDialogCost
          variant="notice"
          [heading]="wp + ' can no longer be decided here'"
          announce="alert"
          >{{ notAllowedText() }}</ah-banner
        >
      } @else if (retry()) {
        @if (noBudget()) {
          <ah-banner
            ahDialogCost
            variant="error"
            heading="No budget left: raise the budget first."
            announce="status"
            >The voyage has spent all of its {{ budget() }} AIU.</ah-banner
          >
        } @else {
          <ah-banner
            ahDialogCost
            variant="cost"
            [heading]="'This may spend up to ' + remaining() + ' AIU'"
            >The new run of {{ wp }} spends from the rest of the voyage's
            {{ budget() }} AIU budget, billed to {{ owner() }}'s Copilot
            account.</ah-banner
          >
        }
      } @else {
        <ah-banner ahDialogCost variant="info" heading="Spends no AIU"
          >Accepting records your reason in the voyage's decision
          log.</ah-banner
        >
      }
      <ah-field
        [label]="
          retry() ? 'Rework note for the implementer' : 'Why it is acceptable'
        "
        required
        [hint]="
          retry()
            ? 'The implementer gets this as the reason to run the package again.'
            : 'Recorded with your name in the decision log.'
        "
        [errorMessages]="messages"
        [errorText]="serverError()"
      >
        <textarea ahInput rows="3" [formControl]="reason"></textarea>
      </ah-field>
      <label class="decision__confirm">
        <input type="checkbox" [formControl]="confirmed" />
        <span>{{ confirmText() }}</span>
      </label>
    </ah-dialog>
  `,
})
export class PackageDecisionDialog {
  private readonly data = inject<PackageDecisionDialogData>(DIALOG_DATA);
  private readonly context = this.data.context;
  private readonly ref = inject<DialogRef<Story>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<Story>();

  protected readonly wp = this.data.workPackageId;
  protected readonly messages = MESSAGES;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [requiredText, maxTrimmed(PACKAGE_REASON_MAX)],
  });
  protected readonly confirmed = new FormControl(false, { nonNullable: true });
  /** Whether the confirmation is ticked, as a signal for the confirm button. */
  protected readonly isConfirmed = toSignal(this.confirmed.valueChanges, {
    initialValue: false,
  });

  protected readonly retry = computed(() => this.data.decision === 'retry');
  protected readonly busy = this.context.commands.pending;
  protected readonly error = this.command.error;
  protected readonly serverError = computed(() =>
    this.command.fieldError('reason')
  );

  /** The package as the page holds it now (read again after a conflict). */
  private readonly pkg = computed(
    () => this.context.state()?.packages.find((p) => p.id === this.wp) ?? null
  );

  /** The voyage and the package still allow the decision. */
  protected readonly allowed = computed(() =>
    canDecidePackage(this.context.story(), this.pkg())
  );

  protected readonly notAllowedText = computed(() => {
    const story = this.context.story();
    const pkg = this.pkg();
    if (pkg === null)
      return `The plan has no work package ${this.wp} any more.`;
    if (story?.status !== 'halted' || story.phase !== 'implementation')
      return 'The voyage is no longer halted in implementation. The page has been refreshed.';
    return `It is ${packageStatusView(pkg.status).label.toLowerCase()} now; only a failed, stalled, blocked or unverified package needs a decision.`;
  });

  protected readonly heading = computed(() =>
    this.retry() ? `Retry ${this.wp}?` : `Accept ${this.wp} as it stands?`
  );
  protected readonly owner = computed(() => this.context.story()?.owner ?? '');
  protected readonly budget = computed(() =>
    formatCap(this.context.story()?.budgetNanoAiu ?? 0, 1)
  );
  protected readonly remaining = computed(() =>
    formatAiu(this.context.remainingNanoAiu())
  );
  /** A retry with nothing left to spend cannot run; an accept spends nothing. */
  protected readonly noBudget = computed(
    () => this.retry() && this.context.remainingNanoAiu() === 0
  );
  protected readonly confirmLabel = computed(() =>
    this.retry()
      ? `Retry ${this.wp} · up to ${this.remaining()} AIU`
      : `Accept ${this.wp}`
  );
  protected readonly confirmText = computed(() =>
    this.retry()
      ? `I want ${this.wp} to run again, and understand it may spend AIU.`
      : `I accept ${this.wp} as it stands, and understand the pull request's gates and review still apply.`
  );

  protected async submit(): Promise<void> {
    this.reason.markAsTouched();
    if (this.reason.invalid || !this.confirmed.value || !this.allowed()) return;
    if (this.noBudget()) return;
    const decision = this.data.decision;
    const outcome = await this.context.decidePackage(
      this.wp,
      decision,
      this.reason.value.trim()
    );
    const story = this.command.settle(outcome);
    if (story === null) {
      // The voyage was read again: the person looks at it and confirms once more.
      if (outcome.kind === 'stale') this.confirmed.setValue(false);
      return;
    }
    this.toasts.show(
      decision === 'retry'
        ? `${this.wp} will run again with your rework note.`
        : `${this.wp} accepted as it stands. Its pull request's gates and review still apply.`
    );
    this.ref.close(story);
  }
}
