import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { ConversationContextItem } from '@core/api/types';
import { CLOCK } from '@core/realtime/clock';
import { checkAiuLimit, formatAiu } from '@domain/aiu';
import {
  askRefusal,
  CONTEXT_KIND_WORDS,
  contextChipText,
  CONVERSATION_BUDGET_MAX_NANO_AIU,
  CONVERSATION_QUESTION_MAX,
  CONVERSATION_TURNS_MAX,
  openTurn,
  RECIPE_WORDS,
  sessionLine,
  TURN_STATUS_WORDS,
} from '@domain/conversations';
import { relativeTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Markdown } from '@ui/markdown/markdown';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Router } from '@angular/router';
import { AddContextDialog, type AddContextData } from './add-context-dialog';
import {
  DeleteConversationDialog,
  type DeleteConversationData,
} from './delete-conversation-dialog';
import { conversationErrorView } from './product-errors';
import { ProductStore } from './product-store';
import { ProposalCard } from './proposal-card';

/** How many of the latest things the agent read show under an answer being written. */
const ACTIVITY_SHOWN = 6;

/**
 * The conversation open on the Product page: what it is for, what the agent reads (pinned chips, added and removed by
 * its owner), the questions with their answers (streamed while the agent writes, with what it is reading), the stories
 * and topics it proposed and the questions it asks back, and the line to ask the next question. The right column says
 * what was spent, the session's state (warm for ten minutes after an answer), and cancels the question being answered.
 * Proposals have no buttons yet. Asking may spend AIU; the rest is 0 AIU.
 */
