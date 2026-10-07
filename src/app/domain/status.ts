import type { Phase, StoryStatus } from "./types";

/** Badge modifiers of the design system (`ah-badge--<modifier>`). */
export type StatusModifier = "queued" | "running" | "input" | "decision" | "halted" | "done" | "blocked";

/** What a status badge shows: the crew's words, the CSS modifier and the API status word. */
export interface StatusPresentation {
  readonly label: string;
  readonly modifier: StatusModifier;
  readonly api: string;
}

/** The API status that groups Docked and Aground ("In port" filter). */
export const IN_PORT: StoryStatus = "terminal";

const BY_STATUS: Readonly<Record<Exclude<StoryStatus, "terminal">, StatusPresentation>> = {
  ready: { label: "Queued", modifier: "queued", api: "ready" },
  running: { label: "Under way", modifier: "running", api: "running" },
  awaiting_input: { label: "Crew asks", modifier: "input", api: "awaiting_input" },
  awaiting_decision: { label: "Your orders", modifier: "decision", api: "awaiting_decision" },
  halted: { label: "Anchored", modifier: "halted", api: "halted" },
};

/** Maps a story's status (and, for `terminal`, its phase) to the badge in `vocabulary.md`. */
export function statusPresentation(status: StoryStatus, phase?: Phase | null): StatusPresentation {
  if (status === "terminal") {
    return phase === "blocked"
      ? { label: "Aground", modifier: "blocked", api: "terminal" }
      : { label: "Docked", modifier: "done", api: "terminal" };
  }
  return BY_STATUS[status];
}
