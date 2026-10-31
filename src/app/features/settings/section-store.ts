import { computed, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type { SettingsEvent, SettingsSection } from '@core/api/types';
import { HISTORY_LIMIT } from './settings-store';
import { SettingsSummary, type SettingsSectionKey } from './settings-summary';

/** What every section page reads: whether the person may change it and whether the API can seal a secret. */
interface SectionPage {
  readonly canEdit: boolean;
}

/**
 * The state of one settings section (Teams, Figma, Agents): its page and its own history as the API last answered
 * them. Every command is answered by reading both again, refused or not, since a refusal means the page is out of
 * date. 0 AIU.
 */
export abstract class SectionStore<P extends SectionPage> {
  protected readonly api = inject(ApiClient);
  private readonly summary = inject(SettingsSummary, { optional: true });

  /** The page as last read. */
  readonly page = signal<P | null>(null);
  /** Why the page could not be read. */
  readonly loadError = signal<ApiError | null>(null);
  /** The section's latest changes, newest first. */
  readonly history = signal<readonly SettingsEvent[]>([]);
  /** Why the history could not be read; the settings still show. */
  readonly historyError = signal<ApiError | null>(null);
  /** Whether the page is being read. */
  readonly loading = signal(false);
  /** Whether the person may change the settings: an admin. */
  readonly canEdit = computed(() => this.page()?.canEdit === true);

  /** How many reads have started: only the latest one's answer is shown. */
  private reads = 0;

  /** The section, as the history and the side navigation name it. */
  protected abstract readonly section: SettingsSection & SettingsSectionKey;
  /** Reads the section's page. */
  protected abstract read(): Promise<ApiResult<P>>;
  /** Tells the side navigation what was read. */
  protected abstract tell(summary: SettingsSummary, page: P): void;

  /** Reads the page and the section's history together; a failure keeps what was shown and says why. */
  async load(): Promise<void> {
    this.summary?.claim(this.section);
    const read = ++this.reads;
    this.loading.set(true);
    const [page, history] = await Promise.all([
      this.read(),
      this.api.listSettingsEvents(HISTORY_LIMIT, this.section),
    ]);
    if (read !== this.reads) return;
    this.loading.set(false);
    if (page.ok) {
      this.loadError.set(null);
      this.page.set(page.value);
      if (this.summary) this.tell(this.summary, page.value);
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

  /** Sends a command, then reads the page again whatever the answer. */
  protected async reloadAfter<T>(
    request: Promise<ApiResult<T>>
  ): Promise<ApiResult<T>> {
    const result = await request;
    await this.load();
    return result;
  }
}
