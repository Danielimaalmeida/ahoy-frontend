import {
  Component,
  booleanAttribute,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { FormControl } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { CREW } from '@domain/models';
import type { ModelSlot, ReasoningEffort } from '@domain/types';
import { Button } from '@ui/button/button';
import { Icon } from '@ui/icon/icon';
import { Source } from '@ui/tags/source';

/** The reasoning efforts the select offers after "Default", in order. */
export const EFFORTS: readonly ReasoningEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/** The effort select's value: an effort, or `""` for the default (`null` in the API). */
export type EffortChoice = ReasoningEffort | '';

/** A configured model option; the catalogue does not prove account access. */
export interface ModelChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly reasoningEfforts: readonly ReasoningEffort[] | null;
}

/** The two controls of one slot. A blank model and a `""` effort mean the default. */
export interface ModelChoiceControls {
  readonly model: FormControl<string>;
  readonly effort: FormControl<EffortChoice>;
}

/** What one row shows besides its controls. */
export interface ModelChoiceRowSpec {
  readonly slot: ModelSlot;
  /** The model the slot falls back to, shown in the default option or text-input placeholder. */
  readonly defaultModel?: string;
  /** The effort the slot falls back to, when known: "Default (medium)". */
  readonly defaultEffort?: ReasoningEffort;
  /** Where the current value comes from, in the crew's words (`MODEL_SOURCE_LABELS`). */
  readonly source?: string;
  /** The value was chosen for this voyage: the tag is `ah-source--chosen` and the row can be reset. */
  readonly chosen?: boolean;
  /** This row's own error. */
  readonly error?: string;
}

/** The API phase each slot runs in, as the ModelChoice preview labels the rows. */
const SLOT_PHASES: Readonly<Record<ModelSlot, string>> = {
  intake: 'intake',
  planning: 'planning',
  implementation: 'implementation',
  review: 'pr_review',
};

/** The slot's name in accessible labels ("Review model", "Reset review to default"). */
const SLOT_NAMES: Readonly<Record<ModelSlot, string>> = {
  intake: 'Intake',
  planning: 'Planning',
  implementation: 'Implementation',
  review: 'Review',
};

let nextRowId = 0;

/**
 * One slot of the Models table (`ah-model`): phase and crew, a catalogue select when supplied (otherwise a text input),
 * the reasoning effort, the source tag and a reset button. `error` shows under the row,
 * and the model input points to it. Reset clears both controls and emits `null` (`restoreDefault`): back to the default.
 */
@Component({
  selector: 'ah-model-choice-row',
  imports: [Button, Icon, ReactiveFormsModule, Source],
  // The host adds no box, so the table's column sees the row and its error line. The source cell is laid out as in
  // the ModelChoice preview (inline there).
  styles: `
    :host {
      display: contents;
    }
    .ah-model__source {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .ah-model__choice {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }
    /* The bundle's four fixed columns are wider than a phone; there the phase and the source take their own lines. */
    @media (max-width: 600px) {
      .ah-model {
        grid-template-columns: minmax(0, 1fr) 110px;
      }
      .ah-model__phase,
      .ah-model__source {
        grid-column: 1 / -1;
      }
    }
  `,
  template: `
    <div class="ah-model">
      <span class="ah-model__phase"
        >{{ phase() }}<span class="ah-model__crew">{{ crew() }}</span></span
      >
      @if (models(); as options) {
        <div class="ah-model__choice">
          <select
            class="ah-input"
            [value]="modelSelection()"
            [attr.aria-label]="name() + ' model'"
            [attr.aria-invalid]="error() ? 'true' : null"
            [attr.aria-describedby]="error() ? errorId : null"
            (change)="onModelSelect($event)"
          >
            <option value="">
              {{ defaultModel() ? 'Default · ' + defaultModel() : 'Default' }}
            </option>
            @for (option of options; track option.id) {
              <option [value]="option.id">
                {{ option.label }} ({{ option.id }})
              </option>
            }
            <option value="__custom__">Other model id…</option>
          </select>
          @if (modelSelection() === '__custom__') {
            <input
              class="ah-input ah-input--mono"
              [formControl]="controls().model"
              [attr.aria-label]="name() + ' model id'"
              [attr.aria-invalid]="error() ? 'true' : null"
              [attr.aria-describedby]="error() ? errorId : null"
              placeholder="Copilot model id"
              autocomplete="off"
              spellcheck="false"
            />
          }
        </div>
      } @else {
        <input
          class="ah-input ah-input--mono"
          [formControl]="controls().model"
          [placeholder]="
            defaultModel() ? 'Default: ' + defaultModel() : 'Default'
          "
          [attr.aria-label]="name() + ' model'"
          [attr.aria-invalid]="error() ? 'true' : null"
          [attr.aria-describedby]="error() ? errorId : null"
          autocomplete="off"
          spellcheck="false"
        />
      }
      <select
        class="ah-input"
        [formControl]="controls().effort"
        [attr.aria-label]="name() + ' effort'"
      >
        <option value="">
          {{
            defaultEffort() ? 'Default (' + defaultEffort() + ')' : 'Default'
          }}
        </option>
        @for (effort of availableEfforts(); track effort) {
          <option [value]="effort">{{ effort }}</option>
        }
      </select>
      <span class="ah-model__source">
        @if (source()) {
          <ah-source [chosen]="chosen()">{{ source() }}</ah-source>
        }
        @if (resettable() ?? chosen()) {
          <button
            type="button"
            ahButton="ghost"
            size="sm"
            [attr.aria-label]="'Reset ' + name().toLowerCase() + ' to default'"
            title="Reset to default"
            (click)="onReset()"
          >
            <ah-icon name="reset" />
          </button>
        }
      </span>
    </div>
    @if (error()) {
      <span class="ah-field__error" [id]="errorId">{{ error() }}</span>
    }
  `,
})
export class ModelChoiceRow {
  /** The slot this row edits. */
  readonly slot = input.required<ModelSlot>();
  /** The slot's model and effort controls. */
  readonly controls = input.required<ModelChoiceControls>();
  /** Supplying a catalogue enables model selection, with an explicit custom-id escape. */
  readonly models = input<readonly ModelChoiceOption[] | undefined>();
  /** The default model, shown in the default option or placeholder. */
  readonly defaultModel = input<string | undefined>(undefined);
  /** The default effort, shown in the "Default" option. */
  readonly defaultEffort = input<ReasoningEffort | undefined>(undefined);
  /** Where the value comes from, in the crew's words. */
  readonly source = input<string | undefined>(undefined);
  /** The value was chosen for this voyage. */
  readonly chosen = input(false, { transform: booleanAttribute });
  /** Show the reset button; by default only for a chosen value. */
  readonly resettable = input<boolean | undefined>(undefined);
  /** The row's error, shown under it. */
  readonly error = input<string | undefined>('');