@Component({
  selector: 'ah-conversation-view',
  imports: [Banner, Button, EmptyState, Markdown, ProposalCard, Skeleton],
  styles: `
    :host {
      display: block;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: 16px;
      align-items: start;
    }
    .talk {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .head {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .title-row h2 {
      margin: 0;
      font-size: 18px;
      overflow-wrap: anywhere;
    }
    .title-row .actions {
      margin-left: auto;
      display: flex;
      gap: 6px;
    }
    .reads {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .reads .label {
      font-size: 12px;
      font-weight: 600;
      color: var(--ink-soft);
      margin-right: 2px;
    }
    .pin {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      background: var(--surface);
      padding: 2px 4px 2px 10px;
      font-size: 12px;
      font-weight: 600;
    }
    .pin .kind {
      color: var(--ink-muted);
      font-weight: 500;
    }
    .pin .text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 280px;
    }
    .pin button {
      border: 0;
      background: none;
      cursor: pointer;
      color: var(--ink-muted);
      font: inherit;
      padding: 0 4px;
      border-radius: var(--radius-pill);
    }
    .pin button:hover {
      color: var(--danger-text);
    }
    .turn {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .question {
      align-self: flex-end;
      max-width: 85%;
      background: var(--accent-soft);
      border-radius: var(--radius-lg);
      padding: 10px 14px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .question .who {
      display: block;
      font-size: 11px;
      color: var(--ink-muted);
      margin-bottom: 2px;
    }
    .answer {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .meta {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      font-size: 12px;
      color: var(--ink-muted);
    }
    .meta b {
      color: var(--ink);
    }
    .activity {
      list-style: none;
      margin: 0;
      padding: 8px 10px;
      background: var(--surface-sunken);
      border-radius: var(--radius-md);
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--ink-soft);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .activity li {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .proposals {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .asks {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ask {
      border: 1px solid var(--info-line);
      background: var(--info-bg);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ask ul {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .text {
      overflow-wrap: anywhere;
    }
    .composer {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .composer textarea {
      width: 100%;
      min-height: 72px;
      resize: vertical;
    }
    .send-row {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .send-row .cap {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--ink-soft);
    }
    .send-row .cap input {
      width: 72px;
    }
    .send-row .push {
      margin-left: auto;
    }
    .side {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .side h3 {
      margin: 0;
      font-size: 13px;
    }
    dl {
      margin: 0;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 12px;
      font-size: 13px;
    }
    dt {
      color: var(--ink-muted);
    }
    dd {
      margin: 0;
      text-align: right;
      font-weight: 600;
    }
    .can {
      margin: 0;
      padding-left: 18px;
      font-size: 12.5px;
      color: var(--ink-soft);
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  template: `
    @if (id() === undefined) {
      <div class="ah-panel">
        <ah-empty-state heading="Start a conversation" icon="message">
          Pin what the agent should read (an epic, a meeting topic, a defect, a
          Figma design, up to three repositories) and ask. It answers and
          proposes stories and meeting topics; nothing is created until you
          press a button.
        </ah-empty-state>
      </div>
    } @else {
      @if (openFailure(); as problem) {
        <ah-banner
          [variant]="problem.variant"
          [heading]="problem.heading"
          [tech]="problem.tech ?? ''"
        >
          {{ problem.text }}
          <button ahButton size="sm" type="button" (click)="store.refresh()">
            Try again
          </button>
        </ah-banner>
      }
      @if (store.conversation(); as c) {
        <div class="layout">
          <div class="talk">
            <section class="ah-panel head" aria-labelledby="conversation-title">
              <div class="title-row">
                <h2 id="conversation-title">{{ c.title }}</h2>
                <span class="ah-tag">{{ c.key }}</span>
                @if (c.recipe !== null) {
                  <span class="ah-tag ah-tag--accent">{{
                    recipeWords[c.recipe].label
                  }}</span>
                }
                @if (c.shared) {
                  <span class="ah-tag ah-tag--outline"
                    >Shared with the team</span
                  >
                }
                @if (c.canAsk) {
                  <div class="actions">
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      [attr.aria-disabled]="store.busy() ? 'true' : null"
                      (click)="share(!c.shared)"
                    >
                      {{ c.shared ? 'Stop sharing' : 'Share' }}
                    </button>
                    <button
                      ahButton="ghost"
                      size="sm"
                      type="button"
                      [attr.aria-disabled]="store.busy() ? 'true' : null"
                      (click)="remove()"
                    >
                      Delete
                    </button>
                  </div>
                } @else {
                  <span class="ah-hint"
                    >{{ c.ownerName ?? c.owner }}’s, read-only</span
                  >
                }
              </div>
              <div class="reads" aria-label="What the agent reads">
                <span class="label">Reads</span>
                @for (item of c.context; track item.kind + item.ref) {
                  <span class="pin" [title]="item.ref">
                    <span class="kind">{{ kindWords[item.kind].label }}</span>
                    <span class="text">{{ chip(item) }}</span>
                    @if (canPin()) {
                      <button
                        type="button"
                        [attr.aria-label]="'Unpin ' + chip(item)"
                        [attr.aria-disabled]="store.busy() ? 'true' : null"
                        (click)="unpin(item)"
                      >
                        ×
                      </button>
                    }
                  </span>
                } @empty {
                  <span class="ah-hint"
                    >Nothing pinned: the agent answers from the content
                    repository’s knowledge.</span
                  >
                }
                @if (canPin()) {
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    [attr.aria-disabled]="store.busy() ? 'true' : null"
                    (click)="addContext()"
                  >
                    + Add context
                  </button>
                }
              </div>
            </section>

            @if (commandFailure(); as problem) {
              <ah-banner
                [variant]="problem.variant"
                [heading]="problem.heading"
                [tech]="problem.tech ?? ''"
                >{{ problem.text }}</ah-banner
              >
            }

            @for (t of c.turns; track t.n) {
              <article class="turn" [attr.aria-label]="'Question ' + t.n">
                <div class="question">
                  <span class="who"
                    >{{ t.askedByName ?? t.askedBy }} ·
                    {{ ago(t.askedAt) }}</span
                  >{{ t.question }}
                </div>
                <div class="ah-panel answer">
                  <div class="meta">
                    <b>Product analyst</b>
                    <span>{{ statusWords[t.status] }}</span>
                    @if (t.endedAt !== null) {
                      <span>· {{ ago(t.endedAt) }}</span>
                    }
                  </div>
                  @switch (t.status) {
                    @case ('queued') {
                      <span class="ah-hint" role="status"
                        >Waiting for a session. A new one reads what is pinned
                        first, which takes a minute or two.</span
                      >
                    }
                    @case ('handed') {
                      @if (t.liveText) {
                        <ah-markdown [source]="t.liveText" />
                      } @else {
                        <span class="ah-hint" role="status">Reading…</span>
                      }
                      @if (t.activity.length > 0) {
                        <ul
                          class="activity"
                          aria-label="What the agent is reading"
                        >
                          @for (a of latest(t.activity); track $index) {
                            <li>{{ a }}</li>
                          }
                        </ul>
                      }
                    }
                    @case ('failed') {
                      <ah-banner
                        variant="error"
                        heading="The agent could not answer"
                        >{{ t.error ?? 'The session failed.' }}</ah-banner
                      >
                    }
                    @case ('cancelled') {
                      <span class="ah-hint">{{
                        t.error ?? 'Cancelled before it was answered.'
                      }}</span>
                    }
                  }
                  @if (t.answer) {
                    <ah-markdown [source]="t.answer" />
                  }
                  @if (t.proposals.length > 0) {
                    <div class="proposals">
                      @for (p of t.proposals; track p.id) {
                        <ah-proposal-card
                          [proposal]="p"
                          [number]="$index + 1"
                        />
                      }
                    </div>
                    <span class="ah-hint"
                      >Creating them in Jira or adding them to a meeting comes
                      in the next step.</span
                    >
                  }
                  @if (t.questions.length > 0) {
                    <div class="asks">
                      @for (q of t.questions; track q.id) {
                        <div
                          class="ask"
                          [attr.aria-label]="'Agent question ' + q.id"
                        >
                          <b class="text">{{ q.id }} · {{ q.text }}</b>
                          <ul>
                            @for (o of q.options; track $index) {
                              <li class="text">
                                <b>{{ o.label }}</b>
                                @if (o.recommended) {
                                  <span class="ah-tag ah-tag--accent"
                                    >Recommended</span
                                  >
                                }
                                — {{ o.detail }}
                              </li>
                            }
                          </ul>
                        </div>
                      }
                      <span class="ah-hint">Answer in your next question.</span>
                    </div>
                  }
                </div>
              </article>
            }

            @if (c.canAsk) {
              <form
                class="ah-panel composer"
                (submit)="$event.preventDefault(); ask()"
              >
                <label class="ah-sr" for="conversation-question"
                  >Your question</label
                >
                <textarea
                  id="conversation-question"
                  class="ah-input"
                  [attr.maxlength]="questionMax"
                  [placeholder]="placeholder()"
                  [value]="draft()"
                  (input)="draft.set(text($event))"
                  (keydown.control.enter)="ask()"
                  (keydown.meta.enter)="ask()"
                ></textarea>
                <div class="send-row">
                  <span class="ah-hint">{{ spendNote() }}</span>
                  <label class="cap"
                    >Cap
                    <input
                      class="ah-input"
                      inputmode="decimal"
                      [attr.aria-invalid]="
                        capProblem() !== null ? 'true' : null
                      "
                      [attr.aria-describedby]="
                        capProblem() !== null ? 'cap-problem' : null
                      "
                      placeholder="default"
                      [value]="cap()"
                      (input)="cap.set(text($event))"
                    />
                    AIU</label
                  >
                  <button
                    class="push"
                    ahButton="primary"
                    type="submit"
                    [disabled]="refusal() !== null || draft().trim() === ''"
                    [attr.aria-disabled]="store.busy() ? 'true' : null"
                  >
                    Send
                  </button>
                </div>
                @if (capProblem(); as problem) {
                  <span class="ah-hint" id="cap-problem" role="alert">{{
                    problem
                  }}</span>
                } @else if (refusal(); as why) {
                  <span class="ah-hint">{{ why }}</span>
                }
              </form>
            }
          </div>

          <aside class="ah-panel side" aria-labelledby="this-conversation">
            <h3 id="this-conversation">This conversation</h3>
            <dl>
              <dt>Spent</dt>
              <dd>{{ aiu(c.spentNanoAiu) }} AIU</dd>
              <dt>Questions</dt>
              <dd>{{ c.turns.length }} of {{ turnsMax }}</dd>
              @if (c.session; as s) {
                <dt>Session cap</dt>
                <dd>
                  {{ aiu(s.spentNanoAiu) }} of {{ aiu(s.budgetNanoAiu) }} AIU
                </dd>
              }
            </dl>
            <span class="ah-hint" role="status">{{ session() }}</span>
            @if (c.canAsk && open() !== null) {
              <button
                ahButton="danger"
                size="sm"
                type="button"
                [disabled]="c.session?.cancelRequested === true"
                [attr.aria-disabled]="store.busy() ? 'true' : null"
                (click)="cancel()"
              >
                Cancel question
              </button>
            }
            <h3>What it can do</h3>
            <ul class="can">
              <li>
                Reads what is pinned, and the content repository’s knowledge.
              </li>
              <li>
                Follows Jira links and searches Jira and Confluence beyond the
                pins, read-only.
              </li>
              <li>
                Proposes stories and meeting topics, with the risks it sees.
              </li>
              <li>Asks you what only you can settle.</li>
              <li>Changes nothing in Jira, meetings or code.</li>
            </ul>
          </aside>
        </div>
      } @else if (openFailure() === null) {
        <div class="ah-panel head" aria-label="Loading the conversation">
          <ah-skeleton width="40%" />
          <ah-skeleton width="70%" />
          <ah-skeleton width="55%" />
        </div>
      }
    }
  `,
})
export class ConversationView {
  protected readonly store = inject(ProductStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly clock = inject(CLOCK);

  /** The conversation's id, from the address; undefined on `/product`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly recipeWords = RECIPE_WORDS;
  protected readonly kindWords = CONTEXT_KIND_WORDS;
  protected readonly statusWords = TURN_STATUS_WORDS;
  protected readonly questionMax = CONVERSATION_QUESTION_MAX;
  protected readonly turnsMax = CONVERSATION_TURNS_MAX;
  protected readonly chip = contextChipText;
  protected readonly aiu = (n: number) => formatAiu(n);

  /** The question being typed. */
  readonly draft = signal('');
  /** The cap typed for a session this question starts, in AIU; empty is the server's. */
  readonly cap = signal('');

  protected readonly open = computed(() => {
    const c = this.store.conversation();
    return c === null ? null : openTurn(c.turns);
  });
  protected readonly refusal = computed(() => {
    const c = this.store.conversation();
    return c === null ? null : askRefusal(c);
  });
  /** Only the owner pins, and not while a question is open. */
  protected readonly canPin = computed(() => {
    const c = this.store.conversation();
    return c !== null && c.canAsk && this.open() === null;
  });
  protected readonly session = computed(() => {
    const c = this.store.conversation();
    return c === null ? '' : sessionLine(c);
  });
  protected readonly placeholder = computed(() => {
    const c = this.store.conversation();
    if (c === null || c.turns.length > 0) return 'Ask a follow-up…';
    return c.recipe === null
      ? 'Ask anything about the pinned items…'
      : RECIPE_WORDS[c.recipe].question;
  });
  /** What sending costs: a warm session goes on; otherwise a new one starts, capped. */
  protected readonly spendNote = computed(() => {
    const c = this.store.conversation();
    if (c?.session?.warm === true && !c.session.cancelRequested)
      return 'The session is warm: it goes on from what it has read.';
    const typed = checkAiuLimit(this.cap(), CONVERSATION_BUDGET_MAX_NANO_AIU);
    const cap =
      'cap' in typed && typed.cap !== null
        ? `${formatAiu(typed.cap)} AIU`
        : 'the default cap';
    return `Sending starts a session that spends AIU, at most ${cap}.`;
  });
  protected readonly capProblem = computed(() => {
    const typed = checkAiuLimit(this.cap(), CONVERSATION_BUDGET_MAX_NANO_AIU);
    if (!('error' in typed)) return null;
    return typed.error === 'maximum'
      ? `The cap is at most ${formatAiu(CONVERSATION_BUDGET_MAX_NANO_AIU, 0)} AIU.`
      : 'The cap is an amount of AIU above zero, such as 2 or 0.5.';
  });
  protected readonly openFailure = computed(() => {
    const error = this.store.openError();
    return error === null ? null : conversationErrorView(error);
  });
  protected readonly commandFailure = computed(() => {
    const error = this.store.commandError();
    return error === null ? null : conversationErrorView(error);
  });

  constructor() {
    effect(() => {
      const id = this.id() ?? null;
      untracked(() => {
        this.draft.set('');
        void this.store.open(id);
      });
    });
    // A recipe's first question is offered as the text to send, once the conversation is read.
    effect(() => {
      const c = this.store.conversation();
      const recipe = c?.recipe ?? null;
      if (c === null || c.turns.length > 0 || recipe === null) return;
      untracked(() => {
        if (this.draft() === '') this.draft.set(RECIPE_WORDS[recipe].question);
      });
    });
  }

  protected text(event: Event): string {
    const target = event.target;
    return target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
      ? target.value
      : '';
  }

  protected ago(at: string): string {
    return relativeTime(at, this.clock.now());
  }

  /** The latest few lines of what the agent read. */
  protected latest(activity: readonly string[]): readonly string[] {
    return activity.slice(-ACTIVITY_SHOWN);
  }

  /** Sends the question; the answer streams in as the page reads the conversation again. */
  async ask(): Promise<void> {
    const question = this.draft().trim();
    if (question === '' || this.refusal() !== null || this.store.busy()) return;
    const typed = checkAiuLimit(this.cap(), CONVERSATION_BUDGET_MAX_NANO_AIU);
    if ('error' in typed) return;
    const result = await this.store.ask(question, typed.cap);
    if (result.ok) this.draft.set('');
  }

  /** Unpins one item. */
  protected async unpin(item: ConversationContextItem): Promise<void> {
    const c = this.store.conversation();
    if (c === null || this.store.busy()) return;
    await this.store.pin(
      c.context.filter((p) => !(p.kind === item.kind && p.ref === item.ref))
    );
  }

  /** Shares the conversation with the team, or stops sharing it. */
  protected share(shared: boolean): void {
    if (!this.store.busy()) void this.store.share(shared);
  }

  /** Cancels the question being answered. */
  protected cancel(): void {
    if (!this.store.busy()) void this.store.cancel();
  }

  protected addContext(): void {
    if (this.store.busy()) return;
    this.store.dismissError();
    this.dialogs.open<boolean, AddContextData>(AddContextDialog, {
      data: { store: this.store },
      width: '520px',
    });
  }

  protected remove(): void {
    if (this.store.busy()) return;
    this.store.dismissError();
    const ref = this.dialogs.open<boolean, DeleteConversationData>(
      DeleteConversationDialog,
      { data: { store: this.store } }
    );
    ref.closed.subscribe((deleted) => {
      if (deleted === true) void this.router.navigate(['/product']);
    });
  }
}
