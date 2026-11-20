import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import type { FollowUpGrill } from '@core/api/types';
import { CLOCK, type Timer } from '@core/realtime/clock';
import {
  FOLLOW_UP_GRILL_POLL_MS,
  decisionsBlock,
} from '@domain/follow-up-grill';
import {
  GRILL_OWN_ANSWER_MAX,
  optionLetter,
  type GrillPick,
} from '@domain/story-drafts';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import type { VoyageContext } from '../context/voyage-context';

/**
 * "Grill me" for the brief of a follow-up: an agent reads what the done voyage delivered and the brief, and asks a few
 * questions with answer options (one recommended). The person picks, leaves a question open or answers in their own
 * words, and the answers go into the brief as a block of decisions; nothing else is sent. The agent may spend AIU, up to
 * the story draft cap, which no voyage's budget pays. The grill is discarded when its answers are added, when another is
 * asked and when the dialog closes, so an agent never keeps asking for nobody.
 */
@Component({
  selector: 'ah-follow-up-grill',
  imports: [Banner, Button],
  styles: `
    :host {
      display: block;
      margin: 0 0 12px;
    }
    .grill__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .grill__bar .ah-hint {
      margin: 0;
    }
    .grill__busy {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-top: 12px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
    }
    .grill__busy p {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .grill__spinner {
      flex: none;
      width: 16px;
      height: 16px;
      margin-top: 2px;
      border: 2px solid var(--line);
      border-top-color: var(--accent);
      border-radius: 50%;
    }
    @media (prefers-reduced-motion: no-preference) {
      .grill__spinner {
        animation: grill-spin 0.8s linear infinite;
      }
    }
    @keyframes grill-spin {
      to {
        transform: rotate(360deg);
      }
    }
    fieldset {
      margin: 12px 0 0;
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
      overflow-wrap: anywhere;
    }
    textarea {
      width: 100%;
      min-height: 64px;
      resize: vertical;
    }
    .grill__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-top: 12px;
    }
  `,
  template: `
    <div class="grill__bar">
      <button
        ahButton="ghost"
        size="sm"
        type="button"
        [disabled]="!hasBrief()"
        [attr.aria-disabled]="busy() || discarding() ? 'true' : null"
        [attr.aria-busy]="busy()"
        (click)="ask()"
      >
        {{ grill() === null ? 'Grill me' : 'Ask again' }}
      </button>
      <span class="ah-hint">{{ hint() }}</span>
    </div>
    @if (busy()) {
      <div class="grill__busy" role="status">
        <span class="grill__spinner" aria-hidden="true"></span>
        <p>
          <strong>{{ busyMessage() }}</strong>
          <span class="ah-hint"
            >This can take a minute or two. Keep this dialog open: closing it
            stops the agent.</span
          >
        </p>
      </div>
    }
    @if (error(); as message) {
      <ah-banner
        variant="error"
        heading="Grill me did not work"
        announce="status"
        >{{ message }}</ah-banner
      >
    }
    @if (grill(); as g) {
      @if (g.status === 'failed') {
        <ah-banner variant="error" heading="No questions came back">{{
          g.failure ?? 'The agent ended without questions.'
        }}</ah-banner>
      } @else {
        @for (q of g.questions ?? []; track q.id) {
          <fieldset>
            <legend>
              <span class="ah-hint">{{ q.id }}</span>
              <strong>{{ q.text }}</strong>
            </legend>
            @for (option of q.options; track $index) {
              <label class="option" [class.chosen]="isOption(q.id, $index)">
                <input
                  type="radio"
                  [name]="'grill-' + q.id"
                  [checked]="isOption(q.id, $index)"
                  (change)="pick(q.id, { choice: 'option', option: $index })"
                />
                <span class="letter" aria-hidden="true">{{
                  letter($index)
                }}</span>
                <span class="body">
                  <strong>{{ option.label }}</strong>
                  <span class="ah-hint">{{ option.detail }}</span>
                </span>
                @if (option.recommended) {
                  <span class="ah-tag ah-tag--accent">Recommended</span>
                }
              </label>
            }
            <label class="option" [class.chosen]="isChoice(q.id, 'open')">
              <input
                type="radio"
                [name]="'grill-' + q.id"
                [checked]="isChoice(q.id, 'open')"
                (change)="pick(q.id, { choice: 'open' })"
              />
              <span class="body">
                <strong>Leave it open</strong>
                <span class="ah-hint">The crew treats it as not decided.</span>
              </span>
            </label>
            <label class="option" [class.chosen]="isChoice(q.id, 'own')">
              <input
                type="radio"
                [name]="'grill-' + q.id"
                [checked]="isChoice(q.id, 'own')"
                (change)="pick(q.id, { choice: 'own', text: ownText(q.id) })"
              />
              <span class="body"><strong>Answer in my own words</strong></span>
            </label>
            @if (isChoice(q.id, 'own')) {
              <label class="ah-sr" [attr.for]="'grill-own-' + q.id"
                >Your answer to {{ q.id }}</label
              >
              <textarea
                class="ah-input"
                [id]="'grill-own-' + q.id"
                [maxLength]="ownMax"
                [value]="ownText(q.id)"
                (input)="own(q.id, $event)"
              ></textarea>
            }
          </fieldset>
        }
        <div class="grill__actions">
          <button
            ahButton="primary"
            size="sm"
            type="button"
            [disabled]="!hasAnswers()"
            [attr.aria-disabled]="discarding() ? 'true' : null"
            (click)="addToBrief()"
          >
            Add answers to the brief
          </button>
          <button ahButton="ghost" size="sm" type="button" (click)="drop()">
            Discard
          </button>
          <span class="ah-hint"
            >Answers go into the brief; nothing is sent until you start the
            follow-up.</span
          >
        </div>
      }
    }
  `,
})
export class FollowUpGrillPanel {
  readonly context = input.required<VoyageContext>();
  /** The brief as typed, which the agent reads. */
  readonly brief = input('');
  /** The acceptance criteria typed so far. */
  readonly criteria = input<readonly string[]>([]);
  /** The block of decisions to put at the end of the brief. */
  readonly answered = output<string>();

