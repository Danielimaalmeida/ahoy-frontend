import { Component, computed, inject, signal } from '@angular/core';
import type { PrCommentRuling } from '@core/api/types';
import {
  assessBlock,
  commentPlace,
  replyLabel,
  RULING_LABELS,
  waitingLabel,
  type AssessBlock,
} from '@domain/pr-comments';
import { Button } from '@ui/button/button';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Nowrap, Table } from '@ui/table/table';
import { VoyageContext } from '../context/voyage-context';
import { VoyageDialogs } from '../dialogs/voyage-dialogs';
import { PrComments } from './pr-comments';

/** How many rulings an opened panel lists before "Show the other N". */
const FIRST_RULINGS = 4;

/** Why Assess comments is not offered, in words. */
const BLOCKED: Readonly<Record<AssessBlock, string>> = {
  not_at_delivery:
    'People’s comments can be assessed at the delivery gate, or once the voyage is done while a pull request is open.',
  running: 'A run is in progress; assess the comments once it has ended.',
  not_counted:
    'The pull requests have not been counted yet: Assess comments is offered once they are, within a few minutes.',
  no_open_pr:
    'Every pull request of this voyage is merged or closed: a change now is a new story.',
  no_budget: 'No budget left: raise the budget first.',
};

/**
 * The Pull request comments panel (`ahoy-hosted` design §4, "PR comments"). Copilot's comments are ruled on by the
 * reviewer in every review round by themselves; people's only when someone clicks Assess comments, which this panel
 * offers at the delivery gate or on a done voyage with an open pull request, with the count of people's comments the
 * reconciler last found without a ruling. It starts closed, as one line with how many comments wait and how many were
 * ruled; opened, it lists the newest rulings (all of them on "Show the other N"), each with its reason and where Ahoy's
 * reply to it is. Comment text is untrusted and shown as plain text. Hidden while there is nothing to assess and nothing
 * ruled.
 */
@Component({
  selector: 'ah-pr-comments-panel',
  imports: [Button, Nowrap, RelativePipe, Table],
  providers: [PrComments],
  styles: `
    :host {
      display: block;
    }
    .comments {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      overflow-wrap: anywhere;
    }
    .comments p {
      margin: 0;
    }
    .comments__table {
      overflow-x: auto;
    }
    .comments__excerpt {
      white-space: pre-line;
    }
    .comments__head--closed {
      border-bottom: 0;
    }
    .comments__title {
      margin: 0;
    }
    .comments__toggle {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1\\.5);
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .comments__toggle:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }
    .comments__chevron {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: var(--ink-muted);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    [aria-expanded='true'] .comments__chevron {
      transform: rotate(90deg);
    }
    @media (prefers-reduced-motion: no-preference) {
      .comments__chevron {
        transition: transform 0.15s;
      }
    }
    .comments__pill {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--surface-hover);
      color: var(--ink-soft);
      font-size: 11.5px;
      font-weight: 600;
    }
    .comments__pill--waiting {
      background: var(--status-decision-bg);
      color: var(--status-decision-fg);
    }
    .comments__assess {
      margin-left: auto;
    }
    .comments__more {
      align-self: flex-start;
    }
  `,
  template: `
    @if (visible()) {
      <section class="ah-panel" aria-labelledby="pr-comments-title">
        <div class="ah-panel__head" [class.comments__head--closed]="!open()">
          <h2 class="ah-panel__title comments__title" id="pr-comments-title">
            <button
              type="button"
              class="comments__toggle"
              aria-controls="pr-comments-body"
              [attr.aria-expanded]="open()"
              (click)="toggle()"
            >
              <svg
                class="comments__chevron"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
              Pull request comments
            </button>
          </h2>
          @if (count(); as c) {
            <span
              class="comments__pill"
              [class.comments__pill--waiting]="c.waiting > 0"
              >{{ c.waiting }} waiting</span
            >
          }
          @if (rulings().length > 0) {
            <span class="comments__pill">{{ rulings().length }} ruled</span>
          }
          @if (count(); as c) {
            <span class="ah-muted comments__counted"
              >· counted {{ c.checkedAt | ahRelative }}</span
            >
          }
          @if (offered()) {
            <button
              type="button"
              ahButton="soft"
              size="sm"
              class="comments__assess"
              (click)="assess()"
            >
              Assess comments
            </button>
          }
        </div>
        @if (open()) {
          <div class="ah-panel__body" id="pr-comments-body">
            <div class="comments">
              <p class="ah-muted">
                Copilot’s are reviewed in every round; people’s, and Copilot’s
                after the last round, when you ask.
              </p>
              @if (count(); as c) {
                <p>
                  <b>{{ waiting() }}</b>
                  <span class="ah-muted">
                    · on {{ c.openPrs }} open pull request{{
                      c.openPrs === 1 ? '' : 's'
                    }}</span
                  >
                </p>
                @if (c.error !== null) {
                  <p class="ah-muted">
                    The last count could not read GitHub ({{ c.error }}); the
                    number is the one before.
                  </p>
                }
              } @else if (comments.state() === 'error') {
                <p class="ah-muted">
                  Could not read the pull request comments.
                  <button
                    type="button"
                    ahButton="ghost"
                    size="sm"
                    (click)="comments.load()"
                  >
                    Try again
                  </button>
                </p>
              } @else if (comments.state() === 'ready') {
                <p class="ah-muted">
                  People’s comments are counted every few minutes while the
                  voyage waits at the delivery gate or is done.
                </p>
              }
              @if (blocked(); as why) {
                <p class="ah-muted">{{ why }}</p>
              }
              @if (shown().length > 0) {
                <div class="comments__table">
                  <table ahTable>
                    <thead>
                      <tr>
                        <th>Comment</th>
                        <th>Ruling</th>
                        <th>Reason</th>
                        <th>Reply</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of shown(); track row.id) {
                        <tr>
                          <td>
                            <b>{{ row.author }}</b>
                            <span class="ah-muted">
                              ({{ row.source }}) · {{ row.repo }} #{{
                                row.prNumber
                              }}
                              · {{ row.place }}</span
                            >
                            <div class="comments__excerpt">
                              {{ row.excerpt }}
                            </div>
                          </td>
                          <td ahNowrap>
                            {{ row.ruling }}
                            @if (row.severity !== null) {
                              <span class="ah-muted">({{ row.severity }})</span>
                            }
                          </td>
                          <td>{{ row.reason }}</td>
                          <td>
                            {{ row.reply }}
                            @if (row.replyError !== null) {
                              <div class="ah-muted">{{ row.replyError }}</div>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (hidden() > 0) {
                  <button
                    type="button"
                    ahButton="ghost"
                    size="sm"
                    class="comments__more"
                    (click)="showAll.set(true)"
                  >
                    Show the other {{ hidden() }}
                    {{ hidden() === 1 ? 'ruling' : 'rulings' }}
                  </button>
                }
              }
            </div>
          </div>
        }
      </section>
    }
  `,
})
export class PrCommentsPanel {
  private readonly context = inject(VoyageContext);
  private readonly dialogs = inject(VoyageDialogs);
  protected readonly comments = inject(PrComments);

