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

  /**
   * Changes who runs the jobs; turning a job on needs `confirmSpend: true`. The answer is the whole page, so it is shown
   * at once, and the page and its history are read again either way.
   */
  async change(
    body: AgentSettingsChange
  ): Promise<ApiResult<AgentSettingsPage>> {
    const result = await this.api.updateAgentSettings(body);
    if (result.ok) this.page.set(result.value);
    await this.load();
    return result;
  }
}
