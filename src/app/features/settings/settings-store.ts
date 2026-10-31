import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type {
  SettingsEvent,
  SonarRepository,
  SonarRepositoryChange,
  SonarRepositoryRequest,
  SonarServer,
  SonarServerChange,
  SonarServerRequest,
  SonarSettings,
} from '@core/api/types';
import { SettingsSummary } from './settings-summary';

/** How many entries of the settings history the page shows. */
export const HISTORY_LIMIT = 50;

/**
 * The state of the Team settings page: the SonarQube settings and the history of changes as the API last answered
 * them. Every command is answered by reading both again, since a change moves the default and the counts. 0 AIU.
 */
@Injectable()
export class SettingsStore {
  private readonly api = inject(ApiClient);
  private readonly summary = inject(SettingsSummary, { optional: true });

  /** The SonarQube settings, once read. */
  readonly sonar = signal<SonarSettings | null>(null);
  /** Why the SonarQube settings could not be read. */
  readonly loadError = signal<ApiError | null>(null);
  /** The latest changes, newest first. */
  readonly history = signal<readonly SettingsEvent[]>([]);
  /** Why the history could not be read; the settings still show. */
  readonly historyError = signal<ApiError | null>(null);
  /** Whether the settings are being read. */
  readonly loading = signal(false);

  /** Whether the person may change the settings: an admin. */
  readonly canEdit = computed(() => this.sonar()?.canEdit === true);
  /** Whether a server can be added: the person may edit, and the API can seal a token. */
  readonly canAddServer = computed(
    () => this.canEdit() && this.sonar()?.secretsConfigured === true
  );
  /** Each server's name by id, for the repositories table. */
  private readonly serverNames = computed(
    () => new Map((this.sonar()?.servers ?? []).map((s) => [s.id, s.name]))
  );

  /** How many reads have started: only the latest one's answer is shown. */
  private reads = 0;

  /**
   * Reads the settings and the history together; a failure keeps what was shown and says why. When reads overlap,
   * only the latest one's answer is kept, so an older answer never replaces a newer one.
   */
  async load(): Promise<void> {
    const read = ++this.reads;
    this.loading.set(true);
    const [sonar, history] = await Promise.all([
      this.api.getSonarSettings(),
      this.api.listSettingsEvents(HISTORY_LIMIT, 'sonar'),
    ]);
    if (read !== this.reads) return;
    this.loading.set(false);
    if (sonar.ok) {
      this.loadError.set(null);
      this.sonar.set(sonar.value);
      this.summary?.sonarRead(sonar.value);
    } else {
      this.loadError.set(sonar.error);
    }
    if (history.ok) {
      this.historyError.set(null);
      this.history.set(history.value.items);
    } else {
      this.historyError.set(history.error);
    }
  }

  /** The name of a server, or its id when it is no longer listed. */
  serverName(id: string): string {
    return this.serverNames().get(id) ?? id;
  }

  /** Adds a server with its token, then reads the settings again. */
  addServer(body: SonarServerRequest): Promise<ApiResult<SonarServer>> {
    return this.reloadAfter(this.api.addSonarServer(body));
  }

  /** Changes a server, then reads the settings again. */
  updateServer(
    id: string,
    body: SonarServerChange
  ): Promise<ApiResult<SonarServer>> {
    return this.reloadAfter(this.api.updateSonarServer(id, body));
  }

  /** Removes a server no repository is on, then reads the settings again. */
  removeServer(id: string): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.deleteSonarServer(id));
  }

  /** Puts a repository on a server, then reads the settings again. */
  addRepository(
    body: SonarRepositoryRequest
  ): Promise<ApiResult<SonarRepository>> {
    return this.reloadAfter(this.api.addSonarRepository(body));
  }

  /** Moves a repository or changes its project key, then reads the settings again. */
  updateRepository(
    id: string,
    body: SonarRepositoryChange
  ): Promise<ApiResult<SonarRepository>> {
    return this.reloadAfter(this.api.updateSonarRepository(id, body));
  }

  /** Takes a repository off its server, then reads the settings again. */
  removeRepository(id: string): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.deleteSonarRepository(id));
  }

  /**
   * Sends a command, then reads the settings again whatever the answer: a refused change (someone changed it first,
   * it is gone, an unreadable answer) means the page is out of date too.
   */
  private async reloadAfter<T>(
    request: Promise<ApiResult<T>>
  ): Promise<ApiResult<T>> {
    const result = await request;
    await this.load();
    return result;
  }
}
