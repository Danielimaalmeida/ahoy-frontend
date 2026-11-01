import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { isStale, type ApiError } from '@core/api/api-error';
import type {
  AgentSettings,
  AgentSettingsChange,
  AgentSettingsPage as AgentsPage,
} from '@core/api/types';
import {
  AGENT_JOB_WORDS,
  jobsTurnedOn,
  knowledgeRepoProblem,
  MAX_KNOWLEDGE_REPO_CHARS,
  type AgentJobChoice,
  type AgentJobKey,
} from '@domain/agent-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { Panel, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Table } from '@ui/table/table';
import { ToastService } from '@ui/toast/toast';
import { AgentSettingsStore } from './agent-settings-store';
import { AgentsSpendDialog, type AgentsSpendData } from './agents-spend-dialog';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/** The form's value: each job's profile ('' is "Off") and the knowledge repository as typed. */
type FormValue = Readonly<Record<AgentJobKey | 'knowledgeRepo', string>>;

/** The value of the "Off" choice of a job that can be off. */
const OFF = '';

/** The saved jobs as the form shows them. */
function formValueOf(agents: AgentSettings): FormValue {
  return {
    refinementAgent: agents.refinementAgent,
    diagnosisAgent: agents.diagnosisAgent,
    storyDraftAgent: agents.storyDraftAgent ?? OFF,
    knowledgeAgent: agents.knowledgeAgent ?? OFF,
    knowledgeRepo: agents.knowledgeRepo ?? '',
  };
}

/** The jobs a form value chooses; "Off" is null, and a job that cannot be off keeps its saved profile. */
function choiceOf(value: FormValue, saved: AgentSettings): AgentJobChoice {
  const or = (typed: string, fallback: string) =>
    typed === OFF ? fallback : typed;
  return {
    refinementAgent: or(value.refinementAgent, saved.refinementAgent),
    diagnosisAgent: or(value.diagnosisAgent, saved.diagnosisAgent),
    storyDraftAgent:
      value.storyDraftAgent === OFF ? null : value.storyDraftAgent,
    knowledgeAgent: value.knowledgeAgent === OFF ? null : value.knowledgeAgent,
  };
}

/**
 * Team settings › Agents: which of the content repository's agent profiles runs each job Ahoy starts on its own or on
 * request. Turning on Story drafts or Business-rule review spends AIU outside a story's budget, so saving that asks the
 * admin to confirm first. A job whose profile the content repository no longer has is paused until another is chosen.
 */
