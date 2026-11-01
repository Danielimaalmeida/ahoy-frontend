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
import { formatAiu } from '@domain/aiu';
import {
  aiuLabel,
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

/** A phase's saved fields as the form shows them. */
function phaseTextOf(row: PhaseSettingsRow): PhaseText {
  const { saved } = row;
  return {
    model: saved.model ?? DEPLOYMENT,
    reasoningEffort: saved.reasoningEffort ?? DEPLOYMENT,
    budget:
      saved.budgetNanoAiu === null
        ? DEPLOYMENT
        : formatAiu(saved.budgetNanoAiu, 9).replace(/\.?0+$/, ''),
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
    efforts: model.reasoningEfforts?.join(', ') ?? '',
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

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

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
    if (!MODEL_ID.test(id) || id.length > 200)
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
      .map((w) => w.trim())
      .filter(Boolean);
    const efforts: ReasoningEffort[] = [];
    for (const w of words) {
      if (!(REASONING_EFFORTS as readonly string[]).includes(w))
        return {
          problem: `${id}: ${w} is not an effort (${REASONING_EFFORTS.join(', ')}).`,
        };
      if (!efforts.includes(w as ReasoningEffort))
        efforts.push(w as ReasoningEffort);
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
                            <span class="ah-hint">{{
                              deploymentModel(row)
                            }}</span>
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
                            <span class="ah-hint">{{
                              deploymentEffort(row)
                            }}</span>
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
                        <span class="ah-sr-only">Remove</span>
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
                        <td>{{ m.reasoningEfforts?.join(', ') ?? 'Any' }}</td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            @if (catalogEditable(page)) {
              <div class="body warnings">
                <span class="ah-hint"
                  >Efforts as a list, such as "low, medium, high"; empty, any
                  effort. A model a phase runs on stays one people can
                  pick.</span
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

  /** Why a typed field would be refused, by `<phase>.<field>`. */
  protected readonly errors = computed((): ReadonlyMap<string, string> => {
    const page = this.page();
    const out = new Map<string, string>();
    if (page === null) return out;
    const typed = this.typed();
    for (const row of page.phases) {
      const t = typed[row.phase];
      if (t === undefined) continue;
      if (t.budget.trim() !== '' && this.editable(page, row, 'budgetNanoAiu')) {
        const read = readBudget(t.budget, row.budgetCapNanoAiu);
        if ('problem' in read) out.set(`${row.phase}.budget`, read.problem);
      }
      if (
        t.timeout.trim() !== '' &&
        this.editable(page, row, 'timeoutSeconds')
      ) {
        const read = readMinutes(
          t.timeout,
          MIN_TIMEOUT_MINUTES,
          MAX_TIMEOUT_MINUTES
        );
        if ('problem' in read) out.set(`${row.phase}.timeout`, read.problem);
      }
      if (t.ciWait.trim() !== '' && this.editable(page, row, 'ciWaitMinutes')) {
        const read = readMinutes(t.ciWait, 1, MAX_CI_WAIT_MINUTES);
        if ('problem' in read) out.set(`${row.phase}.ciWait`, read.problem);
      }
    }
    return out;
  });

  /** The phases whose cap the typed change raises: saving them asks for a confirmation. */
  protected readonly raised = computed((): CapChange[] => {
    const page = this.page();
    if (page === null || this.errors().size > 0) return [];
    const typed = this.typed();
    return capsRaised(
      page.phases.flatMap((row) => {
        const t = typed[row.phase];
        const from = row.runsOn.budgetNanoAiu;
        if (t === undefined || from === null) return [];
        const read =
          t.budget.trim() === ''
            ? null
            : readBudget(t.budget, row.budgetCapNanoAiu);
        const to =
          read === null
            ? row.deployment.budgetNanoAiu
            : 'nanoAiu' in read
              ? read.nanoAiu
              : null;
        return to === null ? [] : [{ phase: row.phase, from, to }];
      })
    );
  });

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

  /** "Caps up to 150 AIU per run, set by the deployment." */
  protected capsLine(page: PhasesPage): string {
    return page.maxBudgetNanoAiu === null
      ? "Caps may only go down from the deployment's."
      : `Caps up to ${aiuLabel(page.maxBudgetNanoAiu)} per run, set by the deployment.`;
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

  /** The efforts the chosen model takes, or every effort when the catalogue does not say. */
  protected effortChoices(page: PhasesPage, row: PhaseSettingsRow): string[] {
    const typed = this.typed()[row.phase]?.model ?? DEPLOYMENT;
    const model = typed === DEPLOYMENT ? row.deployment.model : typed;
    const efforts = page.catalog.models.find(
      (m) => m.id === model
    )?.reasoningEfforts;
    return [...(efforts ?? REASONING_EFFORTS)];
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

  /** What changed in one phase, as the API takes it; undefined when nothing did. */
  private changeOf(
    page: PhasesPage,
    row: PhaseSettingsRow,
    t: PhaseText
  ): PhaseChange | undefined {
    const saved = phaseTextOf(row);
    const change: Record<string, string | number | null> = {};
    const set = (
      field: PhaseField,
      key: keyof PhaseText,
      value: () => string | number
    ) => {
      const typed = t[key].trim();
      if (typed === saved[key] || !this.editable(page, row, field)) return;
      change[field] = typed === DEPLOYMENT ? null : value();
    };
    set('model', 'model', () => t.model);
    set('reasoningEffort', 'reasoningEffort', () => t.reasoningEffort);
    set('budgetNanoAiu', 'budget', () => {
      const read = readBudget(t.budget, row.budgetCapNanoAiu);
      return 'nanoAiu' in read ? read.nanoAiu : 0;
    });
    set('timeoutSeconds', 'timeout', () => Number(t.timeout.trim()) * 60);
    set('ciWaitMinutes', 'ciWait', () => Number(t.ciWait.trim()));
    return Object.keys(change).length === 0
      ? undefined
      : (change as PhaseChange);
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
    const typed = this.phasesForm.getRawValue();
    const phases: Record<string, PhaseChange> = {};
    for (const row of page.phases) {
      const t = typed[row.phase];
      const change = t === undefined ? undefined : this.changeOf(page, row, t);
      if (change !== undefined) phases[row.phase] = change;
    }
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
