import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import type { MeetingSummary } from '@core/api/types';
import { CLOCK } from '@core/realtime/clock';
import {
  bySeries,
  isClosed,
  meetingDay,
  meetingTime,
  pastByMonth,
  upcomingByWeek,
} from '@domain/meetings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { Skeleton } from '@ui/skeleton/skeleton';
import { meetingErrorView } from './meeting-errors';
import { MeetingsStore } from './meetings-store';
import { StoryDraftsStore } from './story-drafts-store';
import { NewMeetingDialog, type NewMeetingData } from './new-meeting-dialog';

/** One line of the left column. */
interface MeetingLine {
  readonly id: string;
  readonly title: string;
  readonly sub: string;
  readonly live: boolean;
}

/** "3 topics", "1 topic", "no topics". */
function topicCount(n: number): string {
  return n === 0 ? 'no topics' : n === 1 ? '1 topic' : `${n} topics`;
}

/** The left column's line for a meeting: its title, and when it is with how many topics. */
export function meetingLine(m: MeetingSummary): MeetingLine {
  const when =
    m.status === 'in_progress'
      ? `${meetingTime(m.startsAt)} · in progress`
      : m.status === 'planned'
        ? `${meetingDay(m.startsAt)} ${meetingTime(m.startsAt)}`
        : m.status === 'cancelled'
          ? `${meetingDay(m.startsAt)} · cancelled`
          : meetingDay(m.startsAt);
  return {
    id: m.id,
    title: m.title,
    sub: `${when} · ${topicCount(m.topicCount)}`,
    live: m.status === 'in_progress',
  };
}

/** The views of the left column below the meetings running now. */
export const MEETING_VIEWS = ['upcoming', 'past', 'series'] as const;
export type MeetingView = (typeof MEETING_VIEWS)[number];
const VIEW_LABELS: Readonly<Record<MeetingView, string>> = {
  upcoming: 'Upcoming',
  past: 'Past',
  series: 'Series',
};

/** How many past meetings show before Show older, and how many more each click shows. */
export const PAST_PAGE = 12;
/** How many meetings of a series the series view shows before Show all. */
export const SERIES_PAGE = 3;

/**
 * Meetings (`/meetings`): the weekly business meetings with stakeholders. The left column has a search over meetings,
 * open topics and notes, the meetings running now, then one of three views: upcoming (planned, by week), past (ended or
 * cancelled, by month, the latest first and older ones on request) or by series; with New meeting. The right shows the
 * one in the address. The shell reads the list once and provides the `MeetingsStore` the meeting view shares. 0 AIU.
 */
