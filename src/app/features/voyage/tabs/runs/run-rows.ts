import type { RunProgressSpend } from "@core/api/run-progress";
import type { Run } from "@core/api/types";
import type { ProgressEntry } from "@core/stores/run-progress-buffer";
import type { LiveStep } from "@ui/live-steps/live-steps";

/** A run that has not ended: queued, or running. Everything else is a final status. */
export function isRunActive(run: Run): boolean {
  return run.status === "queued" || run.status === "running";
}

/** The runs oldest first (by `createdAt`, then by id, so the order never depends on how the API listed them). */
export function oldestFirst(runs: readonly Run[]): Run[] {
  return [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** "claude-sonnet-5 · high", or "agent's own · default" when the API left the model or the effort to the agent. */
export function runModelLabel(run: Run): string {
  return `${run.model ?? "agent's own"} · ${run.reasoningEffort ?? "default"}`;
}

/**
 * What the run has spent, in nano-AIU. While it is active it is the latest `spend` of its progress (the run's own
 * `usage` is only as fresh as the last list read), never below what the list already shows; once it ended it is the
 * final `usage` the API charged, and the live number is dropped.
 */
export function runSpendNanoAiu(run: Run, spend: RunProgressSpend | null): number {
  if (!isRunActive(run) || spend === null) return run.usage.nanoAiu;
  return Math.max(spend.nanoAiu, run.usage.nanoAiu);
}

/** Model requests so far: the latest `spend`'s while the run is active, else the final `usage`'s. */
export function runRequests(run: Run, spend: RunProgressSpend | null): number {
  if (!isRunActive(run) || spend === null) return run.usage.requests;
  return Math.max(spend.requests, run.usage.requests);
}

/** Turns the buffer's rows into the rows `ah-live-steps` shows, keeping each step's time and each gap's count. */
export function toLiveSteps(entries: readonly ProgressEntry[]): LiveStep[] {
  return entries.map((entry): LiveStep => {
    if (entry.kind === "gap") return { kind: "gap", count: entry.count };
    const { step, at } = entry;
    if (step.kind === "message") return { kind: "message", at, text: step.text };
    return {
      kind: "tool",
      at,
      tool: step.tool,
      ...(step.summary !== undefined ? { summary: step.summary } : {}),
    };
  });
}
