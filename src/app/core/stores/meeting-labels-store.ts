import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type { MeetingSettings } from '@core/api/types';
import { DEFAULT_MEETING_LABELS, type MeetingLabels } from '@domain/meetings';

/** The labels a page of the meetings settings gives. */
export function meetingLabelsOf(settings: MeetingSettings): MeetingLabels {
  return { us: settings.usLabel, them: settings.themLabel };
}

/**
 * The names the meeting pages show for the two sides of a meeting (Team settings › Meetings). Read once, the first time
 * a page asks; until then, and when it cannot be read, the defaults show. Team settings › Meetings tells it of a save,
 * so the pages follow without a reload. 0 AIU.
 */
@Injectable({ providedIn: 'root' })
export class MeetingLabelsStore {
  private readonly api = inject(ApiClient);
  private readonly current = signal<MeetingLabels>(DEFAULT_MEETING_LABELS);
  private loading: Promise<void> | null = null;

  /** The names now: the defaults until the settings are read. */
  readonly labels = this.current.asReadonly();

  /** Reads the settings the first time it is called; later calls wait for that read. */
  load(): Promise<void> {
    this.loading ??= this.api.getMeetingSettings().then((result) => {
      if (result.ok) this.current.set(meetingLabelsOf(result.value.meetings));
    });
    return this.loading;
  }

  /** What Team settings › Meetings saved or read. */
  set(settings: MeetingSettings): void {
    this.current.set(meetingLabelsOf(settings));
  }
}
