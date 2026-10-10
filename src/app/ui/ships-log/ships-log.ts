import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { actorLabel } from '@domain/identifiers';
import { absoluteTime } from '@domain/time';

/** The dot of a log entry: a person acted, a gate passed, waiting on a person, or the system. */
export type LogEntryKind = 'human' | 'pass' | 'wait' | 'system';

/** One event of the ship's log. */
export interface ShipsLogEntry {
  /** Unique within the log (the event id). */
  readonly id: string;
  /** ISO timestamp. */
  readonly at: string;
  /** The event, in words ("Gate evaluated"); shown in bold. */
  readonly title: string;
  /** What follows the title in plain text ("plan · pass"). */
  readonly details?: string;
  /** The API actor: an e-mail, or `ahoy-reconciler` for the system. */
  readonly actor: string;
  readonly kind: LogEntryKind;
  /** The run the event is about, linked to its run detail. */
  readonly run?: {
    readonly id: string;
    readonly link: string | readonly (string | number)[];
  };
}

/**
 * The ship's log (`ah-log`): the voyage's events in the order given (newest first), each with its time ("Tue 09:48"),
 * a dot for its kind, the event in bold with its details, a link to the run when there is one, and who did it (the
 * system shows as "Ahoy"). Every text is interpolated.
 */
@Component({
  selector: 'ah-ships-log',
  imports: [RouterLink],
  styles: `
    :host {
      display: block;
    }
  `,
  template: `
    <div class="ah-log" role="list" [attr.aria-label]="label()">
      @for (entry of entries(); track entry.id) {
        <div class="ah-log__row" role="listitem">
          <time class="ah-log__time" [attr.datetime]="entry.at">{{
            time(entry.at)
          }}</time>
          <span
            class="ah-log__dot"
            [class.ah-log__dot--human]="entry.kind === 'human'"
            [class.ah-log__dot--pass]="entry.kind === 'pass'"
            [class.ah-log__dot--wait]="entry.kind === 'wait'"
            aria-hidden="true"
          ></span>
          <span
            ><b>{{ entry.title }}</b
            >{{ entry.details ? ' ' + entry.details : '' }}
            @if (entry.run; as run) {
              · <a class="ah-key" [routerLink]="run.link">{{ run.id }}</a>
            }
          </span>
          <span class="ah-log__who">{{ who(entry.actor) }}</span>
        </div>
      } @empty {
        <div class="ah-log__row ah-hint" role="listitem">
          Nothing in the log yet.
        </div>
      }
    </div>
  `,
})
export class ShipsLog {
  /** The entries, newest first. */
  readonly entries = input.required<readonly ShipsLogEntry[]>();
  /** The list's accessible name. */
  readonly label = input('Activity');

  protected readonly time = absoluteTime;
  protected readonly who = actorLabel;
}
