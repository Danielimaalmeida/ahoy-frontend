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
  allowedHostsOf,
  allowedHostsText,
  dailySpendText,
  evidenceDaysOf,
  MAX_ALLOWED_HOSTS,
  MAX_EVIDENCE_DAYS,
  spendsMore,
  MAX_DEFECT_BUDGET_NANO_AIU,
  MAX_REPRODUCTIONS_PER_DAY,
  prioritiesOf,
  prioritiesText,
  reproduceModeLabel,
  reproductionCapOf,
  reproductionSpendsMore,
  startCapOf,
} from '@domain/defect-settings';
import { qnumberOf } from '@domain/people-settings';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { MAX_BACKLOG_JQL_CHARS } from '@domain/jira-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Field, FieldControl } from '@ui/field/field';
import { Icon } from '@ui/icon/icon';
import { RouterLink } from '@angular/router';
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
  /** The qnumber of the person the voyages Ahoy starts by itself run as. */
  readonly startAs: string;
  /** The AIU cap per defect, in AIU. */
  readonly cap: string;
  readonly perDay: string;
  readonly active: string;
  /** Whether the watch reproduces a defect before it starts it by itself. */
  readonly reproduce: 'on' | 'off';
  /** What the verdict decides. */
  readonly mode: 'advisory' | 'required';
  /** The id of the environment defects are reproduced in; '' for none. */
  readonly environment: string;
  readonly reproductionsPerDay: string;
  /** The hosts an environment's origins may be on, one per line. */
  readonly hosts: string;
  /** Days a reproduction's screenshots and recordings are kept. */
  readonly evidenceDays: string;
  /** The admin's yes to the spend, asked when the change lets Ahoy spend more by itself. */
  readonly confirm: boolean;
}

