import { Injectable, inject, signal } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  DefectSettingsChange,
  DefectSettingsPage,
  EnvironmentRow,
  JiraBacklogPreview,
} from '@core/api/types';
import { SectionStore } from './section-store';
import { SettingsSummary } from './settings-summary';

/**
 * The state of the Defects section: the watch, its query, the priorities, reproduction and the history; and, for
 * choosing where defects are reproduced, the environments of Team settings › Environments.
 */
@Injectable()
export class DefectSettingsStore extends SectionStore<DefectSettingsPage> {
  protected readonly section = 'defects' as const;
  private readonly frame = inject(SettingsSummary, { optional: true });

  /** The environments a defect may be reproduced in; null until read, or when they could not be. */
  readonly environments = signal<readonly EnvironmentRow[] | null>(null);

  /** Reads the settings and, beside them, the environments: the page shows without them if they cannot be read. */
  override async load(): Promise<void> {
    this.frame?.claim('environments');
    const [, environments] = await Promise.all([
      super.load(),
      this.api.getEnvironments(),
    ]);
    if (!environments.ok) return;
    this.environments.set(environments.value.environments);
    this.frame?.environmentsRead(environments.value);
  }

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
