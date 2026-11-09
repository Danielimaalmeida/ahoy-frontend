import {
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { map, merge } from 'rxjs';
import type { CommandErrorView } from '@core/commands/command-error';
import {
  REASONING_EFFORTS,
  type CatalogModel,
  type PhaseSettingsPlanPanel,
  type PlanPanelChange,
  type PlanPanelConfig,
  type ReasoningEffort,
} from '@core/api/types';
import {
  catalogModelLabel,
  earlierPlannerOnSameModel,
  MAX_JUDGE_MODELS,
  MAX_PLANNERS,
  MIN_PLANNERS,
  PLAN_PANEL_ORIGIN_LABELS,
  plannerShareNanoAiu,
} from '@domain/plan-panel';
import { aiuLabel } from '@domain/phase-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { FieldControl } from '@ui/field/field';
import { Panel, PanelFoot, PanelHead } from '@ui/panel/panel';
import { CellSub, Nowrap, Table } from '@ui/table/table';

/** The model's default effort: an empty control. */
const MODEL_DEFAULT = '';

/** One planner as typed: its model, and its effort ('' for the model's default). */
interface PlannerText {
  readonly model: string;
  readonly effort: string;
}

/** The panel as typed. */
interface PanelText {
  readonly planners: readonly PlannerText[];
  readonly judges: readonly string[];
  readonly judgeEffort: string;
}

type PlannerGroup = FormGroup<{
  model: FormControl<string>;
  effort: FormControl<string>;
}>;

function control(value: string): FormControl<string> {
  return new FormControl(value, { nonNullable: true });
}

function plannerGroup(text: PlannerText): PlannerGroup {
  return new FormGroup({
    model: control(text.model),
    effort: control(text.effort),
  });
}

/** A panel as the form shows it. */
function panelTextOf(panel: PlanPanelConfig): PanelText {
  return {
    planners: panel.panelists.map((p) => ({
      model: p.model,
      effort: p.reasoningEffort ?? MODEL_DEFAULT,
    })),
    judges: [...panel.judge.models],
    judgeEffort: panel.judge.reasoningEffort ?? MODEL_DEFAULT,
  };
}

function sameText(a: PanelText, b: PanelText): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isEffort(word: string): word is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(word);
}

/**
 * Team settings › Phases › Plan panel (ahoy-hosted D22): the models a story planned by panel runs on. Two to five
 * planners, each a model and an effort, and the judge's models, best first (it runs on the first one the owner's account
 * may use), with one effort. Only models of the catalogue; a model two planners share is allowed but flagged, since its
 * ratings then count twice. The panel changes no cap, so saving asks nothing; the page sends the change.
 */
