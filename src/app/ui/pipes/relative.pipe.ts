import type { PipeTransform } from '@angular/core';
import { Pipe, inject } from '@angular/core';
import { relativeTime, waitingTime } from '@domain/time';
import { CLOCK } from './clock';

/** `ago` reads "22 m ago"; `waiting` reads "22 m", for the "Waiting" column. */
export type RelativeForm = 'ago' | 'waiting';

/**
 * Shows how long ago something happened, measured against the `CLOCK`: `{{ story.updatedAt | ahRelative }}` gives
 * "22 m ago"; `| ahRelative: 'waiting'` gives "22 m". It is impure because "now" changes; the work is a few comparisons.
 */
@Pipe({ name: 'ahRelative', pure: false })
export class RelativePipe implements PipeTransform {
  private readonly clock = inject(CLOCK);

  transform(
    at: Date | string | null | undefined,
    form: RelativeForm = 'ago'
  ): string {
    if (at === null || at === undefined) return '—';
    const now = this.clock();
    return form === 'waiting' ? waitingTime(at, now) : relativeTime(at, now);
  }
}
