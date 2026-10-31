import { Injectable } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type { AgentSettingsChange, AgentSettingsPage } from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Agents section: who runs each job, the profiles at HEAD and the history. */
@Injectable()
export class AgentSettingsStore extends SectionStore<AgentSettingsPage> {
  protected readonly section = 'agents' as const;

  protected read(): Promise<ApiResult<AgentSettingsPage>> {
    return this.api.getAgentSettings();
  }

  protected tell(summary: SettingsSummary, page: AgentSettingsPage): void {
    summary.agentsRead(page);
  }

  /** Changes who runs the jobs; turning a job on needs `confirmSpend: true`. Reads the page again either way. */
  change(body: AgentSettingsChange): Promise<ApiResult<AgentSettingsPage>> {
    return this.reloadAfter(this.api.updateAgentSettings(body));
  }
}
