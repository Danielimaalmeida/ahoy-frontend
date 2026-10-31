import { Component, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ApiError } from '@core/api/api-error';
import type {
  AgentSettings,
  AgentSettingsChange,
  AgentSettingsPage as AgentsPage,
} from '@core/api/types';
import {
  AGENT_JOB_WORDS,
  jobsTurnedOn,
  knowledgeRepoProblem,
  spendWarning,
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

/** The jobs as chosen on the page, with the knowledge repository as typed. */
interface Draft extends AgentJobChoice {
  readonly knowledgeRepo: string;
}

/** The value of the "Off" choice of a job that can be off. */
const OFF = '';

function draftOf(agents: AgentSettings): Draft {
  return {
    refinementAgent: agents.refinementAgent,
    diagnosisAgent: agents.diagnosisAgent,
    storyDraftAgent: agents.storyDraftAgent,
    knowledgeAgent: agents.knowledgeAgent,
    knowledgeRepo: agents.knowledgeRepo ?? '',
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
      <div class="ah-panel loading" aria-label="Loading the agents' settings">
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
                            [attr.aria-label]="job.name + ' profile'"
                            [disabled]="saving()"
                            (change)="choose(job.key, $event)"
                          >
                            @if (job.optional) {
                              <option
                                [value]="off"
                                [selected]="chosen(job.key) === null"
                              >
                                Off
                              </option>
                            }
                            @for (name of choices(page, job.key); track name) {
                              <option
                                [value]="name"
                                [selected]="chosen(job.key) === name"
                              >
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
                  {{ warning(job) }} Saving asks you to confirm.
                </ah-banner>
              }
              @if (store.canEdit()) {
                <div class="repo">
                  <ah-field
                    label="Knowledge repository"
                    optional
                    hint="Where Business-rule review opens its pull requests (owner/name). Empty, a person opens them from the review."
                    [errorText]="repoError() ?? ''"
                  >
                    <input
                      ahInput
                      mono
                      type="text"
                      autocomplete="off"
                      spellcheck="false"
                      maxlength="200"
                      [value]="draft()?.knowledgeRepo ?? ''"
                      [disabled]="saving()"
                      (input)="typeRepo($event)"
                    />
                  </ah-field>
                </div>
              } @else {
                <span class="ah-hint"
                  >Knowledge repository:
                  <span class="ah-mono">{{
                    page.agents.knowledgeRepo ??
                      'none (a person opens the pull requests)'
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
                    [disabled]="!dirty() || saving()"
                    (click)="reset()"
                  >
                    Cancel
                  </button>
                  <button
                    ahButton="primary"
                    type="button"
                    [disabled]="!dirty() || saving() || repoError() !== null"
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
  protected readonly warning = spendWarning;

  /** The jobs as chosen; they follow the saved ones until the admin changes one. */
  protected readonly draft = signal<Draft | null>(null);
  /** The saved jobs the draft started from. */
  private readonly saved = computed(() => {
    const agents = this.store.page()?.agents;
    return agents === undefined ? null : draftOf(agents);
  });
  protected readonly dirty = computed(() => {
    const saved = this.saved();
    const draft = this.draft();
    if (saved === null || draft === null) return false;
    return (
      AGENT_JOB_WORDS.some((job) => saved[job.key] !== draft[job.key]) ||
      saved.knowledgeRepo !== draft.knowledgeRepo.trim()
    );
  });
  /** The jobs the draft turns on: saving them asks for a confirmation. */
  protected readonly turnedOn = computed(() => {
    const saved = this.saved();
    const draft = this.draft();
    return saved === null || draft === null ? [] : jobsTurnedOn(saved, draft);
  });
  protected readonly repoError = computed(() =>
    knowledgeRepoProblem(this.draft()?.knowledgeRepo ?? '')
  );
  protected readonly saving = signal(false);
  private readonly saveError = signal<ApiError | null>(null);
  protected readonly saveFailure = computed(() => {
    const error = this.saveError();
    return error === null ? null : settingsErrorView(error);
  });
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
    // The draft follows the saved jobs until the admin changes one; a save or a change elsewhere moves it on.
    let last: Draft | null = null;
    effect(() => {
      const saved = this.saved();
      if (saved === null) return;
      const draft = this.draft();
      const untouched =
        draft === null || last === null || sameDraft(draft, last);
      last = saved;
      if (untouched) this.draft.set(saved);
    });
  }

  /** The profile a job has in the draft; undefined before the page is read. */
  protected chosen(job: AgentJobKey): string | null | undefined {
    return this.draft()?.[job];
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

  protected choose(job: AgentJobKey, event: Event): void {
    const target = event.target;
    const draft = this.draft();
    if (!(target instanceof HTMLSelectElement) || draft === null) return;
    const value = target.value === OFF ? null : target.value;
    if (value === null && !this.isOptional(job)) return;
    this.draft.set(withJob(draft, job, value));
    this.saveError.set(null);
  }

  protected typeRepo(event: Event): void {
    const target = event.target;
    const draft = this.draft();
    if (!(target instanceof HTMLInputElement) || draft === null) return;
    this.draft.set({ ...draft, knowledgeRepo: target.value });
  }

  /** Puts the saved jobs back. */
  protected reset(): void {
    const saved = this.saved();
    if (saved !== null) this.draft.set(saved);
    this.saveError.set(null);
  }

  /** Saves what changed; a change that turns a job on asks first and is sent with `confirmSpend`. */
  protected async save(agents: AgentSettings): Promise<void> {
    const draft = this.draft();
    const saved = this.saved();
    if (draft === null || saved === null || this.saving() || !this.dirty())
      return;
    const turnedOn = this.turnedOn();
    if (turnedOn.length > 0) {
      const ref = this.dialogs.open<boolean, AgentsSpendData>(
        AgentsSpendDialog,
        { data: { jobs: turnedOn }, width: '480px' }
      );
      if ((await firstValueFrom(ref.closed)) !== true) return;
    }
    const repo = draft.knowledgeRepo.trim();
    const changed = (job: AgentJobKey) => draft[job] !== saved[job];
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
      ...(repo !== saved.knowledgeRepo
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
      return;
    }
    this.draft.set(draftOf(result.value.agents));
    this.toasts.show(
      turnedOn.length > 0
        ? `${turnedOn.map((j) => j.name).join(' and ')} on. Agents' jobs saved.`
        : "Agents' jobs saved."
    );
  }
}

/** Whether two drafts choose the same. */
function sameDraft(a: Draft, b: Draft): boolean {
  return (
    AGENT_JOB_WORDS.every((job) => a[job.key] === b[job.key]) &&
    a.knowledgeRepo === b.knowledgeRepo
  );
}

/** The draft with one job's profile changed; a job that cannot be off keeps its profile. */
function withJob(draft: Draft, job: AgentJobKey, value: string | null): Draft {
  switch (job) {
    case 'refinementAgent':
      return value === null ? draft : { ...draft, refinementAgent: value };
    case 'diagnosisAgent':
      return value === null ? draft : { ...draft, diagnosisAgent: value };
    case 'storyDraftAgent':
      return { ...draft, storyDraftAgent: value };
    case 'knowledgeAgent':
      return { ...draft, knowledgeAgent: value };
  }
}
