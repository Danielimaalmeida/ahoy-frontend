import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type {
  JiraBacklogPreview,
  JiraConnectionRequest,
  JiraFieldPage,
  JiraSettings,
  JiraSettingsChange,
  JiraSettingsPage,
  JiraTest,
  SettingsEvent,
} from '@core/api/types';
import { HISTORY_LIMIT } from './settings-store';
import { SettingsSummary } from './settings-summary';

/**
 * The state of the Jira section: the settings and Jira's history of changes as the API last answered them. Every
 * command is answered by reading both again, refused or not, since a refusal means the page is out of date. 0 AIU.
 */
@Injectable()
export class JiraSettingsStore {
  private readonly api = inject(ApiClient);
  private readonly summary = inject(SettingsSummary, { optional: true });

  /** The page as last read: Jira (null while it is off) and what the person and the API can do. */
  readonly page = signal<JiraSettingsPage | null>(null);
  /** Why the settings could not be read. */
  readonly loadError = signal<ApiError | null>(null);
  /** Jira's latest changes, newest first. */
  readonly history = signal<readonly SettingsEvent[]>([]);
  /** Why the history could not be read; the settings still show. */
  readonly historyError = signal<ApiError | null>(null);
  /** Whether the settings are being read. */
  readonly loading = signal(false);

  /** Jira as set, or null while it is off or unread. */
  readonly jira = computed(() => this.page()?.jira ?? null);
  /** Whether the person may change the settings: an admin. */
  readonly canEdit = computed(() => this.page()?.canEdit === true);
  /** Whether a token can be saved: an admin, and the API can seal it. */
  readonly canSaveToken = computed(
    () => this.canEdit() && this.page()?.secretsConfigured === true
  );

  /** How many reads have started: only the latest one's answer is shown. */
  private reads = 0;

  /** Reads the settings and Jira's history together; a failure keeps what was shown and says why. */
  async load(): Promise<void> {
    this.summary?.claim('jira');
    const read = ++this.reads;
    this.loading.set(true);
    const [page, history] = await Promise.all([
      this.api.getJiraSettings(),
      this.api.listSettingsEvents(HISTORY_LIMIT, 'jira'),
    ]);
    if (read !== this.reads) return;
    this.loading.set(false);
    if (page.ok) {
      this.loadError.set(null);
      this.page.set(page.value);
      this.summary?.jiraRead(page.value);
    } else {
      this.loadError.set(page.error);
    }
    if (history.ok) {
      this.historyError.set(null);
      this.history.set(history.value.items);
    } else {
      this.historyError.set(history.error);
    }
  }

  /** Connects Jira, or changes its URL or token, then reads the settings again. */
  connect(body: JiraConnectionRequest): Promise<ApiResult<JiraSettings>> {
    return this.reloadAfter(this.api.putJiraConnection(body));
  }

  /** Changes the backlog query, the board or the meeting stories' prefix and fields, then reads the settings again. */
  change(body: JiraSettingsChange): Promise<ApiResult<JiraSettings>> {
    return this.reloadAfter(this.api.updateJiraSettings(body));
  }

  /** Turns Jira off, then reads the settings again. */
  disconnect(): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.deleteJiraSettings());
  }

  /** Asks Jira who the token is; the answer is kept as the last test, so the settings are read again. */
  test(): Promise<ApiResult<JiraTest>> {
    return this.reloadAfter(this.api.testJiraConnection());
  }

  /** How many issues a query matches and the first; nothing is saved, so nothing is read again. */
  preview(jql: string): Promise<ApiResult<JiraBacklogPreview>> {
    return this.api.previewJiraBacklog(jql);
  }

  /** Jira's fields whose name or id holds `q`. */
  fields(q: string): Promise<ApiResult<JiraFieldPage>> {
    return this.api.listJiraFields(q);
  }

  /** Sends a command, then reads the settings again whatever the answer. */
  private async reloadAfter<T>(
    request: Promise<ApiResult<T>>
  ): Promise<ApiResult<T>> {
    const result = await request;
    await this.load();
    return result;
  }
}