  private readonly clock = inject(CLOCK);
  private timer: Timer | null = null;
  /** Counts grills asked, so an answer for one since replaced or dropped is ignored. */
  private generation = 0;

  protected readonly ownMax = GRILL_OWN_ANSWER_MAX;
  protected readonly grill = signal<FollowUpGrill | null>(null);
  protected readonly starting = signal(false);
  /** Stopping the grill's agent is on its way: nothing else starts or is added meanwhile. */
  protected readonly discarding = signal(false);
  protected readonly error = signal('');
  protected readonly picks = signal<ReadonlyMap<string, GrillPick>>(new Map());
  protected readonly hasBrief = computed(() => this.brief().trim() !== '');
  /** The request is on its way or the agent is still asking; a lost connection ends the wait, not the agent. */
  protected readonly busy = computed(
    () =>
      this.starting() ||
      (this.grill()?.status === 'working' && this.error() === '')
  );
  protected readonly busyMessage = computed(() => {
    const g = this.grill();
    return g === null
      ? 'Sending your brief to the agent…'
      : `Ahoy's agent is reading ${g.storyKey} and your brief, then writing its questions…`;
  });
  protected readonly hint = computed(() =>
    this.brief().trim() === ''
      ? 'Write what is new or missing first; the agent asks about it.'
      : 'An agent asks a few questions about the brief. It may spend AIU (up to the story draft cap), which no budget pays.'
  );
  protected readonly hasAnswers = computed(() => this.block() !== '');

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation += 1;
      this.timer?.cancel();
      this.discardCurrent();
    });
  }

  protected letter(index: number): string {
    return optionLetter(index);
  }

  protected isOption(questionId: string, index: number): boolean {
    const pick = this.picks().get(questionId);
    return pick?.choice === 'option' && pick.option === index;
  }

  protected isChoice(questionId: string, choice: GrillPick['choice']): boolean {
    return this.picks().get(questionId)?.choice === choice;
  }

  protected ownText(questionId: string): string {
    const pick = this.picks().get(questionId);
    return pick?.choice === 'own' ? pick.text : '';
  }

  protected pick(questionId: string, pick: GrillPick): void {
    this.picks.update((picks) => new Map(picks).set(questionId, pick));
  }

  protected own(questionId: string, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement)
      this.pick(questionId, { choice: 'own', text: target.value });
  }

  /** Asks the agent; an earlier grill of the person's on this story is replaced by the API. */
  protected async ask(): Promise<void> {
    if (this.busy() || this.discarding() || !this.hasBrief()) return;
    const generation = ++this.generation;
    this.timer?.cancel();
    this.error.set('');
    // Until the API has replaced it, the earlier grill is the one that can still be cancelled.
    const earlier = this.grill();
    this.grill.set(null);
    this.picks.set(new Map());
    this.starting.set(true);
    const result = await this.context().askFollowUpGrill({
      text: this.brief().trim(),
      criteria: [...this.criteria()],
    });
    if (generation !== this.generation) {
      if (result.ok) void this.context().discardFollowUpGrill(result.value.id);
      if (earlier !== null)
        void this.context().discardFollowUpGrill(earlier.id);
      return;
    }
    this.starting.set(false);
    if (!result.ok) {
      this.grill.set(earlier);
      this.error.set(describe(result.error));
      return;
    }
    this.grill.set(result.value);
    this.poll(generation);
  }

  /** Puts the decisions at the end of the brief and drops the grill. */
  protected addToBrief(): void {
    const block = this.block();
    if (block === '' || this.discarding()) return;
    this.answered.emit(block);
    void this.drop();
  }

  /**
   * Drops the grill, stopping the agent if it is still asking. If the agent cannot be stopped, the grill stays with an
   * error, so Discard can be tried again and closing the dialog can still try.
   */
  protected async drop(): Promise<void> {
    if (this.discarding()) return;
    this.generation += 1;
    this.timer?.cancel();
    const grill = this.grill();
    if (grill !== null) {
      this.discarding.set(true);
      const result = await this.context().discardFollowUpGrill(grill.id);
      this.discarding.set(false);
      if (!result.ok && grill.status === 'working' && !isGone(result.error)) {
        this.error.set(`Could not stop the agent. ${describe(result.error)}`);
        return;
      }
    }
    this.error.set('');
    this.grill.set(null);
    this.picks.set(new Map());
  }

  private block(): string {
    const questions = this.grill()?.questions ?? [];
    return decisionsBlock(questions, this.picks());
  }

  private discardCurrent(): void {
    const grill = this.grill();
    if (grill !== null) void this.context().discardFollowUpGrill(grill.id);
  }

  /** Reads the grill again in a few seconds while the agent is asking. */
  private poll(generation: number): void {
    const grill = this.grill();
    if (grill === null || grill.status !== 'working') return;
    this.timer = this.clock.schedule(FOLLOW_UP_GRILL_POLL_MS, () => {
      void this.read(generation, grill.id);
    });
  }

  private async read(generation: number, id: string): Promise<void> {
    const result = await this.context().readFollowUpGrill(id);
    if (generation !== this.generation) return;
    if (!result.ok) {
      // The grill stays, so Discard and closing the dialog can still stop the agent.
      this.error.set(describe(result.error));
      return;
    }
    this.error.set('');
    this.grill.set(result.value);
    this.poll(generation);
  }
}

/** The API says there is no such grill any more, so there is nothing left to stop. */
function isGone(error: ApiError): boolean {
  return error.kind === 'problem' && error.status === 404;
}

/** What went wrong, in words for the person. */
function describe(error: ApiError): string {
  return error.kind === 'problem' && error.detail
    ? error.detail
    : 'Ahoy could not be reached. Try again.';
}
