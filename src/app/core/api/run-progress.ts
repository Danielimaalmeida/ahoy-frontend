/**
 * The payload of a `run.progress` event: what a running agent is doing (`RunProgressPayload` in the contract).
 *
 * Progress is shown, never judged: what a run did and what it is charged come only from `run.finished` and from `getRun`.
 * The text of a step is written by an agent. It arrives plain, with credential-shaped strings already masked as
 * `[REDACTED]`, and must still be rendered as text, never as HTML.
 */
import {
  guard,
  isRecord,
  nonEmptyText,
  oneOf,
  optional,
  patterned,
  shape,
  text,
  timestamp,
  wholeNumber,
} from "./guard-kit";

/** A tool call the agent started. */
export interface RunProgressTool {
  readonly kind: "tool";
  readonly runId: string;
  /** The line of the run's `events.jsonl` this step came from, 1-based: the key to de-duplicate on. */
  readonly line: number;
  readonly at?: string;
  readonly tool: string;
  /** A short summary of the tool's main argument, when it has one. */
  readonly summary?: string;
}

/** A message the agent wrote, cut to its first 200 characters. */
export interface RunProgressMessage {
  readonly kind: "message";
  readonly runId: string;
  readonly line: number;
  readonly at?: string;
  readonly text: string;
}

/** The run's spend so far. It closes every batch of steps, so it also says where reading stopped. */
export interface RunProgressSpend {
  readonly kind: "spend";
  readonly runId: string;
  /** Lines of `events.jsonl` read so far. */
  readonly line: number;
  /** Bytes read so far. */
  readonly offset: number;
  /** Spent so far, as the run's log shows it; `run.finished` has what is charged. */
  readonly nanoAiu: number;
  /** Model requests so far. */
  readonly requests: number;
  /** `tool` and `message` events written for the run. */
  readonly steps: number;
  /** Steps left out by the API's limits. */
  readonly omitted: number;
  /** Lines the API could not read. */
  readonly skipped: number;
  /** `run.progress` events written for the run, this one included. */
  readonly events: number;
}

/** One `run.progress` payload, told apart by `kind`. */
export type RunProgress = RunProgressTool | RunProgressMessage | RunProgressSpend;

const runId = patterned("a run id", /^[A-Za-z0-9_.-]+$/, 120);
const count = wholeNumber("a whole number, 0 or more", 0);

const isTool = guard<RunProgressTool>(
  "run.progress tool",
  shape<RunProgressTool>({
    kind: oneOf(["tool"]),
    runId,
    line: wholeNumber("a line number, 1 or more", 1),
    at: optional(timestamp),
    tool: nonEmptyText,
    summary: optional(text),
  }),
);

const isMessage = guard<RunProgressMessage>(
  "run.progress message",
  shape<RunProgressMessage>({
    kind: oneOf(["message"]),
    runId,
    line: wholeNumber("a line number, 1 or more", 1),
    at: optional(timestamp),
    text: nonEmptyText,
  }),
);

const isSpend = guard<RunProgressSpend>(
  "run.progress spend",
  shape<RunProgressSpend>({
    kind: oneOf(["spend"]),
    runId,
    line: count,
    offset: count,
    nanoAiu: wholeNumber("a whole number of nano-AIU, 0 or more", 0),
    requests: count,
    steps: count,
    omitted: count,
    skipped: count,
    events: wholeNumber("a whole number, 1 or more", 1),
  }),
);

/**
 * Reads the payload of a `run.progress` event. Returns null for anything that is not one: a `kind` this version does not
 * know (the API may add some), or a known `kind` with a field missing or of the wrong type. Progress is advisory, so a
 * payload that cannot be read is dropped rather than reported.
 */
export function parseRunProgress(payload: unknown): RunProgress | null {
  if (!isRecord(payload)) return null;
  switch (payload["kind"]) {
    case "tool":
      return isTool(payload) ? payload : null;
    case "message":
      return isMessage(payload) ? payload : null;
    case "spend":
      return isSpend(payload) ? payload : null;
    default:
      return null;
  }
}
