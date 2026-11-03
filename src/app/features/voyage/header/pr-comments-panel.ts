import { Component, computed, inject } from '@angular/core';
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
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Nowrap, Table } from '@ui/table/table';
import { VoyageContext } from '../context/voyage-context';
import { VoyageDialogs } from '../dialogs/voyage-dialogs';
import { PrComments } from './pr-comments';

/** Why Assess comments is not offered, in words. */
const BLOCKED: Readonly<Record<AssessBlock, string>> = {
  not_at_delivery:
    'People’s comments can be assessed at the delivery gate, or once the voyage is done while a pull request is open.',
  running: 'A run is in progress; assess the comments once it has ended.',
  no_open_pr:
    'Every pull request of this voyage is merged or closed: a change now is a new story.',
  no_budget: 'No budget left: raise the budget first.',
};

/**
 * The Pull request comments panel (`ahoy-hosted` design §4, "PR comments"). Copilot's comments are ruled on by the
 * reviewer in every review round by themselves; people's only when someone clicks Assess comments, which this panel
 * offers at the delivery gate or on a done voyage with an open pull request, with the count of people's comments the
 * reconciler last found without a ruling. It lists every ruling, its reason and where Ahoy's reply to it is. Comment
 * text is untrusted and shown as plain text. Hidden while there is nothing to assess and nothing ruled.
 */
@Component({
  selector: 'ah-pr-comments-panel',
  imports: [Button, Nowrap, Panel, PanelBody, PanelHead, RelativePipe, Table],
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
  `,
  template: `
    @if (visible()) {
      <ah-panel>
        <ah-panel-head
          heading="Pull request comments"
          subtitle="Copilot’s are reviewed in every round; people’s when you ask"
        >
          @if (offered()) {
            <button
              type="button"
              ahButton="soft"
              size="sm"
              ahPanelActions
              (click)="assess()"
            >
              Assess comments
            </button>
          }
        </ah-panel-head>
        <ah-panel-body>
          <div class="comments" aria-label="Pull request comments">
            @if (count(); as c) {
              <p>
                <b>{{ waiting() }}</b>
                <span class="ah-muted">
                  · on {{ c.openPrs }} open pull request{{
                    c.openPrs === 1 ? '' : 's'
                  }}
                  · counted {{ c.checkedAt | ahRelative }}</span
                >
              </p>
              @if (c.error !== null) {
                <p class="ah-muted">
                  The last count could not read GitHub ({{ c.error }}); the
                  number is the one before.
                </p>
              }
            } @else if (comments.state() === 'error') {
              <p class="ah-muted">Could not read the pull request comments.</p>
            } @else if (comments.state() === 'ready') {
              <p class="ah-muted">
                People’s comments are counted every few minutes while the voyage
                waits at the delivery gate or is done.
              </p>
            }
            @if (blocked(); as why) {
              <p class="ah-muted">{{ why }}</p>
            }
            @if (rulings().length > 0) {
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
                    @for (row of rulings(); track row.id) {
                      <tr>
                        <td>
                          <b>{{ row.author }}</b>
                          <span class="ah-muted">
                            ({{ row.source }}) · {{ row.repo }} #{{
                              row.prNumber
                            }}
                            · {{ row.place }}</span
                          >
                          <div class="comments__excerpt">{{ row.excerpt }}</div>
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
            }
          </div>
        </ah-panel-body>
      </ah-panel>
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

  protected readonly rulings = computed(() =>
    (this.comments.comments()?.rulings ?? []).map(rulingRow)
  );

  /** Shown at the delivery gate, once done, or as soon as anything was ruled. */
  protected readonly visible = computed(() => {
    const story = this.context.story();
    if (story === null) return false;
    const atDelivery = this.context.gateKey() === 'delivery_accepted';
    const done = story.status === 'terminal' && story.phase === 'done';
    return atDelivery || done || this.rulings().length > 0;
  });

  protected assess(): void {
    const waiting = this.count()?.waiting ?? null;
    this.dialogs
      .assessComments({ context: this.context, waiting })
      .closed.subscribe((story) => {
        if (story !== undefined) void this.comments.load();
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
