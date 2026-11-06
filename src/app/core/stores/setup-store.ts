import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { ApiError } from '@core/api/api-error';
import type { Setup } from '@core/api/types';
import { setupReady } from '@domain/setup';

/**
 * What the installation and the team still need (`GET /setup`, `ahoy-hosted` design D23), for the banner every page
 * shows and for Team settings › Setup. Read when the app starts and each time the Setup page opens or checks again;
 * a read that fails keeps the last answer, and with none the banner stays hidden. 0 AIU.
 */
@Injectable({ providedIn: 'root' })
export class SetupStore {
  private readonly api = inject(ApiClient);
  private readonly current = signal<Setup | null>(null);
  private readonly problem = signal<ApiError | null>(null);
  private readonly reading = signal(false);
  /** Counts the reads and saves, so a read that started before a later one is dropped. */
  private generation = 0;

  /** The last answer, or null before the first one. */
  readonly setup = this.current.asReadonly();
  /** Why the last read failed, or null. */
  readonly error = this.problem.asReadonly();
  /** Whether a read is under way. */
  readonly loading = this.reading.asReadonly();
  /** Whether a required step is still not done; false until the API has answered. */
  readonly notReady = computed(() => {
    const setup = this.current();
    return setup !== null && !setupReady(setup);
  });

  /** Reads the steps again. */
  async load(): Promise<void> {
    const generation = ++this.generation;
    this.reading.set(true);
    const result = await this.api.getSetup();
    if (generation !== this.generation) return;
    this.reading.set(false);
    if (result.ok) {
      this.current.set(result.value);
      this.problem.set(null);
    } else this.problem.set(result.error);
  }

  /** Says the phases run on the defaults (admins only); the answer is the steps with Phases done. */
  async keepPhaseDefaults(): Promise<ApiError | null> {
    const generation = ++this.generation;
    const result = await this.api.keepPhaseDefaults();
    if (generation === this.generation) this.reading.set(false);
    if (!result.ok) return result.error;
    if (generation === this.generation) {
      this.current.set(result.value);
      this.problem.set(null);
    }
    return null;
  }
}
