import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { ApiError } from '@core/api/api-error';
import type { CrewChangeMode, CrewRole, CrewSprint } from '@core/api/types';
import { dayLabel, ROLE_WORDS, sprintTitle } from '@domain/crew';
import { Banner } from '@ui/banner/banner';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { crewErrorView } from './crew-errors';
import type { CrewStore } from './crew-store';

/** What the change dialog is opened with: the page's store, the sprint and the role to change. */
export interface ChangeData {
  readonly store: CrewStore;
  readonly sprint: CrewSprint;
  readonly role: CrewRole;
}

/** One person to choose. */
interface Choice {
  readonly id: string;
  readonly name: string;
  readonly note: string;
}

/** What each way of changing a sprint does, in the dialog's words. */
const MODES: readonly {
  readonly mode: CrewChangeMode;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    mode: 'swap',
    label: 'Swap: they take the next sprint',
    hint: 'Nobody loses or gains a turn.',
  },
  {
    mode: 'skip',
    label: 'Skip: they wait for the next round',
    hint: 'The order carries on alphabetically.',
  },
  {
    mode: 'restart',
    label: 'Start the order from the person chosen',
    hint: 'From this sprint on, the turns go alphabetically from them.',
  },
];

/**
 * "Who is the sprint person?" for one sprint: the members who take the role, with who is due and who is away, and what
 * happens to the person whose turn it was. Choosing the person due removes a change. Closes with true once saved.
 */
@Component({
  selector: 'ah-crew-change-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    fieldset {
      border: 0;
      margin: 0 0 14px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    legend {
      font-weight: 600;
      margin-bottom: 6px;
    }
    label.choice {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      cursor: pointer;
    }
    label.choice:has(input:checked) {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .choice__name {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
    }
  `,
  template: `
    <ah-dialog
      icon="compass"
      [heading]="words.question"
      confirmLabel="Save change"
      busyLabel="Saving…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >{{ title }} · {{ dayLabel(sprint.startsOn) }} –
        {{ dayLabel(sprint.endsOn) }}</span
      >
      @if (current?.away) {
        <ah-banner
          variant="notice"
          [heading]="current!.memberName + ' is away part of this sprint'"
        >
          @if (current!.suggestedMemberName) {
            {{ current!.suggestedMemberName }} is next in the order and is
            around.
          }
        </ah-banner>
      }
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <fieldset>
          <legend>Pick someone for this sprint</legend>
          @for (choice of choices; track choice.id) {
            <label class="choice">
              <input
                type="radio"
                formControlName="memberId"
                [value]="choice.id"
              />
              <span class="choice__name">{{ choice.name }}</span>
              <span class="ah-hint">{{ choice.note }}</span>
            </label>
          }
        </fieldset>
        @if (changing()) {
          <fieldset>
            <legend>What happens to {{ due }}'s turn?</legend>
            @for (m of modes; track m.mode) {
              <label class="choice">
                <input type="radio" formControlName="mode" [value]="m.mode" />
                <span class="choice__name">
                  <span>{{
                    m.mode === 'restart'
                      ? 'Start the order from ' + chosenName()
                      : m.label
                  }}</span>
                  <span class="ah-hint">{{ m.hint }}</span>
                </span>
              </label>
            }
          </fieldset>
          <ah-field label="Reason" optional hint="Such as “On holiday”.">
            <input
              ahInput
              formControlName="reason"
              autocomplete="off"
              maxlength="200"
            />
          </ah-field>
        }
      </form>
    </ah-dialog>
  `,
})
export class ChangeDialog {
  private readonly data = inject<ChangeData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);

  protected readonly sprint = this.data.sprint;
  protected readonly words = ROLE_WORDS[this.data.role];
  protected readonly title = sprintTitle(this.data.sprint);
  protected readonly dayLabel = dayLabel;
  protected readonly modes = MODES;
  protected readonly current =
    this.data.sprint.assignments.find((a) => a.role === this.data.role) ?? null;
  /** Who the order names for this sprint. */
  protected readonly due = this.current?.dueMemberName ?? '';
  private readonly away = new Set(
    this.current?.away ? [this.current.memberId] : []
  );
  protected readonly choices: readonly Choice[] = this.data.store
    .membersFor(this.data.role)
    .map((m) => ({
      id: m.id,
      name: m.name,
      note:
        m.id === this.current?.dueMemberId
          ? this.away.has(m.id)
            ? 'Due · away'
            : 'Due by the order'
          : m.id === this.current?.memberId
            ? 'On now'
            : m.id === this.current?.suggestedMemberId
              ? 'Next who is around'
              : '',
    }));

  protected readonly form = new FormGroup({
    memberId: new FormControl(
      this.current?.suggestedMemberId ?? this.current?.memberId ?? '',
      { nonNullable: true }
    ),
    mode: new FormControl<CrewChangeMode>(
      this.current?.change?.mode ?? 'swap',
      {
        nonNullable: true,
      }
    ),
    reason: new FormControl(this.current?.change?.reason ?? '', {
      nonNullable: true,
    }),
  });
  private readonly chosen = signal(this.form.controls.memberId.value);
  protected readonly chosenName = computed(
    () => this.choices.find((c) => c.id === this.chosen())?.name ?? ''
  );
  /** Whether the person chosen is someone else than the one due, so the turn changes hands. */
  protected readonly changing = computed(
    () => this.chosen() !== '' && this.chosen() !== this.current?.dueMemberId
  );
  protected readonly busy = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : crewErrorView(failure);
  });

  constructor() {
    this.form.controls.memberId.valueChanges.subscribe((id) =>
      this.chosen.set(id)
    );
  }

  /** Saves the change and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    const { memberId, mode, reason } = this.form.getRawValue();
    if (memberId === '' || this.busy()) return;
    this.busy.set(true);
    const trimmed = reason.trim();
    const result = await this.data.store.change(
      this.data.sprint.startsOn,
      this.data.role,
      {
        memberId,
        mode: this.changing() ? mode : 'swap',
        ...(this.changing() && trimmed !== '' ? { reason: trimmed } : {}),
      }
    );
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    const name = this.choices.find((c) => c.id === memberId)?.name ?? '';
    this.toasts.show(
      `${name} is the ${this.words.name.toLowerCase()} for ${this.title}.`
    );
    this.ref.close(true);
  }
}