@Component({
  selector: 'ah-plan-panel-settings',
  imports: [
    Banner,
    Button,
    CellSub,
    FieldControl,
    Nowrap,
    Panel,
    PanelFoot,
    PanelHead,
    ReactiveFormsModule,
    Table,
  ],
  styles: `
    .scroll {
      position: relative;
      overflow-x: auto;
    }
    .intro {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px 16px;
      border-top: 1px solid var(--line-soft);
    }
    .intro b {
      font-weight: 600;
    }
    td,
    th[scope='row'] {
      vertical-align: top;
    }
    th[scope='row'] {
      font-weight: 600;
      white-space: nowrap;
      text-transform: none;
      letter-spacing: normal;
    }
    .cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    select {
      min-width: 100px;
      max-width: 140px;
    }
    select.model {
      min-width: 170px;
      max-width: 240px;
    }
    .err {
      color: var(--danger-text);
      font-size: 12px;
    }
    .warn {
      color: var(--status-input-fg);
      font-size: 12px;
      max-width: 260px;
    }
    .order {
      width: 40px;
    }
    .moves {
      display: inline-flex;
      gap: 4px;
    }
    .add {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      align-items: center;
      padding: 10px 16px;
      border-top: 1px solid var(--line-soft);
    }
    .grow {
      flex: 1;
    }
    .row {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .body {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-top: 1px solid var(--line-soft);
    }
    .foot {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      width: 100%;
    }
  `,
  template: `
    <ah-panel>
      <ah-panel-head heading="Plan panel" [subtitle]="subtitle()">
        <span ahPanelActions class="row">
          @if (dirty()) {
            <span class="ah-tag ah-tag--outline">Unsaved changes</span>
          }
          <span
            class="ah-tag"
            [class.ah-tag--accent]="panel().source === 'settings'"
            >{{ originLabel() }}</span
          >
        </span>
      </ah-panel-head>

      <div class="intro">
        <b>Planners</b>
        <span class="ah-hint"
          >Each plans the story on its own and in parallel, from
          {{ minPlanners }} to {{ maxPlanners }}. Together they may spend
          {{ panel().panelistsBudgetPercent }}% of the run's cap and half its
          time.</span
        >
      </div>
      <div class="scroll">
        <table ahTable aria-label="Planners">
          <thead>
            <tr>
              <th scope="col">Planner</th>
              <th scope="col">Model</th>
              <th scope="col">Effort</th>
              <th scope="col">Share of the cap</th>
              @if (editable()) {
                <th scope="col"><span class="ah-sr">Remove</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @if (editable()) {
              @for (group of planners.controls; track group; let i = $index) {
                <tr [formGroup]="group">
                  <th scope="row">
                    Planner {{ i + 1 }}
                    <span ahCellSub>Anonymous to the judge</span>
                  </th>
                  <td>
                    <span class="cell">
                      <select
                        ahInput
                        mono
                        class="model"
                        formControlName="model"
                        [attr.aria-label]="'Planner ' + (i + 1) + ' model'"
                      >
                        @for (
                          m of modelChoices(group.controls.model.value);
                          track m
                        ) {
                          <option [value]="m">{{ m }}</option>
                        }
                      </select>
                      @if (errors().get('planner.' + i + '.model'); as e) {
                        <span class="err">{{ e }}</span>
                      } @else if (repeatOf(i); as earlier) {
                        <span class="warn"
                          >Same model as planner {{ earlier }}: allowed, but
                          {{ label(group.controls.model.value) }} then gets two
                          ratings per panel in Metrics.</span
                        >
                      } @else {
                        <span class="ah-hint">{{
                          label(group.controls.model.value)
                        }}</span>
                      }
                    </span>
                  </td>
                  <td>
                    <span class="cell">
                      <select
                        ahInput
                        formControlName="effort"
                        [attr.aria-label]="'Planner ' + (i + 1) + ' effort'"
                      >
                        <option [value]="modelDefault">Default</option>
                        @for (
                          e of effortChoices(
                            group.controls.model.value,
                            group.controls.effort.value
                          );
                          track e
                        ) {
                          <option [value]="e">{{ e }}</option>
                        }
                      </select>
                      @if (errors().get('planner.' + i + '.effort'); as e) {
                        <span class="err">{{ e }}</span>
                      } @else if (
                        group.controls.effort.value === modelDefault
                      ) {
                        <span class="ah-hint">model default</span>
                      }
                    </span>
                  </td>
                  <td class="ah-hint" ahNowrap>{{ share() }}</td>
                  <td>
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      [disabled]="busy() || planners.length <= minPlanners"
                      [attr.aria-label]="'Remove planner ' + (i + 1)"
                      (click)="removePlanner(i)"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              }
            } @else {
              @for (
                p of panel().runsOn.panelists;
                track $index;
                let i = $index
              ) {
                <tr>
                  <th scope="row">Planner {{ i + 1 }}</th>
                  <td>
                    <span class="cell">
                      <span class="ah-mono">{{ p.model }}</span>
                      <span class="ah-hint">{{ label(p.model) }}</span>
                    </span>
                  </td>
                  <td>{{ p.reasoningEffort ?? 'model default' }}</td>
                  <td class="ah-hint" ahNowrap>{{ share() }}</td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (editable()) {
        <div class="add">
          <button
            ahButton
            size="sm"
            type="button"
            [disabled]="busy() || planners.length >= maxPlanners"
            (click)="addPlanner()"
          >
            Add planner
          </button>
          <span class="ah-hint"
            >{{ planners.length }} of {{ maxPlanners }}</span
          >
        </div>
      }

      <div class="intro">
        <b>Judge</b>
        <span class="ah-hint"
          >Writes the final plan from the drafts and rates each from 1 to 10. It
          runs on the first model below that the owner's Copilot account may
          use; the rest are fallbacks, in order.</span
        >
      </div>
      <div class="scroll">
        <table ahTable aria-label="Judge models">
          <thead>
            <tr>
              <th scope="col" class="order">Order</th>
              <th scope="col">Model</th>
              @if (editable()) {
                <th scope="col"><span class="ah-sr">Move</span></th>
                <th scope="col"><span class="ah-sr">Remove</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @if (editable()) {
              @for (c of judges.controls; track c; let i = $index) {
                <tr>
                  <th scope="row" class="order">{{ i + 1 }}</th>
                  <td>
                    <span class="cell">
                      <select
                        ahInput
                        mono
                        class="model"
                        [formControl]="c"
                        [attr.aria-label]="'Judge model ' + (i + 1)"
                      >
                        @for (m of modelChoices(c.value); track m) {
                          <option [value]="m">{{ m }}</option>
                        }
                      </select>
                      @if (errors().get('judge.' + i); as e) {
                        <span class="err">{{ e }}</span>
                      } @else {
                        <span class="ah-hint">{{
                          i === 0
                            ? 'First the account may use'
                            : 'If the account may not use the one above'
                        }}</span>
                      }
                    </span>
                  </td>
                  <td>
                    <span class="moves">
                      <button
                        ahButton="ghost"
                        size="sm"
                        type="button"
                        [disabled]="busy() || i === 0"
                        [attr.aria-label]="
                          'Move judge model ' + (i + 1) + ' up'
                        "
                        (click)="moveJudge(i, -1)"
                      >
                        ↑
                      </button>
                      <button
                        ahButton="ghost"
                        size="sm"
                        type="button"
                        [disabled]="busy() || i === judges.length - 1"
                        [attr.aria-label]="
                          'Move judge model ' + (i + 1) + ' down'
                        "
                        (click)="moveJudge(i, 1)"
                      >
                        ↓
                      </button>
                    </span>
                  </td>
                  <td>
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      [disabled]="busy() || judges.length <= 1"
                      [attr.aria-label]="'Remove judge model ' + (i + 1)"
                      (click)="removeJudge(i)"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              }
            } @else {
              @for (m of panel().runsOn.judge.models; track m; let i = $index) {
                <tr>
                  <th scope="row" class="order">{{ i + 1 }}</th>
                  <td>
                    <span class="cell">
                      <span class="ah-mono">{{ m }}</span>
                      <span class="ah-hint">{{ label(m) }}</span>
                    </span>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      <div class="add">
        @if (editable()) {
          <button
            ahButton
            size="sm"
            type="button"
            [disabled]="busy() || judges.length >= maxJudgeModels"
            (click)="addJudge()"
          >
            Add fallback
          </button>
          <span class="ah-hint"
            >{{ judges.length }} of {{ maxJudgeModels }}</span
          >
          <span class="grow"></span>
          <label class="row">
            <b>Judge effort</b>
            <select
              ahInput
              [formControl]="judgeEffort"
              aria-label="Judge effort"
            >
              <option [value]="modelDefault">Default</option>
              @for (e of judgeEffortChoices(); track e) {
                <option [value]="e">{{ e }}</option>
              }
            </select>
          </label>
        } @else {
          <span
            >Judge effort:
            {{ panel().runsOn.judge.reasoningEffort ?? 'model default' }}</span
          >
        }
      </div>

      <div class="body">
        <span class="ah-hint">{{ footnote() }}</span>
        @if (errors().get('judgeEffort'); as e) {
          <span class="err">{{ e }}</span>
        }
        @if (error(); as problem) {
          <ah-banner
            [variant]="problem.variant"
            [heading]="problem.heading"
            [tech]="problem.tech ?? ''"
          >
            {{ problem.text }}
          </ah-banner>
        }
      </div>
      @if (editable()) {
        <ah-panel-foot>
          <span class="foot">
            @if (panel().saved !== null) {
              <button
                ahButton="ghost"
                type="button"
                [disabled]="busy()"
                (click)="saveBuiltIn()"
              >
                Back to the built-in panel
              </button>
            }
            <span class="grow"></span>
            <button
              ahButton="ghost"
              type="button"
              [disabled]="!dirty() || busy()"
              (click)="reset()"
            >
              Cancel
            </button>
            <button
              ahButton="primary"
              type="button"
              [disabled]="!dirty() || busy() || errors().size > 0"
              (click)="savePanel()"
            >
              {{ saving() ? 'Saving…' : 'Save panel' }}
            </button>
          </span>
        </ah-panel-foot>
      }
    </ah-panel>
  `,
})
export class PlanPanelSettings {
  /** The plan panel of the Phases page. */
  readonly panel = input.required<PhaseSettingsPlanPanel>();
  /** The models people may choose now: the panel may name only these. */
  readonly catalog = input.required<readonly CatalogModel[]>();
  /** The planning phase's AIU cap per run now; a panel run's cap is this times the run factor. Null: not known. */
  readonly planningCapNanoAiu = input<number | null>(null);
  /** Whether the person is an admin. */
  readonly canEdit = input(false);
  /** Whether a save of the page is going on. */
  readonly busy = input(false);
  readonly saving = input(false);
  /** Why the last save of the panel failed; null when it did not. */
  readonly error = input<CommandErrorView | null>(null);
  /** The change to send: a panel, or null for the built-in one. */
  readonly save = output<PlanPanelChange | null>();

