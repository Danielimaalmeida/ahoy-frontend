import type { DialogRef } from '@angular/cdk/dialog';
import { computed, signal } from '@angular/core';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type { ToastService } from '@ui/toast/toast';
import { settingsErrorView } from './settings-errors';

/**
 * How a settings dialog sends a change: one at a time, a refusal kept in the dialog with its reason, and a toast and a
 * close once it went through.
 */
export class DialogSend {
  /** A request is in flight. */
  readonly busy = signal(false);
  private readonly failure = signal<ApiError | null>(null);
  /** The refusal to show at the top of the dialog. */
  readonly error = computed(() => {
    const failure = this.failure();
    return failure === null ? null : settingsErrorView(failure);
  });

  constructor(
    private readonly ref: DialogRef<boolean>,
    private readonly toasts: ToastService
  ) {}

  /** Sends `request`; on success shows `done` and closes the dialog with true. */
  async run(
    request: () => Promise<ApiResult<unknown>>,
    done: string
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.failure.set(null);
    const result = await request();
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    this.toasts.show(done);
    this.ref.close(true);
  }
}
