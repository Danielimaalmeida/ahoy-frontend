import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type {
  ConversationContextItem,
  ConversationTurn,
} from '@core/api/types';

/** One thing a question named that Ahoy read with it. */
type ConversationMention = ConversationTurn['mentions'][number];
import { CLOCK } from '@core/realtime/clock';
import { checkAiuLimit, formatAiu } from '@domain/aiu';
import {
  askRefusal,
  CONTEXT_KIND_WORDS,
  contextChipText,
  CONVERSATION_BUDGET_MAX_NANO_AIU,
  CONVERSATION_QUESTION_MAX,
  CONVERSATION_TURNS_MAX,
  defaultEffortLabel,
  defaultJiraProject,
  effortChoices,
  LOOK_UP_WORDS,
  LOOK_UPS,
  lookUpNote,
  type LookUp,
  modelChoiceChanged,
  type ModelChoiceLike,
  modelSwitchNote,
  openTurn,
  pinRefusal,
  quickPins,
  type QuickPin,
  RECIPE_WORDS,
  sessionLine,
  teamModelLabel,
  TURN_STATUS_WORDS,
} from '@domain/conversations';
import type { ReasoningEffort } from '@domain/types';
import { relativeTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { EmptyState } from '@ui/empty-state/empty-state';
import { FieldControl } from '@ui/field/field';
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
 * its owner, from the dialog or pasted in the quick box), what it may look up beyond them (Jira and Confluence, each
 * turned on or off for the conversation), the questions with their answers (streamed while the agent writes, with what it is reading), the stories
 * and topics it proposed and the questions it asks back, and the line to ask the next question. The right column says
 * what was spent, the session's state (warm for ten minutes after an answer), and cancels the question being answered.
 * A proposal is created in Jira or added to a meeting from its card. Asking may spend AIU; the rest is 0 AIU.
 */
