import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { isStale, type ApiError } from '@core/api/api-error';
import type {
  DefectSettings,
  DefectSettingsChange,
  JiraBacklogPreview,
} from '@core/api/types';
import { checkAiuLimit } from '@domain/aiu';
import {
  dailySpendText,
  spendsMore,
  MAX_DEFECT_BUDGET_NANO_AIU,
  prioritiesOf,
  prioritiesText,
  startCapOf,
} from '@domain/defect-settings';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { MAX_BACKLOG_JQL_CHARS } from '@domain/jira-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Field, FieldControl } from '@ui/field/field';
import { Icon } from '@ui/icon/icon';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import { DefectSettingsStore } from './defect-settings-store';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/** The form's value: the watch and its automatic starts as 'on' or 'off', the rest as typed. */
interface FormValue {
  readonly watch: 'on' | 'off';
  readonly jql: string;
  readonly priorities: string;
  readonly auto: 'on' | 'off';
  /** The AIU cap per defect, in AIU. */
  readonly cap: string;
  readonly perDay: string;
  readonly active: string;
  /** The admin's yes to the spend, asked when the change turns automatic starts on. */
  readonly confirm: boolean;
}

/** The saved settings as the form shows them. */
function formValueOf(settings: DefectSettings): FormValue {
  return {
    watch: settings.watchOn ? 'on' : 'off',
    jql: settings.defectsJql ?? '',
    priorities: prioritiesText(settings.priorities),
    auto: settings.autoStart ? 'on' : 'off',
    cap:
      settings.budgetNanoAiu === null
        ? ''
        : formatCap(settings.budgetNanoAiu, 9),
    perDay: String(settings.maxStartsPerDay),
    active: String(settings.maxActive),
    confirm: false,
  };
}

/** What the query's Preview found, or why it could not. */
type PreviewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | {
      readonly kind: 'done';
      readonly jql: string;
      readonly answer: JiraBacklogPreview;
    }
  | { readonly kind: 'failed'; readonly jql: string; readonly error: ApiError };

/**
 * Team settings › Defects (`ahoy-hosted` design §5 "Defect watch"): whether the reconciler reads the team's defects
 * query and the priorities it tries, and whether it starts the defects Ahoy can try by itself. The watch only reads
 * Jira and judges each defect by fixed rules, at 0 AIU, so turning it on asks for no confirmation. Automatic starts
 * spend AIU without a person starting each voyage: turning them on needs an AIU cap per defect and the admin's yes
 * (`confirmSpend`). No repository is set here: the planner finds them from the content repository's routing and the
 * code.
 */
