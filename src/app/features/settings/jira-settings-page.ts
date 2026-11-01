import {
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import { initialsOf } from '@core/auth/current-user';
import type {
  JiraBacklogPreview,
  JiraFixedField,
  JiraSettings,
} from '@core/api/types';
import { dayLabel } from '@domain/crew';
import {
  fieldValueText,
  jiraTestView,
  MAX_BACKLOG_JQL_CHARS,
  MAX_FIXED_FIELDS,
  prefixExample,
} from '@domain/jira-settings';
import { describeSettingsEvent, tokenLabel } from '@domain/settings';
import { absoluteDay, absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Icon } from '@ui/icon/icon';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Api, Table } from '@ui/table/table';
import { ToastService } from '@ui/toast/toast';
import { JiraBoardDialog, type JiraBoardData } from './jira-board-dialog';
import {
  JiraConnectionDialog,
  type JiraConnectionData,
} from './jira-connection-dialog';
import { JiraFieldDialog, type JiraFieldData } from './jira-field-dialog';
import { JiraPrefixDialog, type JiraPrefixData } from './jira-prefix-dialog';
import { JiraSettingsStore } from './jira-settings-store';
import { settingsErrorView } from './settings-errors';

/** What the backlog's Preview found, or why it could not. */
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
 * Team settings › Jira: the connection the API and the reconciler use, the backlog query, the crew's board and what
 * every story created from a meeting carries, with Jira's history of changes. Admins change them; everyone else reads
 * them. The token is typed once and shown only as its last four characters. Every check here is 0 AIU.
 */
