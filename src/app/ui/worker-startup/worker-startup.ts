import { Component, computed, inject, input } from '@angular/core';
import { workerStartup } from '@domain/worker-startup';
import type { RuntimeStatus } from '@domain/types';
import { CLOCK } from '@ui/pipes/clock';

/** In-context, accessible worker startup feedback; runtime evidence is always plain text. */
@Component({
  selector: 'ah-worker-startup',
  template: `
    @if (view(); as v) {
      <div class="ah-panel__body" role="status">
        <b>{{ v.heading }}</b>
        <p>{{ v.detail }}</p>
        @if (v.evidence !== '') {
          <details>
            <summary>Worker status details</summary>
            <p>{{ v.evidence }}</p>
          </details>
        }
      </div>
    }
  `,
  styles: `
    p {
      margin: 4px 0 0;
      overflow-wrap: anywhere;
    }
    details {
      margin-top: 8px;
      overflow-wrap: anywhere;
    }
  `,
})
export class WorkerStartupNotice {
  private readonly clock = inject(CLOCK);
  /** Run lifecycle and optional runtime observation; absent observations preserve the incumbent UI. */
  readonly run = input.required<{
    readonly status: string;
    readonly cancelRequested?: boolean;
    readonly runtimeStatus?: RuntimeStatus | null;
  }>();

  protected readonly view = computed(() =>
    workerStartup(this.run(), this.clock())
  );
}
