import { Component, booleanAttribute, computed, effect, input, output, signal } from "@angular/core";
import type { FormControl } from "@angular/forms";
import { ReactiveFormsModule } from "@angular/forms";
import { CREW, reviewersConflict } from "@domain/models";
import type { ModelSlot, ReasoningEffort, SlotModel } from "@domain/types";
import { Button } from "@ui/button/button";
import { Icon } from "@ui/icon/icon";
import { Source } from "@ui/tags/source";

/** The reasoning efforts the select offers after "Default", in order. */
export const EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];

/** The effort select's value: an effort, or `""` for the default (`null` in the API). */
export type EffortChoice = ReasoningEffort | "";

/** The two controls of one slot. A blank model and a `""` effort mean the default. */
export interface ModelChoiceControls {
  readonly model: FormControl<string>;
  readonly effort: FormControl<EffortChoice>;
}

/** What one row shows besides its controls. */
export interface ModelChoiceRowSpec {
  readonly slot: ModelSlot;
  /** The model the slot falls back to, when known: the input's placeholder ("Default: gpt-5.6-terra"). */
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
  intake: "intake",
  planning: "planning",
  implementation: "implementation",
  "review-design": "pr_review",
  "review-defect": "pr_review",
};

/** The slot's name in accessible labels ("Design reviewer model", "Reset design reviewer to default"). */
const SLOT_NAMES: Readonly<Record<ModelSlot, string>> = {
  intake: "Intake",
  planning: "Planning",
  implementation: "Implementation",
  "review-design": "Design reviewer",
  "review-defect": "Defect reviewer",
};

/** The error both Lookout rows show when they would run on the same model. */
export function lookoutsConflictMessage(model: string): string {
  return `The two Lookouts must use different models: both would run on ${model}.`;
}

/** The model a slot would run on: the typed one, else its default; "" when neither is known. */
function effectiveModel(typed: string, fallback: string | undefined): string {
  const model = typed.trim();
  return model !== "" ? model : (fallback?.trim() ?? "");
}

let nextRowId = 0;

/**
 * One slot of the Models table (`ah-model`): phase and crew, the model (free-text mono input, placeholder from the
 * default), the reasoning effort (Default, low … max), the source tag and a reset button. `error` shows under the row,
 * and the model input points to it. Reset clears both controls and emits `null` (`restoreDefault`): back to the default.
 */
@Component({
  selector: "ah-model-choice-row",
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
      <input
        class="ah-input ah-input--mono"
        [formControl]="controls().model"
        [placeholder]="defaultModel() ? 'Default: ' + defaultModel() : 'Default'"
        [attr.aria-label]="name() + ' model'"
        [attr.aria-invalid]="error() ? 'true' : null"
        [attr.aria-describedby]="error() ? errorId : null"
        autocomplete="off"
        spellcheck="false"
      />
      <select class="ah-input" [formControl]="controls().effort" [attr.aria-label]="name() + ' effort'">
        <option value="">{{ defaultEffort() ? "Default (" + defaultEffort() + ")" : "Default" }}</option>
        @for (effort of efforts; track effort) {
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
  /** The default model, shown as the placeholder. */
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
  readonly error = input<string | undefined>("");

  /** Reset was pressed: the controls are cleared and the slot goes back to its default (`null` in the API). */
  readonly restoreDefault = output<null>();

  protected readonly efforts = EFFORTS;
  protected readonly errorId = `ah-model-${nextRowId++}-error`;
  protected readonly phase = computed(() => SLOT_PHASES[this.slot()]);
  protected readonly crew = computed(() => CREW[this.slot()]);
  protected readonly name = computed(() => SLOT_NAMES[this.slot()]);

  protected onReset(): void {
    const { model, effort } = this.controls();
    model.setValue("");
    effort.setValue("");
    model.markAsDirty();
    effort.markAsDirty();
    this.restoreDefault.emit(null);
  }
}

/**
 * The Models table: one `ah-model-choice-row` per spec that has controls, in the given order. When both Lookouts would
 * run on the same model (typed, or the default when blank), the error shows under **both** reviewer rows.
 * "A change applies from that phase's next run" belongs next to the page's save button.
 *
 * ```html
 * <ah-model-choice-table [rows]="rows" [controls]="form.controls" (restoreDefault)="onReset($event)" />
 * ```
 */
@Component({
  selector: "ah-model-choice-table",
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
  /** The rows, in order. */
  readonly rows = input.required<readonly ModelChoiceRowSpec[]>();
  /** The controls of each slot; a spec without controls is not shown. */
  readonly controls = input.required<Readonly<Partial<Record<ModelSlot, ModelChoiceControls>>>>();

  /** A slot was reset to its default (send `null` for it). */
  readonly restoreDefault = output<ModelSlot>();

  protected readonly shown = computed(() =>
    this.rows().flatMap((spec) => {
      const controls = this.controls()[spec.slot];
      return controls === undefined ? [] : [{ spec, controls }];
    }),
  );

  /** The typed model of each slot, kept current from the controls. */
  private readonly typed = signal<Readonly<Partial<Record<ModelSlot, string>>>>({});

  /** The model both Lookouts would run on (typed, or the default when blank), or `null`. */
  readonly conflict = computed(() => {
    const specs = new Map(this.rows().map((s) => [s.slot, s]));
    const typed = this.typed();
    const lookout = (slot: "review-design" | "review-defect"): SlotModel => ({
      model: effectiveModel(typed[slot] ?? "", specs.get(slot)?.defaultModel),
      reasoningEffort: null,
      modelSource: "configuration",
      effortSource: "model_default",
    });
    return reviewersConflict({
      slots: { "review-design": lookout("review-design"), "review-defect": lookout("review-defect") },
    });
  });

  constructor() {
    effect((onCleanup) => {
      const entries = Object.entries(this.controls()).flatMap(([slot, c]) => (c === undefined ? [] : [{ slot, c }]));
      const read = (): void => this.typed.set(Object.fromEntries(entries.map(({ slot, c }) => [slot, c.model.value])));
      read();
      const subs = entries.map(({ c }) => c.model.valueChanges.subscribe(read));
      onCleanup(() => subs.forEach((s) => s.unsubscribe()));
    });
  }

  protected errorFor(spec: ModelChoiceRowSpec): string {
    const conflict = this.conflict();
    const isLookout = spec.slot === "review-design" || spec.slot === "review-defect";
    if (conflict !== null && isLookout) return lookoutsConflictMessage(conflict);
    return spec.error ?? "";
  }
}
