import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { Me } from '@core/api/types';

/**
 * The signed-in person (`getMe`), for what a page starts on: the side of a meeting the topics they raise are on
 * (Team settings › People). Read once, the first time a page asks (again after a failed read); until then, and when it
 * cannot be read, nobody is known and the side is ours. 0 AIU.
 */
@Injectable({ providedIn: 'root' })
export class MeStore {
  private readonly api = inject(ApiClient);
  private readonly current = signal<Me | null>(null);
  private loading: Promise<void> | null = null;

  /** The signed-in person, or null until read. */
  readonly me = this.current.asReadonly();

  /** Reads the person the first time it is called; later calls wait for that read, or read again after a failure. */
  load(): Promise<void> {
    this.loading ??= this.api.getMe().then((result) => {
      if (result.ok) this.current.set(result.value);
      else this.loading = null;
    });
    return this.loading;
  }
}
