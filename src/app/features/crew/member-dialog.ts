import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { ApiError } from '@core/api/api-error';
import { CREW_ROLES, type CrewMember, type CrewRole } from '@core/api/types';
import { awayLabel, cleanName, ROLE_WORDS } from '@domain/crew';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { ToastService } from '@ui/toast/toast';
import { crewErrorView } from './crew-errors';
import type { CrewStore } from './crew-store';

/** What the member dialog is opened with: the page's store and the member to edit, or null to add one. */
export interface MemberData {
  readonly store: CrewStore;
  readonly member: CrewMember | null;
}

/**
 * Adds a member to the crew or edits one: the name, the turns they take (the sprint person's for devs, lunch and retro
 * for anyone), their time off and removing them. Closes with true once something was saved.
 */
@Component({
  selector: 'ah-crew-member-dialog',
  imports: [Button, DialogShell, Field, FieldControl, ReactiveFormsModule],
  styles: `
    fieldset {
      border: 0;
      margin: 12px 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    legend {
      font-weight: 600;
      margin-bottom: 4px;
    }
    label.role {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .role__text {
      display: flex;
      flex-direction: column;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .remove {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
  `,
  template: `
    <ah-dialog
      icon="compass"
      [heading]="member ? 'Edit ' + member.name : 'Add a person to the crew'"
      [confirmLabel]="member ? 'Save' : 'Add'"
      busyLabel="Saving…"
      [busy]="busy()"
      [confirmDisabled]="form.invalid"
      [error]="error()"
      (confirm)="submit()"
    >
      <form [formGroup]="form" (submit)="$event.preventDefault(); submit()">
        <ah-field label="Name" required>
          <input
            ahInput
            formControlName="name"
            autocomplete="off"
            maxlength="100"
          />
        </ah-field>
        <fieldset>
          <legend>Takes the turn of</legend>
          @for (role of roles; track role) {
            <label class="role">
              <input type="checkbox" [formControlName]="role" />
              <span class="role__text">
                <span>{{ words[role].name }}</span>
                <span class="ah-hint"
                  >{{ words[role].who }} · {{ words[role].duty }}</span
                >
              </span>
            </label>
          }
        </fieldset>
      </form>
      @if (member) {
        <fieldset>
          <legend>Time off</legend>
          @if (member.timeOff.length === 0) {
            <span class="ah-hint"
              >None recorded. Add it from the page's Add time off.</span
            >
          } @else {
            <ul>
              @for (t of member.timeOff; track t.id) {
                <li>
                  <span>{{ away(t) }}{{ t.note ? ' · ' + t.note : '' }}</span>
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    [attr.aria-label]="'Remove ' + away(t)"
                    [disabled]="busy()"
                    (click)="removeTimeOff(t.id)"
                  >
                    Remove
                  </button>
                </li>
              }
            </ul>
          }
        </fieldset>
        <div class="remove">
          @if (confirmingRemove()) {
            <p>
              Remove {{ member.name }} from the crew? Their time off and the
              changes that name them go too.
            </p>
            <button
              ahButton="danger-outline"
              size="sm"
              type="button"
              [disabled]="busy()"
              (click)="remove()"
            >
              Remove {{ member.name }}
            </button>
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="confirmingRemove.set(true)"
            >
              Remove from the crew…
            </button>
          }
        </div>
      }
    </ah-dialog>
  `,
})
export class MemberDialog {
  private readonly data = inject<MemberData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);

  protected readonly member = this.data.member;
  protected readonly roles = CREW_ROLES;
  protected readonly words = ROLE_WORDS;
  protected readonly away = awayLabel;
  protected readonly form = new FormGroup({
    name: new FormControl(this.member?.name ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    sprint_person: new FormControl(
      this.member ? this.member.roles.includes('sprint_person') : true,
      { nonNullable: true }
    ),
    lunch_host: new FormControl(
      this.member ? this.member.roles.includes('lunch_host') : true,
      { nonNullable: true }
    ),
  });
  protected readonly busy = signal(false);
  protected readonly confirmingRemove = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : crewErrorView(failure);
  });

  /** Adds or saves the member and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const value = this.form.getRawValue();
    const name = cleanName(value.name);
    const roles: CrewRole[] = CREW_ROLES.filter((role) => value[role]);
    this.busy.set(true);
    const result = this.member
      ? await this.data.store.updateMember(this.member.id, { name, roles })
      : await this.data.store.addMember({ name, roles });
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    this.toasts.show(
      this.member ? `${name} saved.` : `${name} joined the crew.`
    );
    this.ref.close(true);
  }

  /** Removes one of the member's time off; the dialog stays open on the crew as read again. */
  protected async removeTimeOff(id: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const result = await this.data.store.removeTimeOff(id);
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    this.toasts.show('Time off removed.');
    this.ref.close(true);
  }

  /** Removes the member from the crew and closes. */
  protected async remove(): Promise<void> {
    if (!this.member || this.busy()) return;
    this.busy.set(true);
    const result = await this.data.store.removeMember(this.member.id);
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    this.toasts.show(`${this.member.name} left the crew.`);
    this.ref.close(true);
  }
}
