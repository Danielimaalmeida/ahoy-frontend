import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  FormRecord,
  ReactiveFormsModule,
} from '@angular/forms';
import { firstValueFrom, map, merge } from 'rxjs';
import { isStale, type ApiError } from '@core/api/api-error';
import {
  REASONING_EFFORTS,
  type CatalogModel,
  type PhaseChange,
  type PhaseSettingsChange,
  type PhaseSettingsPage as PhasesPage,
  type PhaseSettingsRow,
  type ReasoningEffort,
} from '@core/api/types';
import { MODEL_ID, MODEL_ID_MAX } from '@core/api/guards';
import {
  aiuLabel,
  aiuNumber,
  capsRaised,
  isStoryPhase,
  MAX_CI_WAIT_MINUTES,
  MAX_TIMEOUT_MINUTES,
  MIN_TIMEOUT_MINUTES,
  minutesLabel,
  phaseName,
  readBudget,
  readMinutes,
  type CapChange,
  type PhaseField,
} from '@domain/phase-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { FieldControl } from '@ui/field/field';
import { Panel, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Table } from '@ui/table/table';
import { ToastService } from '@ui/toast/toast';
import { PhaseSettingsStore } from './phase-settings-store';
import { PhasesSpendDialog, type PhasesSpendData } from './phases-spend-dialog';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/** One phase's fields as typed; '' is the deployment's value. */
interface PhaseText {
  readonly model: string;
  readonly reasoningEffort: string;
  readonly budget: string;
  readonly timeout: string;
  readonly ciWait: string;
}

/** One catalogue model as typed: its id, label and efforts ("low, high"; empty: the catalogue does not say). */
interface ModelText {
  readonly id: string;
  readonly label: string;
  readonly efforts: string;
}

type PhaseGroup = FormGroup<{
  [K in keyof PhaseText]: FormControl<string>;
}>;
type ModelGroup = FormGroup<{ [K in keyof ModelText]: FormControl<string> }>;

/** The deployment's value: an empty control. */
const DEPLOYMENT = '';

/** What a catalogue model's efforts read as when it takes none (`[]`); empty is any effort (`null`). */
const NO_EFFORT = 'none';

/** A phase's change while it is built: the API's shape, field by field. */
type MutablePhaseChange = {
  -readonly [K in keyof PhaseChange]: PhaseChange[K];
};

/** One phase as typed, read once. */
interface RowRead {
  readonly phase: string;
  /** Why a changed field is refused, by field of the form. */
  readonly problems: ReadonlyMap<keyof PhaseText, string>;
  /** Its cap before and after, when the admin changed it. */
  readonly cap?: CapChange;
  /** What changed, as the API takes it; absent when nothing did. */
  readonly change?: PhaseChange;
}

/** Whether a typed word is an effort a run can ask for. */
function isEffort(word: string): word is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(word);
}

/** A model's efforts in words: "low, high", "none" for no effort, empty for any. */
function effortsText(efforts: CatalogModel['reasoningEfforts']): string {
  if (efforts === null) return '';
  return efforts.length === 0 ? NO_EFFORT : efforts.join(', ');
}

/** A phase's saved fields as the form shows them. */
function phaseTextOf(row: PhaseSettingsRow): PhaseText {
  const { saved } = row;
  return {
    model: saved.model ?? DEPLOYMENT,
    reasoningEffort: saved.reasoningEffort ?? DEPLOYMENT,
    budget:
      saved.budgetNanoAiu === null
        ? DEPLOYMENT
        : aiuNumber(saved.budgetNanoAiu),
    timeout:
      saved.timeoutSeconds === null
        ? DEPLOYMENT
        : String(Math.round(saved.timeoutSeconds / 60)),
    ciWait:
      saved.ciWaitMinutes === null ? DEPLOYMENT : String(saved.ciWaitMinutes),
  };
}

/** A catalogue model as the form shows it. */
function modelTextOf(model: CatalogModel): ModelText {
  return {
    id: model.id,
    label: model.label === model.id ? '' : model.label,
    efforts: effortsText(model.reasoningEfforts),
  };
}

function phaseGroup(text: PhaseText): PhaseGroup {
  const control = (value: string) =>
    new FormControl(value, { nonNullable: true });
  return new FormGroup({
    model: control(text.model),
    reasoningEffort: control(text.reasoningEffort),
    budget: control(text.budget),
    timeout: control(text.timeout),
    ciWait: control(text.ciWait),
  });
}

function modelGroup(text: ModelText): ModelGroup {
  const control = (value: string) =>
    new FormControl(value, { nonNullable: true });
  return new FormGroup({
    id: control(text.id),
    label: control(text.label),
    efforts: control(text.efforts),
  });
}

