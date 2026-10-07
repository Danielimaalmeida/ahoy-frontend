import { signal } from "@angular/core";
import {
  isAlreadyAnswered,
  isDecisionAlreadyRecorded,
  isStale,
  type ApiError,
  type ApiResult,
  type ProblemError,
} from "@core/api/api-error";

/**
 * What a command came to (plan §5.5). Every outcome is a value: the caller keeps what the user typed whatever comes
 * back, and only closes its form on `ok`.
 *
 * - `ok`: the API took it; `value` is its answer (the story, or the model plan), already the truth.
 * - `stale`: `409 stale_version`. The story has been read again, so a resend goes with the new version.
 * - `decided`: `409 decision_already_recorded`. Someone decided that gate first.
 * - `answered`: `409 already_answered`. Someone answered that question first.
 * - `other`: any other error (another 409, a 400, a 404, the network, an unreadable answer).
 * - `skipped`: nothing was sent, because a command was already in flight or the story was not loaded yet.
 */
export type CommandOutcome<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "stale" | "decided" | "answered"; readonly error: ProblemError }
  | { readonly kind: "other"; readonly error: ApiError }
  | { readonly kind: "skipped" };

/** What a {@link CommandRunner} works on: the story version the user saw, and how to read the story again. */
export interface CommandTarget {
  /** The version the user saw, sent as `expectedVersion`; null while the story is not loaded. */
  version(): number | null;
  /** Reads the story (and what depends on it) again; resolves once the new version is in place. */
  refresh(): Promise<void>;
}

/** Options of {@link CommandRunner.run}. */
export interface RunOptions<T> {
  /** Called with the answer of a successful command, before `run` resolves: put it in the store here. */
  readonly onOk?: (value: T) => void;
}

/** Sorts an error of a command into the outcome the UI handles. */
export function classifyCommandError(error: ApiError): CommandOutcome<never> {
  if (isStale(error)) return { kind: "stale", error };
  if (isDecisionAlreadyRecorded(error)) return { kind: "decided", error };
  if (isAlreadyAnswered(error)) return { kind: "answered", error };
  return { kind: "other", error };
}

/**
 * Sends the commands of one voyage (plan §5.5), one at a time.
 *
 * `run(send)` calls `send` with the version the user saw and sorts the answer into a {@link CommandOutcome}. While one
 * command is in flight `pending` is true and any other `run` is `skipped` without a request, so a double click sends one
 * request. After a `409` (the story moved on), the story is read again before `run` resolves, so the page shows what
 * changed and a resend carries the new version. The runner never touches the user's text: forms keep it, whatever the
 * outcome.
 */
export class CommandRunner {
  private readonly pendingSignal = signal(false);
  private inFlight = false;

  /** Whether a command is in flight. */
  readonly pending = this.pendingSignal.asReadonly();

  constructor(private readonly target: CommandTarget) {}

  /** Sends one command with the current version. Never throws for an outcome the API can give. */
  async run<T>(
    send: (expectedVersion: number) => Promise<ApiResult<T>>,
    options: RunOptions<T> = {},
  ): Promise<CommandOutcome<T>> {
    const version = this.target.version();
    if (this.inFlight || version === null) return { kind: "skipped" };
    this.inFlight = true;
    this.pendingSignal.set(true);
    try {
      const result = await send(version);
      if (result.ok) {
        options.onOk?.(result.value);
        return { kind: "ok", value: result.value };
      }
      // A 409 means the story is not what the user saw: show them what it is now before they try again.
      if (result.error.kind === "problem" && result.error.status === 409) await this.target.refresh();
      return classifyCommandError(result.error);
    } finally {
      this.inFlight = false;
      this.pendingSignal.set(false);
    }
  }
}
