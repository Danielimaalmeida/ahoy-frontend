import { Component, computed, effect, inject, signal } from '@angular/core';
import { EventBus } from '@core/realtime/event-bus';
import {
  StoryEventsFeed,
  type StoryEventsHandle,
} from '@core/stores/story-events-feed';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { SkeletonRows, type SkeletonColumn } from '@ui/skeleton/skeleton';
import { ShipsLog } from '@ui/ships-log/ships-log';
import { VoyageContext } from '../../context/voyage-context';
import { PAGE_SIZE, logEntries, visibleCount } from './log-entries';

const SKELETON_COLUMNS: readonly SkeletonColumn[] = [
  { track: '80px' },
  { track: '10px', height: 10 },
  { track: 'minmax(0, 1fr)' },
  { track: '120px' },
];

/**
 * The Activity tab (lane 5B, `Records` board): every event of the voyage, newest first, from the `StoryEventsFeed`
 * the voyage page already holds (so opening the tab asks the API for nothing more). `run.progress` is not here: those are
 * the live steps, on the Runs tab. The last 14 events show first, then 20 more per click. An event of a type this version
 * does not know shows under its own type with a short detail, never its payload.
 */
@Component({
  selector: 'ah-log-tab',
  imports: [
    Banner,
    Button,
    Panel,
    PanelBody,
    PanelHead,
    ShipsLog,
    SkeletonRows,
  ],
  styles: `
    :host {
      display: block;
    }
    .log__more {
      display: flex;
      justify-content: center;
      padding: 10px 16px;
      border-top: 1px solid var(--line);
    }
    .log__live {
      margin-left: auto;
    }
  `,
  template: `
    <ah-panel>
      <ah-panel-head
        heading="Activity"
        subtitle="Every event, newest first. Updates arrive live."
      >
        <span class="log__live" role="status">
          @if (stream() === 'reconnecting') {
            <span class="ah-badge ah-badge--input">Reconnecting…</span>
          } @else if (stream() === 'offline') {
            <span class="ah-badge ah-badge--queued">Live updates are off</span>
          } @else {
            <span class="ah-live">Live</span>
          }
        </span>
      </ah-panel-head>
      @if (failed()) {
        <ah-panel-body>
          <ah-banner variant="error" heading="Could not read activity">
            Nothing you did is lost.
            <button ahButton size="sm" type="button" (click)="retry()">
              Try again
            </button>
          </ah-banner>
        </ah-panel-body>
      } @else if (loading()) {
        <ah-panel-body
          ><ah-skeleton-rows [rows]="6" [columns]="skeletonColumns"
        /></ah-panel-body>
      } @else {
        @if (stale()) {
          <ah-panel-body>
            <ah-banner
              variant="notice"
              icon="info"
              announce="off"
              heading="The log may be out of date"
            >
              The last read failed; what is shown is what was read before.
              <button ahButton size="sm" type="button" (click)="retry()">
                Try again
              </button>
            </ah-banner>
          </ah-panel-body>
        }
        <ah-ships-log [entries]="shown()" />
        @if (hidden() > 0) {
          <div class="log__more">
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              (click)="showMore()"
            >
              Show {{ nextPage() }} earlier events
            </button>
          </div>
        } @else if (truncated()) {
          <div class="log__more ah-hint">Older events are not loaded.</div>
        }
      }
    </ah-panel>
  `,
})
export class LogTab {
  private readonly context = inject(VoyageContext);
  private readonly feeds = inject(StoryEventsFeed);
  private readonly bus = inject(EventBus);

  protected readonly skeletonColumns = SKELETON_COLUMNS;

  /** The voyage's event feed, shared with the voyage page: holding it here starts no second read. */
  private readonly feed = signal<StoryEventsHandle | null>(null);

  /** How many times "Show earlier events" was pressed. */
  private readonly clicks = signal(0);

  protected readonly stream = this.bus.status;

  private readonly entries = computed(() => {
    const key = this.context.key();
    const events = this.feed()?.events() ?? [];
    return logEntries(events, (runId) => `/voyages/${key ?? ''}/runs/${runId}`);
  });

  protected readonly shown = computed(() =>
    this.entries().slice(0, visibleCount(this.entries().length, this.clicks()))
  );
  protected readonly hidden = computed(
    () => this.entries().length - this.shown().length
  );
  protected readonly nextPage = computed(() =>
    Math.min(PAGE_SIZE, this.hidden())
  );
  protected readonly truncated = computed(
    () => this.feed()?.truncated() ?? false
  );

  /** The history is still being read for the first time. */
  protected readonly loading = computed(() => {
    const feed = this.feed();
    return (
      feed === null ||
      (feed.events().length === 0 &&
        feed.status() !== 'error' &&
        feed.status() !== 'ready')
    );
  });

  /** The read failed and there is nothing earlier to show. */
  protected readonly failed = computed(() => {
    const feed = this.feed();
    return (
      feed !== null && feed.events().length === 0 && feed.status() === 'error'
    );
  });

  /** A read failed but events were read before: the list stays, with a notice. */
  protected readonly stale = computed(() => {
    const feed = this.feed();
    return (
      feed !== null && feed.events().length > 0 && feed.status() === 'error'
    );
  });

  constructor() {
    // Hold the feed of the open voyage, and let it go (or switch to the next voyage's) when the key changes.
    effect((onCleanup) => {
      const key = this.context.key();
      this.clicks.set(0);
      if (key === null) {
        this.feed.set(null);
        return;
      }
      const handle = this.feeds.for(key);
      this.feed.set(handle);
      onCleanup(() => handle.release());
    });
  }

  protected showMore(): void {
    this.clicks.update((n) => n + 1);
  }

  protected retry(): void {
    void this.feed()?.refresh();
  }
}
