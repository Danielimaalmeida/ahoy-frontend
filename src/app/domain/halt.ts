import type { HaltReason } from "./types";

/** The two faces of a halt reason: a one-liner for lists and the full sentence from the vocabulary. */
export interface HaltReasonInfo {
  /** One-line version for the "What's needed" column and the banner title. */
  readonly short: string;
  /** Full text, copied verbatim from `docs/design/design-system/vocabulary.md`. */
  readonly text: string;
}

/** What the Anchored banner shows. */
export interface HaltExplanation {
  readonly short: string;
  readonly text: string;
  /** The event's `detail`, trimmed; `null` when there is none. */
  readonly detail: string | null;
}

/**
 * Plain-language text for each halt reason, copied verbatim from `vocabulary.md`. `short` is the first sentence of
 * `text` when the text has more than one, and the whole text otherwise: a table cell with no room still says
 * exactly what the vocabulary says, never a rewording.
 */
export const HALT_REASONS: Readonly<Record<HaltReason, HaltReasonInfo>> = {
  stopped_by_user: {
    short: "Someone on the crew stopped it.",
    text: "Someone on the crew stopped it. Show their reason.",
  },
  gate_rejected: {
    short: "An automated check rejected the crew's output, and it can't be retried automatically.",
    text: "An automated check rejected the crew's output, and it can't be retried automatically.",
  },
  budget_exhausted: {
    short: "The voyage has spent its whole AIU budget.",
    text: "The voyage has spent its whole AIU budget. Raise the budget, then resume.",
  },
  run_failed: {
    short: "A crew member's run failed, for example a refused model or a crash.",
    text: "A crew member's run failed, for example a refused model or a crash.",
  },
  run_lost: {
    short: "Ahoy lost contact with a run and can't tell how it ended.",
    text: "Ahoy lost contact with a run and can't tell how it ended.",
  },
  run_result_invalid: {
    short: "A run finished, but its result couldn't be read or broke the rules.",
    text: "A run finished, but its result couldn't be read or broke the rules.",
  },
  dispatch_failed: {
    short: "Ahoy couldn't start the run at all.",
    text: "Ahoy couldn't start the run at all. Nothing was spent.",
  },
  revision_ceiling_reached: {
    short: "The plan was sent back the maximum number of times (about 4).",
    text: "The plan was sent back the maximum number of times (about 4).",
  },
  reconciler_error: {
    short: "Something went wrong inside Ahoy while moving the voyage on.",
    text: "Something went wrong inside Ahoy while moving the voyage on.",
  },
};

/** True when the API value is one of the nine known halt reasons. */
export function isHaltReason(value: string): value is HaltReason {
  return Object.hasOwn(HALT_REASONS, value);
}

/**
 * Explains a halt in plain language. An unknown reason shows the API code untouched (a tooling failure never reads
 * like a verdict), and the event's detail is returned separately so the banner can quote it.
 */
export function explainHalt(reason: string, detail?: string): HaltExplanation {
  const known: HaltReasonInfo = isHaltReason(reason) ? HALT_REASONS[reason] : { short: reason, text: reason };
  const trimmed = detail?.trim() ?? "";
  return { short: known.short, text: known.text, detail: trimmed.length > 0 ? trimmed : null };
}
