import { Injectable } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type { PhaseSettingsChange, PhaseSettingsPage } from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Phases section: each phase, the model catalogue and the history. */
@Injectable()
export class PhaseSettingsStore extends SectionStore<PhaseSettingsPage> {
  protected readonly section = 'phases' as const;

  protected read(): Promise<ApiResult<PhaseSettingsPage>> {
    return this.api.getPhaseSettings();
  }

  protected tell(summary: SettingsSummary, page: PhaseSettingsPage): void {
    summary.phasesRead(page);
  }

  /**
   * Changes phases or the catalogue; raising a cap needs `confirmSpend: true`. The answer is the whole page, so it is
   * shown at once, and the page and its history are read again either way.
   */
  async change(
    body: PhaseSettingsChange
  ): Promise<ApiResult<PhaseSettingsPage>> {
    const result = await this.api.updatePhaseSettings(body);
    if (result.ok) this.page.set(result.value);
    await this.load();
    return result;
  }
}
