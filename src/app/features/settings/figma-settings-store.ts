import { Injectable, computed } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  AgentSettingsPage,
  FigmaSettings,
  FigmaSettingsChange,
  FigmaSettingsPage,
  FigmaTest,
  FigmaTokenRequest,
} from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Figma section: the token, the design phase's settings and their history. 0 AIU. */
@Injectable()
export class FigmaSettingsStore extends SectionStore<FigmaSettingsPage> {
  protected readonly section = 'figma' as const;

  /** Figma's settings as saved, or the defaults; null while unread. */
  readonly figma = computed(() => this.page()?.figma ?? null);
  /** Whether a token can be saved: an admin, and the API can seal it. */
  readonly canSaveToken = computed(
    () => this.canEdit() && this.page()?.secretsConfigured === true
  );

  protected read(): Promise<ApiResult<FigmaSettingsPage>> {
    return this.api.getFigmaSettings();
  }

  protected tell(summary: SettingsSummary, page: FigmaSettingsPage): void {
    summary.figmaRead(page);
  }

  /** Saves a token, the first or a new one, then reads the page again. */
  saveToken(body: FigmaTokenRequest): Promise<ApiResult<FigmaSettings>> {
    return this.reloadAfter(this.api.putFigmaToken(body));
  }

  /** Removes the token, then reads the page again. */
  removeToken(): Promise<ApiResult<FigmaSettings>> {
    return this.reloadAfter(this.api.deleteFigmaToken());
  }

  /** Changes the UI builders or the prefix, then reads the page again. */
  change(body: FigmaSettingsChange): Promise<ApiResult<FigmaSettings>> {
    return this.reloadAfter(this.api.updateFigmaSettings(body));
  }

  /** Asks Figma who the stored token is; the answer is kept as the last test, so the page is read again. */
  test(): Promise<ApiResult<FigmaTest>> {
    return this.reloadAfter(this.api.testFigmaToken());
  }

  /** The content repository's agent profiles, for choosing the UI builders. */
  profiles(): Promise<ApiResult<AgentSettingsPage>> {
    return this.api.getAgentSettings();
  }
}