@Component({
  selector: 'ah-meetings-shell',
  imports: [
    Banner,
    Button,
    NgTemplateOutlet,
    RouterLink,
    RouterOutlet,
    Skeleton,
  ],
  providers: [MeetingsStore, StoryDraftsStore],
  styles: `
    :host {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    aside {
      width: 270px;
      flex: none;
    }
    .group {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--ink-muted);
      padding: 12px 10px 4px;
      margin: 0;
    }
    nav ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    nav {
      padding: 0 6px 6px;
    }
    a.line {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border-radius: var(--radius-md);
      color: var(--ink);
      text-decoration: none;
    }
    a.line:hover {
      background: var(--surface-hover);
      color: var(--ink);
    }
    a.line[aria-current='page'] {
      background: var(--accent-soft);
    }
    .title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--live);
      flex: none;
    }
    .loading {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 16px;
    }
    .empty {
      padding: 12px 16px 16px;
    }
    .search {
      padding: 8px 12px 0;
    }
    .search input {
      width: 100%;
    }
    .views {
      display: flex;
      gap: 4px;
      padding: 10px 12px 0;
    }
    .views button[aria-pressed='true'] {
      background: var(--accent-soft);
    }
    .more {
      padding: 4px 10px;
    }
    .found {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-weight: 400;
    }
    .status-line {
      padding: 8px 16px;
    }
    /* On a narrow screen the list goes above the meeting instead of squeezing it, and scrolls on its own so the
       meeting opened from it starts within the first screen. */
    @media (max-width: 760px) {
      :host {
        flex-direction: column;
        align-items: stretch;
      }
      aside {
        width: auto;
        max-height: 45vh;
        overflow-y: auto;
      }
    }
    /* Not a <main>: the app shell already has the page's one main landmark. */
    .meetings-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
  `,
  template: `
    <aside class="ah-panel" aria-labelledby="meetings-heading">
      <div class="ah-panel__head">
        <h2 class="ah-panel__title" id="meetings-heading">Meetings</h2>
        <div class="ah-panel__actions">
          <button
            ahButton
            size="sm"
            type="button"
            [disabled]="!loaded()"
            (click)="newMeeting()"
          >
            New meeting
          </button>
        </div>
      </div>
      @if (loading() && !loaded()) {
        <div class="loading" aria-label="Loading meetings">
          <ah-skeleton width="70%" />
          <ah-skeleton width="50%" />
          <ah-skeleton width="60%" />
        </div>
      } @else if (loaded() && total() === 0) {
        <p class="empty ah-muted">
          No meetings yet. Plan the first one with New meeting.
        </p>
      } @else {
        <div class="search" role="search">
          <label class="ah-sr" for="meeting-search"
            >Search meetings, topics and notes</label
          >
          <input
            id="meeting-search"
            class="ah-input"
            type="search"
            autocomplete="off"
            placeholder="Search meetings, topics, notes"
            maxlength="100"
            [value]="query()"
            (input)="find(inputText($event))"
            (keydown.escape)="find('')"
          />
        </div>
        @if (query().trim().length >= 2) {
          <nav aria-label="Search results">
            @if (store.searchError() !== null) {
              <p class="status-line ah-hint" role="status">
                The search failed. Try again in a moment.
              </p>
            } @else if (!store.searching() && results(); as r) {
              @if (r.meetings.length + r.topics.length + r.notes.length === 0) {
                <p class="status-line ah-hint" role="status">
                  Nothing matches “{{ r.q }}”.
                </p>
              }
              @if (r.meetings.length > 0) {
                <h3 class="group">Meetings</h3>
                <ul>
                  @for (m of r.meetings; track m.id) {
                    <li>
                      <a class="line" [routerLink]="['/meetings', m.id]">
                        <span class="title">{{ m.title }}</span>
                        <span class="ah-hint">{{ line(m).sub }}</span>
                      </a>
                    </li>
                  }
                </ul>
              }
              @if (r.topics.length > 0) {
                <h3 class="group">Topics</h3>
                <ul>
                  @for (t of r.topics; track t.id) {
                    <li>
                      <a class="line" [routerLink]="['/meetings', t.meetingId]">
                        <span class="title found">{{ t.title }}</span>
                        <span class="ah-hint"
                          >{{ t.meetingTitle }} ·
                          {{ day(t.meetingStartsAt) }}</span
                        >
                      </a>
                    </li>
                  }
                </ul>
              }
              @if (r.notes.length > 0) {
                <h3 class="group">Notes</h3>
                <ul>
                  @for (n of r.notes; track n.note.id) {
                    <li>
                      <a class="line" [routerLink]="['/meetings', n.meetingId]">
                        <span class="title found">{{ n.note.text }}</span>
                        <span class="ah-hint"
                          >{{ n.topicTitle }} · {{ n.meetingTitle }} ·
                          {{ day(n.meetingStartsAt) }}</span
                        >
                      </a>
                    </li>
                  }
                </ul>
              }
            } @else {
              <p class="status-line ah-hint" role="status">Searching…</p>
            }
          </nav>
        } @else {
          <nav aria-label="Meetings">
            @if (now().length > 0) {
              <h3 class="group">Now</h3>
              <ul>
                @for (line of now(); track line.id) {
                  <ng-container
                    *ngTemplateOutlet="lineTpl; context: { $implicit: line }"
                  />
                }
              </ul>
            }
            <div class="views" role="group" aria-label="Which meetings to list">
              @for (v of views; track v) {
                <button
                  ahButton="ghost"
                  size="sm"
                  type="button"
                  [attr.aria-pressed]="view() === v"
                  (click)="chosenView.set(v)"
                >
                  {{ viewLabel[v] }}
                </button>
              }
            </div>
            @for (section of sections(); track section.key) {
              <h3 class="group">{{ section.label }}</h3>
              <ul>
                @for (line of section.lines; track line.id) {
                  <ng-container
                    *ngTemplateOutlet="lineTpl; context: { $implicit: line }"
                  />
                }
              </ul>
              @if (section.hidden > 0) {
                <button
                  ahButton="ghost"
                  size="sm"
                  type="button"
                  class="more"
                  (click)="showAll(section.key)"
                >
                  Show all {{ section.hidden + section.lines.length }}
                </button>
              }
            } @empty {
              <p class="status-line ah-hint">{{ emptyText() }}</p>
            }
            @if (olderHidden() > 0) {
              <button
                ahButton="ghost"
                size="sm"
                type="button"
                class="more"
                (click)="pastShown.set(pastShown() + pastPage)"
              >
                Show older ({{ olderHidden() }})
              </button>
            }
          </nav>
        }
      }
      <ng-template #lineTpl let-line>
        <li>
          <a
            class="line"
            [routerLink]="['/meetings', line.id]"
            [attr.aria-current]="line.id === openId() ? 'page' : null"
          >
            <span class="title">
              @if (line.live) {
                <span class="dot" aria-hidden="true"></span>
              }
              {{ line.title }}
            </span>
            <span class="ah-hint">{{ line.sub }}</span>
          </a>
        </li>
      </ng-template>
    </aside>
    <div class="meetings-main">
      @if (listFailure(); as problem) {
        <ah-banner
          [variant]="problem.variant"
          [heading]="problem.heading"
          [tech]="problem.tech ?? ''"
        >
          {{ problem.text }}
          <button ahButton size="sm" type="button" (click)="store.load()">
            Try again
          </button>
        </ah-banner>
      }
      <router-outlet />
    </div>
  `,
})
export class MeetingsShell {
  protected readonly store = inject(MeetingsStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  protected readonly loading = this.store.loading;
  protected readonly loaded = this.store.loaded;
  protected readonly openId = computed(() => this.store.meeting()?.id ?? null);
  protected readonly total = computed(() => this.store.meetings().length);
  private readonly clock = inject(CLOCK);
  protected readonly views = MEETING_VIEWS;
  protected readonly viewLabel = VIEW_LABELS;
  protected readonly pastPage = PAST_PAGE;
  protected readonly line = meetingLine;
  protected readonly day = meetingDay;

  /** The view the person picked; until then, past for a closed meeting on the right and upcoming otherwise. */
  readonly chosenView = signal<MeetingView | null>(null);
  protected readonly view = computed<MeetingView>(() => {
    const chosen = this.chosenView();
    if (chosen !== null) return chosen;
    const open = this.store.meeting();
    return open !== null && isClosed(open.status) ? 'past' : 'upcoming';
  });
  /** How many past meetings show; Show older adds a page. */
  readonly pastShown = signal(PAST_PAGE);
  /** The series whose meetings all show in the series view. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  /** What is typed in the search box. */
  readonly query = signal('');
  /** What the search found, for the text in the box. */
  protected readonly results = computed(() => {
    const found = this.store.searchResult();
    return found === null || found.q !== this.query().trim().slice(0, 100)
      ? null
      : { q: found.q, ...found.result };
  });

  protected readonly now = computed(() =>
    this.store.groups().now.map(meetingLine)
  );
  /** The sections of the chosen view, each with how many of its meetings are left out until asked for. */
  protected readonly sections = computed(() => {
    const meetings = this.store.meetings();
    switch (this.view()) {
      case 'upcoming':
        return upcomingByWeek(meetings, this.clock.now()).map((s) => ({
          key: s.key,
          label: s.label,
          lines: s.meetings.map(meetingLine),
          hidden: 0,
        }));
      case 'past': {
        let budget = this.pastShown();
        return pastByMonth(meetings).flatMap((s) => {
          if (budget <= 0) return [];
          const shown = s.meetings.slice(0, budget);
          budget -= shown.length;
          return [
            {
              key: s.key,
              label: s.label,
              lines: shown.map(meetingLine),
              hidden: 0,
            },
          ];
        });
      }
      case 'series': {
        const open = this.expanded();
        return bySeries(meetings).map((s) => {
          const all = open.has(s.key) || s.meetings.length <= SERIES_PAGE;
          const shown = all ? s.meetings : s.meetings.slice(0, SERIES_PAGE);
          return {
            key: s.key,
            label: s.label,
            lines: shown.map(meetingLine),
            hidden: s.meetings.length - shown.length,
          };
        });
      }
    }
  });
  /** How many past meetings Show older would still add. */
  protected readonly olderHidden = computed(() =>
    this.view() === 'past'
      ? Math.max(0, this.store.groups().past.length - this.pastShown())
      : 0
  );
  protected readonly emptyText = computed(() =>
    this.view() === 'upcoming'
      ? 'No meeting is planned. Plan one with New meeting.'
      : this.view() === 'past'
        ? 'No meeting has ended yet.'
        : 'No meetings yet.'
  );
  protected readonly listFailure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : meetingErrorView(error);
  });

  constructor() {
    void this.store.load();
  }

  /** Shows every meeting of one series in the series view. */
  protected showAll(key: string): void {
    this.expanded.set(new Set([...this.expanded(), key]));
  }

  /** Searches as the person types; a blank box, or Esc, shows the list again. */
  protected find(text: string): void {
    this.query.set(text);
    this.store.search(text);
  }

  protected inputText(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  /** Plans a meeting and opens it. */
  protected newMeeting(): void {
    this.store.dismissError();
    const ref = this.dialogs.open<string, NewMeetingData>(NewMeetingDialog, {
      data: { store: this.store },
      width: '520px',
    });
    ref.closed.subscribe((id) => {
      if (id !== undefined) void this.router.navigate(['/meetings', id]);
    });
  }
}