  protected readonly modelDefault = MODEL_DEFAULT;
  protected readonly minPlanners = MIN_PLANNERS;
  protected readonly maxPlanners = MAX_PLANNERS;
  protected readonly maxJudgeModels = MAX_JUDGE_MODELS;

  protected readonly planners = new FormArray<PlannerGroup>([]);
  protected readonly judges = new FormArray<FormControl<string>>([]);
  protected readonly judgeEffort = control(MODEL_DEFAULT);

  private readonly edits = toSignal(
    merge(
      this.planners.valueChanges,
      this.judges.valueChanges,
      this.judgeEffort.valueChanges
    ).pipe(map(() => Symbol())),
    { initialValue: Symbol() }
  );
  /** Moves on when the form is rebuilt from the page. */
  private readonly shown = signal(0);

  /** Whether the person may change the panel: an admin, while the deployment does not set it. */
  protected readonly editable = computed(
    () => this.canEdit() && this.panel().editable
  );

  /** The panel as typed. */
  private readonly typed = computed((): PanelText => {
    this.edits();
    this.shown();
    return {
      planners: this.planners.getRawValue(),
      judges: this.judges.getRawValue(),
      judgeEffort: this.judgeEffort.getRawValue(),
    };
  });

  protected readonly dirty = computed(
    () => !sameText(this.typed(), panelTextOf(this.panel().runsOn))
  );

