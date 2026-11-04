import { Injectable } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  DefectSettingsChange,
  DefectSettingsPage,
  JiraBacklogPreview,
} from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Defects section: the watch, its query, the priorities and the component map, and the history. */
@Injectable()
export class DefectSettingsStore extends SectionStore<DefectSettingsPage> {
  protected readonly section = 'defects' as const;

  protected read(): Promise<ApiResult<DefectSettingsPage>> {
    return this.api.getDefectSettings();
  }

  protected tell(summary: SettingsSummary, page: DefectSettingsPage): void {
    summary.defectsRead(page);
  }

  /** Changes the settings. The answer is the whole page, so it is shown at once, and both are read again either way. */
  async change(
    body: DefectSettingsChange
  ): Promise<ApiResult<DefectSettingsPage>> {
    const result = await this.api.updateDefectSettings(body);
    if (result.ok) this.page.set(result.value);
    await this.load();
    return result;
  }

  /** How many issues a query matches now, with the team's Jira (admins only, 0 AIU). */
  preview(jql: string): Promise<ApiResult<JiraBacklogPreview>> {
    return this.api.previewJiraBacklog(jql);
  }
}
