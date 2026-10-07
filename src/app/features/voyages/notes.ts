import type { StoryStateView } from "@core/api/story-state";
import type { AhoyEvent, Question, Story } from "@core/api/types";
import { explainHalt } from "@domain/halt";
import { crewLabel } from "@domain/models";
import { GATE_FOR_PHASE } from "@domain/phases";
import { actorLabel } from "@domain/identifiers";

/** Who anchored a voyage, from the last `story.halted` event (G7). */
export interface HaltNote {
  readonly actor: string;
}

/** Who rejected a human gate, from the last `decision.recorded` event that rejected one. */
export interface Rejection {
  readonly actor: string;
  readonly gate: string | null;
}

/** What a row of the table has read about its voyage; `null` until it is read. */
export interface NoteDetail {
  readonly questions: readonly Question[] | null;
  readonly state: StoryStateView | null;
  readonly halt: HaltNote | null;
  readonly rejection: Rejection | null;
}

/** The crew member of a phase, in the crew's words (G14); both Lookouts share `pr_review`. */
function crewOfPhase(phase: string): string {
  return phase === "pr_review" ? "Lookouts" : crewLabel(phase);
}

/** What a human gate decides, as a noun: "Plan", "Delivery". */
function gateNoun(gate: string | null): string {
  if (gate === GATE_FOR_PHASE.plan_review) return "Plan";
  if (gate === GATE_FOR_PHASE.delivery_gate) return "Delivery";
  return "Decision";
}

function approvalNote(story: Story, state: StoryStateView | null): string {
  const byPhase: Readonly<Record<string, string>> = GATE_FOR_PHASE;
  const gate = byPhase[story.phase];
  if (gate === undefined) return "A decision is waiting";
  const waiting = `${gateNoun(gate)} waiting for approval`;
  if (state === null) return waiting;
  return `${waiting} · round ${(state.revisions.get(gate) ?? 0) + 1} of ${state.revisionCeiling}`;
}

function haltedNote(story: Story, halt: HaltNote | null): string {
  const reason = story.haltReason;
  if (reason === null) return "The voyage is anchored";
  if (reason === "stopped_by_user") return `Stopped by ${halt === null ? "a person" : actorLabel(halt.actor)}`;
  return explainHalt(reason).short;
}

function portNote(story: Story, rejection: Rejection | null): string {
  if (story.phase !== "blocked") return "Delivered";
  return rejection === null ? "Ran aground" : `${gateNoun(rejection.gate)} rejected by ${actorLabel(rejection.actor)}`;
}

/** The "Note" column: one line on what the voyage is doing or waiting for, by status. */
export function noteFor(story: Story, detail: NoteDetail): string {
  switch (story.status) {
    case "running":
      return `${crewOfPhase(story.phase)} at work`;
    case "ready":
      return `${crewOfPhase(story.phase)} goes next`;
    case "awaiting_input": {
      if (detail.questions === null) return "Waiting for answers";
      const open = detail.questions.filter((question) => question.answer === null).length;
      return `${open} open ${open === 1 ? "question" : "questions"}`;
    }
    case "awaiting_decision":
      return approvalNote(story, detail.state);
    case "halted":
      return haltedNote(story, detail.halt);
    case "terminal":
      return portNote(story, detail.rejection);
  }
}

/** The last event of a type, or `undefined`. */
function lastOf(events: readonly AhoyEvent[], type: string): AhoyEvent | undefined {
  return events.filter((event) => event.type === type).at(-1);
}

/** The phase an aground voyage was in: the `from` of its last `story.phase_changed` (G12); `null` when unknown. */
export function blockedAt(events: readonly AhoyEvent[]): string | null {
  const from = lastOf(events, "story.phase_changed")?.payload["from"];
  return typeof from === "string" && from !== "" ? from : null;
}

/** Who rejected a gate: the last `decision.recorded` event whose decision was `reject`; `null` when none was. */
export function rejectionOf(events: readonly AhoyEvent[]): Rejection | null {
  const last = events
    .filter((event) => event.type === "decision.recorded" && event.payload["decision"] === "reject")
    .at(-1);
  if (last === undefined) return null;
  const gate = last.payload["gate"];
  return { actor: last.actor, gate: typeof gate === "string" && gate !== "" ? gate : null };
}

/** Reads who anchored the voyage from the last `story.halted` event; `null` when there is none. */
export function haltOf(events: readonly AhoyEvent[]): HaltNote | null {
  const last = lastOf(events, "story.halted");
  return last === undefined ? null : { actor: last.actor };
}
