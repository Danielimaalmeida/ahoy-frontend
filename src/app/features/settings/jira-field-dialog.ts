import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import type { JiraField, JiraFixedField, JiraSettings } from '@core/api/types';
import {
  fieldTypeLabel,
  fieldValueOf,
  fieldValueText,
  isReservedJiraField,
} from '@domain/jira-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { ToastService } from '@ui/toast/toast';
import { DialogSend } from './jira-dialog-send';
import type { JiraSettingsStore } from './jira-settings-store';
import { settingsErrorView } from './settings-errors';

/** What the fixed field dialog is opened with: the page's store, Jira as set, and the field to edit or null. */
export interface JiraFieldData {
  readonly store: JiraSettingsStore;
  readonly jira: JiraSettings;
  readonly field: JiraFixedField | null;
}

/** How long the field search waits for the next key before it asks Jira. */
export const FIELD_SEARCH_DEBOUNCE_MS = 300;

/** A field id as Jira names it, typed by hand when the search does not list it. */
const FIELD_ID = /^[A-Za-z]\w{0,79}$/;

/**
 * Adds a field every story created from a meeting carries, or changes or removes one. The field is found in Jira by
 * name or id; the value is JSON as Jira's create takes it, checked as it is typed. The fields Ahoy writes itself are
 * refused before the API is asked. Closes with true once something was saved.
 */
