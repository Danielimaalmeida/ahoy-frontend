import { PHASES, phaseIndex } from "@domain/phases";
import { statusPresentation } from "@domain/status";
import type { StoryStatus } from "@domain/types";

/** How one step of the stepper reads: passed, the one the voyage is in, where it stopped, or still ahead. */
export type StepState = "done" | "current" | "stopped" | "upcoming";

/** One of the seven phases as the stepper draws it. */
export interface PhaseStep {
  /** The API phase name, shown as the label. */
  readonly phase: string;
  /** 1-based position, shown in the circle unless the step is done or stopped. */
  readonly n: number;
  readonly state: StepState;
}

/** The stepper's content for one voyage: the seven steps and the sentence that names the position. */
export interface PhaseProgress {
  readonly steps: readonly PhaseStep[];
  /** 1-based position of the current or stopped step; `null` when it is unknown or the voyage is Docked. */
  readonly position: number | null;
  /** The accessible name of the compact bars: "Phase 3 of 7", "Stopped at phase 2", "Blocked at phase 3", "Done". */
  readonly label: string;
}

/**
 * Works out the seven steps for a voyage (the vocabulary lives in `@domain`).
 *
 * - Docked: every step is done, none is current.
 * - Anchored: the phase it is in is `stopped`, replacing `current`; the ones before are done.
 * - Aground: the phase is `blocked`, so the position comes from `stoppedAt` (the `from` of the last
 *   `story.phase_changed`, G12); without it no step is marked and the label says only "Blocked".
 * - Everything else: the phase it is in is `current`, the ones before are done, the rest are ahead.
 *
 * At most one step is `current` or `stopped`. A phase the stepper does not know marks nothing.
 */
export function phaseProgress(phase: string, status: StoryStatus, stoppedAt: string | null = null): PhaseProgress {
  const kind = statusPresentation(status, phase === "blocked" ? "blocked" : null).modifier;
  if (kind === "done") {
    return {
      steps: PHASES.map((name, index) => ({ phase: name, n: index + 1, state: "done" })),
      position: null,
      label: "Done",
    };
  }
  const position = phaseIndex(phase === "blocked" ? (stoppedAt ?? "") : phase);
  const marker = kind === "halted" || kind === "blocked" ? "stopped" : "current";
  const steps = PHASES.map((name, index): PhaseStep => {
    const n = index + 1;
    return { phase: name, n, state: position === null || n > position ? "upcoming" : n < position ? "done" : marker };
  });
  return { steps, position, label: positionLabel(kind, phase, position) };
}

/** The sentence that names where the voyage is, for the compact bars. */
function positionLabel(kind: string, phase: string, position: number | null): string {
  if (position === null) return kind === "blocked" ? "Blocked" : `Phase ${phase}`;
  if (kind === "blocked") return `Blocked at phase ${position}`;
  if (kind === "halted") return `Stopped at phase ${position}`;
  return `Phase ${position} of ${PHASES.length}`;
}
