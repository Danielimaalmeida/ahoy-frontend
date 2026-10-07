import { Component, booleanAttribute, computed, input } from "@angular/core";
import type { StoryStatus } from "@domain/types";
import type { StepState } from "./phase-steps";
import { phaseProgress } from "./phase-steps";

/** The sign inside a step's circle: a check when passed, "!" where it stopped, otherwise its number. */
const MARKS: Readonly<Record<StepState, string | null>> = { done: "✓", stopped: "!", current: null, upcoming: null };

/** What a screen reader hears after the phase name, so the state is never carried by colour alone. */
const STATE_WORDS: Readonly<Record<StepState, string>> = {
  done: "done",
  current: "current",
  stopped: "stopped",
  upcoming: "ahead",
};

/**
 * Where a voyage is in intake → planning → plan_review → implementation → pr_review → delivery_gate → done. The full
 * form shows all seven phases (passed with ✓, the current one numbered, the one it stopped in with "!"); `compact` is
 * the seven bars for tables. For an Aground voyage the API phase is `blocked`, so pass `stoppedAt`, the phase it was
 * in (G12); without it the stepper shows the final state with no position.
 *
 * ```html
 * <ah-phase-stepper [phase]="story.phase" [status]="story.status" [stoppedAt]="blockedAt" />
 * <ah-phase-stepper [phase]="story.phase" [status]="story.status" compact />
 * ```
 */
@Component({
  selector: "ah-phase-stepper",
  template: `
    @if (compact()) {
      <div class="ah-dots" role="img" [attr.aria-label]="progress().label">
        @for (step of progress().steps; track step.n) {
          <span [class]="dotClass(step.state)"></span>
        }
      </div>
    } @else {
      <div class="ah-stepper" role="list" aria-label="Phases">
        @for (step of progress().steps; track step.n) {
          <span
            role="listitem"
            [class]="stepClass(step.state)"
            [attr.aria-current]="step.state === 'current' || step.state === 'stopped' ? 'step' : null"
            [attr.aria-label]="step.phase + ', ' + stateWord(step.state)"
            ><b class="ah-step__n" aria-hidden="true">{{ mark(step.state) ?? step.n }}</b
            >{{ step.phase }}</span
          >
          @if (!$last) {
            <span class="ah-step__sep" aria-hidden="true"></span>
          }
        }
      </div>
    }
  `,
})
export class PhaseStepper {
  /** The API phase, or `blocked` for a voyage that ran aground. */
  readonly phase = input.required<string>();
  /** The API status: it tells Anchored and Aground (stopped) from Docked (all done) and from a voyage under way. */
  readonly status = input.required<StoryStatus>();
  /** For an Aground voyage, the phase it was in when it stopped (the `from` of its last `story.phase_changed`). */
  readonly stoppedAt = input<string | null>(null);
  /** The seven bars of the voyages table instead of the full stepper. */
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly progress = computed(() => phaseProgress(this.phase(), this.status(), this.stoppedAt()));

  protected stepClass(state: StepState): string {
    return state === "upcoming" ? "ah-step" : `ah-step ah-step--${state}`;
  }
  protected dotClass(state: StepState): string | null {
    return state === "upcoming" ? null : `is-${state}`;
  }
  protected mark(state: StepState): string | null {
    return MARKS[state];
  }
  protected stateWord(state: StepState): string {
    return STATE_WORDS[state];
  }
}
