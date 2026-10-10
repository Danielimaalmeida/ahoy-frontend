import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, computed, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { STALE_HEADING } from '@core/commands/command-error';
import { Banner } from '@ui/banner/banner';
import { DialogService, DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import type { VoyageContext } from '../../context/voyage-context';
import { sendBackLead } from './decision-view';
import type { PlanDecision } from './plan-decision';
import { DECISION_REASON_MESSAGES } from './plan-decision';

/** What a plan dialog is opened with: the page's context and the decision it shares with the panel. */
export interface PlanDialogData {
  readonly context: VoyageContext;
  readonly decision: PlanDecision;
}

/**
 * What both decision dialogs share: the text of the panel (one control, so what was written there is in the dialog and
 * what is written here stays in the panel), the banner of the last error, and the send. The dialog stays open on any
 * error, with the text; it closes when the decision went through, or when someone decided first (the tab shows that).
 */
abstract class PlanDecisionDialog {
  protected readonly data = inject<PlanDialogData>(DIALOG_DATA);
  protected readonly decision = this.data.decision;
  protected readonly context = this.data.context;
  protected readonly messages = DECISION_REASON_MESSAGES;
  protected readonly busy = this.decision.busy;
  /** The last error, while this dialog is where the decision was started. */
  protected readonly error = computed(() =>
    this.decision.surface() === 'dialog' ? this.decision.error() : null
  );
  /** After a `stale_version` the button says "again": the story was read anew and the text is kept. */
  protected readonly stale = computed(
    () => this.error()?.heading === STALE_HEADING
  );
  protected readonly serverError = this.decision.reasonError;
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);

  protected async send(verb: 'send_back' | 'reject'): Promise<void> {
    const outcome = await this.decision.submit(verb, 'dialog');
    if (outcome.kind === 'ok' || outcome.kind === 'decided')
      this.ref.close(outcome.kind === 'ok');
  }
}

/**
 * "Send the plan back to Cartographer" (wireframe `Dialogs`): which round it starts, what should change (the text already
 * written in the panel), the model the revision runs on and what it may spend.
 */
@Component({
  selector: 'ah-send-back-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      kind="sendback"
      [heading]="'Send the ' + subject() + ' back to ' + decision.crew()"
      [confirmLabel]="stale() ? 'Send back again' : 'Send back'"
      busyLabel="Sending back…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="send('send_back')"
    >
      <span ahDialogLead>{{ lead() }}</span>
      <ah-banner
        ahDialogCost
        variant="cost"
        [heading]="'Spends from the remaining ' + remaining() + ' AIU'"
      >
        @if (model(); as m) {
          The revision runs on <b class="ah-mono">{{ m }}</b
          >&ngsp;for planning.
        }
        Billed to {{ owner() }}.</ah-banner
      >
      <ah-field
        label="What should change"
        required
        [hint]="'Recorded as ' + decision.actor() + '.'"
        [errorMessages]="messages"
        [errorText]="serverError()"
      >
        <textarea ahInput rows="4" [formControl]="decision.reason"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class SendBackDialog extends PlanDecisionDialog {
  protected readonly subject = computed(() =>
    this.decision.isPlan() ? 'plan' : 'work'
  );
  protected readonly lead = computed(() =>
    sendBackLead(this.context.revisionRound(), this.context.revisionCeiling())
  );
  protected readonly remaining = this.decision.remaining;
  protected readonly owner = this.decision.owner;
  protected readonly model = this.decision.model;
}

/**
 * "Reject the plan?" (wireframe `Dialogs`, `danger`): the voyage becomes blocked for good. The reason is
 * required; Send back is the way to ask for changes.
 */
@Component({
  selector: 'ah-reject-dialog',
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      kind="danger"
      icon="anchor"
      [heading]="decision.isPlan() ? 'Reject the plan?' : 'Reject this gate?'"
      [confirmLabel]="
        stale() ? 'Reject again' : decision.isPlan() ? 'Reject plan' : 'Reject'
      "
      busyLabel="Rejecting…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="send('reject')"
    >
      <span ahDialogLead
        >The voyage becomes blocked. No agent works on it again. Use Send back
        if the {{ decision.isPlan() ? 'plan' : 'work' }} only needs
        changes.</span
      >
      <ah-field
        label="Reason"
        required
        [hint]="'Recorded as ' + decision.actor() + '.'"
        [errorMessages]="messages"
        [errorText]="serverError()"
      >
        <textarea ahInput rows="3" [formControl]="decision.reason"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class RejectDialog extends PlanDecisionDialog {}

/** Opens the Send back and Reject dialogs over the Plan tab; each closes with whether the decision went through. */
@Injectable({ providedIn: 'root' })
export class PlanDialogs {
  private readonly dialogs = inject(DialogService);

  /** "Send the plan back to Cartographer" */
  sendBack(
    context: VoyageContext,
    decision: PlanDecision
  ): DialogRef<boolean, SendBackDialog> {
    return this.dialogs.open<boolean, PlanDialogData, SendBackDialog>(
      SendBackDialog,
      { data: { context, decision } }
    );
  }

  /** "Reject the plan?" */
  reject(
    context: VoyageContext,
    decision: PlanDecision
  ): DialogRef<boolean, RejectDialog> {
    return this.dialogs.open<boolean, PlanDialogData, RejectDialog>(
      RejectDialog,
      { data: { context, decision } }
    );
  }
}
