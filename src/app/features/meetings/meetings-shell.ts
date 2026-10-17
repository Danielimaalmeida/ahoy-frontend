import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import type { MeetingSummary } from '@core/api/types';
import { meetingDay, meetingTime } from '@domain/meetings';
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
        : meetingDay(m.startsAt);
  return {
    id: m.id,
    title: m.title,
    sub: `${when} · ${topicCount(m.topicCount)}`,
    live: m.status === 'in_progress',
  };
}

/**
 * Meetings (`/meetings`): the weekly business meetings with stakeholders. The left column lists the meetings running
 * now, the planned ones (soonest first) and the ended ones (latest first), with New meeting; the right shows the one in
 * the address. The shell reads the list once and provides the `MeetingsStore` the meeting view shares. 0 AIU.
 */
@Component({
  selector: 'ah-meetings-shell',
  imports: [Banner, Button, RouterLink, RouterOutlet, Skeleton],
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
    main {
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
        <nav aria-label="Meetings">
          @for (group of groups(); track group.name) {
            @if (group.lines.length > 0) {
              <h3 class="group">{{ group.name }}</h3>
              <ul>
                @for (line of group.lines; track line.id) {
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
                }
              </ul>
            }
          }
        </nav>
      }
    </aside>
    <main>
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
    </main>
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
  protected readonly groups = computed(() => {
    const g = this.store.groups();
    return [
      { name: 'Now', lines: g.now.map(meetingLine) },
      { name: 'Next', lines: g.next.map(meetingLine) },
      { name: 'Past', lines: g.past.map(meetingLine) },
    ];
  });
  protected readonly listFailure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : meetingErrorView(error);
  });

  constructor() {
    void this.store.load();
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
