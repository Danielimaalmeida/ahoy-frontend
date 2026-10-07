import type { AhoyEvent } from "@core/api/types";
import { RUN_PROGRESS } from "@core/realtime/event-types";
import { crewLabel } from "@domain/models";
import type { ShipsLogEntry } from "@ui/ships-log/ships-log";
import { eventText, type EventContext } from "./event-text";

/** How many events the log shows at first. */
export const INITIAL_VISIBLE = 14;

/** How many more each "Show earlier events" click adds. */
export const PAGE_SIZE = 20;

/** The text of a payload field when it is a non-blank string. */
function text(event: AhoyEvent, key: string): string | null {
  const value: unknown = event.payload[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The ship's log entries for a voyage's events, **newest first**, without `run.progress` (that is the live steps, not a
 * log line). The events come oldest first, as `StoryEventsFeed.events` holds them: reading in that order lets each entry
 * know the revision round of its gate (one more than the send-backs recorded before it) and the crew member of its run
 * (from the run's own `run.queued`), which the payloads of `story.awaiting_decision` and `run.finished` do not carry.
 */
export function logEntries(
  eventsOldestFirst: readonly AhoyEvent[],
  runLink: (runId: string) => string,
): ShipsLogEntry[] {
  const sendBacks = new Map<string, number>();
  const crews = new Map<string, string>();
  const entries: ShipsLogEntry[] = [];
  for (const event of eventsOldestFirst) {
    if (event.type === RUN_PROGRESS) continue;
    const gate = text(event, "gate");
    const runId = text(event, "runId");
    const context: EventContext = {
      round: event.type === "story.awaiting_decision" && gate !== null ? (sendBacks.get(gate) ?? 0) + 1 : null,
      crew: event.type === "run.finished" && runId !== null ? (crews.get(runId) ?? null) : null,
    };
    if (event.type === "decision.recorded" && gate !== null && text(event, "decision") === "send_back") {
      sendBacks.set(gate, (sendBacks.get(gate) ?? 0) + 1);
    }
    if (event.type === "run.queued" && runId !== null) {
      const agent = text(event, "agent");
      if (agent !== null) crews.set(runId, crewLabel(text(event, "phase") ?? "", agent));
    }
    const view = eventText(event, context);
    entries.push({
      id: event.id,
      at: event.createdAt,
      title: view.title,
      ...(view.details !== "" ? { details: view.details } : {}),
      actor: event.actor,
      kind: view.kind,
      ...(view.runId !== null ? { run: { id: view.runId, link: runLink(view.runId) } } : {}),
    });
  }
  return entries.reverse();
}

/** How many entries to show after `clicks` presses of "Show earlier events" (the first screen is {@link INITIAL_VISIBLE}). */
export function visibleCount(total: number, clicks: number): number {
  return Math.min(total, INITIAL_VISIBLE + clicks * PAGE_SIZE);
}