/** A typed catalogue as the API takes it, or why it is refused. */
function catalogOf(
  typed: readonly ModelText[]
):
  | { readonly models: PhaseSettingsChange['models'] }
  | { readonly problem: string } {
  if (typed.length === 0) return { problem: 'Keep at least one model.' };
  const seen = new Set<string>();
  const models = [];
  for (const [i, m] of typed.entries()) {
    const id = m.id.trim();
    if (!MODEL_ID.test(id) || id.length > MODEL_ID_MAX)
      return {
        problem: `Model ${i + 1}: give a model id, such as claude-sonnet-5.`,
      };
    if (seen.has(id.toLowerCase()))
      return { problem: `${id} is listed twice.` };
    seen.add(id.toLowerCase());
    const label = m.label.trim();
    if (label.length > 80)
      return { problem: `${id}: keep the label to 80 characters.` };
    const words = m.efforts
      .split(/[\s,]+/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    const none = words.length === 1 && words[0] === NO_EFFORT;
    const efforts: ReasoningEffort[] = [];
    for (const w of none ? [] : words) {
      if (!isEffort(w))
        return {
          problem: `${id}: ${w} is not an effort (${REASONING_EFFORTS.join(', ')}, or ${NO_EFFORT}).`,
        };
      if (!efforts.includes(w)) efforts.push(w);
    }
    models.push({
      id,
      ...(label !== '' ? { label } : {}),
      ...(words.length > 0 ? { reasoningEfforts: efforts } : {}),
    });
  }
  return { models };
}

/**
 * Team settings › Phases: each phase's default model and effort, the AIU cap of one of its runs, its timeout and how
 * long implementation waits for CI, and the models people may choose. A field the deployment's `AHOY_PHASE_CONFIG` sets
 * is shown, not changed. Raising a cap lets every run of that phase spend more AIU, so saving that asks first.
 */
@Component({
  selector: 'ah-phase-settings-page',
  imports: [
    Banner,
    Button,
    FieldControl,
    Panel,
    PanelFoot,
    PanelHead,
    ReactiveFormsModule,
    SettingsHistory,
    Skeleton,
    Table,
  ],
  providers: [PhaseSettingsStore],
  styles: [
    SECTION_STYLES,
    `
      .phases,
      .models {
        overflow-x: auto;
      }
      .phase {
        font-weight: 600;
        white-space: nowrap;
        text-transform: none;
        letter-spacing: normal;
      }
      .kind {
        display: block;
        font-weight: 400;
      }
      select {
        min-width: 100px;
        max-width: 120px;
      }
      select[formControlName='model'] {
        min-width: 138px;
        max-width: 170px;
      }
      .cell > select + .ah-hint,
      .cell > input + .ah-hint {
        white-space: nowrap;
      }
      input {
        min-width: 96px;
        max-width: 200px;
      }
      .number {
        width: 88px;
        min-width: 88px;
      }
      .phases td,
      .phases th[scope='row'] {
        vertical-align: top;
      }
      .cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .err {
        color: var(--danger-text);
        font-size: 12px;
      }
      .warnings {
        border-top: 1px solid var(--line-soft);
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Phases</h2>
      <span class="ah-muted"
        >Each phase's default model and effort, the AIU cap of one run, its
        timeout, and the models people may choose.</span
      >
    </div>

    @if (failure(); as problem) {
      <ah-banner
        [variant]="problem.variant"
        [heading]="problem.heading"
        [tech]="problem.tech ?? ''"
      >
        {{ problem.text }}
        <button ahButton size="sm" type="button" (click)="store.load()">
          Try again
        </button>
      </ah-banner>
    }

    @if (store.loading() && !store.page()) {
      <div
        class="ah-panel loading"
        role="status"
        aria-label="Loading the phases' settings"
      >
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
        <ah-skeleton width="55%" />
      </div>
    } @else if (store.page(); as page) {
      @if (!page.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can read the team settings. Ask an admin to add you to
          AHOY_ADMIN_QNUMBERS.
        </ah-banner>
      } @else if (page.maxBudgetNanoAiu === null) {
        <ah-banner variant="info" heading="Caps can only be lowered">
          The deployment does not set AHOY_MAX_PHASE_BUDGET_AIU, so a phase's
          AIU cap can go down from the deployment's, not up.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head heading="Phases" [subtitle]="capsLine(page)">
              @if (phasesDirty()) {
                <span ahPanelActions class="ah-tag ah-tag--outline"
                  >Unsaved changes</span
                >
              }
            </ah-panel-head>
            <div class="phases">
              <table ahTable aria-label="Phases">
                <thead>
                  <tr>
                    <th scope="col">Phase</th>
                    <th scope="col">Model</th>
                    <th scope="col">Effort</th>
                    <th scope="col">AIU cap per run</th>
                    <th scope="col">Timeout (min)</th>
                    <th scope="col">Wait for CI (min)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of page.phases; track row.phase) {
                    <tr [formGroup]="phaseForm(row.phase)">
                      <th scope="row" class="phase">
                        {{ name(row.phase)
                        }}<span class="ah-cell-sub kind">{{
                          kind(row.phase)
                        }}</span>
                      </th>
                      <td>
                        @if (editable(page, row, 'model')) {
                          <span class="cell">
                            <select
                              ahInput
                              mono
                              formControlName="model"
                              [attr.aria-label]="name(row.phase) + ' model'"
                            >
                              <option [value]="deployment">Default</option>
                              @for (m of modelChoices(page, row); track m) {
                                <option [value]="m">{{ m }}</option>
                              }
                            </select>
                            @if (errors().get(row.phase + '.model'); as e) {
                              <span class="err">{{ e }}</span>
                            } @else {
                              <span class="ah-hint">{{
                                deploymentModel(row)
                              }}</span>
                            }
                          </span>
                        } @else {
                          <span class="cell">
                            <span class="ah-mono">{{
                              row.runsOn.model ?? 'agent profile'
                            }}</span>
                            @if (isPinned(row, 'model')) {
                              <span class="ah-hint">Set by the deployment</span>
                            }
                          </span>
                        }
                      </td>
                      <td>
                        @if (editable(page, row, 'reasoningEffort')) {
                          <span class="cell">
                            <select
                              ahInput
                              formControlName="reasoningEffort"
                              [attr.aria-label]="name(row.phase) + ' effort'"
                            >
                              <option [value]="deployment">Default</option>
                              @for (e of effortChoices(page, row); track e) {
                                <option [value]="e">{{ e }}</option>
                              }
                            </select>
                            @if (
                              errors().get(row.phase + '.reasoningEffort');
                              as e
                            ) {
                              <span class="err">{{ e }}</span>
                            } @else {
                              <span class="ah-hint">{{
                                deploymentEffort(row)
                              }}</span>
                            }
                          </span>
                        } @else {
                          <span class="cell">
                            <span>{{
                              row.runsOn.reasoningEffort ?? 'model default'
                            }}</span>
                            @if (isPinned(row, 'reasoningEffort')) {
                              <span class="ah-hint">Set by the deployment</span>
                            }
                          </span>
                        }
                      </td>
                      <td>
                        @if (editable(page, row, 'budgetNanoAiu')) {
                          <span class="cell">
                            <input
                              ahInput
                              class="number"
                              type="text"
                              inputmode="decimal"
                              autocomplete="off"
                              formControlName="budget"
                              [placeholder]="aiu(row.deployment.budgetNanoAiu)"
                              [attr.aria-label]="
                                name(row.phase) + ' AIU cap per run'
                              "
                            />
                            @if (errors().get(row.phase + '.budget'); as e) {
                              <span class="err">{{ e }}</span>
                            } @else {
                              <span class="ah-hint"
                                >Up to {{ aiu(row.budgetCapNanoAiu) }}</span
                              >
                            }
                          </span>
                        } @else {
                          <span class="cell">
                            <span>{{ aiu(row.runsOn.budgetNanoAiu) }}</span>
                            @if (isPinned(row, 'budgetNanoAiu')) {
                              <span class="ah-hint">Set by the deployment</span>
                            }
                          </span>
                        }
                      </td>
                      <td>
                        @if (editable(page, row, 'timeoutSeconds')) {
                          <span class="cell">
                            <input
                              ahInput
                              class="number"
                              type="text"
                              inputmode="numeric"
                              autocomplete="off"
                              formControlName="timeout"
                              [placeholder]="
                                minutes(row.deployment.timeoutSeconds)
                              "
                              [attr.aria-label]="name(row.phase) + ' timeout'"
                            />
                            @if (errors().get(row.phase + '.timeout'); as e) {
                              <span class="err">{{ e }}</span>
                            } @else {
                              <span class="ah-hint">{{
                                timeoutLabel(row.deployment.timeoutSeconds)
                              }}</span>
                            }
                          </span>
                        } @else {
                          <span class="cell">
                            <span>{{
                              timeoutLabel(row.runsOn.timeoutSeconds)
                            }}</span>
                            @if (isPinned(row, 'timeoutSeconds')) {
                              <span class="ah-hint">Set by the deployment</span>
                            }
                          </span>
                        }
                      </td>
                      <td>
                        @if (!row.fields.includes('ciWaitMinutes')) {
                          <span class="ah-hint">—</span>
                        } @else if (editable(page, row, 'ciWaitMinutes')) {
                          <span class="cell">
                            <input
                              ahInput
                              class="number"
                              type="text"
                              inputmode="numeric"
                              autocomplete="off"
                              formControlName="ciWait"
                              [placeholder]="
                                String(row.deployment.ciWaitMinutes ?? '')
                              "
                              [attr.aria-label]="
                                name(row.phase) + ' wait for CI'
                              "
                            />
                            @if (errors().get(row.phase + '.ciWait'); as e) {
                              <span class="err">{{ e }}</span>
                            } @else {
                              <span class="ah-hint">{{
                                row.deployment.ciWaitMinutes === null
                                  ? '—'
                                  : minutesText(row.deployment.ciWaitMinutes)
                              }}</span>
                            }
                          </span>
                        } @else {
                          <span class="cell">
                            <span>{{
                              row.runsOn.ciWaitMinutes === null
                                ? '—'
                                : minutesText(row.runsOn.ciWaitMinutes)
                            }}</span>
                            @if (isPinned(row, 'ciWaitMinutes')) {
                              <span class="ah-hint">Set by the deployment</span>
                            }
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="body warnings">
              <span class="ah-hint"
                >Default and an empty field take the deployment's value, shown
                in grey. A story's own budget still bounds every run.</span
              >
              @for (raise of raised(); track raise.phase) {
                <ah-banner
                  variant="notice"
                  [heading]="
                    'Raising ' + name(raise.phase) + '’s cap spends more AIU'
                  "
                >
                  Each {{ name(raise.phase) }} run may then spend up to
                  {{ aiu(raise.to) }}, not {{ aiu(raise.from) }}. Saving asks
                  you to confirm.
                </ah-banner>
              }
              @if (saveFailure(); as problem) {
                <ah-banner
                  [variant]="problem.variant"
                  [heading]="problem.heading"
                  [tech]="problem.tech ?? ''"
                >
                  {{ problem.text }}
                </ah-banner>
              }
            </div>
            @if (store.canEdit()) {
              <ah-panel-foot>
                <span class="row foot">
                  <button
                    ahButton="ghost"
                    type="button"
                    [disabled]="!phasesDirty() || busy()"
                    (click)="reset()"
                  >
                    Cancel
                  </button>
                  <button
                    ahButton="primary"
                    type="button"
                    [disabled]="!phasesDirty() || busy() || errors().size > 0"
                    (click)="savePhases(page)"
                  >
                    {{
                      saving()
                        ? 'Saving…'
                        : raised().length > 0
                          ? 'Save…'
                          : 'Save'
                    }}
                  </button>
                </span>
              </ah-panel-foot>
            }
          </ah-panel>

          <ah-panel>
            <ah-panel-head
              heading="Model catalogue"
              [subtitle]="catalogLine(page)"
            >
              @if (catalogDirty()) {
                <span ahPanelActions class="ah-tag ah-tag--outline"
                  >Unsaved changes</span
                >
              }
            </ah-panel-head>
            <div class="models">
              <table ahTable aria-label="Model catalogue">
                <thead>
                  <tr>
                    <th scope="col">Model id</th>
                    <th scope="col">Label</th>
                    <th scope="col">Efforts it takes</th>
                    @if (catalogEditable(page)) {
                      <th scope="col">
                        <span class="ah-sr">Remove</span>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @if (catalogEditable(page)) {
                    @for (
                      group of catalogForm.controls;
                      track group;
                      let i = $index
                    ) {
                      <tr [formGroup]="group">
                        <td>
                          <input
                            ahInput
                            mono
                            type="text"
                            autocomplete="off"
                            spellcheck="false"
                            formControlName="id"
                            [attr.aria-label]="'Model ' + (i + 1) + ' id'"
                          />
                        </td>
                        <td>
                          <input
                            ahInput
                            type="text"
                            autocomplete="off"
                            formControlName="label"
                            placeholder="The id"
                            [attr.aria-label]="'Model ' + (i + 1) + ' label'"
                          />
                        </td>
                        <td>
                          <input
                            ahInput
                            type="text"
                            autocomplete="off"
                            spellcheck="false"
                            formControlName="efforts"
                            placeholder="Any"
                            [attr.aria-label]="'Model ' + (i + 1) + ' efforts'"
                          />
                        </td>
                        <td>
                          <button
                            ahButton="ghost"
                            size="sm"
                            type="button"
                            [disabled]="busy()"
                            (click)="removeModel(i)"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    }
                  } @else {
                    @for (m of page.catalog.models; track m.id) {
                      <tr>
                        <td class="ah-mono">{{ m.id }}</td>
                        <td>{{ m.label }}</td>
                        <td>{{ effortsShown(m) }}</td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            @if (catalogEditable(page)) {
              <div class="body warnings">
                <span class="ah-hint"
                  >Efforts as a list, such as "low, medium, high"; "none" for a
                  model that takes no effort; empty, any effort. A model a phase
                  runs on stays one people can pick.</span
                >
                @if (catalogProblem(); as problem) {
                  <span class="err">{{ problem }}</span>
                }
                @if (catalogFailure(); as problem) {
                  <ah-banner
                    [variant]="problem.variant"
                    [heading]="problem.heading"
                    [tech]="problem.tech ?? ''"
                  >
                    {{ problem.text }}
                  </ah-banner>
                }
              </div>
              <ah-panel-foot>
                <span class="row foot">
                  <button
                    ahButton="ghost"
                    type="button"
                    [disabled]="busy()"
                    (click)="addModel()"
                  >
                    Add model
                  </button>
                  @if (page.catalog.saved !== null) {
                    <button
                      ahButton="ghost"
                      type="button"
                      [disabled]="busy()"
                      (click)="useBuiltIn(page)"
                    >
                      Use the built-in list
                    </button>
                  }
                  <button
                    ahButton="primary"
                    type="button"
                    [disabled]="
                      !catalogDirty() || busy() || catalogProblem() !== null
                    "
                    (click)="saveCatalog(page)"
                  >
                    {{ saving() ? 'Saving…' : 'Save catalogue' }}
                  </button>
                </span>
              </ah-panel-foot>
            }
          </ah-panel>
        </div>

        <aside class="side">
          <ah-settings-history
            section="Phases"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. What each phase may read and write, and the most a cap may be, are set in the deployment."
          />
        </aside>
      </div>
    }
  `,
})
export class PhaseSettingsPage {
  protected readonly store = inject(PhaseSettingsStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  protected readonly deployment = DEPLOYMENT;
  protected readonly String = String;

  /** Each phase's fields as typed, by phase. */
  protected readonly phasesForm = new FormRecord<PhaseGroup>({});
  /** The group a row binds to before the form has its phase (never shown: rows come from the same page). */
  private readonly noPhase = phaseGroup({
    model: DEPLOYMENT,
    reasoningEffort: DEPLOYMENT,
    budget: DEPLOYMENT,
    timeout: DEPLOYMENT,
    ciWait: DEPLOYMENT,
  });
  /** The catalogue as typed. */
  protected readonly catalogForm = new FormArray<ModelGroup>([]);

  /** Moves on whenever either form changes, so the signals below read the forms again. */
  private readonly edits = toSignal(
    merge(this.phasesForm.valueChanges, this.catalogForm.valueChanges).pipe(
      map(() => Symbol())
    ),
    { initialValue: Symbol() }
  );
  /** Moves on when the forms are rebuilt from a page. */
  private readonly shown = signal(0);

  private readonly page = computed(() => this.store.page());

  /** The phases as typed. */
  private readonly typed = computed((): Readonly<Record<string, PhaseText>> => {
    this.edits();
    this.shown();
    return this.phasesForm.getRawValue();
  });

  protected readonly phasesDirty = computed(() => {
    const page = this.page();
    if (page === null) return false;
    const typed = this.typed();
    return page.phases.some((row) => {
      const now = typed[row.phase];
      const saved = phaseTextOf(row);
      return (
        now !== undefined &&
        (Object.keys(saved) as (keyof PhaseText)[]).some(
          (k) => saved[k] !== now[k].trim()
        )
      );
    });
  });

  /** Each phase as typed, read once: what changed, why a field is refused and the change the API would take. */
  private readonly reads = computed((): readonly RowRead[] => {
    const page = this.page();
    if (page === null) return [];
    const typed = this.typed();
    return page.phases.flatMap((row) => {
      const t = typed[row.phase];
      return t === undefined ? [] : [this.readRow(page, row, t)];
    });
  });

  /** Why a changed field would be refused, by `<phase>.<field>`; a saved value the admin did not touch is not judged. */
  protected readonly errors = computed((): ReadonlyMap<string, string> => {
    const out = new Map<string, string>();
    for (const read of this.reads())
      for (const [field, problem] of read.problems)
        out.set(`${read.phase}.${field}`, problem);
    return out;
  });

  /** The phases whose cap the admin's change raises: saving them asks for a confirmation. */
  protected readonly raised = computed((): CapChange[] =>
    this.errors().size > 0
      ? []
      : capsRaised(this.reads().flatMap((read) => read.cap ?? []))
  );

  /** The catalogue as typed. */
  private readonly typedModels = computed((): readonly ModelText[] => {
    this.edits();
    this.shown();
    return this.catalogForm.getRawValue();
  });

  protected readonly catalogDirty = computed(() => {
    const page = this.page();
    if (page === null) return false;
    const saved = this.listedOf(page).map(modelTextOf);
    const typed = this.typedModels();
    return (
      saved.length !== typed.length ||
      saved.some(
        (m, i) =>
          m.id !== typed[i]?.id.trim() ||
          m.label !== typed[i]?.label.trim() ||
          m.efforts !== typed[i]?.efforts.trim()
      )
    );
  });

  protected readonly catalogProblem = computed(() => {
    const read = catalogOf(this.typedModels());
    return 'problem' in read ? read.problem : null;
  });

  protected readonly saving = signal(false);
  /** Waiting for the admin to confirm what a higher cap spends. */
  private readonly confirming = signal(false);
  protected readonly busy = computed(() => this.saving() || this.confirming());
  private readonly saveError = signal<ApiError | null>(null);
  private readonly catalogError = signal<ApiError | null>(null);
  protected readonly saveFailure = computed(() =>
    this.errorView(this.saveError())
  );
  protected readonly catalogFailure = computed(() =>
    this.errorView(this.catalogError())
  );
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
    // The forms follow the saved settings until the admin changes something; a save or a change elsewhere moves them on.
    effect(() => {
      const page = this.page();
      if (page === null) return;
      if (this.phasesForm.pristine) this.showPhases(page);
      if (this.catalogForm.pristine) this.showCatalog(page);
    });
    effect(() => {
      if (this.busy()) {
        this.phasesForm.disable({ emitEvent: false });
        this.catalogForm.disable({ emitEvent: false });
      } else {
        this.phasesForm.enable({ emitEvent: false });
        this.catalogForm.enable({ emitEvent: false });
      }
    });
  }

  protected name(phase: string): string {
    return phaseName(phase);
  }

  protected kind(phase: string): string {
    return isStoryPhase(phase) ? 'Story phase' : 'Agent job, outside a story';
  }

  protected aiu(nanoAiu: number | null): string {
    return nanoAiu === null ? '—' : aiuLabel(nanoAiu);
  }

  protected minutes(seconds: number | null): string {
    return seconds === null ? '' : String(Math.round(seconds / 60));
  }

  protected minutesText(minutes: number): string {
    return minutesLabel(minutes);
  }

  protected timeoutLabel(seconds: number | null): string {
    return seconds === null ? '—' : minutesLabel(Math.round(seconds / 60));
  }

  /** "Caps up to 150 AIU per run, or a phase's deployment cap where that is higher." */
  protected capsLine(page: PhasesPage): string {
    return page.maxBudgetNanoAiu === null
      ? "Caps may only go down from the deployment's."
      : `Caps up to ${aiuLabel(page.maxBudgetNanoAiu)} per run, or a phase's deployment cap where that is higher.`;
  }

  protected catalogLine(page: PhasesPage): string {
    switch (page.catalog.source) {
      case 'file':
        return 'Set by the deployment (AHOY_MODEL_CATALOG).';
      case 'settings':
        return 'Saved here. People choose from these when they start a story.';
      default:
        return 'The built-in list. Save a list to choose your own.';
    }
  }

  protected isPinned(row: PhaseSettingsRow, field: PhaseField): boolean {
    return row.pinned.includes(field);
  }

  /** Whether the person may change a field of a phase: an admin, on a field the deployment's file does not set. */
  protected editable(
    page: PhasesPage,
    row: PhaseSettingsRow,
    field: PhaseField
  ): boolean {
    return (
      page.canEdit && row.fields.includes(field) && !this.isPinned(row, field)
    );
  }

  protected catalogEditable(page: PhasesPage): boolean {
    return page.canEdit && page.catalog.editable;
  }

  /** A catalogue model's efforts on the read-only table. */
  protected effortsShown(model: CatalogModel): string {
    const text = effortsText(model.reasoningEfforts);
    return text === '' ? 'Any' : text === NO_EFFORT ? 'None' : text;
  }

  protected deploymentModel(row: PhaseSettingsRow): string {
    return row.deployment.model ?? 'agent profile';
  }

  protected deploymentEffort(row: PhaseSettingsRow): string {
    return row.deployment.reasoningEffort ?? 'model default';
  }

  /** The models a phase can take: the catalogue, with its saved one even if it left the catalogue. */
  protected modelChoices(page: PhasesPage, row: PhaseSettingsRow): string[] {
    const ids = page.catalog.models.map((m) => m.id);
    const saved = row.saved.model;
    return saved !== null && !ids.includes(saved) ? [saved, ...ids] : ids;
  }

  /** The efforts the chosen model takes (every effort when the catalogue does not say), with the one typed now. */
  protected effortChoices(page: PhasesPage, row: PhaseSettingsRow): string[] {
    const t = this.typed()[row.phase];
    const model =
      t === undefined ? row.deployment.model : this.runningModel(row, t);
    const efforts = page.catalog.models.find(
      (m) => m.id === model
    )?.reasoningEfforts;
    const choices: string[] = [...(efforts ?? REASONING_EFFORTS)];
    const typed = t?.reasoningEffort.trim() ?? DEPLOYMENT;
    return typed !== DEPLOYMENT && !choices.includes(typed)
      ? [typed, ...choices]
      : choices;
  }

  protected phaseForm(phase: string): PhaseGroup {
    return this.phasesForm.controls[phase] ?? this.noPhase;
  }

  /** Puts the saved phases back. */
  protected reset(): void {
    const page = this.page();
    if (page !== null) this.showPhases(page);
    this.saveError.set(null);
  }

  protected addModel(): void {
    this.catalogForm.push(modelGroup({ id: '', label: '', efforts: '' }));
    this.catalogForm.markAsDirty();
  }

  protected removeModel(index: number): void {
    this.catalogForm.removeAt(index);
    this.catalogForm.markAsDirty();
  }

  /** The catalogue the form edits: the saved one, else the one people choose from now. */
  private listedOf(page: PhasesPage): readonly CatalogModel[] {
    return page.catalog.saved ?? page.catalog.models;
  }

  private showPhases(page: PhasesPage): void {
    for (const name of Object.keys(this.phasesForm.controls))
      if (!page.phases.some((row) => row.phase === name))
        this.phasesForm.removeControl(name, { emitEvent: false });
    for (const row of page.phases) {
      const control = this.phasesForm.controls[row.phase];
      if (control) control.reset(phaseTextOf(row), { emitEvent: false });
      else
        this.phasesForm.addControl(row.phase, phaseGroup(phaseTextOf(row)), {
          emitEvent: false,
        });
    }
    this.phasesForm.markAsPristine();
    this.shown.update((n) => n + 1);
  }

  private showCatalog(page: PhasesPage): void {
    this.catalogForm.clear({ emitEvent: false });
    for (const m of this.listedOf(page))
      this.catalogForm.push(modelGroup(modelTextOf(m)), { emitEvent: false });
    this.catalogForm.markAsPristine();
    this.shown.update((n) => n + 1);
  }

  private errorView(error: ApiError | null) {
    if (error === null) return null;
    return isStale(error)
      ? {
          ...settingsErrorView(error),
          text: 'Another admin saved the phases first. The page now shows theirs: make your change again.',
        }
      : settingsErrorView(error);
  }

  /** One phase as typed: the fields the admin changed, each checked, and the change as the API takes it. */
  private readRow(
    page: PhasesPage,
    row: PhaseSettingsRow,
    t: PhaseText
  ): RowRead {
    const saved = phaseTextOf(row);
    const problems = new Map<keyof PhaseText, string>();
    const change: MutablePhaseChange = {};
    const changed = (
      field: PhaseField,
      key: keyof PhaseText
    ): string | null => {
      const typed = t[key].trim();
      return typed !== saved[key] && this.editable(page, row, field)
        ? typed
        : null;
    };

    const model = changed('model', 'model');
    if (model !== null) change.model = model === DEPLOYMENT ? null : model;
    const effort = changed('reasoningEffort', 'reasoningEffort');
    if (effort !== null)
      change.reasoningEffort = isEffort(effort) ? effort : null;
    if (model !== null || effort !== null) {
      const problem = this.effortProblem(page, row, t);
      if (problem !== null)
        problems.set(
          this.editable(page, row, 'reasoningEffort')
            ? 'reasoningEffort'
            : 'model',
          problem
        );
    }

    let cap: CapChange | undefined;
    const budget = changed('budgetNanoAiu', 'budget');
    if (budget !== null) {
      const read =
        budget === DEPLOYMENT ? null : readBudget(budget, row.budgetCapNanoAiu);
      if (read !== null && 'problem' in read)
        problems.set('budget', read.problem);
      else {
        change.budgetNanoAiu = read === null ? null : read.nanoAiu;
        const from = row.runsOn.budgetNanoAiu;
        const to = read === null ? row.deployment.budgetNanoAiu : read.nanoAiu;
        if (from !== null && to !== null) cap = { phase: row.phase, from, to };
      }
    }
    const timeout = changed('timeoutSeconds', 'timeout');
    if (timeout !== null) {
      const read =
        timeout === DEPLOYMENT
          ? null
          : readMinutes(timeout, MIN_TIMEOUT_MINUTES, MAX_TIMEOUT_MINUTES);
      if (read !== null && 'problem' in read)
        problems.set('timeout', read.problem);
      else change.timeoutSeconds = read === null ? null : read.minutes * 60;
    }
    const ciWait = changed('ciWaitMinutes', 'ciWait');
    if (ciWait !== null) {
      const read =
        ciWait === DEPLOYMENT
          ? null
          : readMinutes(ciWait, 1, MAX_CI_WAIT_MINUTES);
      if (read !== null && 'problem' in read)
        problems.set('ciWait', read.problem);
      else change.ciWaitMinutes = read === null ? null : read.minutes;
    }
    return {
      phase: row.phase,
      problems,
      ...(cap !== undefined ? { cap } : {}),
      ...(Object.keys(change).length > 0 ? { change } : {}),
    };
  }

  /** Why the effort a phase would run on is not one the model it would run on takes, or null. */
  private effortProblem(
    page: PhasesPage,
    row: PhaseSettingsRow,
    t: PhaseText
  ): string | null {
    const model = this.runningModel(row, t);
    const effort =
      t.reasoningEffort.trim() === DEPLOYMENT ||
      !this.editable(page, row, 'reasoningEffort')
        ? row.deployment.reasoningEffort
        : t.reasoningEffort.trim();
    if (model === null || effort === null) return null;
    const efforts = page.catalog.models.find(
      (m) => m.id === model
    )?.reasoningEfforts;
    if (
      efforts === undefined ||
      efforts === null ||
      efforts.includes(effort as ReasoningEffort)
    )
      return null;
    return efforts.length === 0
      ? `${model} takes no effort.`
      : `${model} takes only ${efforts.join(', ')}.`;
  }

  /** The model a phase would run on with what is typed: the typed one, else the deployment's. */
  private runningModel(row: PhaseSettingsRow, t: PhaseText): string | null {
    const typed = t.model.trim();
    return typed === DEPLOYMENT ? row.deployment.model : typed;
  }

  /** Saves what changed; a change that raises a cap asks first and is sent with `confirmSpend`. */
  protected async savePhases(page: PhasesPage): Promise<void> {
    if (this.busy() || !this.phasesDirty() || this.errors().size > 0) return;
    const raised = this.raised();
    if (raised.length > 0) {
      this.confirming.set(true);
      const ref = this.dialogs.open<boolean, PhasesSpendData>(
        PhasesSpendDialog,
        { data: { raised }, width: '480px' }
      );
      const confirmed = (await firstValueFrom(ref.closed)) === true;
      this.confirming.set(false);
      if (!confirmed) return;
    }
    const phases: Record<string, PhaseChange> = {};
    for (const read of this.reads())
      if (read.change !== undefined) phases[read.phase] = read.change;
    await this.send(
      {
        ...(page.version !== null ? { version: page.version } : {}),
        phases,
        ...(raised.length > 0 ? { confirmSpend: true } : {}),
      },
      this.saveError,
      raised.length > 0
        ? 'Phases saved, with the higher cap.'
        : 'Phases saved.',
      (fresh) => this.showPhases(fresh)
    );
  }

  protected async saveCatalog(page: PhasesPage): Promise<void> {
    if (this.busy() || !this.catalogDirty()) return;
    const read = catalogOf(this.catalogForm.getRawValue());
    if ('problem' in read) return;
    await this.send(
      {
        ...(page.version !== null ? { version: page.version } : {}),
        models: read.models,
      },
      this.catalogError,
      'Model catalogue saved.',
      (fresh) => this.showCatalog(fresh)
    );
  }

  protected async useBuiltIn(page: PhasesPage): Promise<void> {
    if (this.busy()) return;
    await this.send(
      {
        ...(page.version !== null ? { version: page.version } : {}),
        models: null,
      },
      this.catalogError,
      'Back to the built-in models.',
      (fresh) => this.showCatalog(fresh)
    );
  }

  /** Sends a change; another admin's save first shows theirs rather than sending over it. */
  private async send(
    body: PhaseSettingsChange,
    error: typeof this.saveError,
    done: string,
    show: (fresh: PhasesPage) => void
  ): Promise<void> {
    this.saving.set(true);
    error.set(null);
    const result = await this.store.change(body);
    this.saving.set(false);
    if (!result.ok) {
      error.set(result.error);
      const fresh = this.page();
      if (isStale(result.error) && fresh !== null) show(fresh);
      return;
    }
    const fresh = this.page();
    if (fresh !== null) show(fresh);
    this.toasts.show(done);
  }
}