@Component({
  selector: 'ah-jira-settings-page',
  imports: [
    Api,
    Banner,
    Button,
    EmptyState,
    Icon,
    Panel,
    PanelBody,
    PanelFoot,
    PanelHead,
    Skeleton,
    Table,
  ],
  providers: [JiraSettingsStore],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .head {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .head h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
    }
    .layout {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-start;
    }
    .main {
      flex: 999 1 560px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .side {
      flex: 1 1 300px;
      min-width: 0;
    }
    .loading {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
    }
    .dl {
      display: grid;
      grid-template-columns: 168px minmax(0, 1fr);
      margin: 0;
    }
    .dl dt {
      padding: 11px 16px;
      font-weight: 600;
      color: var(--ink-soft);
      border-top: 1px solid var(--line-soft);
    }
    .dl dd {
      margin: 0;
      padding: 11px 16px 11px 0;
      border-top: 1px solid var(--line-soft);
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      align-items: baseline;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .dl > :nth-child(1),
    .dl > :nth-child(2) {
      border-top: 0;
    }
    .body {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .secret,
    .ok,
    .bad {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }
    .ok {
      color: var(--status-done-fg);
      font-weight: 600;
    }
    .bad {
      color: var(--danger-text);
      font-weight: 600;
    }
    .foot {
      justify-content: flex-end;
      width: 100%;
    }
    .jql {
      font-family: var(--font-mono);
      white-space: pre-wrap;
      margin: 0;
      overflow-wrap: anywhere;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
    }
    .fields {
      overflow-x: auto;
      border-top: 1px solid var(--line-soft);
    }
    .reserved {
      padding: 10px 16px 14px;
    }
    .name {
      font-weight: 600;
    }
    .history {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .history li {
      display: flex;
      gap: 10px;
    }
    .history__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    @media (max-width: 560px) {
      .dl {
        grid-template-columns: minmax(0, 1fr);
      }
      .dl dd {
        border-top: 0;
        padding: 0 16px 11px;
      }
    }
  `,
  template: `
    <div class="head">
      <h2>Jira</h2>
      <span class="ah-muted"
        >The backlog, the stories Ahoy reads at intake, the crew's sprints and
        the stories drafted from meetings.</span
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
        aria-label="Loading the Jira settings"
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
      } @else if (!page.secretsConfigured) {
        <ah-banner variant="notice" heading="Tokens can't be saved yet">
          The API needs AHOY_SECRETS_KEY to store a token encrypted. Until it is
          set, Jira cannot be connected and a new token cannot be saved.
        </ah-banner>
      }
      @if (page.jira && !page.tokenReadable) {
        <ah-banner variant="error" heading="The stored token can't be opened">
          The API's key no longer opens it, so Jira is off until an admin types
          the token again (Edit the connection).
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          @if (page.jira; as jira) {
            <ah-panel>
              <ah-panel-head
                heading="Connection"
                subtitle="The API and the reconciler use it to read the backlog, read each story at intake and create stories from meetings."
              >
                @if (store.canEdit()) {
                  <span ahPanelActions class="row">
                    <button
                      ahButton
                      size="sm"
                      type="button"
                      [disabled]="testing()"
                      (click)="test()"
                    >
                      {{ testing() ? 'Testing…' : 'Test connection' }}
                    </button>
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      (click)="connection(jira)"
                    >
                      Edit
                    </button>
                  </span>
                }
              </ah-panel-head>
              @if (testFailure(); as problem) {
                <div class="body">
                  <ah-banner
                    [variant]="problem.variant"
                    [heading]="problem.heading"
                    [tech]="problem.tech ?? ''"
                  >
                    {{ problem.text }}
                  </ah-banner>
                </div>
              } @else if (lastTest(); as last) {
                @if (!last.view.good) {
                  <div class="body">
                    <ah-banner
                      variant="error"
                      [heading]="last.view.heading ?? ''"
                      [tech]="last.view.tech ?? ''"
                    >
                      {{ last.view.text }}
                    </ah-banner>
                  </div>
                }
              }
              <dl class="dl">
                <dt>Base URL</dt>
                <dd>
                  <span ahApi>{{ jira.connection.baseUrl }}</span>
                </dd>
                <dt>Token</dt>
                <dd>
                  <span class="secret"
                    ><ah-icon name="lock" [size]="12" /><span class="ah-mono">{{
                      token(jira.connection.tokenHint)
                    }}</span></span
                  >
                  <span class="ah-hint"
                    >Set by
                    {{
                      jira.connection.tokenSetByName ??
                        jira.connection.tokenSetBy
                    }}
                    · {{ day(jira.connection.tokenSetAt) }}</span
                  >
                </dd>
                <dt>Last test</dt>
                <dd>
                  @if (lastTest(); as last) {
                    @if (last.view.good) {
                      <span class="ok"
                        ><ah-icon name="check" [size]="12" />{{
                          last.view.label
                        }}</span
                      >
                    } @else {
                      <span class="bad"
                        ><ah-icon name="aground" [size]="12" />{{
                          last.view.label
                        }}</span
                      >
                    }
                    <span class="ah-hint">{{ moment(last.at) }}</span>
                  } @else {
                    <span class="ah-hint"
                      >Not tested since the connection was set</span
                    >
                  }
                </dd>
              </dl>
            </ah-panel>

            <ah-panel>
              <ah-panel-head
                heading="Backlog"
                subtitle="The query behind the Backlog page. Keep it to Stories, Tasks and Bugs; empty turns the Backlog page off."
              >
                @if (backlogDirty()) {
                  <span ahPanelActions class="ah-tag ah-tag--outline"
                    >Unsaved changes</span
                  >
                }
              </ah-panel-head>
              <div class="body">
                @if (store.canEdit()) {
                  <div class="ah-field">
                    <label class="ah-label" for="jira-jql">Query (JQL)</label>
                    <textarea
                      id="jira-jql"
                      class="ah-input ah-input--mono"
                      rows="3"
                      spellcheck="false"
                      [attr.maxlength]="maxJql"
                      [value]="jql()"
                      (input)="typeJql($event)"
                    ></textarea>
                  </div>
                  <div class="row">
                    <button
                      ahButton="soft"
                      size="sm"
                      type="button"
                      [disabled]="
                        jql().trim() === '' || preview().kind === 'busy'
                      "
                      (click)="runPreview()"
                    >
                      {{
                        preview().kind === 'busy' ? 'Asking Jira…' : 'Preview'
                      }}
                    </button>
                    @switch (preview().kind) {
                      @case ('done') {
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
                      }
                      @case ('failed') {
                        @if (previewProblem(); as problem) {
                          <span class="bad" role="status"
                            ><ah-icon name="aground" [size]="12" />{{
                              problem.heading
                            }}</span
                          >
                          <span class="ah-hint">{{ problem.text }}</span>
                        }
                      }
                    }
                  </div>
                  @if (backlogFailure(); as problem) {
                    <ah-banner
                      [variant]="problem.variant"
                      [heading]="problem.heading"
                      [tech]="problem.tech ?? ''"
                    >
                      {{ problem.text }}
                    </ah-banner>
                  }
                } @else if (jira.backlogJql !== null) {
                  <pre class="jql">{{ jira.backlogJql }}</pre>
                } @else {
                  <span class="ah-hint"
                    >No query: the Backlog page is off.</span
                  >
                }
              </div>
              @if (store.canEdit()) {
                <ah-panel-foot>
                  <span class="row foot">
                    <button
                      ahButton="ghost"
                      type="button"
                      [disabled]="!backlogDirty() || savingBacklog()"
                      (click)="resetJql()"
                    >
                      Cancel
                    </button>
                    <button
                      ahButton="primary"
                      type="button"
                      [disabled]="!backlogDirty() || savingBacklog()"
                      (click)="saveJql(jira)"
                    >
                      {{
                        savingBacklog()
                          ? 'Saving…'
                          : jql().trim() === ''
                            ? 'Turn the Backlog off'
                            : 'Save query'
                      }}
                    </button>
                  </span>
                </ah-panel-foot>
              }
            </ah-panel>

            <ah-panel>
              <ah-panel-head
                heading="Crew sprints"
                subtitle="The board whose sprints the Crew page and its Teams cards follow."
              >
                @if (store.canEdit()) {
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    ahPanelActions
                    (click)="board(jira)"
                  >
                    Edit
                  </button>
                }
              </ah-panel-head>
              <dl class="dl">
                <dt>Board</dt>
                <dd>
                  @if (jira.board; as b) {
                    <span class="ah-mono">{{ b.id }}</span>
                    <span>{{ b.name ?? "Jira didn't name it" }}</span>
                    @if (b.type) {
                      <span class="ah-hint">{{ b.type }}</span>
                    }
                  } @else {
                    <span class="ah-hint"
                      >No board: the Crew page has no sprints.</span
                    >
                  }
                </dd>
                @if (jira.board) {
                  <dt>Sprint now</dt>
                  <dd>
                    @if (jira.currentSprint; as sprint) {
                      <span>{{ sprint.name }}</span>
                      @if (
                        sprintDays(sprint.startsOn, sprint.endsOn);
                        as days
                      ) {
                        <span class="ah-hint">{{ days }}</span>
                      }
                    } @else {
                      <span class="ah-hint"
                        >Jira did not say (no active or future sprint, or no
                        answer in time)</span
                      >
                    }
                  </dd>
                }
              </dl>
            </ah-panel>

            <ah-panel>
              <ah-panel-head
                heading="Stories from meetings"
                subtitle="Every story Ahoy creates from a meeting starts with this prefix and carries these fields."
              >
                @if (store.canEdit()) {
                  <span ahPanelActions class="row">
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      (click)="prefix(jira)"
                    >
                      Edit prefix
                    </button>
                    <button
                      ahButton
                      size="sm"
                      type="button"
                      [disabled]="jira.storyFields.length >= maxFields"
                      (click)="field(jira, null)"
                    >
                      Add a fixed field
                    </button>
                  </span>
                }
              </ah-panel-head>
              <dl class="dl">
                <dt>Summary prefix</dt>
                <dd>
                  @if (jira.storySummaryPrefix !== '') {
                    <span class="ah-mono">{{
                      visiblePrefix(jira.storySummaryPrefix)
                    }}</span>
                  }
                  <span class="ah-hint">{{
                    example(jira.storySummaryPrefix)
                  }}</span>
                </dd>
              </dl>
              @if (jira.storyFields.length > 0) {
                <div class="fields">
                  <table ahTable aria-label="Fixed fields">
                    <thead>
                      <tr>
                        <th scope="col">Fixed field</th>
                        <th scope="col">Id</th>
                        <th scope="col">Value</th>
                        @if (store.canEdit()) {
                          <th scope="col">
                            <span class="ah-sr">Actions</span>
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (f of jira.storyFields; track f.id) {
                        <tr>
                          <th scope="row" class="name">{{ f.name }}</th>
                          <td>
                            <span ahApi>{{ f.id }}</span>
                          </td>
                          <td>
                            <span class="ah-mono">{{
                              valueText(f.value)
                            }}</span>
                          </td>
                          @if (store.canEdit()) {
                            <td>
                              <button
                                ahButton="ghost"
                                size="sm"
                                type="button"
                                [attr.aria-label]="'Edit ' + f.name"
                                (click)="field(jira, f)"
                              >
                                Edit
                              </button>
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <ah-panel-body>
                  <span class="ah-hint"
                    >No fixed field: stories carry only what Ahoy writes from
                    the story.</span
                  >
                </ah-panel-body>
              }
              <div class="reserved">
                <span class="ah-hint"
                  >Ahoy sets the project, issue type, summary, description,
                  labels and acceptance criteria itself, so those can't be fixed
                  here.</span
                >
              </div>
            </ah-panel>
          } @else {
            <ah-panel>
              <ah-panel-head heading="Connection" />
              <ah-panel-body>
                <ah-empty-state heading="Jira is off" icon="anchor">
                  The Backlog page, story intake and stories from meetings need
                  it. A story that starts now halts until Jira is connected.
                  @if (store.canEdit()) {
                    <button
                      ahButton="primary"
                      size="sm"
                      type="button"
                      [disabled]="!store.canSaveToken()"
                      (click)="connection(null)"
                    >
                      Connect Jira
                    </button>
                  }
                </ah-empty-state>
              </ah-panel-body>
            </ah-panel>
          }
        </div>

        <aside class="side">
          <ah-panel>
            <ah-panel-head
              heading="History"
              subtitle="Jira, the latest first"
            />
            <ah-panel-body>
              @if (historyFailure(); as problem) {
                <ah-banner
                  [variant]="problem.variant"
                  heading="The history could not be read"
                  [tech]="problem.tech ?? ''"
                >
                  {{ problem.text }}
                </ah-banner>
              } @else if (history().length === 0) {
                <span class="ah-hint">No change yet.</span>
              } @else {
                <ol class="history" aria-label="Changes to Jira">
                  @for (e of history(); track e.id) {
                    <li>
                      <span class="ah-avatar" aria-hidden="true">{{
                        e.initials
                      }}</span>
                      <span class="history__text">
                        <span>{{ e.text }}</span>
                        <span class="ah-hint"
                          >{{ e.who }} · {{ moment(e.createdAt) }}</span
                        >
                      </span>
                    </li>
                  }
                </ol>
              }
            </ah-panel-body>
            <ah-panel-foot>
              <span class="ah-hint"
                >Kept for good. A token shows only its last four
                characters.</span
              >
            </ah-panel-foot>
          </ah-panel>
        </aside>
      </div>
    }
  `,
})
export class JiraSettingsPage {
  protected readonly store = inject(JiraSettingsStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  protected readonly token = tokenLabel;
  protected readonly valueText = fieldValueText;
  protected readonly example = (prefix: string) => prefixExample(prefix);
  protected readonly maxJql = MAX_BACKLOG_JQL_CHARS;
  protected readonly maxFields = MAX_FIXED_FIELDS;
  /** When the page opened, so a date from another year shows its year. */
  private readonly now = new Date();

  /** The backlog query as typed; it follows the saved one until it is edited. */
  protected readonly jql = signal('');
  /** The saved query the typed one started from. */
  private readonly savedJql = signal<string | null>(null);
  protected readonly backlogDirty = computed(
    () => this.jql().trim() !== (this.savedJql() ?? '')
  );
  protected readonly savingBacklog = signal(false);
  private readonly backlogError = signal<ApiError | null>(null);
  protected readonly backlogFailure = computed(() => {
    const error = this.backlogError();
    return error === null ? null : settingsErrorView(error);
  });
  protected readonly preview = signal<PreviewState>({ kind: 'idle' });
  protected readonly previewAnswer = computed(() => {
    const p = this.preview();
    return p.kind === 'done' && p.jql === this.jql().trim() ? p.answer : null;
  });
  protected readonly previewProblem = computed(() => {
    const p = this.preview();
    if (p.kind !== 'failed' || p.jql !== this.jql().trim()) return null;
    return settingsErrorView(p.error);
  });

  protected readonly testing = signal(false);
  private readonly testError = signal<ApiError | null>(null);
  protected readonly testFailure = computed(() => {
    const error = this.testError();
    return error === null ? null : settingsErrorView(error);
  });
  /** The last connection test, in words. */
  protected readonly lastTest = computed(() => {
    const last = this.store.jira()?.connection.lastTest ?? null;
    return last === null
      ? null
      : { at: last.at, view: jiraTestView(last.result, last.detail) };
  });

  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  protected readonly historyFailure = computed(() => {
    const error = this.store.historyError();
    return error === null ? null : settingsErrorView(error, 'read');
  });
  /** Jira's history in words, with who made each change. */
  protected readonly history = computed(() =>
    this.store.history().map((e) => {
      const who = e.actorName ?? e.actor;
      return {
        id: e.id,
        text: describeSettingsEvent(e.type, e.payload),
        who,
        initials: initialsOf(who),
        createdAt: e.createdAt,
      };
    })
  );

  constructor() {
    void this.store.load();
    // The typed query follows the saved one until the person edits it; a save or a change elsewhere moves it on.
    effect(() => {
      const saved = this.store.jira()?.backlogJql ?? null;
      const typedWasSaved = untracked(() => !this.backlogDirty());
      if (saved !== untracked(this.savedJql)) {
        this.savedJql.set(saved);
        if (typedWasSaved) this.jql.set(saved ?? '');
      }
    });
  }

  /** The day of a record, such as when a token was set. */
  protected day(at: string): string {
    return absoluteDay(at, this.now);
  }

  /** The day and time of a change. */
  protected moment(at: string): string {
    return absoluteDayTime(at, this.now);
  }

  /** "Mon 26 Oct – Fri 6 Nov", or null when Jira gave no days. */
  protected sprintDays(
    startsOn: string | null,
    endsOn: string | null
  ): string | null {
    if (startsOn === null || endsOn === null) return null;
    return `${dayLabel(startsOn)} – ${dayLabel(endsOn)}`;
  }

  /** The prefix with its trailing space shown, so "[PROJ] " does not read as "[PROJ]". */
  protected visiblePrefix(prefix: string): string {
    return prefix.replace(/ $/, ' ');
  }

  /** "1 issue matches", "42 issues match". */
  protected matchLabel(total: number): string {
    if (total === 0) return 'No issue matches';
    return total === 1
      ? '1 issue matches'
      : `${total.toLocaleString('en-GB')} issues match`;
  }

  protected typeJql(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) this.jql.set(target.value);
  }

  /** Puts the saved query back. */
  protected resetJql(): void {
    this.jql.set(this.savedJql() ?? '');
    this.backlogError.set(null);
  }

  /** Asks Jira how many issues the typed query matches. Nothing is saved. */
  protected async runPreview(): Promise<void> {
    const jql = this.jql().trim();
    if (jql === '' || this.preview().kind === 'busy') return;
    this.preview.set({ kind: 'busy' });
    const result = await this.store.preview(jql);
    this.preview.set(
      result.ok
        ? { kind: 'done', jql, answer: result.value }
        : { kind: 'failed', jql, error: result.error }
    );
  }

  /** Saves the typed query; an empty one turns the Backlog page off. */
  protected async saveJql(jira: JiraSettings): Promise<void> {
    if (this.savingBacklog()) return;
    const jql = this.jql().trim();
    this.savingBacklog.set(true);
    this.backlogError.set(null);
    const result = await this.store.change({
      version: jira.version,
      backlogJql: jql === '' ? null : jql,
    });
    this.savingBacklog.set(false);
    if (!result.ok) {
      this.backlogError.set(result.error);
      return;
    }
    this.jql.set(result.value.backlogJql ?? '');
    this.toasts.show(
      jql === '' ? 'The Backlog page is off.' : 'Backlog query saved.'
    );
  }

  /** Asks Jira who the stored token is; the answer shows as the last test. */
  protected async test(): Promise<void> {
    if (this.testing()) return;
    this.testing.set(true);
    this.testError.set(null);
    const result = await this.store.test();
    this.testing.set(false);
    if (!result.ok) {
      this.testError.set(result.error);
      return;
    }
    if (result.value.result === 'ok')
      this.toasts.show(jiraTestView('ok', result.value.detail).label + '.');
  }

  /** Opens the connection dialog: connect Jira, or change its URL or token, or turn it off. */
  protected connection(jira: JiraSettings | null): void {
    this.testError.set(null);
    this.dialogs.open<boolean, JiraConnectionData>(JiraConnectionDialog, {
      data: {
        store: this.store,
        jira,
        tokenReadable: this.store.page()?.tokenReadable !== false,
      },
      width: '520px',
    });
  }

  /** Opens the board dialog. */
  protected board(jira: JiraSettings): void {
    this.dialogs.open<boolean, JiraBoardData>(JiraBoardDialog, {
      data: { store: this.store, jira },
      width: '480px',
    });
  }

  /** Opens the summary prefix dialog. */
  protected prefix(jira: JiraSettings): void {
    this.dialogs.open<boolean, JiraPrefixData>(JiraPrefixDialog, {
      data: { store: this.store, jira },
      width: '480px',
    });
  }

  /** Opens the fixed field dialog: a new field, or one to change or remove. */
  protected field(jira: JiraSettings, field: JiraFixedField | null): void {
    this.dialogs.open<boolean, JiraFieldData>(JiraFieldDialog, {
      data: { store: this.store, jira, field },
      width: '560px',
    });
  }
}