  /** Why the panel as typed would be refused, by `planner.<i>.model`, `planner.<i>.effort`, `judge.<i>` or `judgeEffort`. */
  protected readonly errors = computed((): ReadonlyMap<string, string> => {
    const out = new Map<string, string>();
    const typed = this.typed();
    for (const [i, p] of typed.planners.entries()) {
      if (!this.listed(p.model))
        out.set(
          `planner.${i}.model`,
          `${p.model || 'A model'} is not in the model catalogue.`
        );
      const problem = this.effortProblem(p.model, p.effort);
      if (problem !== null) out.set(`planner.${i}.effort`, problem);
    }
    const seen = new Set<string>();
    for (const [i, m] of typed.judges.entries()) {
      if (!this.listed(m))
        out.set(
          `judge.${i}`,
          `${m || 'A model'} is not in the model catalogue.`
        );
      else if (seen.has(m)) out.set(`judge.${i}`, `${m} is listed twice.`);
      seen.add(m);
    }
    for (const m of typed.judges) {
      const problem = this.effortProblem(m, typed.judgeEffort);
      if (problem !== null) {
        out.set('judgeEffort', `Judge effort: ${problem}`);
        break;
      }
    }
    return out;
  });

  /** "Team setting", "Built-in" or "Set by the deployment". */
  protected readonly originLabel = computed(
    () => PLAN_PANEL_ORIGIN_LABELS[this.panel().source]
  );