  protected readonly count = computed(
    () => this.comments.comments()?.count ?? null
  );
  protected readonly waiting = computed(() => waitingLabel(this.count()));

  /** Why the button is not offered, or null when it is. */
  private readonly block = computed((): AssessBlock | null => {
    const story = this.context.story();
    if (story === null) return 'not_at_delivery';
    return assessBlock(
      story,
      this.context.gateKey(),
      this.count(),
      this.context.remainingNanoAiu()
    );
  });

  protected readonly offered = computed(() => this.block() === null);

  /** The reason the button is missing, shown only where the voyage could otherwise take it. */
  protected readonly blocked = computed(() => {
    const block = this.block();
    return block === null || block === 'not_at_delivery'
      ? null
      : BLOCKED[block];
  });

  /** Every ruling, newest first. */
  protected readonly rulings = computed(() =>
    [...(this.comments.comments()?.rulings ?? [])]
      .sort((a, b) => b.ruledAt.localeCompare(a.ruledAt))
      .map(rulingRow)
  );

  /** Whether the panel is open; it starts closed, one line, so the page below it is in reach. */
  protected readonly open = signal(false);
  /** Whether every ruling is listed, not only the newest {@link FIRST_RULINGS}. */
  protected readonly showAll = signal(false);
  /** The rulings listed: the newest few until "Show the other N". */
  protected readonly shown = computed(() =>
    this.showAll() ? this.rulings() : this.rulings().slice(0, FIRST_RULINGS)
  );
  /** How many rulings "Show the other N" would add. */
  protected readonly hidden = computed(
    () => this.rulings().length - this.shown().length
  );

  /** Shown at the delivery gate, once done, or as soon as anything was ruled. */
  protected readonly visible = computed(() => {
    const story = this.context.story();
    if (story === null) return false;
    const atDelivery = this.context.gateKey() === 'delivery_accepted';
    const done = story.status === 'terminal' && story.phase === 'done';
    return atDelivery || done || this.rulings().length > 0;
  });

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  protected assess(): void {
    const waiting = this.count()?.waiting ?? null;
    this.dialogs
      .assessComments({ context: this.context, waiting })
      .closed.subscribe((story) => {
        // An accepted request moves the version, which reads the comments again; a refused one may mean the count
        // is out of date (a pull request merged since), so it is read again here.
        if (story === undefined) void this.comments.load();
      });
  }
}

/** One ruling as its row reads. */
function rulingRow(r: PrCommentRuling) {
  return {
    id: r.id,
    author: r.author,
    source: r.source === 'copilot' ? 'Copilot' : 'person',
    repo: r.repo,
    prNumber: r.prNumber,
    place: commentPlace(r),
    excerpt: r.excerpt,
    ruling: RULING_LABELS[r.ruling],
    severity: r.ruling === 'accepted' ? r.severity : null,
    reason: r.reason,
    reply: replyLabel(r),
    replyError: r.status === 'reply_pending' ? r.replyError : null,
  };
}
