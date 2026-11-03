import { Injectable } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  PrCommentSettingsChange,
  PrCommentSettingsPage,
} from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Pull request comments section: replies on or off, the comments per round and the history. */
@Injectable()
export class PrCommentSettingsStore extends SectionStore<PrCommentSettingsPage> {
  protected readonly section = 'pr_comments' as const;

  protected read(): Promise<ApiResult<PrCommentSettingsPage>> {
    return this.api.getPrCommentSettings();
  }

  protected tell(summary: SettingsSummary, page: PrCommentSettingsPage): void {
    summary.prCommentsRead(page);
  }

  /**
   * Changes the settings; turning replies on needs `confirmReplies: true`. The answer is the whole page, so it is shown
   * at once, and the page and its history are read again either way.
   */
  async change(
    body: PrCommentSettingsChange
  ): Promise<ApiResult<PrCommentSettingsPage>> {
    const result = await this.api.updatePrCommentSettings(body);
    if (result.ok) this.page.set(result.value);
    await this.load();
    return result;
  }
}
