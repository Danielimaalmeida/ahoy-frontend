import { Injectable, computed } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  ConfluenceConnectionRequest,
  ConfluenceSettings,
  ConfluenceSettingsChange,
  ConfluenceSettingsPage,
  ConfluenceTest,
} from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Confluence section: the connection, the space pages are searched in, and their history. 0 AIU. */
@Injectable()
export class ConfluenceSettingsStore extends SectionStore<ConfluenceSettingsPage> {
  protected readonly section = 'confluence' as const;

  /** Confluence as set, or null while it is off or unread. */
  readonly confluence = computed(() => this.page()?.confluence ?? null);
  /** Whether a token can be saved: an admin, and the API can seal it. */
  readonly canSaveToken = computed(
    () => this.canEdit() && this.page()?.secretsConfigured === true
  );

  protected read(): Promise<ApiResult<ConfluenceSettingsPage>> {
    return this.api.getConfluenceSettings();
  }

  protected tell(summary: SettingsSummary, page: ConfluenceSettingsPage): void {
    summary.confluenceRead(page);
  }

  /** Connects Confluence, or changes its URL or token, then reads the page again. */
  connect(
    body: ConfluenceConnectionRequest
  ): Promise<ApiResult<ConfluenceSettings>> {
    return this.reloadAfter(this.api.putConfluenceConnection(body));
  }

  /** Sets or clears the space the parent page search looks in, then reads the page again. */
  change(
    body: ConfluenceSettingsChange
  ): Promise<ApiResult<ConfluenceSettings>> {
    return this.reloadAfter(this.api.updateConfluenceSettings(body));
  }

  /** Turns Confluence off, then reads the page again. */
  disconnect(): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.deleteConfluenceSettings());
  }

  /** Asks Confluence who the token is; the answer is kept as the last test, so the page is read again. */
  test(): Promise<ApiResult<ConfluenceTest>> {
    return this.reloadAfter(this.api.testConfluenceConnection());
  }
}