/** The saved settings as the form shows them. */
function formValueOf(settings: DefectSettings): FormValue {
  return {
    watch: settings.watchOn ? 'on' : 'off',
    jql: settings.defectsJql ?? '',
    priorities: prioritiesText(settings.priorities),
    auto: settings.autoStart ? 'on' : 'off',
    startAs: settings.startAs ?? '',
    cap:
      settings.budgetNanoAiu === null
        ? ''
        : formatCap(settings.budgetNanoAiu, 9),
    perDay: String(settings.maxStartsPerDay),
    active: String(settings.maxActive),
    reproduce: settings.reproduceOn ? 'on' : 'off',
    mode: settings.reproduceMode,
    environment: settings.reproduceEnvironmentId ?? '',
    reproductionsPerDay: String(settings.maxReproductionsPerDay),
    hosts: allowedHostsText(settings.reproduceAllowedHosts),
    evidenceDays: String(settings.evidenceDays),
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
 * (`confirmSpend`). Reproduction (design §5 "Defect reproduction") has the watch try each defect in a browser on an
 * environment of Team settings › Environments first; it spends AIU too, so turning it on or raising its daily cap
 * asks for the same yes. No repository is set here: the planner finds them from the content repository's routing and
 * the code.
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
    RouterLink,
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
      .fields > fieldset {
        max-width: none;
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
      fieldset {
        margin: 0;
        padding: 14px 0 0;
        border: 0;
        border-top: 1px solid var(--line-soft);
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 0;
      }
      legend {
        padding: 0 8px 0 0;
        font-weight: 700;
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
                    label="Start as"
                    [optional]="value().auto === 'off'"
                    hint="The qnumber of the person who owns the voyages Ahoy starts by itself. Their Copilot token runs them, and they get the plan and the delivery to review."
                    [errorText]="startAsError() ?? ''"
                  >
                    <input
                      ahInput
                      autocomplete="off"
                      spellcheck="false"
                      placeholder="q123456"
                      [formControl]="form.controls.startAs"
                    />
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
                  <fieldset>
                    <legend>Reproduction</legend>
                    <ah-field
                      label="Reproduce before starting"
                      hint="On: after each check, Ahoy tries each defect it could fix in a browser on the environment below, the oldest first, and shows the verdict in the Backlog. Each try spends AIU, up to the Defect reproduction cap of Team settings › Phases."
                    >
                      <select ahInput [formControl]="form.controls.reproduce">
                        <option value="off">Off</option>
                        <option value="on">On</option>
                      </select>
                    </ah-field>
                    <ah-field
                      label="Environment"
                      [optional]="value().reproduce === 'off'"
                      hint="Where defects are reproduced. Reproduce in the Backlog uses it too."
                      [errorText]="environmentError() ?? ''"
                    >
                      <select ahInput [formControl]="form.controls.environment">
                        <option value="">None</option>
                        @for (e of environmentChoices(); track e.id) {
                          <option [value]="e.id">{{ e.name }}</option>
                        }
                      </select>
                    </ah-field>
                    @if (noEnvironments()) {
                      <span class="ah-hint"
                        >No environment is listed yet. Add one in
                        <a routerLink="/settings/environments"
                          >Team settings › Environments</a
                        >.</span
                      >
                    }
                    <ah-field
                      label="What the verdict decides"
                      hint="Required: a defect that was not reproduced, or whose reproduction was inconclusive, is not started by Ahoy and waits for a person."
                    >
                      <select ahInput [formControl]="form.controls.mode">
                        <option value="advisory">
                          {{ modeLabel('advisory') }}
                        </option>
                        <option value="required">
                          {{ modeLabel('required') }}
                        </option>
                      </select>
                    </ah-field>
                    <ah-field
                      label="Reproductions per day"
                      [hint]="
                        'The most reproductions in any 24 hours, the ones asked for in the Backlog included. At most ' +
                        maxReproductions +
                        '.'
                      "
                      [errorText]="reproductionsError() ?? ''"
                    >
                      <input
                        ahInput
                        inputmode="numeric"
                        autocomplete="off"
                        [formControl]="form.controls.reproductionsPerDay"
                      />
                    </ah-field>
                    <ah-field
                      label="Allowed hosts"
                      [hint]="
                        'One per line: the hosts an environment may open, such as test.example.com, or *.example.com for every subdomain (not example.com itself). At most ' +
                        maxHosts +
                        '. With none, no environment can be saved or tested, and while reproduction is on its environment must stay on them. The cluster must let reproductions reach them too.'
                      "
                      [errorText]="hostsError() ?? ''"
                    >
                      <textarea
                        ahInput
                        mono
                        rows="3"
                        spellcheck="false"
                        autocomplete="off"
                        [formControl]="form.controls.hosts"
                      ></textarea>
                    </ah-field>
                    <ah-field
                      label="Days screenshots and recordings are kept"
                      [hint]="
                        'They show the environment as its account saw it, to anyone allowed into Ahoy. 0 keeps none; at most ' +
                        maxEvidenceDays +
                        '. A change applies to reproductions that end after it.'
                      "
                      [errorText]="evidenceDaysError() ?? ''"
                    >
                      <input
                        ahInput
                        inputmode="numeric"
                        autocomplete="off"
                        [formControl]="form.controls.evidenceDays"
                      />
                    </ah-field>
                  </fieldset>
                  @if (confirmNeeded()) {
                    <ah-banner variant="cost" [heading]="confirmHeading()">
                      @if (startsConfirm()) {
                        @if (alreadyOn() && startAsChanged()) {
                          The voyages will run on another person's Copilot
                          token.
                        } @else if (alreadyOn()) {
                          This raises what Ahoy may spend by itself.
                        }
                        Each voyage it starts is capped at the AIU cap per
                        defect, and it starts at most the starts per day.
                      }
                      @if (reproductionConfirm()) {
                        Each reproduction is capped at the Defect reproduction
                        cap of Team settings › Phases, and Ahoy runs at most the
                        reproductions per day.
                      }
                      <label class="confirm">
                        <input
                          type="checkbox"
                          [formControl]="form.controls.confirm"
                        />
                        {{
                          startsConfirm()
                            ? 'Let Ahoy start voyages and spend AIU without a person starting each one.'
                            : 'Let Ahoy reproduce defects and spend AIU without a person asking for each one.'
                        }}
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
                  <dt>Start as</dt>
                  <dd>
                    @if (page.defects.startAs; as startAs) {
                      {{ page.defects.startAsName ?? startAs }}
                      @if (page.defects.startAsName) {
                        <span class="ah-muted">({{ startAs }})</span>
                      }
                    } @else {
                      <span class="ah-muted">Not set</span>
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
                  <dt>Reproduction</dt>
                  <dd>
                    @if (page.defects.reproduceOn) {
                      On, in {{ savedEnvironmentName() ?? 'an environment' }}:
                      at most {{ page.defects.maxReproductionsPerDay }} a day.
                      {{ modeLabel(page.defects.reproduceMode) }}
                    } @else {
                      Off
                    }
                  </dd>
                  <dt>Allowed hosts</dt>
                  <dd>
                    @if (page.defects.reproduceAllowedHosts.length > 0) {
                      {{ page.defects.reproduceAllowedHosts.join(', ') }}
                    } @else {
                      <span class="ah-muted">None</span>
                    }
                  </dd>
                  <dt>Screenshots and recordings kept</dt>
                  <dd>
                    {{
                      page.defects.evidenceDays === 0
                        ? 'Not kept'
                        : page.defects.evidenceDays === 1
                          ? '1 day'
                          : page.defects.evidenceDays + ' days'
                    }}
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
    startAs: new FormControl('', { nonNullable: true }),
    cap: new FormControl('', { nonNullable: true }),
    perDay: new FormControl('2', { nonNullable: true }),
    active: new FormControl('3', { nonNullable: true }),
    reproduce: new FormControl<'on' | 'off'>('off', { nonNullable: true }),
    mode: new FormControl<'advisory' | 'required'>('advisory', {
      nonNullable: true,
    }),
    environment: new FormControl('', { nonNullable: true }),
    reproductionsPerDay: new FormControl('5', { nonNullable: true }),
    hosts: new FormControl('', { nonNullable: true }),
    evidenceDays: new FormControl('7', { nonNullable: true }),
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
  /** The person to start as: a qnumber, null (none), or why it is refused. */
  private readonly startAsRead = computed(
    (): { readonly value: string | null } | { readonly problem: string } =>
      this.value().startAs.trim() === ''
        ? { value: null }
        : qnumberOf(this.value().startAs)
  );
  private readonly perDayRead = computed(() => startCapOf(this.value().perDay));
  private readonly activeRead = computed(() => startCapOf(this.value().active));
  private readonly reproductionsRead = computed(() =>
    reproductionCapOf(this.value().reproductionsPerDay)
  );
  protected readonly maxReproductions = MAX_REPRODUCTIONS_PER_DAY;
  private readonly hostsRead = computed(() =>
    allowedHostsOf(this.value().hosts)
  );
  private readonly evidenceDaysRead = computed(() =>
    evidenceDaysOf(this.value().evidenceDays)
  );
  protected readonly maxHosts = MAX_ALLOWED_HOSTS;
  protected readonly maxEvidenceDays = MAX_EVIDENCE_DAYS;
  /**
   * The environments the select offers: the ones read, or, when they could not be, only the saved one, so the
   * setting still shows.
   */
  protected readonly environmentChoices = computed(
    (): readonly { readonly id: string; readonly name: string }[] => {
      const read = this.store.environments();
      if (read !== null) return read;
      const saved = this.saved()?.reproduceEnvironmentId ?? null;
      return saved === null ? [] : [{ id: saved, name: 'The saved one' }];
    }
  );
  /** Whether the environments were read and there is none to choose. */
  protected readonly noEnvironments = computed(
    () => this.store.environments()?.length === 0
  );
  /** The name of the environment the saved settings reproduce in, once the environments are read. */
  protected readonly savedEnvironmentName = computed(() => {
    const id = this.saved()?.reproduceEnvironmentId ?? null;
    return this.store.environments()?.find((e) => e.id === id)?.name ?? null;
  });
  /** What the form would save, or null while a field is refused. */
  private readonly typed = computed(() => {
    const value = this.value();
    const priorities = this.prioritiesRead();
    const cap = this.capRead();
    const perDay = this.perDayRead();
    const active = this.activeRead();
    const startAs = this.startAsRead();
    const reproductions = this.reproductionsRead();
    const hosts = this.hostsRead();
    const evidenceDays = this.evidenceDaysRead();
    if (
      'problem' in reproductions ||
      'problem' in hosts ||
      'problem' in evidenceDays ||
      'problem' in priorities ||
      'problem' in startAs ||
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
      startAs: startAs.value,
      budgetNanoAiu: cap.cap,
      maxStartsPerDay: perDay.value,
      maxActive: active.value,
      reproduceOn: value.reproduce === 'on',
      reproduceMode: value.mode,
      reproduceEnvironmentId:
        value.environment === '' ? null : value.environment,
      maxReproductionsPerDay: reproductions.value,
      reproduceAllowedHosts: hosts.value,
      evidenceDays: evidenceDays.value,
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
      ...(typed.startAs !== saved.startAs ? { startAs: typed.startAs } : {}),
      ...(typed.budgetNanoAiu !== saved.budgetNanoAiu
        ? { budgetNanoAiu: typed.budgetNanoAiu }
        : {}),
      ...(typed.maxStartsPerDay !== saved.maxStartsPerDay
        ? { maxStartsPerDay: typed.maxStartsPerDay }
        : {}),
      ...(typed.maxActive !== saved.maxActive
        ? { maxActive: typed.maxActive }
        : {}),
      ...(typed.reproduceOn !== saved.reproduceOn
        ? { reproduceOn: typed.reproduceOn }
        : {}),
      ...(typed.reproduceMode !== saved.reproduceMode
        ? { reproduceMode: typed.reproduceMode }
        : {}),
      ...(typed.reproduceEnvironmentId !== saved.reproduceEnvironmentId
        ? { reproduceEnvironmentId: typed.reproduceEnvironmentId }
        : {}),
      ...(typed.maxReproductionsPerDay !== saved.maxReproductionsPerDay
        ? { maxReproductionsPerDay: typed.maxReproductionsPerDay }
        : {}),
      ...(!same(typed.reproduceAllowedHosts, saved.reproduceAllowedHosts)
        ? { reproduceAllowedHosts: [...typed.reproduceAllowedHosts] }
        : {}),
      ...(typed.evidenceDays !== saved.evidenceDays
        ? { evidenceDays: typed.evidenceDays }
        : {}),
    };
  });
  /**
   * Whether saving would let the watch spend more by itself (automatic starts turned on, or the cap per defect or the
   * starts per day raised while they are on), which asks for the admin's yes to the spend. While a field is refused
   * it asks when the form turns them on, so the question does not come and go as the admin types.
   */
  protected readonly startsConfirm = computed(() => {
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
  /**
   * Whether saving would let reproduction spend more by itself: it is turned on, or its daily cap is raised while it
   * is on. While a field is refused it asks when the form turns it on.
   */
  protected readonly reproductionConfirm = computed(() => {
    const saved = this.saved();
    if (saved === null) return false;
    const typed = this.typed();
    if (typed !== null) return reproductionSpendsMore(saved, typed);
    return this.value().reproduce === 'on' && !saved.reproduceOn;
  });
  /** Whether the change needs the admin's yes to the spend: for automatic starts, for reproduction, or for both. */
  protected readonly confirmNeeded = computed(
    () => this.startsConfirm() || this.reproductionConfirm()
  );
  /** "Ahoy may spend up to 40 AIU a day by itself", or what reproduction spends when only it asks. */
  protected readonly confirmHeading = computed(() =>
    this.startsConfirm()
      ? `Ahoy may spend up to ${this.dailySpend() ?? '…'} a day by itself`
      : 'Ahoy will spend AIU reproducing defects by itself'
  );
  /** Whether automatic starts are on in the saved settings, so the confirmation is about raising what they spend. */
  protected readonly alreadyOn = computed(() => {
    const saved = this.saved();
    return saved !== null && saved.watchOn && saved.autoStart;
  });
  /** Whether the form names another person to start as than the saved settings. */
  protected readonly startAsChanged = computed(() => {
    const saved = this.saved();
    const typed = this.typed();
    return saved !== null && typed !== null && typed.startAs !== saved.startAs;
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
  protected readonly startAsError = computed(() => {
    const read = this.startAsRead();
    if ('problem' in read) return read.problem;
    return this.value().auto === 'on' && read.value === null
      ? 'Automatic starts need a person to start as: their Copilot token runs the voyages.'
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
  protected readonly reproductionsError = computed(() => {
    const read = this.reproductionsRead();
    return 'problem' in read ? read.problem : null;
  });
  protected readonly hostsError = computed(() => {
    const read = this.hostsRead();
    return 'problem' in read ? read.problem : null;
  });
  protected readonly evidenceDaysError = computed(() => {
    const read = this.evidenceDaysRead();
    return 'problem' in read ? read.problem : null;
  });
  protected readonly environmentError = computed(() =>
    this.value().reproduce === 'on' && this.value().environment === ''
      ? 'Reproduction needs an environment to reproduce defects in.'
      : null
  );
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
      value.startAs.trim().toLowerCase() !== was.startAs ||
      value.cap.trim() !== was.cap ||
      value.perDay.trim() !== was.perDay ||
      value.active.trim() !== was.active ||
      value.reproductionsPerDay.trim() !== was.reproductionsPerDay ||
      value.hosts.trim() !== was.hosts ||
      value.evidenceDays.trim() !== was.evidenceDays
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
      this.startAsError() !== null ||
      this.environmentError() !== null ||
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

  /** What a mode does with the verdict, in a few words. */
  protected modeLabel(mode: 'advisory' | 'required'): string {
    return reproduceModeLabel(mode);
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
        : typed.reproduceOn && !saved.reproduceOn
          ? 'Reproduction on. Defect settings saved.'
          : typed.watchOn && !saved.watchOn
            ? 'Watch on. Defect settings saved.'
            : 'Defect settings saved.'
    );
  }
}
