import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  STORY_FIELD_KINDS,
  STORY_LIST_MAX,
  STORY_TEXT_MAX,
  storyLinesProblem,
  type StoryFieldKey,
} from '@domain/story-drafts';
import { Button } from '@ui/button/button';
import { Field, FieldControl } from '@ui/field/field';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';

/** One field a section edits: which, its label, its text now, whether it is required and its longest length. */
export interface InlineField {
  readonly key: StoryFieldKey;
  readonly label: string;
  readonly text: string;
  readonly required: boolean;
  readonly max: number;
}

/** A list typed one item per line: at least `min` items, at most `STORY_LIST_MAX`, each within the API's length. */
function linesValidator(
  min: number
): (control: AbstractControl<string>) => ValidationErrors | null {
  return (control) => {
    const problem = storyLinesProblem(control.value, min);
    return problem === null ? null : { lines: problem };
  };
}

/** The validators of a field, by its kind. */
function validatorsOf(field: InlineField) {
  if (STORY_FIELD_KINDS[field.key] === 'lines')
    return [linesValidator(field.required ? 1 : 0)];
  const max = maxTrimmed(field.max);
  return field.required ? [requiredText, max] : [max];
}

/**
 * One section of a drafted story ("Acceptance criteria"), edited where it stands. Pointing at it (or tabbing to it)
 * shows "Edit"; on a touch screen "Edit" always shows. Editing turns only this section into its fields, with Save and
 * Cancel next to them: Ctrl+Enter (or Enter in a one-line field) saves and Esc cancels without closing the dialog. The
 * check owns which section is being edited and saves the story; this section only gathers the typed text.
 */
@Component({
  selector: 'ah-story-inline-section',
  imports: [Button, Field, FieldControl, ReactiveFormsModule],
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    section {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px 8px;
      border-radius: var(--radius-md);
    }
    .editable:hover,
    .editable:focus-within {
      background: var(--surface-hover);
    }
    .editing {
      background: var(--surface-sunken);
      box-shadow: inset 0 0 0 1px var(--accent);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 18px;
    }
    .label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink-soft);
    }
    .edit {
      position: absolute;
      top: 2px;
      right: 4px;
      opacity: 0;
      transition: opacity 120ms ease-out;
    }
    .editable:hover .edit,
    .editable:focus-within .edit {
      opacity: 1;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    textarea {
      resize: vertical;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .acts {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }
    @media (hover: none) {
      .edit {
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .edit {
        transition: none;
      }
    }
  `,
  template: `
    <section
      [class.editable]="editable() && !editing()"
      [class.editing]="editing()"
    >
      @if (form(); as f) {
        <form
          [formGroup]="f"
          [attr.aria-label]="'Edit ' + heading()"
          (submit)="$event.preventDefault(); submit()"
          (keydown)="key($event)"
        >
          @if (fields().length > 1) {
            <span class="label">{{ heading() }}</span>
          }
          @for (field of fields(); track field.key) {
            <ah-field
              [label]="fields().length > 1 ? field.label : heading()"
              [required]="field.required"
              [optional]="!field.required"
              [hint]="hintOf(field)"
              [errorMessages]="messagesOf(field)"
            >
              @if (field.key === 'title' || field.key === 'role') {
                <input
                  ahInput
                  autocomplete="off"
                  [formControlName]="field.key"
                />
              } @else {
                <textarea
                  ahInput
                  [rows]="rowsOf(field)"
                  [formControlName]="field.key"
                ></textarea>
              }
            </ah-field>
          }
          <div class="row">
            <span class="ah-hint">Ctrl+Enter saves · Esc cancels</span>
            <span class="acts">
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                [attr.aria-disabled]="busy() ? 'true' : null"
                (click)="cancel()"
              >
                Cancel
              </button>
              <button
                ahButton="primary"
                size="sm"
                type="submit"
                [attr.aria-disabled]="busy() ? 'true' : null"
              >
                {{ busy() ? 'Saving…' : 'Save' }}
              </button>
            </span>
          </div>
        </form>
      } @else {
        <div class="head">
          <span class="label">{{ heading() }}</span>
          @if (editable()) {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              class="edit"
              [attr.aria-label]="'Edit ' + heading().toLowerCase()"
              (click)="start.emit()"
            >
              Edit
            </button>
          }
        </div>
      }
      <div [hidden]="editing()"><ng-content /></div>
    </section>
  `,
})
export class StoryInlineSection {
  /** The section's name, shown as its label ("Acceptance criteria"). */
  readonly heading = input.required<string>();
  /** The fields it edits: one, or the three of the "User story" sentence. */
  readonly fields = input.required<readonly InlineField[]>();
  /** Whether "Edit" is offered: the draft is ready and no other section is being edited. */
  readonly editable = input(false);
  /** Whether this section is the one being edited. */
  readonly editing = input(false);
  /** Whether a save is in flight. */
  readonly busy = input(false);

  /** "Edit" was clicked. */
  readonly start = output();
  /** Cancel or Esc: the section goes back to its text, unchanged. */
  readonly cancelled = output();
  /** Save: the typed text of each field, by key, untrimmed. */
  readonly save = output<Partial<Record<StoryFieldKey, string>>>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The fields' form while editing, made from their text when editing starts; later changes do not reset it. */
  protected readonly form = computed(() => {
    if (!this.editing()) return null;
    const fields = untracked(() => this.fields());
    const controls: Record<string, FormControl<string>> = {};
    for (const field of fields)
      controls[field.key] = new FormControl(field.text, {
        nonNullable: true,
        validators: validatorsOf(field),
      });
    return new FormGroup(controls);
  });

  constructor() {
    // Focus follows the edit: into the first field when it starts, back to "Edit" when it ends.
    let was = false;
    effect(() => {
      const editing = this.editing();
      if (editing === was) return;
      was = editing;
      afterNextRender(
        () =>
          this.host.nativeElement
            .querySelector<HTMLElement>(
              editing ? 'input, textarea' : 'button.edit'
            )
            ?.focus(),
        { injector: this.injector }
      );
    });
  }

  protected rowsOf(field: InlineField): number {
    const kind = STORY_FIELD_KINDS[field.key];
    if (kind === 'text') return 2;
    const lines = field.text.split('\n').length;
    return Math.min(8, Math.max(3, lines + 1));
  }

  protected hintOf(field: InlineField): string {
    return STORY_FIELD_KINDS[field.key] === 'lines'
      ? `One per line, at most ${STORY_LIST_MAX}, each up to ${STORY_TEXT_MAX} characters.`
      : '';
  }

  /** What each error says, with the field's own limit. */
  protected messagesOf(field: InlineField): Readonly<Record<string, string>> {
    return {
      required: 'This is required.',
      maxlength: `Keep this to ${field.max} characters.`,
    };
  }

  /** Esc cancels without closing the dialog; Ctrl+Enter (⌘+Enter) saves. */
  protected key(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submit();
    }
  }

  /** Goes back to the text, unless a save is in flight: if it fails, the typed text is still there. */
  protected cancel(): void {
    if (!this.busy()) this.cancelled.emit();
  }

  /** Sends the typed text when every field is valid; otherwise moves focus to the first field to fix. */
  protected submit(): void {
    const form = this.form();
    if (form === null || this.busy()) return;
    form.markAllAsTouched();
    if (form.invalid) {
      afterNextRender(
        () =>
          this.host.nativeElement
            .querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus(),
        { injector: this.injector }
      );
      return;
    }
    if (!form.dirty) {
      this.cancelled.emit();
      return;
    }
    this.save.emit(form.getRawValue());
  }
}