@Component({
  selector: 'ah-agent-settings-page',
  imports: [
    Banner,
    Button,
    Field,
    FieldControl,
    Panel,
    PanelFoot,
    PanelHead,
    ReactiveFormsModule,
    SettingsHistory,
    Skeleton,
    Table,
  ],
  providers: [AgentSettingsStore],
  styles: [
    SECTION_STYLES,
    `
      .jobs {
        overflow-x: auto;
      }
      .job {
        font-weight: 600;
      }
      .when {
        display: block;
        font-weight: 400;
      }
      select {
        max-width: 240px;
      }
      .repo {
        max-width: 420px;
      }
      .warnings {
        border-top: 1px solid var(--line-soft);
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>Agents</h2>
      <span class="ah-muted"
        >Which of the content repository's agent profiles runs each job Ahoy
        starts on its own or on request.</span
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
        aria-label="Loading the agents' settings"
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
      }
      @if (page.profiles.problem; as problem) {
        <ah-banner
          variant="notice"
          heading="The content repository can't be read"
          [tech]="problem"
        >
          Its agent profiles can't be listed, so no job can get another profile
          now. Turning a job off and the knowledge repository still save.
        </ah-banner>
      }
      @for (gone of page.missing; track gone.job) {
        <ah-banner variant="error" [heading]="gone.name + ' is paused'">
          {{ gone.profile }} is not in the content repository at
          {{ commitLabel(page) }} any more. Its runs fail before they start
          until an admin chooses another profile{{
            isOptional(gone.job) ? ', or turns it off' : ''
          }}.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head
              heading="Which agent does which job"
              [subtitle]="profilesLine(page)"
            >
              @if (dirty()) {
                <span ahPanelActions class="ah-tag ah-tag--outline"
                  >Unsaved changes</span
                >
              }
            </ah-panel-head>
            <div class="jobs">
              <table ahTable aria-label="Agent jobs">
                <thead>
                  <tr>
                    <th scope="col">Job</th>
                    <th scope="col">Profile</th>
                    <th scope="col">Spends AIU</th>
                  </tr>
                </thead>
                <tbody>
                  @for (job of jobs; track job.key) {
                    <tr>
                      <th scope="row" class="job">
                        {{ job.name
                        }}<span class="ah-cell-sub when">{{ job.when }}</span>
                      </th>
                      <td>
                        @if (store.canEdit()) {
                          <select
                            ahInput
                            mono
                            [formControl]="form.controls[job.key]"
                            [attr.aria-label]="job.name + ' profile'"
                          >
                            @if (job.optional) {
                              <option [value]="off">Off</option>
                            }
                            @for (name of choices(page, job.key); track name) {
                              <option [value]="name">
                                {{ name
                                }}{{ isGone(page, name) ? ' (gone)' : '' }}
                              </option>
                            }
                          </select>
                        } @else if (page.agents[job.key]; as profile) {
                          <span class="ah-mono">{{ profile }}</span>
                        } @else {
                          <span class="ah-hint">Off</span>
                        }
                      </td>
                      <td>
                        <span class="ah-hint">{{ job.spends }}</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="body warnings">
              @for (job of turnedOn(); track job.key) {
                <ah-banner
                  variant="notice"
                  [heading]="
                    'Turning on ' +
                    job.name +
                    ' spends AIU outside a story’s budget'
                  "
                >
                  {{ job.warning }} Saving asks you to confirm.
                </ah-banner>
              }
              @if (store.canEdit()) {
                <div class="repo">
                  <ah-field
                    label="Knowledge repository"
                    optional
                    hint="Where Business-rule review opens its pull requests (owner/name). Empty, no pull request is opened: the proposal stays on the review."
                    [errorText]="repoError() ?? ''"
                  >
                    <input
                      ahInput
                      mono
                      type="text"
                      autocomplete="off"
                      spellcheck="false"
                      [attr.maxlength]="maxRepo"
                      [formControl]="form.controls.knowledgeRepo"
                    />
                  </ah-field>
                </div>
              } @else {
                <span class="ah-hint"
                  >Knowledge repository:
                  <span class="ah-mono">{{
                    page.agents.knowledgeRepo ??
                      'none (the proposals stay on the reviews)'
                  }}</span></span
                >
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
                    [disabled]="!dirty() || busy()"
                    (click)="reset()"
                  >
                    Cancel
                  </button>
                  <button
                    ahButton="primary"
                    type="button"
                    [disabled]="!dirty() || busy() || repoError() !== null"
                    (click)="save(page.agents)"
                  >
                    {{
                      saving()
                        ? 'Saving…'
                        : turnedOn().length > 0
                          ? 'Save…'
                          : 'Save'
                    }}
                  </button>
                </span>
              </ah-panel-foot>
            }
          </ah-panel>
        </div>

        <aside class="side">
          <ah-settings-history
            section="Agents"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good. The content repository and its branch are set in the deployment."
          />
        </aside>
      </div>
    }
  `,
})
export class AgentSettingsPage {
  protected readonly store = inject(AgentSettingsStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  protected readonly jobs = AGENT_JOB_WORDS;
  protected readonly off = OFF;
  protected readonly maxRepo = MAX_KNOWLEDGE_REPO_CHARS;

  /** The jobs as chosen and the repository as typed; it follows the saved jobs until the admin changes one. */
  protected readonly form = new FormGroup({
    refinementAgent: new FormControl(OFF, { nonNullable: true }),
    diagnosisAgent: new FormControl(OFF, { nonNullable: true }),
    storyDraftAgent: new FormControl(OFF, { nonNullable: true }),
    knowledgeAgent: new FormControl(OFF, { nonNullable: true }),
    knowledgeRepo: new FormControl('', { nonNullable: true }),
  });
  /** The form's whole value, disabled controls too, as a signal. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  /** The saved jobs, as the API last answered them. */
  private readonly agents = computed(() => this.store.page()?.agents ?? null);
  protected readonly dirty = computed(() => {
    const agents = this.agents();
    if (agents === null) return false;
    const saved = formValueOf(agents);
    const value = this.value();
    return (
      AGENT_JOB_WORDS.some((job) => saved[job.key] !== value[job.key]) ||
      saved.knowledgeRepo !== value.knowledgeRepo.trim()
    );
  });
  /** The jobs the form turns on: saving them asks for a confirmation. */
  protected readonly turnedOn = computed(() => {
    const agents = this.agents();
    if (agents === null) return [];
    return jobsTurnedOn(agents, choiceOf(this.value(), agents));
  });
  protected readonly repoError = computed(() =>
    knowledgeRepoProblem(this.value().knowledgeRepo)
  );
  /** Waiting for the admin to confirm what turning a job on spends. */
  private readonly confirming = signal(false);
  protected readonly saving = signal(false);
  /** Saving, or asking first: nothing else can be pressed. */
  protected readonly busy = computed(() => this.saving() || this.confirming());
  private readonly saveError = signal<ApiError | null>(null);
  protected readonly saveFailure = computed(() => {
    const error = this.saveError();
    if (error === null) return null;
    return isStale(error)
      ? {
          ...settingsErrorView(error),
          text: 'Another admin saved the agents’ jobs first. The page now shows theirs: make your change again.',
        }
      : settingsErrorView(error);
  });
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
    // The form follows the saved jobs until the admin changes one; a save or a change elsewhere moves it on.
    effect(() => {
      const agents = this.agents();
      if (agents !== null && this.form.pristine) this.show(agents);
    });
    effect(() => {
      if (this.busy()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }

  /** "Profiles from the content repository at a1b2c3d." */
  protected profilesLine(page: AgentsPage): string {
    return page.profiles.commit === null
      ? 'Profiles from the content repository, which cannot be read now.'
      : `Profiles from the content repository at ${this.commitLabel(page)}.`;
  }

  /** The commit the profiles were read at, short. */
  protected commitLabel(page: AgentsPage): string {
    return page.profiles.commit?.slice(0, 7) ?? 'its HEAD';
  }

  /** Whether a job can be turned off. */
  protected isOptional(job: AgentJobKey): boolean {
    return AGENT_JOB_WORDS.some((j) => j.key === job && j.optional);
  }

  /** Whether a profile is one HEAD no longer has. */
  protected isGone(page: AgentsPage, name: string): boolean {
    return (
      page.profiles.problem === null && !page.profiles.names.includes(name)
    );
  }

  /** The profiles a job can take: those at HEAD, with its saved one even if gone. */
  protected choices(page: AgentsPage, job: AgentJobKey): string[] {
    const saved = page.agents[job];
    const names = [...page.profiles.names];
    return saved !== null && !names.includes(saved) ? [saved, ...names] : names;
  }

  /** Puts the saved jobs back. */
  protected reset(): void {
    const agents = this.agents();
    if (agents !== null) this.show(agents);
    this.saveError.set(null);
  }

  /** Shows the saved jobs, as yet unchanged. */
  private show(agents: AgentSettings): void {
    this.form.reset(formValueOf(agents));
  }

  /** Saves what changed; a change that turns a job on asks first and is sent with `confirmSpend`. */
  protected async save(agents: AgentSettings): Promise<void> {
    if (this.busy() || !this.dirty()) return;
    const value = this.form.getRawValue();
    const draft = choiceOf(value, agents);
    const turnedOn = this.turnedOn();
    if (turnedOn.length > 0) {
      this.confirming.set(true);
      const ref = this.dialogs.open<boolean, AgentsSpendData>(
        AgentsSpendDialog,
        { data: { jobs: turnedOn }, width: '480px' }
      );
      const confirmed = (await firstValueFrom(ref.closed)) === true;
      this.confirming.set(false);
      if (!confirmed) return;
    }
    const repo = value.knowledgeRepo.trim();
    const changed = (job: AgentJobKey) => draft[job] !== agents[job];
    const body: AgentSettingsChange = {
      ...(agents.version !== null ? { version: agents.version } : {}),
      ...(changed('refinementAgent')
        ? { refinementAgent: draft.refinementAgent }
        : {}),
      ...(changed('diagnosisAgent')
        ? { diagnosisAgent: draft.diagnosisAgent }
        : {}),
      ...(changed('storyDraftAgent')
        ? { storyDraftAgent: draft.storyDraftAgent }
        : {}),
      ...(changed('knowledgeAgent')
        ? { knowledgeAgent: draft.knowledgeAgent }
        : {}),
      ...(repo !== (agents.knowledgeRepo ?? '')
        ? { knowledgeRepo: repo === '' ? null : repo }
        : {}),
      ...(turnedOn.length > 0 ? { confirmSpend: true } : {}),
    };
    this.saving.set(true);
    this.saveError.set(null);
    const result = await this.store.change(body);
    this.saving.set(false);
    if (!result.ok) {
      this.saveError.set(result.error);
      // Someone else saved first: show theirs rather than send this change over it with their version.
      const now = this.agents();
      if (isStale(result.error) && now !== null) this.show(now);
      return;
    }
    this.show(result.value.agents);
    this.toasts.show(
      turnedOn.length > 0
        ? `${turnedOn.map((j) => j.name).join(' and ')} on. Agents' jobs saved.`
        : "Agents' jobs saved."
    );
  }
}