@Component({
  selector: 'ah-jira-field-dialog',
  imports: [Banner, Button, DialogShell],
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
    }
    .results {
      list-style: none;
      margin: 4px 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 180px;
      overflow-y: auto;
    }
    .results button {
      width: 100%;
      justify-content: flex-start;
      text-align: left;
    }
    .result__id {
      margin-left: 8px;
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
      icon="tool"
      [heading]="field ? 'Edit ' + field.name : 'Add a fixed field'"
      [subtitle]="
        field ? field.id : 'Every story created from a meeting carries it'
      "
      [confirmLabel]="field ? 'Save' : 'Add field'"
      busyLabel="Saving…"
      [busy]="send.busy()"
      [confirmDisabled]="!ready()"
      [error]="send.error()"
      (confirm)="submit()"
    >
      <div class="body">
        @if (!field) {
          <div class="ah-field">
            <label class="ah-label" for="jira-field-search"
              >Field <span class="ah-req" aria-hidden="true">*</span></label
            >
            <input
              id="jira-field-search"
              class="ah-input"
              type="search"
              autocomplete="off"
              maxlength="100"
              aria-describedby="jira-field-found"
              [attr.aria-invalid]="fieldProblem() ? 'true' : null"
              [value]="query()"
              (input)="search($event)"
            />
            <span class="ah-hint" id="jira-field-found">
              @if (picked(); as p) {
                Found in Jira: <span class="ah-api">{{ p.id }}</span
                >, {{ typeLabel(p.type) }}
              } @else {
                Search by the field's name or id, such as Team or
                customfield_11200.
              }
            </span>
            @if (fieldProblem(); as problem) {
              <span class="ah-field__error">{{ problem }}</span>
            }
            @if (searchFailure(); as problem) {
              <ah-banner
                [variant]="problem.variant"
                [heading]="problem.heading"
                [tech]="problem.tech ?? ''"
              >
                {{ problem.text }}
              </ah-banner>
            }
            @if (!picked() && typedId(); as id) {
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                (click)="pick({ id: id, name: id, type: null })"
              >
                Use the id {{ id }}
              </button>
            }
            @if (!picked() && choices().length > 0) {
              <ul class="results" aria-label="Fields found in Jira">
                @for (f of choices(); track f.id) {
                  <li>
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      (click)="pick(f)"
                    >
                      {{ f.name + ' '
                      }}<span class="ah-hint result__id">{{ f.id }}</span>
                    </button>
                  </li>
                }
              </ul>
            } @else if (!picked() && searched() && !searching()) {
              <span class="ah-hint" role="status"
                >No field of Jira matches.</span
              >
            }
          </div>
        }
        <div class="ah-field">
          <label class="ah-label" for="jira-field-value"
            >Value, as Jira's create takes it
            <span class="ah-req" aria-hidden="true">*</span></label
          >
          <textarea
            id="jira-field-value"
            class="ah-input ah-input--mono"
            rows="2"
            spellcheck="false"
            aria-describedby="jira-field-value-hint"
            [attr.aria-invalid]="valueProblem() ? 'true' : null"
            [value]="valueText()"
            (input)="typeValue($event)"
            (blur)="valueTouched.set(true)"
          ></textarea>
          @if (valueProblem(); as problem) {
            <span class="ah-field__error">{{ problem }}</span>
          } @else {
            <span class="ah-hint" id="jira-field-value-hint"
              >JSON: text in double quotes ("4211"), an option as
              {{ optionExample }}, a list in brackets.</span
            >
          }
        </div>
      </div>
      @if (field) {
        <div class="remove">
          @if (confirmingRemove()) {
            <p>
              Remove {{ field.name }}? Stories created from now on no longer
              carry it.
            </p>
            <button
              ahButton="danger-outline"
              size="sm"
              type="button"
              [disabled]="send.busy()"
              (click)="remove()"
            >
              Remove the field
            </button>
          } @else {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="confirmingRemove.set(true)"
            >
              Remove this field…
            </button>
          }
        </div>
      }
    </ah-dialog>
  `,
})
export class JiraFieldDialog {
  private readonly data = inject<JiraFieldData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly send = new DialogSend(this.ref, inject(ToastService));
  protected readonly field = this.data.field;
  protected readonly typeLabel = fieldTypeLabel;
  protected readonly optionExample = '{"value": "Checkout"}';

  protected readonly query = signal('');
  private readonly found = signal<readonly JiraField[]>([]);
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  private readonly searchError = signal<ApiError | null>(null);
  protected readonly searchFailure = computed(() => {
    const error = this.searchError();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  /** The field chosen from the search, or typed as an id. */
  protected readonly picked = signal<JiraField | null>(null);
  /** The fields Jira found, to choose from. */
  protected readonly choices = this.found.asReadonly();
  /**
   * The text itself as a field id, when it reads as one and Jira did not list it (`components`, or any field while
   * the search cannot reach Jira); null otherwise.
   */
  protected readonly typedId = computed(() => {
    const typed = this.query().trim();
    if (!FIELD_ID.test(typed)) return null;
    const lower = typed.toLowerCase();
    return this.found().some((f) => f.id.toLowerCase() === lower)
      ? null
      : typed;
  });
  /** Why the chosen field cannot be fixed. */
  protected readonly fieldProblem = computed(() => {
    const p = this.picked();
    if (p === null) return null;
    if (isReservedJiraField(p.id))
      return `${p.name} can't be fixed: Ahoy writes it from the story.`;
    if (
      this.data.jira.storyFields.some(
        (f) => f.id.toLowerCase() === p.id.toLowerCase()
      )
    )
      return `${p.name} is already fixed: edit it in the list instead.`;
    return null;
  });

  protected readonly valueText = signal(
    this.field ? fieldValueText(this.field.value) : ''
  );
  protected readonly valueTouched = signal(false);
  private readonly reading = computed(() => fieldValueOf(this.valueText()));
  protected readonly valueProblem = computed(() => {
    const reading = this.reading();
    if (reading.ok) return null;
    return this.valueTouched() || this.valueText() !== ''
      ? reading.problem
      : null;
  });
  protected readonly ready = computed(
    () =>
      this.reading().ok &&
      (this.field !== null ||
        (this.picked() !== null && this.fieldProblem() === null))
  );
  protected readonly confirmingRemove = signal(false);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private searches = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Takes what was typed in the search; Jira is asked once typing pauses. */
  protected search(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.query.set(target.value);
    this.picked.set(null);
    clearTimeout(this.timer);
    // Whatever is in flight answers what was typed before: drop it.
    this.searches++;
    this.searching.set(false);
    const q = target.value.trim();
    if (q === '') {
      this.found.set([]);
      this.searched.set(false);
      return;
    }
    this.timer = setTimeout(() => void this.ask(q), FIELD_SEARCH_DEBOUNCE_MS);
  }

  /** Asks Jira for the fields that match; only the latest answer is kept. */
  private async ask(q: string): Promise<void> {
    const search = ++this.searches;
    this.searching.set(true);
    const result = await this.data.store.fields(q);
    if (search !== this.searches) return;
    this.searching.set(false);
    this.searched.set(true);
    if (result.ok) {
      this.searchError.set(null);
      this.found.set(result.value.items);
    } else {
      this.searchError.set(result.error);
      this.found.set([]);
    }
  }

  /** Chooses a field from the search. */
  protected pick(field: JiraField): void {
    this.picked.set(field);
    this.query.set(field.name);
  }

  protected typeValue(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) this.valueText.set(target.value);
  }

  /** Adds or saves the field and closes; a refusal keeps the dialog open with the reason. */
  async submit(): Promise<void> {
    this.valueTouched.set(true);
    const reading = this.reading();
    if (!this.ready() || !reading.ok || this.send.busy()) return;
    const jira = this.data.jira;
    if (this.field === null) {
      const p = this.picked();
      if (p === null) return;
      const added: JiraFixedField = {
        id: p.id,
        name: p.name,
        value: reading.value,
      };
      await this.send.run(
        () =>
          this.data.store.change({
            version: jira.version,
            storyFields: [...jira.storyFields, added],
          }),
        `${p.name} added.`
      );
      return;
    }
    const current = this.field;
    if (JSON.stringify(reading.value) === JSON.stringify(current.value)) {
      this.ref.close(false);
      return;
    }
    const storyFields = jira.storyFields.map((f) =>
      f.id === current.id ? { ...f, value: reading.value } : f
    );
    await this.send.run(
      () => this.data.store.change({ version: jira.version, storyFields }),
      `${current.name} saved.`
    );
  }

  /** Removes the field and closes. */
  protected async remove(): Promise<void> {
    const current = this.field;
    if (current === null) return;
    const jira = this.data.jira;
    await this.send.run(
      () =>
        this.data.store.change({
          version: jira.version,
          storyFields: jira.storyFields.filter((f) => f.id !== current.id),
        }),
      `${current.name} removed.`
    );
  }
}
