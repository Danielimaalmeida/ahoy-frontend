import {
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { FormControl } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { actorLabel } from '@domain/identifiers';
import { absoluteTime } from '@domain/time';
import { Button } from '@ui/button/button';
import { Icon } from '@ui/icon/icon';

/** The agent's recommended answer. */
export interface QuestionRecommendation {
  /** The crew member that asked ("Cartographer"). */
  readonly agent: string;
  readonly text: string;
}

/** A final answer: who gave it and when. */
export interface QuestionAnswer {
  readonly text: string;
  /** The API actor (an e-mail, or `ahoy-reconciler`). */
  readonly actor: string;
  /** ISO timestamp. */
  readonly at: string;
  /** Extra words after the time ("used the recommendation, edited"). */
  readonly note?: string;
}

/** What a question card shows: the answer form, the final answer, or the question alone. */
export type QuestionCardState = 'open' | 'answered' | 'disabled';

let nextQuestionId = 0;

/**
 * One agent question: its id and round, the question, the agent's recommendation, then the final answer or the answer
 * form. Presentational: the parent owns the `FormControl` and sends the answer when `send` fires.
 *
 * - **open** (no `answer`, not `disabled`): the `ah-question--open` ring, the textarea and "Send answer".
 *   "Use recommendation" copies the recommendation into the control and emits `useRecommendation`; it never sends.
 * - **answered** (`answer` set): the answer, who and when, and a "Final" lock. Nothing is editable.
 * - **disabled**: the question and recommendation without a form, with `disabledReason`.
 */
@Component({
  selector: 'ah-question-card',
  imports: [Button, Icon, ReactiveFormsModule],
  // Layout the QuestionCard preview sets inline and the Questions wireframe draws for the lock; not in the bundle.
  styles: `
    :host {
      display: block;
    }
    .ah-question__final {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-left: auto;
      font-size: 11.5px;
      font-weight: 600;
      color: var(--ink-muted);
    }
    .ah-question__rec-icon {
      flex: none;
      color: var(--accent);
    }
    .ah-question__rec-body {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ah-question__send {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }
    textarea.ah-input {
      min-height: 60px;
    }
  `,
  template: `
    <article
      class="ah-question"
      [class.ah-question--open]="state() === 'open'"
      [attr.aria-labelledby]="textId"
    >
      <div class="ah-question__head">
        <span class="ah-question__id">{{ questionId() }}</span>
        @if (state() === 'answered') {
          <span class="ah-badge ah-badge--done"
            ><i class="ah-badge__dot"></i>Answered</span
          >
        } @else {
          <span class="ah-badge ah-badge--input"
            ><i class="ah-badge__dot"></i>Needs an answer</span
          >
        }
        @if (round() !== null) {
          <span class="ah-hint">Round {{ round() }}</span>
        }
        @if (state() === 'answered') {
          <span class="ah-question__final"
            ><ah-icon name="lock" [size]="12" />Final</span
          >
        }
      </div>
      <div class="ah-question__text" [id]="textId">{{ text() }}</div>
      @if (answer(); as a) {
        <div class="ah-question__answer">
          <span>{{ a.text }}</span>
          <span class="ah-hint">{{ answeredBy() }}</span>
        </div>
      } @else {
        @if (recommendation(); as rec) {
          <div class="ah-question__rec">
            <span class="ah-question__rec-icon"
              ><ah-icon name="compass"
            /></span>
            <div class="ah-question__rec-body">
              <span
                ><b>{{ rec.agent }} recommends:</b> {{ rec.text }}</span
              >
              @if (state() === 'open' && control()) {
                <span
                  ><button
                    type="button"
                    ahButton="soft"
                    size="sm"
                    [disabled]="locked()"
                    (click)="useRec(rec.text)"
                  >
                    Use recommendation
                  </button></span
                >
              }
            </div>
          </div>
        }
        @if (state() === 'open') {
          @if (control(); as c) {
            <div class="ah-question__form">
              <label class="ah-label" [for]="answerId">Your answer</label>
              <textarea
                class="ah-input"
                [id]="answerId"
                [formControl]="c"
                [attr.aria-describedby]="hintId"
                placeholder="Type an answer, or start from the recommendation"
              ></textarea>
              <span class="ah-question__send">
                <button
                  type="button"
                  ahButton="primary"
                  [disabled]="!canSend()"
                  (click)="sendAnswer()"
                >
                  {{ busy() ? 'Sending…' : 'Send answer' }}
                </button>
                <span class="ah-hint" [id]="hintId">{{ finalHint() }}</span>
              </span>
            </div>
          }
        } @else if (disabledReason()) {
          <div class="ah-question__form">
            <span class="ah-hint">{{ disabledReason() }}</span>
          </div>
        }
      }
    </article>
  `,
})
export class QuestionCard {
  /** The question's id ("Q2"). */
  readonly questionId = input.required<string>();
  /** The question, as the agent wrote it (shown as text). */
  readonly text = input.required<string>();
  /** The round it was asked in, or `null` to leave it out. */
  readonly round = input<number | null>(null);
  /** The agent's recommendation, if it gave one. */
  readonly recommendation = input<QuestionRecommendation | null>(null);
  /** The final answer; when set, the card is answered and nothing can be edited. */
  readonly answer = input<QuestionAnswer | null>(null);
  /** The question can't be answered here (no form); `disabledReason` says why. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Why the question can't be answered, shown in place of the form. */
  readonly disabledReason = input('');
  /** The answer field's control; the parent owns it and its validation. */
  readonly control = input<FormControl<string> | null>(null);
  /** Who the answer will be recorded as. */
  readonly actor = input('');
  /** The answer is being sent: the button is disabled. */
  readonly busy = input(false, { transform: booleanAttribute });

  /** "Use recommendation" was pressed; the text is already in the control. Never a send. */
  readonly useRecommendation = output<string>();
  /** "Send answer" was pressed with a non-blank answer: the trimmed text to send. */
  readonly send = output<string>();

  protected readonly textId = `ah-question-${nextQuestionId}-text`;
  protected readonly answerId = `ah-question-${nextQuestionId}-answer`;
  protected readonly hintId = `ah-question-${nextQuestionId++}-hint`;
  protected readonly state = computed<QuestionCardState>(() =>
    this.answer() !== null ? 'answered' : this.disabled() ? 'disabled' : 'open'
  );
  protected readonly answeredBy = computed(() => {
    const a = this.answer();
    if (a === null) return '';
    return [
      actorLabel(a.actor),
      absoluteTime(a.at),
      ...(a.note ? [a.note] : []),
    ].join(' · ');
  });
  protected readonly finalHint = computed(() => {
    const actor = this.actor();
    return actor
      ? `Answers are final once sent. Recorded as ${actor}.`
      : 'Answers are final once sent.';
  });

  private readonly value = signal('');
  private readonly controlDisabled = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly locked = computed(
    () => this.busy() || this.controlDisabled()
  );
  protected readonly canSend = computed(
    () => !this.locked() && this.value().trim() !== ''
  );

  constructor() {
    // Keep the form state in signals, so the send button follows typing and programmatic changes.
    effect((onCleanup) => {
      const c = this.control();
      const read = (): void => {
        this.value.set(c?.value ?? '');
        this.controlDisabled.set(c?.disabled ?? false);
      };
      read();
      if (c === null) return;
      const sub = c.events.subscribe(read);
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected useRec(text: string): void {
    const c = this.control();
    if (c === null || this.locked()) return;
    c.setValue(text);
    c.markAsDirty();
    this.useRecommendation.emit(text);
    this.host.nativeElement.querySelector('textarea')?.focus();
  }

  protected sendAnswer(): void {
    if (!this.canSend()) return;
    this.send.emit(this.value().trim());
  }
}
