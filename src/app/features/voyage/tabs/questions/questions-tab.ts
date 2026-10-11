import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  Directive,
  computed,
  inject,
  signal,
  type WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { ApiClient } from '@core/api/api-client';
import {
  apiErrorView,
  commandErrorView,
  type CommandErrorView,
} from '@core/commands/command-error';
import type { Question } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import { StoryStore } from '@core/stores/story-store';
import { formatAiu } from '@domain/aiu';
import { actorLabel } from '@domain/identifiers';
import { currentQuestions, isSuperseded } from '@domain/questions';
import { crewLabel } from '@domain/models';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import {
  QuestionCard,
  type QuestionAnswer,
  type QuestionRecommendation,
} from '@ui/question-card/question-card';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import {
  modelLabel,
  runById,
  runCrew,
  slotsForPhase,
} from '../../context/crew';
import { VoyageContext } from '../../context/voyage-context';
import { DRAFT_STORAGE, QuestionDrafts } from './question-drafts';
import {
  answerProblem,
  answerSentToast,
  groupRounds,
  isAnswered,
  tooLongMessage,
  unanswered,
  type QuestionRound,
} from './question-rounds';

/** What the template needs to draw one question: the API's question, its answer form and what it may show. */
export interface QuestionView {
  readonly question: Question;
  readonly control: FormControl<string>;
  readonly answer: QuestionAnswer | null;
  readonly recommendation: QuestionRecommendation | null;
  /** Why the question cannot be answered now, or "". */
  readonly disabledReason: string;
  /** The text typed and not sent, when the question has been answered by someone else first. */
  readonly keptText: string;
  /** The message when the typed answer is longer than the API takes, or "". */
  readonly lengthProblem: string;
}

/** The field of one answer, and its text as a signal, so the page follows typing. */
export interface AnswerField {
  readonly control: FormControl<string>;
  readonly text: WritableSignal<string>;
}

/** One round with the crew member that asked it and the cards of its questions. */
export interface RoundView {
  readonly round: QuestionRound;
  readonly crew: string;
  readonly questions: readonly QuestionView[];
}

/** Types the context of the round templates (`let-view`), which Angular would otherwise read as `any`. */
@Directive({ selector: 'ng-template[ahRound]' })
export class RoundContext {
  static ngTemplateContextGuard(
    _directive: RoundContext,
    context: unknown
  ): context is { $implicit: RoundView } {
    return typeof context === 'object' && context !== null;
  }
}

/**
 * The Questions tab of a voyage (plan, lane 4C; wireframe `Questions`): the questions the crew asked, by round (the
 * newest open, earlier ones folded), each with its answer form, and the "What happens next" panel.
 *
 * Answers are final, so nothing is sent without a click on "Send answer". "Use recommendation" fills the field and
 * stops there. What a person types is a draft kept in memory and in `sessionStorage` until it is sent: a conflict, a
 * refresh of the store or a page reload never loses it.
 */
