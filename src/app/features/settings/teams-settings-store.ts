import { Injectable, computed } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  TeamsCardOutcome,
  TeamsSettings,
  TeamsSettingsChange,
  TeamsSettingsPage,
  TeamsWebhookRequest,
} from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Teams section: the crew's channel and its history. Sending a test card is 0 AIU. */
@Injectable()
export class TeamsSettingsStore extends SectionStore<TeamsSettingsPage> {
  protected readonly section = 'teams' as const;

  /** The channel as set, or null while it is off or unread. */
  readonly teams = computed(() => this.page()?.teams ?? null);
  /** Whether a webhook can be saved: an admin, and the API can seal it. */
  readonly canSaveWebhook = computed(
    () => this.canEdit() && this.page()?.secretsConfigured === true
  );

  protected read(): Promise<ApiResult<TeamsSettingsPage>> {
    return this.api.getTeamsSettings();
  }

  protected tell(summary: SettingsSummary, page: TeamsSettingsPage): void {
    summary.teamsRead(page);
  }

  /** Connects the channel, or gives it a new webhook, without reading the page again (the dialog may change more). */
  putWebhook(body: TeamsWebhookRequest): Promise<ApiResult<TeamsSettings>> {
    return this.api.putTeamsWebhook(body);
  }

  /** Sets or clears the UI's address, without reading the page again. */
  changeUiUrl(body: TeamsSettingsChange): Promise<ApiResult<TeamsSettings>> {
    return this.api.updateTeamsSettings(body);
  }

  /** Reads the page again after the dialog's changes. */
  refresh(): Promise<void> {
    return this.load();
  }

  /** Disconnects the channel, then reads the page again. */
  disconnect(): Promise<ApiResult<null>> {
    return this.reloadAfter(this.api.deleteTeamsSettings());
  }

  /** Posts a test card to the whole channel; its outcome is kept as the last card, so the page is read again. */
  sendTestCard(): Promise<ApiResult<TeamsCardOutcome>> {
    return this.reloadAfter(this.api.sendTeamsTestCard());
  }
}
