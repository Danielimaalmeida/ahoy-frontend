import { Injectable, inject } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  MeetingSettingsChange,
  MeetingSettingsPage,
} from '@core/api/types';
import { MeetingLabelsStore } from '@core/stores/meeting-labels-store';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Meetings section: the names of the two sides of a meeting and the history. */
@Injectable()
export class MeetingSettingsStore extends SectionStore<MeetingSettingsPage> {
  protected readonly section = 'meetings' as const;
  private readonly labels = inject(MeetingLabelsStore);

  protected read(): Promise<ApiResult<MeetingSettingsPage>> {
    return this.api.getMeetingSettings();
  }

  protected tell(summary: SettingsSummary, page: MeetingSettingsPage): void {
    summary.meetingsRead(page);
    this.labels.set(page.meetings);
  }

  /** Renames one side or both. The answer is the whole page, so it is shown at once; then both are read again. */
  async change(
    body: MeetingSettingsChange
  ): Promise<ApiResult<MeetingSettingsPage>> {
    const result = await this.api.updateMeetingSettings(body);
    if (result.ok) {
      this.page.set(result.value);
      this.labels.set(result.value.meetings);
    }
    await this.load();
    return result;
  }
}