@Component({
  selector: 'ah-questions-tab',
  imports: [
    Banner,
    Button,
    EmptyState,
    NgTemplateOutlet,
    Panel,
    PanelBody,
    PanelHead,
    QuestionCard,
    RoundContext,
    Skeleton,
  ],
  styleUrl: './questions-tab.scss',
  template: `
    @if (questions() === null) {
      @if (loadError(); as e) {
        <ah-banner
          [variant]="e.variant"
          [heading]="e.heading"
          [tech]="e.tech ?? ''"
          icon="offline"
          announce="alert"
          >{{ e.text }}
          <span class="questions__retry"
            ><button type="button" ahButton size="sm" (click)="reload()">
              Try again
            </button></span
          ></ah-banner
        >
      } @else {
        <ah-panel>
          <div class="ah-panel__body questions__skeleton" aria-busy="true">
            <span class="ah-sr" role="status">Loading the questions…</span>
            <ah-skeleton width="40%" [height]="20" />
            <ah-skeleton width="90%" />
            <ah-skeleton width="70%" />
          </div>
        </ah-panel>
      }
    } @else if (rounds().length === 0 && history().length === 0) {
      <ah-panel>
        <ah-empty-state heading="No questions" icon="compass"
          >The crew hasn't asked anything on this voyage. If it does, the
          questions show up here.</ah-empty-state
        >
      </ah-panel>
    } @else {
      <div class="questions">
        <div class="questions__main">
          @if (rounds().length === 0) {
            <ah-panel>
              <ah-empty-state heading="No new questions" icon="compass"
                >The intake was refreshed, and the crew hasn't asked anything
                since. If it does, the questions show up here.</ah-empty-state
              >
            </ah-panel>
          }
          @for (view of rounds(); track view.round.round; let first = $first) {
            @if (first) {
              <section
                class="questions__round"
                [attr.aria-labelledby]="'round-' + view.round.round"
              >
                <div class="questions__head">
                  <ng-container
                    [ngTemplateOutlet]="head"
                    [ngTemplateOutletContext]="{ $implicit: view }"
                  />
                </div>
                <ng-container
                  [ngTemplateOutlet]="body"
                  [ngTemplateOutletContext]="{ $implicit: view }"
                />
              </section>
            } @else {
              <details class="questions__round questions__round--folded">
                <summary class="questions__head">
                  <ng-container
                    [ngTemplateOutlet]="head"
                    [ngTemplateOutletContext]="{ $implicit: view }"
                  />
                </summary>
                <ng-container
                  [ngTemplateOutlet]="body"
                  [ngTemplateOutletContext]="{ $implicit: view }"
                />
              </details>
            }
          }
          @if (history().length > 0) {
            <details
              class="questions__round questions__round--folded questions__history"
            >
              <summary class="questions__head">
                <h2 class="questions__title" id="questions-history">
                  Before the intake refresh
                </h2>
                <span class="ah-muted"
                  >{{ history().length }}
                  {{ history().length === 1 ? 'question' : 'questions' }} kept
                  as history, not answerable</span
                >
              </summary>
              <ng-container
                [ngTemplateOutlet]="body"
                [ngTemplateOutletContext]="{ $implicit: historyView() }"
              />
            </details>
          }
        </div>
        <aside class="questions__side" aria-label="What happens next">
          <ah-panel>
            <ah-panel-head heading="What happens next" />
            <ah-panel-body>
              <div class="questions__next">
                @if (waiting()) {
                  <span
                    >When every question in this round is answered, the voyage
                    is queued and {{ nextCrew() }}'s next run reads all the
                    answers.</span
                  >
                  @if (nextModel(); as model) {
                    <span class="ah-hint"
                      >That run spends from the remaining {{ remaining() }} AIU,
                      billed to {{ owner() }}, on
                      <span class="ah-mono">{{ model }}</span
                      >.</span
                    >
                  }
                } @else if (open()) {
                  <span
                    >This voyage isn't waiting for answers right now, so nothing
                    here is sent.</span
                  >
                } @else {
                  <span
                    >Every question is answered. Nothing on this voyage is
                    waiting for an answer.</span
                  >
                }
                <span class="ah-hint"
                  >Anyone on the crew may answer. There's no chat with the
                  agent: the answer is the whole message.</span
                >
              </div>
            </ah-panel-body>
          </ah-panel>
        </aside>
      </div>
    }

    <ng-template ahRound #head let-view>
      <h2 class="questions__title" [id]="'round-' + view.round.round">
        Round {{ view.round.round }} · {{ view.crew }} asks
      </h2>
      <span class="ah-muted"
        >{{ view.round.answered }} of {{ view.questions.length }} answered</span
      >
      <div
        class="ah-meter"
        role="meter"
        aria-valuemin="0"
        [style.width.px]="120"
        [attr.aria-label]="'Questions answered in round ' + view.round.round"
        [attr.aria-valuemax]="view.questions.length"
        [attr.aria-valuenow]="view.round.answered"
      >
        <i class="ah-meter__fill" [style.width.%]="view.round.percent"></i>
      </div>
    </ng-template>

    <ng-template ahRound #body let-view>
      @for (item of view.questions; track item.question.id) {
        <div class="questions__item">
          <ah-question-card
            [questionId]="item.question.id"
            [text]="item.question.text"
            [recommendation]="item.recommendation"
            [answer]="item.answer"
            [disabled]="item.disabledReason !== ''"
            [disabledReason]="item.disabledReason"
            [control]="item.control"
            [actor]="actor()"
            [busy]="sending() === item.question.id"
            (send)="send(item.question, $event)"
          />
          @if (item.lengthProblem !== '') {
            <p class="questions__problem" role="alert">
              {{ item.lengthProblem }}
            </p>
          }
          @if (problem(); as p) {
            @if (p.questionId === item.question.id) {
              <ah-banner
                [variant]="p.view.variant"
                [heading]="p.view.heading"
                [tech]="p.view.tech ?? ''"
                >{{ p.view.text }}</ah-banner
              >
            }
          }
          @if (item.keptText !== '') {
            <div class="questions__kept">
              <span class="ah-label">Your text, not sent</span>
              <p class="questions__kept-text">{{ item.keptText }}</p>
              <span
                ><button
                  type="button"
                  ahButton
                  size="sm"
                  (click)="discard(item.question.id)"
                >
                  Discard my text
                </button></span
              >
            </div>
          }
        </div>
      }
    </ng-template>
  `,
})
export class QuestionsTab {
  private readonly context = inject(VoyageContext);
  private readonly api = inject(ApiClient);
  private readonly store = inject(StoryStore);
  private readonly toasts = inject(ToastService);
  private readonly storage = inject(DRAFT_STORAGE);
  private readonly destroyRef = inject(DestroyRef);

