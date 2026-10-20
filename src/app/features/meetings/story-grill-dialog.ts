import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { ApiError } from '@core/api/api-error';
import type { GrillQuestion, MeetingStoryDraft } from '@core/api/types';
import {
  GRILL_OWN_ANSWER_MAX,
  firstUnanswered,
  grillAnswerBodies,
  grillProgress,
  optionLetter,
  pickComplete,
  pickSummary,
  type GrillPick,
} from '@domain/story-drafts';
import { Banner } from '@ui/banner/banner';
import { formatCap } from '@ui/budget-meter/budget-meter';
import { Button } from '@ui/button/button';
import { DialogShell } from '@ui/dialog/dialog';
import { ToastService } from '@ui/toast/toast';
import { storyErrorView } from './story-errors';
import type { StoryDraftsStore } from './story-drafts-store';

/** What the Grill me dialog is opened with: the page's drafts and the grill whose questions to answer. */
export interface StoryGrillData {
  readonly drafts: StoryDraftsStore;
  readonly draftId: string;
}

/** An answered question as the list above the current one shows it. */
interface Answered {
  readonly question: GrillQuestion;
  readonly index: number;
  readonly summary: string;
}

/**
 * "Grill me" (board `StoryGrill`): the agent's questions about a topic, one at a time. Each offers the agent's answers
 * (one recommended), "Leave it open in the story" and "Answer in my own words"; answered ones show above with Change.
 * Nothing is sent until the last question, or "Stop and write the story now" (the rest is left open): then the answers
 * go once and the agent writes the story, which may spend AIU up to the questions' cap. Closing keeps the answers
 * picked so far for the next time it opens. Discard drops the grill (nothing more is spent), so the topic can be
 * drafted again.
 */
@Component({
  selector: 'ah-story-grill-dialog',
  imports: [Banner, Button, DialogShell, ReactiveFormsModule],
  styles: `
    .progress {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      align-items: baseline;
      justify-content: space-between;
    }
    .progress strong {
      font-size: 13px;
    }
    ol {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .answered li {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 2px 10px;
      align-items: center;
      padding: 8px 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
    }
    .answered .what {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .text {
      overflow-wrap: anywhere;
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    legend {
      padding: 0;
      margin-bottom: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    legend strong {
      font-size: 16px;
    }
    .option {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      cursor: pointer;
    }
    .option.chosen {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .option input {
      margin-top: 3px;
      accent-color: var(--accent);
    }
    .letter {
      font-weight: 700;
      color: var(--ink-soft);
      min-width: 1.2em;
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    textarea {
      width: 100%;
      min-height: 72px;
      resize: vertical;
    }
    .stop {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
  `,
  template: `
    <ah-dialog
      icon="compass"
      heading="Grill me"
      cancelLabel="Later"
      [confirmLabel]="confirmLabel()"
      busyLabel="Sending…"
      [busy]="busy()"
      [confirmDisabled]="!canNext()"
      [error]="error()"
      (confirm)="next()"
    >
      @if (draft(); as d) {
        <span ahDialogLead
          >From “{{ d.topicTitle }}” · First Mate asked
          {{ questions().length }}
          {{ questions().length === 1 ? 'question' : 'questions' }}</span
        >
        @if (asking()) {
          <ah-banner ahDialogCost variant="cost" [heading]="costHeading()"
            >Your answers go once, after the last question. Not charged to any
            voyage's budget.</ah-banner
          >
          <div class="progress">
            <strong>{{ progress() }}</strong>
            <span class="ah-hint">{{ spent() }} AIU spent so far</span>
          </div>
          @if (answered().length > 0) {
            <ol class="answered" aria-label="Answered">
              @for (a of answered(); track a.question.id) {
                <li>
                  <span class="ah-key">{{ a.question.id }}</span>
                  <span class="what">
                    <span class="ah-hint text">{{ a.question.text }}</span>
                    <strong class="text">{{ a.summary }}</strong>
                  </span>
                  <button
                    ahButton="ghost"
                    size="sm"
                    type="button"
                    [attr.aria-label]="'Change the answer to ' + a.question.id"
                    [disabled]="busy()"
                    (click)="go(a.index)"
                  >
                    Change
                  </button>
                </li>
              }
            </ol>
          }
          @if (current(); as q) {
            <fieldset>
              <legend>
                <span class="ah-hint">{{ q.id }} · Pick an answer</span>
                <strong class="text">{{ q.text }}</strong>
              </legend>
              @for (option of q.options; track $index) {
                <label class="option" [class.chosen]="isOption($index)">
                  <input
                    type="radio"
                    name="grill-answer"
                    [checked]="isOption($index)"
                    (change)="chooseOption($index)"
                  />
                  <span class="letter" aria-hidden="true">{{
                    letter($index)
                  }}</span>
                  <span class="body">
                    <strong class="text">{{ option.label }}</strong>
                    <span class="ah-hint text">{{ option.detail }}</span>
                  </span>
                  @if (option.recommended) {
                    <span class="ah-tag ah-tag--accent">Recommended</span>
                  }
                </label>
              }
              <label class="option" [class.chosen]="isChoice('open')">
                <input
                  type="radio"
                  name="grill-answer"
                  [checked]="isChoice('open')"
                  (change)="chooseOpen()"
                />
                <span class="letter" aria-hidden="true">{{
                  letter(q.options.length)
                }}</span>
                <span class="body">
                  <strong>Leave it open in the story</strong>
                  <span class="ah-hint"
                    >It goes into the story as an open question for
                    refinement.</span
                  >
                </span>
              </label>
              <label class="option" [class.chosen]="isChoice('own')">
                <input
                  type="radio"
                  name="grill-answer"
                  [checked]="isChoice('own')"
                  (change)="chooseOwn()"
                />
                <span class="letter" aria-hidden="true">{{
                  letter(q.options.length + 1)
                }}</span>
                <span class="body">
                  <strong>Answer in my own words</strong>
                </span>
              </label>
              @if (isChoice('own')) {
                <label class="ah-sr" for="grill-own"
                  >Your answer to {{ q.id }}</label
                >
                <textarea
                  id="grill-own"
                  class="ah-input"
                  [maxlength]="ownMax"
                  [formControl]="own"
                ></textarea>
              }
            </fieldset>
          }
          <div class="stop">
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              [disabled]="busy()"
              (click)="stop()"
            >
              Stop and write the story now
            </button>
            <span class="ah-hint">{{ stopHint() }}</span>
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              [disabled]="busy()"
              (click)="discard()"
            >
              Discard
            </button>
          </div>
        } @else {
          <ah-banner variant="notice" heading="These questions were answered"
            >This draft is {{ d.status }} now: close this and look at the
            topic.</ah-banner
          >
        }
      } @else {
        <span ahDialogLead>This draft was discarded.</span>
      }
    </ah-dialog>
  `,
})
export class StoryGrillDialog {
  private readonly data = inject<StoryGrillData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<MeetingStoryDraft>>(DialogRef);
  private readonly toasts = inject(ToastService);
  /** Whether the answers went or the grill was discarded; then closing keeps nothing. */
  private done = false;

