/**
 * The mock's whole state: the voyages, the global event log (ids increase across stories, as in the real API), the gate
 * record ids, and the open event streams that every new event is pushed to.
 */
import type { AhoyEvent, GateRecord, Run } from '@core/api/types';
import { iso, type MockClock } from './clock';
import type { StreamHub } from './event-stream';
import type { Voyage, Writable } from './voyage';

/** An event to be written: everything but its id. */
export type NewEvent = Omit<AhoyEvent, 'id'>;

/** The state of the mock server. */
export class World {
  readonly voyages = new Map<string, Voyage>();
  readonly events: AhoyEvent[] = [];
  readonly clock: MockClock;
  readonly hub: StreamHub;
  private readonly runIndex = new Map<
    string,
    { readonly voyage: Voyage; readonly run: Writable<Run> }
  >();
  private nextEventId = 1;
  private nextGateId = 1;

  constructor(clock: MockClock, hub: StreamHub) {
    this.clock = clock;
    this.hub = hub;
  }

  /** Now, as the API writes it. */
  nowIso(): string {
    return iso(this.clock.now());
  }

  /** Writes an event now and pushes it to the open streams. */
  append(
    voyage: Voyage,
    type: string,
    actor: string,
    payload: Readonly<Record<string, unknown>>
  ): AhoyEvent {
    return this.record({
      storyKey: voyage.story.key,
      type,
      actor,
      payload,
      createdAt: this.nowIso(),
    });
  }

  /** Writes an event as given (seeds pass their own time) and pushes it to the open streams. */
  record(event: NewEvent): AhoyEvent {
    const written: AhoyEvent = { id: String(this.nextEventId++), ...event };
    this.events.push(written);
    this.hub.publish(written);
    return written;
  }

  /** The events with an id greater than `after`, of one story or all, oldest first, at most `limit`. */
  eventsAfter(
    after: number,
    story: string | null,
    limit = Number.POSITIVE_INFINITY
  ): AhoyEvent[] {
    const found: AhoyEvent[] = [];
    for (const event of this.events) {
      if (found.length >= limit) break;
      if (
        Number(event.id) > after &&
        (story === null || event.storyKey === story)
      )
        found.push(event);
    }
    return found;
  }

  /** Records a change of the story: a new version and `updatedAt`. */
  touch(voyage: Voyage, at = this.clock.now()): void {
    voyage.story.version += 1;
    voyage.story.updatedAt = iso(at);
  }

  /** Adds a gate record with the next id. */
  addGateRecord(voyage: Voyage, record: Omit<GateRecord, 'id'>): GateRecord {
    const written: GateRecord = { id: String(this.nextGateId++), ...record };
    voyage.gates.push(written);
    return written;
  }

  /** Adds a run to its story and to the index `getRun` reads. */
  addRun(voyage: Voyage, run: Writable<Run>): void {
    voyage.runs.push(run);
    this.runIndex.set(run.id, { voyage, run });
  }

  /** A run by id, wherever it is. */
  findRun(runId: string): Writable<Run> | null {
    return this.runIndex.get(runId)?.run ?? null;
  }

  /** The id the newest event has, or 0. */
  get lastEventId(): number {
    return this.nextEventId - 1;
  }
}