  /** Who an answer is recorded as. */
  protected readonly actor = inject(CurrentUser).id;

  /** The id of the question being sent, if any. */
  protected readonly sending = signal<string | null>(null);
  /** What went wrong with the last answer, and for which question. */
  protected readonly problem = signal<{
    readonly questionId: string;
    readonly view: CommandErrorView;
  } | null>(null);

  /** The unsent answers of this voyage, by question id; a new set when the page shows another voyage. */
  private readonly drafts = computed(() => {
    const key = this.context.key();
    return key === null ? null : new QuestionDrafts(key, this.storage);
  });
  /** The answer fields, one per question and kept for as long as the voyage is open, so the text outlives refreshes. */
  private fields = new Map<string, AnswerField>();
  private fieldsOf: QuestionDrafts | null = null;

  /** The questions as the API lists them; null until they are read. */
  protected readonly questions = computed<readonly Question[] | null>(
    () => this.context.handle()?.questions.value() ?? null
  );
  protected readonly loadError = computed(() => {
    const error = this.context.handle()?.questions.error() ?? null;
    return error === null ? null : apiErrorView(error);
  });
  private readonly isAwaitingInput = computed(
    () => this.context.story()?.status === 'awaiting_input'
  );

  protected readonly rounds = computed((): readonly RoundView[] =>
    groupRounds(currentQuestions(this.questions() ?? [])).map((round) => ({
      round,
      crew: this.crewOf(round.questions[0]),
      questions: round.questions.map((question) => this.viewOf(question)),
    }))
  );

  /** The questions an intake refresh superseded: shown folded, read-only, after the current rounds. */
  protected readonly history = computed((): readonly Question[] =>
    (this.questions() ?? []).filter(isSuperseded)
  );
  /** The superseded questions as one read-only group for the card template. */
  protected readonly historyView = computed((): RoundView => {
    const questions = this.history();
    const answered = questions.filter(isAnswered).length;
    return {
      round: {
        round: 0,
        questions,
        answered,
        percent:
          questions.length === 0
            ? 0
            : Math.round((answered / questions.length) * 100),
      },
      crew: this.crewOf(questions[0]),
      questions: questions.map((question) => this.viewOf(question)),
    };
  });