  /** Reset was pressed: the controls are cleared and the slot goes back to its default (`null` in the API). */
  readonly restoreDefault = output<null>();

  protected readonly efforts = EFFORTS;
  private readonly customModel = signal(false);
  protected readonly errorId = `ah-model-${nextRowId++}-error`;
  protected readonly phase = computed(() => SLOT_PHASES[this.slot()]);
  protected readonly crew = computed(() => CREW[this.slot()]);
  protected readonly name = computed(() => SLOT_NAMES[this.slot()]);

  protected modelSelection(): string {
    const value = this.controls().model.value;
    return this.customModel() ||
      (value !== '' && !this.models()?.some((model) => model.id === value))
      ? '__custom__'
      : value;
  }

  protected availableEfforts(): readonly ReasoningEffort[] {
    const value = this.controls().model.value;
    const model = this.customModel() ? value : value || this.defaultModel();
    return (
      this.models()?.find((option) => option.id === model)?.reasoningEfforts ??
      this.efforts
    );
  }

  protected onModelSelect(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const custom = target.value === '__custom__';
    this.customModel.set(custom);
    const { model, effort } = this.controls();
    model.setValue(custom ? '' : target.value);
    model.markAsDirty();
    if (
      effort.value !== '' &&
      !this.availableEfforts().includes(effort.value)
    ) {
      effort.setValue('');
      effort.markAsDirty();
    }
  }

  protected onReset(): void {
    this.customModel.set(false);
    const { model, effort } = this.controls();
    model.setValue('');
    effort.setValue('');
    model.markAsDirty();
    effort.markAsDirty();
    this.restoreDefault.emit(null);
  }
}

/**
 * The Models table: one `ah-model-choice-row` per spec that has controls, in the given order.
 * "A change applies from that phase's next run" belongs next to the page's save button.
 *
 * ```html
 * <ah-model-choice-table [rows]="rows" [controls]="form.controls" (restoreDefault)="onReset($event)" />
 * ```
 */
@Component({
  selector: 'ah-model-choice-table',
  imports: [ModelChoiceRow],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }
  `,
  template: `
    @for (row of shown(); track row.spec.slot) {
      <ah-model-choice-row
        [slot]="row.spec.slot"
        [controls]="row.controls"
        [models]="models()"
        [defaultModel]="row.spec.defaultModel"
        [defaultEffort]="row.spec.defaultEffort"
        [source]="row.spec.source"
        [chosen]="row.spec.chosen ?? false"
        [error]="errorFor(row.spec)"
        (restoreDefault)="restoreDefault.emit(row.spec.slot)"
      />
    }
  `,
})
export class ModelChoiceTable {
  /** Optional catalogue; pages without one retain the existing text inputs. */
  readonly models = input<readonly ModelChoiceOption[] | undefined>();
  /** The rows, in order. */
  readonly rows = input.required<readonly ModelChoiceRowSpec[]>();
  /** The controls of each slot; a spec without controls is not shown. */
  readonly controls =
    input.required<Readonly<Partial<Record<ModelSlot, ModelChoiceControls>>>>();

  /** A slot was reset to its default (send `null` for it). */
  readonly restoreDefault = output<ModelSlot>();

  protected readonly shown = computed(() =>
    this.rows().flatMap((spec) => {
      const controls = this.controls()[spec.slot];
      return controls === undefined ? [] : [{ spec, controls }];
    })
  );

  protected errorFor(spec: ModelChoiceRowSpec): string {
    return spec.error ?? '';
  }
}
