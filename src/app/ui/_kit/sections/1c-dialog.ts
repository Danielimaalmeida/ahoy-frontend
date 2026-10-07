import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { Component, inject, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { Banner } from "@ui/banner/banner";
import { Button } from "@ui/button/button";
import type { DialogError } from "@ui/dialog/dialog";
import { DialogService, DialogShell } from "@ui/dialog/dialog";
import { Field, FieldControl } from "@ui/field/field";

/** What the gallery's live dialog is opened with. */
interface KitStopData {
  readonly key: string;
}

/**
 * A gallery-only stop dialog on the CDK: the first confirm pretends the voyage changed meanwhile (a 409), the second
 * closes with the reason. Nothing is sent anywhere; lane 4A owns the real dialogs.
 */
@Component({
  selector: "ah-kit-stop-dialog",
  imports: [DialogShell, Field, FieldControl, ReactiveFormsModule],
  template: `
    <ah-dialog
      [heading]="'Drop anchor on ' + data.key + '?'"
      kind="danger"
      confirmLabel="Stop voyage"
      cancelLabel="Keep sailing"
      [busy]="busy()"
      [confirmDisabled]="reason.invalid"
      [error]="error()"
      (confirm)="stop()"
    >
      <span ahDialogLead
        >The voyage halts in planning. Cartographer's run <span class="ah-mono">r-02</span> is cancelled in the
        background; the 1.84 AIU it has used stays spent.</span
      >
      <ah-field label="Reason" required hint="Shown to the crew on the voyage. Recorded as alex@example.com.">
        <textarea ahInput [formControl]="reason"></textarea>
      </ah-field>
    </ah-dialog>
  `,
})
export class KitStopDialog {
  protected readonly data = inject<KitStopData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<string, KitStopDialog>>(DialogRef);
  protected readonly reason = new FormControl("", { nonNullable: true, validators: [Validators.required] });
  protected readonly busy = signal(false);
  protected readonly error = signal<DialogError | null>(null);
  private attempts = 0;

  protected stop(): void {
    this.busy.set(true);
    this.attempts += 1;
    // A pretend request, so the busy state can be seen.
    setTimeout(() => {
      this.busy.set(false);
      if (this.attempts === 1) {
        this.error.set({
          variant: "notice",
          heading: "This voyage changed since you opened it",
          text: "priya@example.com raised the budget to 35 AIU. We kept your text; check it and send again.",
        });
        return;
      }
      this.ref.close(this.reason.value);
    }, 900);
  }
}

/** Gallery: the Dialog preview inline, the other two kinds, and a live CDK dialog (Esc, focus, busy, 409). */
@Component({
  selector: "ah-kit-dialog",
  imports: [Banner, Button, DialogShell, Field, FieldControl],
  styles: `
    .kit-dialogs {
      align-items: start;
    }
  `,
  template: `
    <div class="kit-row">
      <button ahButton="danger-outline" type="button" (click)="open()">Open a live dialog: Stop</button>
      <span class="ah-hint" role="status">{{ result() }}</span>
    </div>
    <div class="kit-grid-2 kit-dialogs">
      <ah-dialog heading="Weigh anchor and resume?" icon="sail" confirmLabel="Resume · up to 10.2 AIU">
        <span ahDialogLead
          >Ahoy retries <b>planning</b> with Cartographer on <span class="ah-mono">claude-sonnet-5 · high</span>.</span
        >
        <ah-banner ahDialogCost variant="cost" heading="This may spend up to 10.2 AIU"
          >Billed to sam&#64;example.com. Anyone can stop it again.</ah-banner
        >
        <ah-field label="Reason" optional>
          <input ahInput value="Switched planning to a model the account can use." />
        </ah-field>
      </ah-dialog>
      <ah-dialog heading="Send the plan back to Cartographer" kind="sendback" confirmLabel="Send back" busy>
        <span ahDialogLead>This starts revision round <b>3 of 4</b>.</span>
        <ah-field label="What should change" required>
          <textarea ahInput>Keep the overdue badge, but don't change the default sort.</textarea>
        </ah-field>
      </ah-dialog>
      <ah-dialog
        heading="Reject the plan?"
        kind="danger"
        icon="aground"
        confirmLabel="Reject plan"
        [error]="rejectError"
      >
        <span ahDialogLead
          ><b>The voyage runs aground.</b> It becomes blocked and no crew member works on it again.</span
        >
      </ah-dialog>
    </div>
  `,
})
export class KitDialog {
  private readonly dialogs = inject(DialogService);
  protected readonly result = signal("");
  protected readonly rejectError: DialogError = {
    variant: "error",
    heading: "The plan couldn't be rejected",
    text: "Ahoy didn't answer. Nothing changed; try again.",
    tech: "503 · unavailable · req-7f3a",
  };

  protected open(): void {
    this.result.set("");
    const ref = this.dialogs.open<string, KitStopData, KitStopDialog>(KitStopDialog, { data: { key: "PROJ-140" } });
    ref.closed.subscribe((reason) =>
      this.result.set(reason === undefined ? "Closed without stopping." : `Stopped: “${reason}”`),
    );
  }
}