@Component({
  selector: 'ah-defect-settings-page',
  imports: [
    Banner,
    Button,
    Field,
    FieldControl,
    Icon,
    Panel,
    PanelBody,
    PanelFoot,
    PanelHead,
    ReactiveFormsModule,
    SettingsHistory,
    Skeleton,
  ],
  providers: [DefectSettingsStore],
  styles: [
    SECTION_STYLES,
    `
      .fields {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .fields > * {
        max-width: 560px;
      }
      .preview {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .ok,
      .bad {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        font-weight: 600;
      }
      .ok {
        color: var(--status-done-fg);
      }
      .bad {
        color: var(--danger-text);
      }
      dl {
        margin: 0;
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 6px 16px;
      }
      dt {
        font-weight: 600;
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      .confirm {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        margin-top: 8px;
        font-weight: 600;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Defects</h2>
      <span class="ah-muted"
        >Which Jira defects Ahoy watches, which it could try to fix, and whether
        it starts them by itself. The watch reads Jira every 15 minutes and
        lists them in the Backlog, spending no AIU; automatic starts spend AIU
        under the caps set here.</span
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
        aria-label="Loading the defect settings"
      >
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
      </div>
    } @else if (store.page(); as page) {
      @if (!page.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can read the team settings. Ask an admin to make you one in
          People.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head
              heading="Defect watch"
              subtitle="Read with the Jira connection of Team settings › Jira. A defect Ahoy could try says how to reproduce it and what should happen, and has a priority tried here; the planner finds its repositories."
            >
              @if (dirty()) {
                <span ahPanelActions class="ah-tag ah-tag--outline"
                  >Unsaved changes</span
                >
              }
            </ah-panel-head>
            <ah-panel-body>
              @if (store.canEdit()) {
                <div class="fields">
                  <ah-field
                    label="Watch"
                    hint="On: the reconciler reads the query every 15 minutes. Off: the list keeps what it last read."
                  >
                    <select ahInput [formControl]="form.controls.watch">
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                  </ah-field>
                  <ah-field
                    label="Defects query (JQL)"
                    hint="The open defects of your product, for example: project = PROJ AND issuetype = Defect AND statusCategory != Done"
                    [errorText]="jqlError() ?? ''"
                  >
                    <textarea
                      ahInput
                      mono
                      rows="3"
                      spellcheck="false"
                      [attr.maxlength]="maxJql"
                      [formControl]="form.controls.jql"
                    ></textarea>
                  </ah-field>
                  <div class="preview">
                    <button
                      ahButton="soft"
                      size="sm"
                      type="button"
                      [disabled]="
                        value().jql.trim() === '' || preview().kind === 'busy'
                      "
                      (click)="runPreview()"
                    >
                      {{
                        preview().kind === 'busy' ? 'Asking Jira…' : 'Preview'
                      }}
                    </button>
                    @if (previewAnswer(); as answer) {
                      <span class="ok" role="status"
                        ><ah-icon name="check" [size]="12" />{{
                          matchLabel(answer.total)
                        }}</span
                      >
                      @if (answer.first; as first) {
                        <span class="ah-hint"
                          >The first is
                          <span class="ah-key">{{ first.key }}</span>
                          {{ first.summary }}</span
                        >
                      }
                    }
                    @if (previewProblem(); as problem) {
                      <span class="bad" role="status"
                        ><ah-icon name="aground" [size]="12" />{{
                          problem.heading
                        }}</span
                      >
                      <span class="ah-hint">{{ problem.text }}</span>
                    }
                  </div>
                  <ah-field
                    label="Priorities tried"
                    optional
                    hint="As Jira names them, separated by commas. Empty: any priority."
                    [errorText]="prioritiesError() ?? ''"
                  >
                    <input
                      ahInput
                      type="text"
                      autocomplete="off"
                      [formControl]="form.controls.priorities"
                    />
                  </ah-field>
                  <ah-field
                    label="Automatic starts"
                    hint="On: after each check, Ahoy starts a voyage for each defect it can try, the oldest first, under the caps below. The plan and the delivery still wait for a person."
                  >
                    <select ahInput [formControl]="form.controls.auto">
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                  </ah-field>
                  <ah-field
                    label="AIU cap per defect"
                    unit="AIU"
                    [optional]="value().auto === 'off'"
                    hint="The budget of each voyage Ahoy starts, and where Try to fix starts. At most 200 AIU."
                    [errorText]="capError() ?? ''"
                  >
                    <input
                      ahInput
                      inputmode="decimal"
                      autocomplete="off"
                      [formControl]="form.controls.cap"
                    />
                  </ah-field>
                  <ah-field
                    label="Starts per day"
                    hint="The most voyages Ahoy starts by itself in any 24 hours."
                    [errorText]="perDayError() ?? ''"
                  >
                    <input
                      ahInput
                      inputmode="numeric"
                      autocomplete="off"
                      [formControl]="form.controls.perDay"
                    />
                  </ah-field>
                  <ah-field
                    label="Open voyages at once"
                    hint="The most voyages Ahoy started by itself that may be open together; done and cancelled ones don't count."
                    [errorText]="activeError() ?? ''"
                  >
                    <input
                      ahInput
                      inputmode="numeric"
                      autocomplete="off"
                      [formControl]="form.controls.active"
                    />
                  </ah-field>
                  @if (confirmNeeded()) {
                    <ah-banner
                      variant="cost"
                      [heading]="
                        'Ahoy may spend up to ' +
                        (dailySpend() ?? '…') +
                        ' a day by itself'
                      "
                    >
                      @if (alreadyOn()) {
                        This raises what Ahoy may spend by itself.
                      }
                      Each voyage it starts is capped at the AIU cap per defect,
                      and it starts at most the starts per day.
                      <label class="confirm">
                        <input
                          type="checkbox"
                          [formControl]="form.controls.confirm"
                        />
                        Let Ahoy start voyages and spend AIU without a person
                        starting each one.
                      </label>
                    </ah-banner>
                  }
                </div>
              } @else {
                <dl>
                  <dt>Watch</dt>
                  <dd>{{ page.defects.watchOn ? 'On' : 'Off' }}</dd>
                  <dt>Defects query</dt>
                  <dd>
                    @if (page.defects.defectsJql; as jql) {
                      <code>{{ jql }}</code>
                    } @else {
                      <span class="ah-muted">Not set</span>
                    }
                  </dd>
                  <dt>Priorities tried</dt>
                  <dd>
                    {{
                      page.defects.priorities.length === 0
                        ? 'Any'
                        : page.defects.priorities.join(', ')
                    }}
                  </dd>
                  <dt>Automatic starts</dt>
                  <dd>
                    @if (page.defects.autoStart) {
                      On: at most {{ page.defects.maxStartsPerDay }} a day and
                      {{ page.defects.maxActive }} open at once
                    } @else {
                      Off
                    }
                  </dd>
                  <dt>AIU cap per defect</dt>
                  <dd>
                    @if (page.defects.budgetNanoAiu !== null) {
                      {{ aiu(page.defects.budgetNanoAiu) }} AIU
                    } @else {
                      <span class="ah-muted">Not set</span>
                    }
                  </dd>
                </dl>
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
            </ah-panel-body>
            @if (store.canEdit()) {
              <ah-panel-foot>
                <span class="row foot">
                  <button
                    ahButton="ghost"
                    type="button"
                    [disabled]="!dirty() || saving()"
                    (click)="reset()"
                  >
                    Cancel
                  </button>
                  <button
                    ahButton="primary"
                    type="button"
                    [disabled]="!dirty() || saving() || invalid()"
                    (click)="save(page.defects)"
                  >
                    {{ saving() ? 'Saving…' : 'Save' }}
                  </button>
                </span>
              </ah-panel-foot>
            }
          </ah-panel>
        </div>

        <aside class="side">
          <ah-settings-history
            section="Defects"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. Jira is read with the connection of Team settings › Jira."
          />
        </aside>
      </div>
    }
  `,
})
export class DefectSettingsPage {
  protected readonly store = inject(DefectSettingsStore);
  private readonly toasts = inject(ToastService);
  protected readonly maxJql = MAX_BACKLOG_JQL_CHARS;

  /** The settings as typed; they follow the saved settings until the admin changes one. */
  protected readonly form = new FormGroup({
    watch: new FormControl<'on' | 'off'>('off', { nonNullable: true }),
    jql: new FormControl('', { nonNullable: true }),
    priorities: new FormControl('', { nonNullable: true }),
    auto: new FormControl<'on' | 'off'>('off', { nonNullable: true }),
    cap: new FormControl('', { nonNullable: true }),
    perDay: new FormControl('2', { nonNullable: true }),
    active: new FormControl('3', { nonNullable: true }),
    confirm: new FormControl(false, { nonNullable: true }),
  });
  /** The form's whole value, disabled controls too, as a signal. */
  protected readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  /** The saved settings, as the API last answered them. */
  private readonly saved = computed(() => this.store.page()?.defects ?? null);
  /** The priorities as read from the form, parsed once a change. */
  private readonly prioritiesRead = computed(() =>
    prioritiesOf(this.value().priorities)
  );
  /** The AIU cap as read from the form: nano-AIU or null (none), or why it is refused. */
  private readonly capRead = computed(() =>
    checkAiuLimit(this.value().cap, MAX_DEFECT_BUDGET_NANO_AIU)
  );
  private readonly perDayRead = computed(() => startCapOf(this.value().perDay));
  private readonly activeRead = computed(() => startCapOf(this.value().active));
  /** What the form would save, or null while a field is refused. */
  private readonly typed = computed(() => {
    const value = this.value();
    const priorities = this.prioritiesRead();
    const cap = this.capRead();
    const perDay = this.perDayRead();
    const active = this.activeRead();
    if (
      'problem' in priorities ||
      'error' in cap ||
      'problem' in perDay ||
      'problem' in active
    )
      return null;
    const jql = value.jql.trim();
    return {
      watchOn: value.watch === 'on',
      defectsJql: jql === '' ? null : jql,
      priorities: priorities.value,
      autoStart: value.auto === 'on',
      budgetNanoAiu: cap.cap,
      maxStartsPerDay: perDay.value,
      maxActive: active.value,
    };
  });
  /** What saving would change, field by field, or null while a field is refused. */
  private readonly changes = computed((): DefectSettingsChange | null => {
    const saved = this.saved();
    const typed = this.typed();
    if (saved === null || typed === null) return null;
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    return {
      ...(typed.watchOn !== saved.watchOn ? { watchOn: typed.watchOn } : {}),
      ...(typed.defectsJql !== saved.defectsJql
        ? { defectsJql: typed.defectsJql }
        : {}),
      ...(!same(typed.priorities, saved.priorities)
        ? { priorities: [...typed.priorities] }
        : {}),
      ...(typed.autoStart !== saved.autoStart
        ? { autoStart: typed.autoStart }
        : {}),
      ...(typed.budgetNanoAiu !== saved.budgetNanoAiu
        ? { budgetNanoAiu: typed.budgetNanoAiu }
        : {}),
      ...(typed.maxStartsPerDay !== saved.maxStartsPerDay
        ? { maxStartsPerDay: typed.maxStartsPerDay }
        : {}),
      ...(typed.maxActive !== saved.maxActive
        ? { maxActive: typed.maxActive }
        : {}),
    };
  });
  /**
   * Whether saving would let the watch spend more by itself (automatic starts turned on, or the cap per defect or the
   * starts per day raised while they are on), which asks for the admin's yes to the spend. While a field is refused
   * it asks when the form turns them on, so the question does not come and go as the admin types.
   */
  protected readonly confirmNeeded = computed(() => {
    const saved = this.saved();
    if (saved === null) return false;
    const typed = this.typed();
    if (typed !== null) return spendsMore(saved, typed);
    const value = this.value();
    return (
      value.watch === 'on' &&
      value.auto === 'on' &&
      !(saved.watchOn && saved.autoStart)
    );
  });
  /** Whether automatic starts are on in the saved settings, so the confirmation is about raising what they spend. */
  protected readonly alreadyOn = computed(() => {
    const saved = this.saved();
    return saved !== null && saved.watchOn && saved.autoStart;
  });
  /** The most AIU automatic starts may spend in a day, as typed. */
  protected readonly dailySpend = computed(() => {
    const typed = this.typed();
    return typed === null
      ? null
      : dailySpendText(typed.budgetNanoAiu, typed.maxStartsPerDay);
  });
  protected readonly capError = computed(() => {
    const read = this.capRead();
    if ('error' in read)
      return read.error === 'maximum'
        ? 'The cap may be at most 200 AIU.'
        : read.error === 'positive'
          ? 'The cap must be above 0 AIU.'
          : 'Type an amount in AIU, such as 20 or 12.5.';
    return this.value().auto === 'on' && read.cap === null
      ? 'Automatic starts need an AIU cap per defect.'
      : null;
  });
  protected readonly perDayError = computed(() => {
    const read = this.perDayRead();
    return 'problem' in read ? read.problem : null;
  });
  protected readonly activeError = computed(() => {
    const read = this.activeRead();
    return 'problem' in read ? read.problem : null;
  });
  protected readonly confirmMissing = computed(
    () => this.confirmNeeded() && !this.value().confirm
  );
  /** Whether the settings as read differ from the saved ones: spacing alone is no change. A refused field is one. */
  protected readonly dirty = computed(() => {
    const saved = this.saved();
    if (saved === null) return false;
    const changes = this.changes();
    if (changes !== null) return Object.keys(changes).length > 0;
    const was = formValueOf(saved);
    const value = this.value();
    return (
      value.priorities.trim() !== was.priorities ||
      value.cap.trim() !== was.cap ||
      value.perDay.trim() !== was.perDay ||
      value.active.trim() !== was.active
    );
  });
  protected readonly jqlError = computed(() =>
    this.value().watch === 'on' && this.value().jql.trim() === ''
      ? 'The watch needs a defects query.'
      : null
  );
  protected readonly prioritiesError = computed(() => {
    const read = this.prioritiesRead();
    return 'problem' in read ? read.problem : null;
  });
  protected readonly invalid = computed(
    () =>
      this.typed() === null ||
      this.jqlError() !== null ||
      this.capError() !== null ||
      this.confirmMissing()
  );
  protected readonly saving = signal(false);
  private readonly saveError = signal<ApiError | null>(null);
  protected readonly saveFailure = computed(() => {
    const error = this.saveError();
    if (error === null) return null;
    return isStale(error)
      ? {
          ...settingsErrorView(error),
          text: 'Another admin saved these settings first. The page now shows theirs: make your change again.',
        }
      : settingsErrorView(error);
  });
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  protected readonly preview = signal<PreviewState>({ kind: 'idle' });
  protected readonly previewAnswer = computed(() => {
    const p = this.preview();
    return p.kind === 'done' && p.jql === this.value().jql.trim()
      ? p.answer
      : null;
  });
  protected readonly previewProblem = computed(() => {
    const p = this.preview();
    if (p.kind !== 'failed' || p.jql !== this.value().jql.trim()) return null;
    return settingsErrorView(p.error);
  });

  constructor() {
    void this.store.load();
    // The form follows the saved settings until the admin changes one; a save or a change elsewhere moves it on.
    effect(() => {
      const saved = this.saved();
      if (saved !== null && this.form.pristine) this.show(saved);
    });
    effect(() => {
      if (this.saving()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }

  /** An AIU amount as the page shows it: "20" or "12.5". */
  protected aiu(nanoAiu: number): string {
    return formatCap(nanoAiu, 9);
  }

  /** "12 issues match". */
  protected matchLabel(total: number): string {
    if (total === 0) return 'No issue matches';
    return total === 1 ? '1 issue matches' : `${total} issues match`;
  }

  /** Puts the saved settings back. */
  protected reset(): void {
    const saved = this.saved();
    if (saved !== null) this.show(saved);
    this.saveError.set(null);
  }

  /** Shows the saved settings, as yet unchanged. */
  private show(settings: DefectSettings): void {
    this.form.reset(formValueOf(settings));
  }

  /** Asks Jira how many issues the typed query matches. Nothing is saved. */
  protected async runPreview(): Promise<void> {
    const jql = this.value().jql.trim();
    if (jql === '' || this.preview().kind === 'busy') return;
    this.preview.set({ kind: 'busy' });
    const result = await this.store.preview(jql);
    this.preview.set(
      result.ok
        ? { kind: 'done', jql, answer: result.value }
        : { kind: 'failed', jql, error: result.error }
    );
  }

  /** Saves what changed, with the version the page read. */
  protected async save(saved: DefectSettings): Promise<void> {
    const typed = this.typed();
    const changes = this.changes();
    if (
      this.saving() ||
      !this.dirty() ||
      typed === null ||
      changes === null ||
      this.invalid()
    )
      return;
    const body: DefectSettingsChange = {
      ...(saved.version !== null ? { version: saved.version } : {}),
      ...changes,
      ...(this.confirmNeeded() ? { confirmSpend: true } : {}),
    };
    this.saving.set(true);
    this.saveError.set(null);
    const result = await this.store.change(body);
    this.saving.set(false);
    if (!result.ok) {
      this.saveError.set(result.error);
      // Someone else saved first: show theirs rather than send this change over it with their version.
      const now = this.saved();
      if (isStale(result.error) && now !== null) this.show(now);
      return;
    }
    this.show(result.value.defects);
    this.toasts.show(
      typed.autoStart && !saved.autoStart
        ? 'Automatic starts on. Defect settings saved.'
        : typed.watchOn && !saved.watchOn
          ? 'Watch on. Defect settings saved.'
          : 'Defect settings saved.'
    );
  }
}
