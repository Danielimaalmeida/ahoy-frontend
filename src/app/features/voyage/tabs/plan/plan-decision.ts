import { Injectable, computed, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ApiClient } from '@core/api/api-client';
import type { DecisionAccepted, HumanDecision } from '@core/api/types';
import { CurrentUser } from '@core/auth/current-user';
import { commandErrorView } from '@core/commands/command-error';
import type { CommandOutcome } from '@core/commands/command-runner';
import { StoryStore } from '@core/stores/story-store';
import { formatAiu } from '@domain/aiu';
import { crewLabel } from '@domain/models';
import { ToastService } from '@ui/toast/toast';
import { modelLabel, slotsForPhase } from '../../context/crew';
import { VoyageContext } from '../../context/voyage-context';
import { maxTrimmed, requiredText } from '@ui/field/text-validators';
import { serverFieldError } from '../../dialogs/dialog-support';
import {
  DECISION_REASON_MAX,
  PLAN_GATE,
  decidedRecord,
  decisionBody,
  decisionToast,
  outcomeWord,
} from './decision-view';

/** Where a decision was started from, and so where its error shows: the panel (Approve) or a dialog. */
export type DecisionSurface = 'panel' | 'dialog';

/** Someone decided the gate first (`409 decision_already_recorded`), as the conflict panel tells it. */
export interface DecisionConflict {
  /** What the user tried: "approve", "send back" or "reject", for "Your send-back wasn't recorded". */
  readonly attempted: HumanDecision;
  /** The text the user had written, kept for them to copy. */
  readonly text: string;
  /** Who decided first and what they did ("approved", "sent back", "rejected"); null when the history does not say. */
  readonly by: { readonly actor: string; readonly did: string } | null;
  /** The phase the voyage is in now, for "The voyage moved on to {phase}". */
  readonly phase: string;
}

/**
 * The reason a person is writing, by voyage, kept while the app is open: the Change link of the panel leaves for the Models
 * tab and the text must be there when they come back. Emptied when a decision goes through.
 */
@Injectable({ providedIn: 'root' })
export class PlanReasonDrafts {
  private readonly drafts = new Map<string, string>();

  /** The text written for `key`, or "". */
  get(key: string): string {
    return this.drafts.get(key) ?? '';
  }

  /** Keeps `text` for `key`; empty text forgets it. */
  set(key: string, text: string): void {
    if (text === '') this.drafts.delete(key);
    else this.drafts.set(key, text);
  }
}

/** The messages of the reason field. */
export const DECISION_REASON_MESSAGES: Readonly<Record<string, string>> = {
  required: 'A reason is required to send back or reject.',
  maxlength: `At most ${DECISION_REASON_MAX} characters.`,
};

/**
 * The plan decision of one open voyage, shared by the "Your decision" panel and the Send back and Reject dialogs (plan,
 * lane 4B): the picked card, the reason (one text for both, so what is written in the panel reaches the dialog and
 * survives a conflict), the last outcome of the command and what it came to. One per Plan tab; the context's
 * `CommandRunner` sends one command at a time with the version the user saw.
 *
 * The text is never lost: nothing here clears it but a decision that went through.
 */
@Injectable()
export class PlanDecision {
  private readonly context = inject(VoyageContext);
  private readonly api = inject(ApiClient);
  private readonly store = inject(StoryStore);
  private readonly toasts = inject(ToastService);
  private readonly drafts = inject(PlanReasonDrafts);
  private readonly last = signal<CommandOutcome<DecisionAccepted> | null>(null);
  private readonly surfaceSignal = signal<DecisionSurface>('panel');
  private readonly conflictSignal = signal<DecisionConflict | null>(null);