@Component({
  selector: 'ah-conversation-view',
  imports: [
    Banner,
    Button,
    EmptyState,
    FieldControl,
    Markdown,
    ProposalCard,
    Skeleton,
  ],
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
    .pin.default {
      background: var(--surface-sunken);
    }
    .pin .from {
      color: var(--ink-muted);
      font-size: 11px;
      font-weight: 500;
    }
    .read-with {
      align-self: flex-end;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      justify-content: flex-end;
      max-width: 85%;
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
    .quick {
      display: inline-flex;
      flex-direction: column;
      gap: var(--space-1);
      flex: 1 1 240px;
      max-width: 340px;
      min-width: 0;
    }
    .quick input {
      height: 30px;
      font-size: 12px;
      width: 100%;
    }
    .quick-options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
    .quick-options .ref {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .quick-options kbd {
      font-family: var(--font-mono);
      font-size: 10.5px;
      color: var(--ink-muted);
      border: 1px solid var(--line);
      border-radius: var(--radius-xs);
      padding: 0 4px;
    }
    .look-up {
      height: 28px;
      padding: 0 10px;
      font-size: 12px;
      gap: 6px;
    }
    .look-up[aria-disabled='true'] {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .look-up[aria-disabled='true']:hover {
      border-color: var(--line);
    }
    .look-up-note {
      font-size: 12px;
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
    .send-row .pick {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--ink-soft);
    }
    .send-row .pick select {
      width: auto;
      max-width: 220px;
    }
    .switch {
      margin: 0;
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
                @if (c.jiraProject !== null) {
                  <span
                    class="pin"
                    [class.default]="
                      c.jiraProject === c.teamDefaults.jiraProject
                    "
                  >
                    <span class="kind">Jira project</span>
                    <span class="text">{{ c.jiraProject }}</span>
                    @if (c.jiraProject === c.teamDefaults.jiraProject) {
                      <span class="from">team default</span>
                    }
                    @if (canPin()) {
                      <button
                        type="button"
                        [attr.aria-label]="
                          'Remove Jira project ' +
                          c.jiraProject +
                          ' from this conversation'
                        "
                        [attr.aria-disabled]="store.busy() ? 'true' : null"
                        (click)="removeProject()"
                      >
                        ×
                      </button>
                    }
                  </span>
                }
                @for (space of c.confluenceSpaces; track space) {
                  <span
                    class="pin"
                    [class.default]="
                      c.teamDefaults.confluenceSpaces.includes(space)
                    "
                  >
                    <span class="kind">Confluence space</span>
                    <span class="text">{{ space }}</span>
                    @if (c.teamDefaults.confluenceSpaces.includes(space)) {
                      <span class="from">team default</span>
                    }
                    @if (canPin()) {
                      <button
                        type="button"
                        [attr.aria-label]="
                          'Remove Confluence space ' +
                          space +
                          ' from this conversation'
                        "
                        [attr.aria-disabled]="store.busy() ? 'true' : null"
                        (click)="removeSpace(space)"
                      >
                        ×
                      </button>
                    }
                  </span>
                }
                @for (item of c.context; track item.kind + item.ref) {
                  <span
                    class="pin"
                    [class.default]="teamRepository(item)"
                    [title]="item.ref"
                  >
                    <span class="kind">{{ kindWords[item.kind].label }}</span>
                    <span class="text">{{ chip(item) }}</span>
                    @if (teamRepository(item)) {
                      <span class="from">team default</span>
                    }
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
                  @if (
                    c.jiraProject === null && c.confluenceSpaces.length === 0
                  ) {
                    <span class="ah-hint"
                      >Nothing pinned: the agent answers from the content
                      repository’s knowledge.</span
                    >
                  }
                }
                @if (canPin()) {
                  <span class="quick">
                    <input
                      ahInput
                      type="text"
                      autocomplete="off"
                      maxlength="2000"
                      aria-label="Pin quickly"
                      placeholder="Paste a Jira key, Figma link or repository…"
                      [value]="quick()"
                      (input)="typeQuick(text($event))"
                      (keydown.enter)="
                        $event.preventDefault(); pinQuick(quickOptions()[0])
                      "
                      (keydown.escape)="typeQuick('')"
                    />
                    @if (quickOptions().length > 0) {
                      <span
                        class="quick-options"
                        role="group"
                        aria-label="Pin as"
                      >
                        @for (
                          o of quickOptions();
                          track o.kind;
                          let first = $first
                        ) {
                          <button
                            ahButton="ghost"
                            size="sm"
                            type="button"
                            [attr.aria-disabled]="store.busy() ? 'true' : null"
                            (click)="pinQuick(o)"
                          >
                            {{ kindWords[o.kind].label }} ·
                            <span class="ref">{{ quickChip(o) }}</span>
                            @if (first) {
                              <kbd aria-hidden="true">Enter</kbd>
                            }
                          </button>
                        }
                      </span>
                    }
                    <span class="ah-hint" role="status">{{ quickHint() }}</span>
                  </span>
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
              <div
                class="reads"
                role="group"
                aria-labelledby="look-up-label"
                aria-describedby="look-up-note"
              >
                <span class="label" id="look-up-label">Can look up</span>
                @for (l of lookUps; track l) {
                  @let state = c.lookUp[l];
                  <button
                    class="ah-chip look-up"
                    type="button"
                    [attr.aria-pressed]="state.available && state.on"
                    [attr.aria-disabled]="
                      lookUpLocked(state.available) ? 'true' : null
                    "
                    (click)="toggleLookUp(l)"
                  >
                    @if (state.available && state.on) {
                      <span aria-hidden="true">✓</span>
                    }
                    {{ lookUpWords[l] }}
                  </button>
                }
                <span class="ah-hint look-up-note" id="look-up-note">{{
                  lookUpText()
                }}</span>
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
                @if (t.mentions.length > 0) {
                  <div
                    class="read-with"
                    role="group"
                    [attr.aria-label]="'Read with question ' + t.n"
                  >
                    <span class="ah-hint">Read with this question:</span>
                    @for (m of t.mentions; track m.kind + m.ref) {
                      <span class="pin" [title]="m.problem ?? m.ref">
                        <span class="kind">{{ kindWords[m.kind].label }}</span>
                        <span class="text">{{ mentionText(m) }}</span>
                      </span>
                      @if (canPin() && !pinned(m)) {
                        <button
                          ahButton="ghost"
                          size="sm"
                          type="button"
                          [attr.aria-label]="'Pin ' + m.ref"
                          [attr.aria-disabled]="store.busy() ? 'true' : null"
                          (click)="pinMention(m)"
                        >
                          Pin
                        </button>
                      }
                    }
                  </div>
                }
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
                          [canAct]="c.canAsk"
                          [busy]="store.busy()"
                          [defaultProject]="jiraProject()"
                          [meetings]="store.meetings()"
                          (createIssue)="createIssue(p.id, $event)"
                          (addToMeeting)="addToMeeting(p.id, $event)"
                          (meetingsWanted)="store.loadMeetings()"
                          (apply)="applyChange(p.id)"
                        />
                      }
                    </div>
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
                @if (switchNote(); as note) {
                  <p class="ah-hint switch" role="status">{{ note }}</p>
                }
                <span class="ah-hint">{{ spendNote() }}</span>
                <div class="send-row">
                  <label class="pick"
                    >Model
                    <select
                      ahInput
                      [disabled]="!canPin()"
                      [value]="choice().model ?? ''"
                      (change)="pickModel(text($event))"
                    >
                      <option value="">{{ teamLabel() }}</option>
                      @for (m of catalog(); track m.id) {
                        <option
                          [value]="m.id"
                          [selected]="m.id === choice().model"
                        >
                          {{ m.label }}
                        </option>
                      }
                    </select></label
                  >
                  <label class="pick"
                    >Effort
                    <select
                      ahInput
                      [disabled]="!canPin() || efforts().length === 0"
                      [value]="choice().reasoningEffort ?? ''"
                      (change)="pickEffort(text($event))"
                    >
                      <option value="">{{ defaultEffort() }}</option>
                      @for (e of efforts(); track e) {
                        <option
                          [value]="e"
                          [selected]="e === choice().reasoningEffort"
                        >
                          {{ e }}
                        </option>
                      }
                    </select></label
                  >
                  @if (!goesOn()) {
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
                  }
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
                Proposes stories, meeting topics and changes to Jira (an epic,
                issues moved into an epic, an issue’s fields), with the risks it
                sees.
              </li>
              <li>Asks you what only you can settle.</li>
              <li>
                Changes nothing in Jira, meetings or code itself: you create a
                proposal in Jira, add it to a meeting or apply a change, with a
                click.
              </li>
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
  protected readonly quickChip = (pin: QuickPin) =>
    contextChipText({ ...pin, label: null });
  protected readonly lookUps = LOOK_UPS;
  protected readonly lookUpWords = LOOK_UP_WORDS;
  protected readonly aiu = (n: number) => formatAiu(n);

  /** The question being typed. */
  readonly draft = signal('');
  /** The cap typed for a session this question starts, in AIU; empty is the server's. */
  readonly cap = signal('');
  /** What was pasted in the quick pin box. */
  readonly quick = signal('');
  /** Why the quick box could not pin what was picked, until the person types again. */
  private readonly quickProblem = signal<string | null>(null);

  /** The ways to pin what is in the quick box, the likeliest first. */
  protected readonly quickOptions = computed(() => quickPins(this.quick()));
  /** What the quick box says under it: why it cannot pin, or nothing. */
  protected readonly quickHint = computed(() => {
    const problem = this.quickProblem();
    if (problem !== null) return problem;
    if (this.quick().trim() === '' || this.quickOptions().length > 0) return '';
    return 'Not a Jira key, Figma link or repository name. Add context pins a meeting topic.';
  });
  /** What the "Can look up" row says under its chips. */
  protected readonly lookUpText = computed(() => {
    const c = this.store.conversation();
    return c === null ? '' : lookUpNote(c.lookUp, this.goesOn());
  });

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
    if (c.recipe !== null) return RECIPE_WORDS[c.recipe].question;
    return c.jiraProject === null
      ? 'Ask anything about the pinned items…'
      : `Ask anything. Name issues as ${c.jiraProject}-120, or just #120…`;
  });
  /**
   * Whether the next question goes to the warm session: its cap was set when it started, so no cap is asked for, and
   * what it has spent of it is shown instead.
   */
  protected readonly goesOn = computed(() => {
    const s = this.store.conversation()?.session;
    return s?.warm === true && !s.cancelRequested && !this.modelPending();
  });

  /** The model and effort picked in the composer but not sent yet; null while they are the conversation's. */
  private readonly picked = signal<ModelChoiceLike | null>(null);
  /** The catalogue the picker offers, empty until it is read. */
  protected readonly catalog = computed(
    () => this.store.models()?.models ?? []
  );
  /** What the pickers show: what was picked, else the conversation's choice. */
  protected readonly choice = computed((): ModelChoiceLike => {
    const picked = this.picked();
    if (picked !== null) return picked;
    const m = this.store.conversation()?.model;
    return m === undefined
      ? { model: null, reasoningEffort: null }
      : { model: m.model, reasoningEffort: m.reasoningEffort };
  });
  /** Whether sending first changes the conversation's model, which starts a new session. */
  protected readonly modelPending = computed(() => {
    const m = this.store.conversation()?.model;
    const picked = this.picked();
    return m !== undefined && picked !== null && modelChoiceChanged(picked, m);
  });
  protected readonly teamLabel = computed(() =>
    teamModelLabel(this.catalog(), this.team())
  );
  protected readonly efforts = computed(() =>
    effortChoices(this.catalog(), this.choice().model ?? this.team().model)
  );
  protected readonly defaultEffort = computed(() =>
    defaultEffortLabel(this.choice().model, this.team())
  );
  /** Said over the composer when a picked model will replace the warm session's. */
  protected readonly switchNote = computed(() => {
    const s = this.store.conversation()?.session;
    if (!this.modelPending() || s?.warm !== true || s.cancelRequested)
      return null;
    return modelSwitchNote(this.catalog(), s.model, this.choice(), this.team());
  });
  private readonly team = computed(
    (): ModelChoiceLike =>
      this.store.conversation()?.model.team ?? {
        model: null,
        reasoningEffort: null,
      }
  );
  /** What sending costs: a warm session goes on, within its cap; otherwise a new one starts, capped. */
  protected readonly spendNote = computed(() => {
    const s = this.store.conversation()?.session;
    if (this.goesOn() && s)
      return `The session is warm: it goes on from what it has read, within its cap (${formatAiu(s.spentNanoAiu)} of ${formatAiu(s.budgetNanoAiu)} AIU spent).`;
    const typed = checkAiuLimit(this.cap(), CONVERSATION_BUDGET_MAX_NANO_AIU);
    const cap =
      'cap' in typed && typed.cap !== null
        ? `${formatAiu(typed.cap)} AIU`
        : 'the default cap';
    return `Sending starts a session that spends AIU, at most ${cap}.`;
  });
  protected readonly capProblem = computed(() => {
    if (this.goesOn()) return null;
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
    void this.store.loadModels();
    effect(() => {
      const id = this.id() ?? null;
      untracked(() => {
        this.draft.set('');
        this.picked.set(null);
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
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement
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

  /** The Jira project a story proposal is offered in first: the first pinned issue's. */
  protected readonly jiraProject = computed(() => {
    const c = this.store.conversation();
    return c?.jiraProject ?? defaultJiraProject(c?.context ?? []);
  });

  /** Creates a story proposal in Jira; the card then shows the issue. */
  protected async createIssue(
    proposalId: string,
    projectKey: string
  ): Promise<void> {
    if (this.store.busy()) return;
    await this.store.createIssue(proposalId, projectKey);
  }

  /** Applies a Jira change proposal; the card then says what was done. */
  protected async applyChange(proposalId: string): Promise<void> {
    if (this.store.busy()) return;
    await this.store.applyChange(proposalId);
  }

  /** Adds a proposal to a meeting; the card then links to it. */
  protected async addToMeeting(
    proposalId: string,
    meetingId: string
  ): Promise<void> {
    if (this.store.busy()) return;
    await this.store.addToMeeting(proposalId, meetingId);
  }

  /** Sends the question; the answer streams in as the page reads the conversation again. */
  async ask(): Promise<void> {
    const question = this.draft().trim();
    if (question === '' || this.refusal() !== null || this.store.busy()) return;
    // A warm session keeps the cap it started with, so a typed one is not sent.
    const typed = this.goesOn()
      ? { cap: null }
      : checkAiuLimit(this.cap(), CONVERSATION_BUDGET_MAX_NANO_AIU);
    if ('error' in typed) return;
    // A model picked since the last question becomes the conversation's first: its warm session stops.
    const picked = this.picked();
    if (picked !== null && this.modelPending()) {
      const changed = await this.store.setModel(
        picked.model,
        picked.reasoningEffort
      );
      if (!changed.ok) return;
    }
    this.picked.set(null);
    const result = await this.store.ask(question, typed.cap);
    if (result.ok) this.draft.set('');
  }

  /** Picks a model (`""`: the team's); an effort the new model does not take goes back to its default. */
  protected pickModel(value: string): void {
    const model = value === '' ? null : value;
    const effort = this.choice().reasoningEffort;
    const takes = effortChoices(this.catalog(), model ?? this.team().model);
    this.picked.set({
      model,
      reasoningEffort:
        effort !== null && takes.includes(effort) ? effort : null,
    });
  }

  /** Picks an effort (`""`: the default). */
  protected pickEffort(value: string): void {
    const effort = this.efforts().find(
      (e): e is ReasoningEffort => e === value
    );
    this.picked.set({
      model: this.choice().model,
      reasoningEffort: effort ?? null,
    });
  }

  /** Takes what is typed in the quick box. */
  protected typeQuick(value: string): void {
    this.quick.set(value);
    this.quickProblem.set(null);
  }

  /** Pins what was pasted in the quick box, as `pin` says; the box empties once it is pinned. */
  protected async pinQuick(pin: QuickPin | undefined): Promise<void> {
    const c = this.store.conversation();
    if (pin === undefined || c === null || this.store.busy()) return;
    const refusal = pinRefusal(c.context, pin.kind, pin.ref);
    if (refusal !== null) {
      this.quickProblem.set(refusal);
      return;
    }
    const result = await this.store.pin([...c.context, pin]);
    if (result.ok) this.typeQuick('');
  }

  /** Whether a look-up chip does nothing: not set up, not the owner's, or a question is open. */
  protected lookUpLocked(available: boolean): boolean {
    return !available || !this.canPin() || this.store.busy();
  }

  /** Turns a look-up on or off for this conversation; a warm session is stopped, so the next question starts one. */
  protected async toggleLookUp(lookUp: LookUp): Promise<void> {
    const c = this.store.conversation();
    if (c === null || this.lookUpLocked(c.lookUp[lookUp].available)) return;
    await this.store.setLookUp(lookUp, !c.lookUp[lookUp].on);
  }

  /** Whether a pinned repository is one of the team's defaults. */
  protected teamRepository(item: ConversationContextItem): boolean {
    const c = this.store.conversation();
    return (
      item.kind === 'repository' &&
      c !== null &&
      c.teamDefaults.repositories.includes(item.ref)
    );
  }

  /** What a chip of "Read with this question" says: the issue and its summary, or the link. */
  protected mentionText(m: ConversationMention): string {
    return m.label === null ? m.ref : `${m.ref} · ${m.label}`;
  }

  /** Whether something a question named is pinned since. */
  protected pinned(m: ConversationMention): boolean {
    const c = this.store.conversation();
    return (
      c !== null && c.context.some((p) => p.kind === m.kind && p.ref === m.ref)
    );
  }

  /** Pins something a question named, for every later session; the warm session stops, like any pin. */
  protected async pinMention(m: ConversationMention): Promise<void> {
    const c = this.store.conversation();
    if (c === null || this.store.busy() || this.pinned(m)) return;
    const refusal = pinRefusal(c.context, m.kind, m.ref);
    if (refusal !== null) {
      this.quickProblem.set(refusal);
      return;
    }
    await this.store.pin([...c.context, { kind: m.kind, ref: m.ref }]);
  }

  /** Takes the Jira project out of this conversation; the warm session stops. */
  protected removeProject(): void {
    if (!this.store.busy()) void this.store.setWhere({ jiraProject: null });
  }

  /** Takes one Confluence space out of this conversation; the warm session stops. */
  protected removeSpace(space: string): void {
    const c = this.store.conversation();
    if (c === null || this.store.busy()) return;
    void this.store.setWhere({
      confluenceSpaces: c.confluenceSpaces.filter((s) => s !== space),
    });
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
