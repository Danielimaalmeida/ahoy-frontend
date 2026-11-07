import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type { CopilotTokenTest, MyCopilotToken } from '@core/api/types';

/**
 * The state of My Copilot token: the person's own token as the API last showed it (never in clear). Every change is
 * shown at once from the answer. Setup is not read again: the app reads it only when it starts. 0 AIU.
 */
@Injectable()
export class CopilotTokenStore {
  private readonly api = inject(ApiClient);

  /** The page as last read. */
  readonly page = signal<MyCopilotToken | null>(null);
  /** Why the page could not be read. */
  readonly loadError = signal<ApiError | null>(null);
  /** Whether the page is being read. */
  readonly loading = signal(false);

  /** Reads the page again. */
  async load(): Promise<void> {
    this.loading.set(true);
    const result = await this.api.getMyCopilotToken();
    this.loading.set(false);
    if (result.ok) {
      this.page.set(result.value);
      this.loadError.set(null);
    } else this.loadError.set(result.error);
  }

  /** Saves the token, the first or a new one. */
  save(token: string): Promise<ApiResult<MyCopilotToken>> {
    return this.changed(this.api.putMyCopilotToken({ token }));
  }

  /** Removes the token. */
  remove(): Promise<ApiResult<MyCopilotToken>> {
    return this.changed(this.api.deleteMyCopilotToken());
  }

  /** Asks GitHub who the token is; the page is read again, since the answer is kept as the last test. */
  async test(): Promise<ApiResult<CopilotTokenTest>> {
    const result = await this.api.testMyCopilotToken();
    await this.load();
    return result;
  }

  /** Shows the answer of a change at once, or reads the page again when it was refused. */
  private async changed(
    request: Promise<ApiResult<MyCopilotToken>>
  ): Promise<ApiResult<MyCopilotToken>> {
    const result = await request;
    if (result.ok) {
      this.page.set(result.value);
      this.loadError.set(null);
    } else await this.load();
    return result;
  }
}
