import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError } from '@core/api/api-error';
import type { Setup } from '@core/api/types';
import { setupReady } from '@domain/setup';
import { StoreResource } from './resource';

/**
 * What the installation and the team still need (`GET /setup`, `ahoy-hosted` design D23), for the banner every page
 * shows and for Team settings › Setup. Read only when the app starts; after that, only the Setup page's Check again
 * and Try again read it. A read asked for during another runs once more after it, and a read that fails keeps the last
 * answer (with none, the banner stays hidden). 0 AIU.
 */
@Injectable({ providedIn: 'root' })
export class SetupStore {
  private readonly api = inject(ApiClient);
  private readonly resource = new StoreResource<Setup>(() =>
    this.api.getSetup()
  );
  private readonly keepingSignal = signal(false);

  /** The last answer, or null before the first one. */
  readonly setup = computed(() => this.resource.value() ?? null);
  /** Why the last read failed, or null. */
  readonly error = this.resource.error;
  /** Whether a read or Keep defaults is under way. */
  readonly loading = computed(
    () => this.resource.busy() || this.keepingSignal()
  );
  /** Whether a required step is still not done; false until the API has answered. */
  readonly notReady = computed(() => {
    const setup = this.setup();
    return setup !== null && !setupReady(setup);
  });

  /** Reads the steps again. */
  load(): Promise<void> {
    return this.resource.refresh();
  }

  /**
   * Says the phases run on the defaults (admins only). The answer is shown at once; a read that began before the save
   * is then read again, so it cannot put Phases back as missing.
   */
  async keepPhaseDefaults(): Promise<ApiError | null> {
    this.keepingSignal.set(true);
    try {
      const result = await this.api.keepPhaseDefaults();
      if (!result.ok) return result.error;
      this.resource.accept(result.value);
      if (this.resource.busy()) void this.resource.refresh();
      return null;
    } finally {
      this.keepingSignal.set(false);
    }
  }
}