  protected readonly subtitle = computed(() =>
    this.panel().source === 'deployment'
      ? 'Set by the deployment (AHOY_PHASE_CONFIG, planning.planPanel).'
      : 'The models a story planned by panel runs on.'
  );

  /** What one planner may spend: "Up to 16 AIU each, of the run's 80 AIU". */
  protected readonly share = computed(() => {
    const cap = this.planningCapNanoAiu();
    if (cap === null) return '—';
    const run = cap * this.panel().runFactor;
    const count = this.editable()
      ? this.typed().planners.length
      : this.panel().runsOn.panelists.length;
    const each = plannerShareNanoAiu(
      run,
      this.panel().panelistsBudgetPercent,
      count
    );
    return `Up to ${aiuLabel(each)} each, of the run's ${aiuLabel(run)}`;
  });

  protected readonly footnote = computed(() =>
    this.editable()
      ? "Only models in the catalogue below. A change applies to the next planning run of every story planned by panel, stories already sailing included; a run that has started keeps its models. The panel run's cap does not change: it is the Planning phase's times " +
        `${this.panel().runFactor}, so saving needs no spend confirmation.`
      : `A panel run's cap is the Planning phase's times ${this.panel().runFactor}; a story's own budget still bounds it.`
  );

  constructor() {
    // The form follows the saved panel until the admin changes something, and again once what is typed is saved.
    effect(() => {
      const panel = this.panel();
      untracked(() => {
        const pristine =
          this.planners.pristine &&
          this.judges.pristine &&
          this.judgeEffort.pristine;
        if (pristine || !this.dirty()) this.show(panel.runsOn);
      });
    });
    effect(() => {
      const busy = this.busy();
      for (const c of [this.planners, this.judges, this.judgeEffort])
        if (busy) c.disable({ emitEvent: false });
        else c.enable({ emitEvent: false });
    });
  }

  /** A model's name in the catalogue's words. */
  protected label(id: string): string {
    return catalogModelLabel(this.catalog(), id);
  }

  /** The 1-based number of an earlier planner on the same model, or null. */
  protected repeatOf(index: number): number | null {
    const at = earlierPlannerOnSameModel(
      this.typed().planners.map((p) => p.model),
      index
    );
    return at === null ? null : at + 1;
  }

  /** The catalogue's models, with the one chosen now even if it left the catalogue (it is then flagged). */
  protected modelChoices(current: string): string[] {
    const ids = this.catalog().map((m) => m.id);
    return current !== '' && !ids.includes(current) ? [current, ...ids] : ids;
  }

  /** The efforts a model takes (every effort when the catalogue does not say), with the one chosen now. */
  protected effortChoices(model: string, current: string): string[] {
    const choices: string[] = [...(this.effortsOf(model) ?? REASONING_EFFORTS)];
    return current !== MODEL_DEFAULT && !choices.includes(current)
      ? [current, ...choices]
      : choices;
  }