  /** The grill as the page's store has it now; null once discarded. */
  readonly draft = computed(
    () =>
      this.data.drafts.drafts().find((d) => d.id === this.data.draftId) ?? null
  );
  protected readonly questions = computed(() => this.draft()?.questions ?? []);
  protected readonly asking = computed(() => this.draft()?.status === 'asking');
  /** The answers picked so far, by question id; kept by the store between openings. */
  readonly picks = signal<ReadonlyMap<string, GrillPick>>(
    this.data.drafts.picksOf(this.data.draftId)
  );
  /** Which question is shown. */
  readonly index = signal(firstUnanswered(this.questions(), this.picks()));
  protected readonly current = computed(
    () => this.questions()[this.index()] ?? null
  );
  private readonly currentPick = computed(() => {
    const q = this.current();
    return q === null ? null : (this.picks().get(q.id) ?? null);
  });
  protected readonly answered = computed(() =>
    this.questions().flatMap((question, index): Answered[] => {
      const pick = this.picks().get(question.id);
      return index !== this.index() &&
        pick !== undefined &&
        pickComplete(question, pick)
        ? [{ question, index, summary: pickSummary(question, pick) }]
        : [];
    })
  );
  private readonly last = computed(
    () => this.index() >= this.questions().length - 1
  );
  protected readonly canNext = computed(() => {
    const q = this.current();
    const pick = this.currentPick();
    return (
      this.asking() && q !== null && pick !== null && pickComplete(q, pick)
    );
  });
  /** The second run's cap: the one the questions were asked with; null when the draft has no run to read it from. */
  private readonly cap = computed(
    () => this.draft()?.run?.budgetNanoAiu ?? null
  );
  protected readonly confirmLabel = computed(() => {
    if (!this.last()) return 'Next question';
    const cap = this.cap();
    return cap === null
      ? 'Write the story'
      : `Write the story · up to ${formatCap(cap, 9)} AIU`;
  });
  protected readonly costHeading = computed(() => {
    const cap = this.cap();
    return cap === null
      ? "Writing the story may spend AIU, up to the server's story draft cap"
      : `Writing the story may spend up to ${formatCap(cap, 9)} AIU`;
  });
  protected readonly progress = computed(() =>
    grillProgress(this.index(), this.questions().length)
  );
  protected readonly spent = computed(() =>
    formatCap(this.draft()?.spentNanoAiu ?? 0, 2)
  );
  protected readonly stopHint = computed(() => {
    const open = this.questions().filter((q) => {
      const pick = this.picks().get(q.id);
      return pick === undefined || !pickComplete(q, pick);
    }).length;
    return open === 0
      ? 'Every question has an answer.'
      : `${open === 1 ? '1 question' : `${open} questions`} without an answer will be left open.`;
  });
  protected readonly busy = this.data.drafts.busy;
  protected readonly ownMax = GRILL_OWN_ANSWER_MAX;
  /** The answer in the person's own words to the question shown. */
  protected readonly own = new FormControl('', { nonNullable: true });
  private readonly failure = signal<{
    error: ApiError;
    action: 'answer' | 'discard';
  } | null>(null);
  protected readonly error = computed(() => {
    const failure = this.failure();
    return failure === null
      ? null
      : storyErrorView(failure.error, failure.action);
  });