  /** Whether some question still needs an answer. */
  protected readonly open = computed(
    () => unanswered(this.questions() ?? []).length > 0
  );
  /** Whether the voyage waits for these answers: a question is open and the voyage is `awaiting_input`. */
  protected readonly waiting = computed(
    () => this.open() && this.isAwaitingInput()
  );
  private readonly phase = computed(() => this.context.story()?.phase ?? '');
  protected readonly nextCrew = computed(() => crewLabel(this.phase()));
  /** The model of the phase's next run ("model · effort"); null until the model plan says. */
  protected readonly nextModel = computed(() => {
    const slot = slotsForPhase(this.context.models(), this.phase())[0];
    return slot === undefined ? null : modelLabel(slot);
  });
  protected readonly remaining = computed(() =>
    formatAiu(this.context.remainingNanoAiu(), 1)
  );
  protected readonly owner = computed(() => this.context.story()?.owner ?? '');

  /** Reads the questions again after a failed load. */
  protected reload(): void {
    void this.context.handle()?.questions.refresh();
  }

  /** Throws away the text a person typed for a question someone else answered first. */
  protected discard(questionId: string): void {
    this.fields.get(questionId)?.control.setValue('');
    this.drafts()?.clear(questionId);
  }

  /**
   * Sends the answer: the one place that does. It goes with the version the page shows; whatever comes back, the text
   * stays in its field, and only a recorded answer clears it.
   */
  protected async send(question: Question, text: string): Promise<void> {
    const key = this.context.key();
    if (key === null || answerProblem(text) !== null) return;
    this.problem.set(null);
    this.sending.set(question.id);
    try {
      const outcome = await this.context.commands.run(
        (expectedVersion) =>
          this.api.answerQuestion(key, question.id, {
            answer: text,
            expectedVersion,
          }),
        { onOk: (accepted) => this.store.accept(accepted.story) }
      );
      if (outcome.kind === 'skipped') return;
      if (outcome.kind !== 'ok') {
        const view = commandErrorView(outcome);
        if (view !== null) this.problem.set({ questionId: question.id, view });
        return;
      }
      const recorded = outcome.value.question;
      const list = this.questions() ?? [];
      this.context
        .handle()
        ?.questions.accept(
          list.map((q) => (q.id === recorded.id ? recorded : q))
        );
      this.discard(question.id);
      const left = unanswered(list).filter((q) => q.id !== recorded.id).length;
      this.toasts.show(
        answerSentToast(question.id, left, this.crewOf(question))
      );
    } finally {
      this.sending.set(null);
    }
  }

  private viewOf(question: Question): QuestionView {
    const { control, text } = this.fieldFor(question.id);
    const answered = isAnswered(question);
    const typed = text();
    const recommendation = question.recommendation?.trim() ?? '';
    return {
      question,
      control,
      answer: answered
        ? {
            text: question.answer ?? '',
            actor: actorLabel(question.answeredBy ?? ''),
            at: question.answeredAt ?? '',
          }
        : null,
      recommendation:
        recommendation === ''
          ? null
          : { agent: this.crewOf(question), text: recommendation },
      disabledReason: isSuperseded(question)
        ? 'An intake refresh superseded this question: it is kept as history and cannot be answered.'
        : !answered && !this.isAwaitingInput()
          ? "This voyage isn't waiting for answers right now."
          : '',
      keptText: answered && typed.trim() !== '' ? typed : '',
      lengthProblem:
        !answered && answerProblem(typed) === 'too_long'
          ? tooLongMessage(typed)
          : '',
    };
  }

  /** The field of a question, made once per voyage, starting from the draft kept for it. */
  private fieldFor(questionId: string): AnswerField {
    const drafts = this.drafts();
    if (drafts !== this.fieldsOf) {
      this.fields = new Map();
      this.fieldsOf = drafts;
    }
    const known = this.fields.get(questionId);
    if (known !== undefined) return known;
    const control = new FormControl(drafts?.read(questionId) ?? '', {
      nonNullable: true,
    });
    const field = { control, text: signal(control.value) };
    this.fields.set(questionId, field);
    control.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        drafts?.write(questionId, value);
        field.text.set(value);
      });
    return field;
  }

  /** The crew member that asked a question: by its run, else by the phase the voyage is in. */
  private crewOf(question: Question | undefined): string {
    const run =
      question === undefined
        ? undefined
        : runById(this.context.runs(), question.runId);
    return run === undefined ? this.nextCrew() : runCrew(run);
  }
}