  /** The efforts every judge model takes, with the one chosen now. */
  protected judgeEffortChoices(): string[] {
    const typed = this.typed();
    const choices = REASONING_EFFORTS.filter((e) =>
      typed.judges.every((m) => this.effortsOf(m)?.includes(e) ?? true)
    ) as string[];
    return typed.judgeEffort !== MODEL_DEFAULT &&
      !choices.includes(typed.judgeEffort)
      ? [typed.judgeEffort, ...choices]
      : choices;
  }

  protected addPlanner(): void {
    if (this.planners.length >= MAX_PLANNERS) return;
    this.planners.push(
      plannerGroup({
        model: this.unusedModel(this.typed().planners.map((p) => p.model)),
        effort: MODEL_DEFAULT,
      })
    );
    this.planners.markAsDirty();
  }

  protected removePlanner(index: number): void {
    if (this.planners.length <= MIN_PLANNERS) return;
    this.planners.removeAt(index);
    this.planners.markAsDirty();
  }

  protected addJudge(): void {
    if (this.judges.length >= MAX_JUDGE_MODELS) return;
    this.judges.push(control(this.unusedModel(this.typed().judges)));
    this.judges.markAsDirty();
  }

  protected removeJudge(index: number): void {
    if (this.judges.length <= 1) return;
    this.judges.removeAt(index);
    this.judges.markAsDirty();
  }

  /** Moves a judge model one place up (-1) or down (1). */
  protected moveJudge(index: number, by: -1 | 1): void {
    const to = index + by;
    if (to < 0 || to >= this.judges.length) return;
    const moved = this.judges.at(index);
    this.judges.removeAt(index, { emitEvent: false });
    this.judges.insert(to, moved);
    this.judges.markAsDirty();
  }

  /** Puts the saved panel back. */
  protected reset(): void {
    this.show(this.panel().runsOn);
  }

  protected savePanel(): void {
    if (!this.dirty() || this.busy() || this.errors().size > 0) return;
    const typed = this.typed();
    const effort = (word: string) =>
      isEffort(word) ? { reasoningEffort: word } : {};
    this.save.emit({
      panelists: typed.planners.map((p) => ({
        model: p.model,
        ...effort(p.effort),
      })),
      judge: { models: [...typed.judges], ...effort(typed.judgeEffort) },
    });
  }

  protected saveBuiltIn(): void {
    if (this.busy()) return;
    this.save.emit(null);
  }

  /** Shows a panel in the form and marks it saved. */
  show(panel: PlanPanelConfig): void {
    const text = panelTextOf(panel);
    this.planners.clear({ emitEvent: false });
    for (const p of text.planners)
      this.planners.push(plannerGroup(p), { emitEvent: false });
    this.judges.clear({ emitEvent: false });
    for (const m of text.judges)
      this.judges.push(control(m), { emitEvent: false });
    this.judgeEffort.setValue(text.judgeEffort, { emitEvent: false });
    for (const c of [this.planners, this.judges, this.judgeEffort])
      c.markAsPristine();
    this.shown.update((n) => n + 1);
  }

  private listed(model: string): boolean {
    return this.catalog().some((m) => m.id === model);
  }

  /** The efforts the catalogue says a model takes; null when it does not say or does not list the model. */
  private effortsOf(model: string): readonly ReasoningEffort[] | null {
    return this.catalog().find((m) => m.id === model)?.reasoningEfforts ?? null;
  }

  /** Why `effort` does not suit `model`, or null. */
  private effortProblem(model: string, effort: string): string | null {
    if (effort === MODEL_DEFAULT) return null;
    const efforts = this.effortsOf(model);
    if (efforts === null || efforts.includes(effort as ReasoningEffort))
      return null;
    return efforts.length === 0
      ? `${model} takes no effort.`
      : `${model} takes only ${efforts.join(', ')}.`;
  }

  /** The first catalogue model not used yet, else the first one. */
  private unusedModel(used: readonly string[]): string {
    const ids = this.catalog().map((m) => m.id);
    return ids.find((id) => !used.includes(id)) ?? ids[0] ?? '';
  }
}
