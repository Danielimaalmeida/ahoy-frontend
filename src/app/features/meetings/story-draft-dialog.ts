import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { ApiError } from '@core/api/api-error';
import type { MeetingStoryDraft, MeetingTopic } from '@core/api/types';
import { checkAiuLimit } from '@domain/aiu';
import { raisedByLabel } from '@domain/meetings';
import { chosenNoteIds, STORY_DRAFT_MAX_NANO_AIU } from '@domain/story-drafts';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { storyErrorView } from './story-errors';
import type { StoryDraftsStore } from './story-drafts-store';

/** What the Turn into a user story dialog is opened with. */
export interface StoryDraftData {
  readonly drafts: StoryDraftsStore;
  readonly topic: MeetingTopic;
  /** Which meeting, in words ("Finance sync, Thu 15 Oct"). */
  readonly meeting: string;
}

function capValidator(
  control: AbstractControl<string>
): ValidationErrors | null {
  const checked = checkAiuLimit(control.value, STORY_DRAFT_MAX_NANO_AIU);
  return 'error' in checked ? { [checked.error]: true } : null;
}

/**
 * "Turn into a user story" (board `UserStory`): which of the topic's notes the agent uses, then "Draft it for me". The
 * agent writes the story in Ahoy's fixed template; nobody types it. "Grill me" is shown but comes in a later slice. It
 * may spend AIU (not from any voyage's budget), so it says so and sends `confirmSpend: true`. Nothing goes to Jira
 * here. Closes with the queued draft.
 */
@Component({
  selector: 'ah-story-draft-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    .notes {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line);
      border-radius: 12px;
    }
    .notes label {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 8px 12px;
      border-bottom: 1px solid var(--line-soft);
    }
    .notes label:last-child {
      border-bottom: 0;
    }
    .notes input {
      margin-top: 3px;
      accent-color: var(--accent);
    }
    .note {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .picks {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .pick {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
    }
    .pick.chosen {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .pick.later {
      background: var(--surface-raised);
      color: var(--ink-soft);
    }
    .pick strong {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  `,
  template: `
    <ah-dialog
      icon="compass"
      heading="Turn into a user story"
      [confirmLabel]="confirmLabel()"
      busyLabel="Asking…"
      [busy]="busy()"
      [confirmDisabled]="noneTicked()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >From “{{ topic.title }}” · {{ meeting }} · {{ raisedBy }}</span
      >
      <ah-banner ahDialogCost variant="cost" [heading]="costHeading()"
        >Not charged to any voyage's budget. It shares the run slots with the
        voyages, so it may wait in the queue.</ah-banner
      >
      @if (topic.notes.length > 0) {
        <fieldset class="notes">
          <legend class="ah-label">First Mate will use</legend>
          @for (note of topic.notes; track note.id) {
            <label>
              <input
                type="checkbox"
                [checked]="ticked().has(note.id)"
                (change)="toggle(note.id)"
              />
              <span class="note">{{ note.text }}</span>
            </label>
          }
        </fieldset>
        @if (noneTicked()) {
          <span class="ah-hint" role="status"
            >Tick at least one note: the story is drafted from its notes.</span
          >
        } @else {
          <span class="ah-hint">Plus the topic title and who raised it.</span>
        }
      } @else {
        <span class="ah-hint"
          >This topic has no notes: First Mate drafts from its title and who
          raised it.</span
        >
      }
      <div class="picks">
        <div class="pick later">
          <strong>Grill me <span class="ah-tag">Later</span></strong>
          <span
            >First Mate asks about the gaps, one question at a time, then writes
            the story.</span
          >
          <span class="ah-hint">Comes in a later release.</span>
        </div>
        <div class="pick chosen">
          <strong>Draft it for me</strong>
          <span
            >First Mate writes the story and its acceptance criteria from the
            notes. Anything unclear becomes an open question.</span
          >
        </div>
      </div>
      <ah-field
        label="AIU limit"
        optional
        unit="AIU"
        hint="At most 50 AIU. Leave empty for the server's story draft cap."
        [errorMessages]="capMessages"
      >
        <input
          ahInput
          [formControl]="cap"
          inputmode="decimal"
          autocomplete="off"
        />
      </ah-field>
      <span class="ah-hint"
        >You get a finished user story to check. Nothing goes to Jira until you
        click Create.</span
      >
    </ah-dialog>
  `,
})
export class StoryDraftDialog {
  private readonly data = inject<StoryDraftData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<MeetingStoryDraft>>(DialogRef);
  private readonly toasts = inject(ToastService);

  protected readonly topic = this.data.topic;
  protected readonly meeting = this.data.meeting;
  protected readonly raisedBy = raisedByLabel(this.data.topic);
  protected readonly capMessages = {
    amount: 'Type an amount in AIU, such as 2 or 0.5.',
    positive: 'The limit must be above 0 AIU.',
    maximum: 'The limit may be at most 50 AIU.',
  };
  protected readonly cap = new FormControl('', {
    nonNullable: true,
    validators: [capValidator],
  });
  private readonly capText = toSignal(this.cap.valueChanges, {
    initialValue: '',
  });
  /** The limit typed, in nano-AIU; null when there is none or it is not an amount. */
  private readonly capNanoAiu = computed(() => {
    const checked = checkAiuLimit(this.capText(), STORY_DRAFT_MAX_NANO_AIU);
    return 'cap' in checked ? checked.cap : null;
  });
  /** The ids of the ticked notes; all of them to begin with. */
  readonly ticked = signal<ReadonlySet<string>>(
    new Set(this.data.topic.notes.map((n) => n.id))
  );
  protected readonly noneTicked = computed(() => this.chosen() === null);
  private readonly chosen = computed(() =>
    chosenNoteIds(
      this.topic.notes.map((n) => n.id),
      this.ticked()
    )
  );
  protected readonly costHeading = computed(() => {
    const cap = this.capNanoAiu();
    return cap === null
      ? "This may spend AIU, up to the server's story draft cap"
      : `This may spend up to ${formatCap(cap, 9)} AIU`;
  });
  protected readonly confirmLabel = computed(() => {
    const cap = this.capNanoAiu();
    return cap === null
      ? 'Draft it for me'
      : `Draft it for me · up to ${formatCap(cap, 9)} AIU`;
  });
  protected readonly busy = this.data.drafts.busy;
  private readonly failure = signal<ApiError | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : storyErrorView(failure, 'draft');
  });

  /** Ticks or unticks one note. */
  toggle(id: string): void {
    const next = new Set(this.ticked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.ticked.set(next);
  }

  /** Asks for the draft and closes with it; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.cap.markAsTouched();
    const noteIds = this.chosen();
    if (noteIds === null || this.cap.invalid || this.busy()) return;
    const result = await this.data.drafts.request(
      this.topic.id,
      noteIds,
      this.capNanoAiu()
    );
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    this.toasts.show(
      'First Mate is writing the story. It shows on the topic when it is ready.'
    );
    this.ref.close(result.value);
  }
}