  protected readonly letter = optionLetter;

  constructor() {
    this.syncOwn();
    this.own.valueChanges.subscribe((text) => {
      if (this.currentPick()?.choice === 'own')
        this.pick({ choice: 'own', text });
    });
    inject(DestroyRef).onDestroy(() => {
      if (!this.done)
        this.data.drafts.keepPicks(this.data.draftId, this.picks());
    });
  }

  /** Whether the question shown is answered with its option `index`. */
  protected isOption(index: number): boolean {
    const pick = this.currentPick();
    return pick?.choice === 'option' && pick.option === index;
  }

  /** Whether the question shown is left open (`open`) or answered in own words (`own`). */
  protected isChoice(choice: 'open' | 'own'): boolean {
    return this.currentPick()?.choice === choice;
  }

  /** Answers the question shown with one of its options. */
  chooseOption(index: number): void {
    this.pick({ choice: 'option', option: index });
  }

  /** Leaves the question shown open in the story. */
  chooseOpen(): void {
    this.pick({ choice: 'open' });
  }

  /** Answers the question shown in the person's own words, as typed so far. */
  chooseOwn(): void {
    this.pick({ choice: 'own', text: this.own.value });
  }

  /** Shows another question, to change its answer. */
  go(index: number): void {
    if (index < 0 || index >= this.questions().length) return;
    this.index.set(index);
    this.syncOwn();
  }

  /** Next question (after a Change, the first one still without an answer); on the last one, sends the answers. */
  async next(): Promise<void> {
    if (!this.canNext() || this.busy()) return;
    if (this.last()) {
      await this.send();
      return;
    }
    const ahead = firstUnanswered(this.questions(), this.picks());
    this.go(ahead > this.index() ? ahead : this.index() + 1);
  }

  /** "Stop and write the story now": sends the answers picked so far; the rest is left open. */
  stop(): Promise<void> {
    return this.send();
  }

  private async send(): Promise<void> {
    const draft = this.draft();
    if (draft === null || !this.asking() || this.busy()) return;
    this.failure.set(null);
    const result = await this.data.drafts.answer(
      draft.id,
      grillAnswerBodies(this.questions(), this.picks()),
      this.cap()
    );
    if (!result.ok) {
      this.failure.set({ error: result.error, action: 'answer' });
      return;
    }
    this.done = true;
    this.toasts.show(
      'First Mate is writing the story from your answers. It shows on the topic when it is ready.'
    );
    this.ref.close(result.value);
  }

  /** Discards the grill and its answers, so the topic can be drafted again; nothing more is spent. */
  async discard(): Promise<void> {
    if (this.draft() === null || this.busy()) return;
    this.failure.set(null);
    const result = await this.data.drafts.discard(this.data.draftId);
    if (!result.ok) {
      this.failure.set({ error: result.error, action: 'discard' });
      return;
    }
    this.done = true;
    this.toasts.show('Story draft discarded.');
    this.ref.close();
  }

  private pick(pick: GrillPick): void {
    const q = this.current();
    if (q === null) return;
    this.picks.set(new Map(this.picks()).set(q.id, pick));
  }

  /** Puts the shown question's own words, if it has them, in the text box. */
  private syncOwn(): void {
    const pick = this.currentPick();
    this.own.setValue(pick?.choice === 'own' ? pick.text : '', {
      emitEvent: false,
    });
  }
}