  /** Who is deciding, for "Recorded as {actor}". */
  readonly actor = inject(CurrentUser).id;
  /** The picked card; null until the person picks one, so nothing is approved by a stray click. */
  readonly choice = new FormControl<HumanDecision | null>(null);
  /** The reason: required while send back or reject is picked, at most 5000 characters. */
  readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [
      maxTrimmed(DECISION_REASON_MAX),
      (control) => (this.needsReason() ? requiredText(control) : null),
    ],
  });

  /** A command is in flight. */
  readonly busy = this.context.commands.pending;
  /** The banner for the last command that did not go through (stale, ceiling, network…); a conflict has its own panel. */
  readonly error = computed(() => {
    const outcome = this.last();
    return outcome === null || this.conflictSignal() !== null
      ? null
      : commandErrorView(outcome);
  });
  /** Where the last command started, so only that surface shows {@link error}. */
  readonly surface = this.surfaceSignal.asReadonly();
  /** The server's message for the reason, from a `400 validation_failed`. */
  readonly reasonError = computed(() =>
    serverFieldError(this.last(), 'reason')
  );
  /** Someone decided first, if the last command found so. */
  readonly conflict = this.conflictSignal.asReadonly();

  /** Whether the open gate is the plan's; any other gate gets the generic panel (its summary arrives in phase 7). */
  readonly isPlan = computed(() => this.context.gateKey() === PLAN_GATE);
  /** The crew member who revises what is sent back: the Cartographer for the plan, else "the crew". */
  readonly crew = computed(() =>
    this.isPlan() ? crewLabel('planning') : 'the crew'
  );
  /** The planning slot's model and effort, "claude-sonnet-5 · high"; null until the models are read. */
  readonly model = computed(() => {
    const slot = this.planningSlot();
    return slot === null ? null : modelLabel(slot);
  });
  /** What is left of the budget in AIU, as the cost lines say it. */
  readonly remaining = computed(() =>
    formatAiu(this.context.remainingNanoAiu())
  );
  /** Who is billed. */
  readonly owner = computed(() => this.context.story()?.owner ?? '');
  /** The gate records of the voyage, oldest first; empty until read. */
  readonly records = computed(() => this.context.handle()?.gates.value() ?? []);
  /** The planning slot: the model and effort a revision runs on, and where they come from. */
  readonly planningSlot = computed(
    () => slotsForPhase(this.context.models(), 'planning')[0] ?? null
  );

  constructor() {
    const key = this.context.key();
    if (key !== null) {
      this.reason.setValue(this.drafts.get(key));
      this.reason.valueChanges.subscribe((text) => this.drafts.set(key, text));
    }
    // The reason is required only for send back and reject: check it again when the card changes.
    this.choice.valueChanges.subscribe(() =>
      this.reason.updateValueAndValidity()
    );
  }

  /** Whether the picked card needs a reason (send back and reject do; Approve and no card do not). */
  private needsReason(): boolean {
    const choice = this.choice.value;
    return choice === 'send_back' || choice === 'reject';
  }

  /**
   * Whether the reason is there and within bounds for `decision`, marking the field so its error shows. An approval takes
   * no reason (the field is hidden), so whatever is left in it, however long, does not stop it.
   */
  reasonOk(decision: HumanDecision): boolean {
    if (decision === 'approve') return true;
    this.reason.markAsTouched();
    this.reason.updateValueAndValidity();
    return this.reason.valid;
  }

  /** Forgets the conflict panel and the last error, for a dialog that opens or another choice. */
  clearOutcome(): void {
    this.conflictSignal.set(null);
    this.last.set(null);
  }

  /**
   * Sends `decision` for the open gate with the version the user saw. On success the story answered goes to the store, the
   * toast says what is next and the form is emptied; on a conflict the text stays. Returns the outcome (`skipped` when a
   * command is in flight or the voyage has no open gate, which nothing is sent for).
   */
  async submit(
    decision: HumanDecision,
    surface: DecisionSurface
  ): Promise<CommandOutcome<DecisionAccepted>> {
    const key = this.context.key();
    const gate = this.context.gateKey();
    if (key === null || gate === null) return { kind: 'skipped' };
    if (this.choice.value !== decision) this.choice.setValue(decision);
    if (!this.reasonOk(decision)) return { kind: 'skipped' };
    const round = this.context.revisionRound();
    const ceiling = this.context.revisionCeiling();
    const seen = this.humanRecordIds();
    const crew = this.crew();
    const text = this.reason.value.trim();
    const reason = this.reason.value;
    this.surfaceSignal.set(surface);
    this.clearOutcome();
    const outcome = await this.context.commands.run(
      (expectedVersion) =>
        this.api.decideHumanGate(
          key,
          decisionBody(gate, decision, reason, expectedVersion)
        ),
      { onOk: (accepted) => this.store.accept(accepted.story) }
    );
    if (outcome.kind === 'skipped') return outcome;
    this.last.set(outcome);
    if (outcome.kind === 'ok') {
      this.toasts.show(decisionToast(decision, crew, round, ceiling));
      this.reason.reset('');
      this.choice.reset(null);
      void this.context.handle()?.gates.refresh();
    } else if (outcome.kind === 'decided') {
      this.conflictSignal.set(this.conflictOf(decision, text, seen, gate));
    }
    return outcome;
  }

  /** The ids of the human decisions at the gate that are in the history now. */
  private humanRecordIds(): ReadonlySet<string> {
    return new Set(
      this.records()
        .filter((record) => record.source === 'human')
        .map((record) => record.id)
    );
  }

  /**
   * What the conflict panel says. The decision that got there first is the newest human record at the gate that the user
   * had not seen before sending; without one (the history is not read yet) the panel says "Someone".
   */
  private conflictOf(
    attempted: HumanDecision,
    text: string,
    seen: ReadonlySet<string>,
    gate: string
  ): DecisionConflict {
    const first = decidedRecord(this.records(), gate, { settledOnly: false });
    const did =
      first === null || seen.has(first.id) ? null : outcomeWord(first.outcome);
    return {
      attempted,
      text,
      by: first !== null && did !== null ? { actor: first.actor, did } : null,
      phase: this.context.story()?.phase ?? '',
    };
  }
}
