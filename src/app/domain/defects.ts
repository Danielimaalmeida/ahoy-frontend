/**
 * The defect watch's list in words (`ahoy-hosted` design §5 "Defect watch"): what the Backlog's Defects tab says of
 * each defect's triage, and of the watch's last pass. Pure.
 */

import { isStoryKey } from './identifiers';
import { absoluteDay } from './time';

/** What the tab reads of one defect. */
export interface DefectFacts {
  readonly triage: 'can_try' | 'out';
  readonly reasons: readonly string[];
  readonly ignored: {
    readonly by: string;
    readonly byName: string | null;
    readonly reason: string | null;
  } | null;
}

/** The triage tag and the line under it: "Ahoy can try", "Not for Ahoy" or "Ignored", with why. */
export function defectTriageView(defect: DefectFacts): {
  readonly label: string;
  readonly tone: 'fit' | 'out' | 'ignored';
  readonly detail: string;
} {
  if (defect.ignored !== null) {
    const who = defect.ignored.byName ?? defect.ignored.by;
    return {
      label: 'Ignored',
      tone: 'ignored',
      detail:
        defect.ignored.reason === null
          ? `by ${who}`
          : `by ${who}: ${defect.ignored.reason}`,
    };
  }
  return defect.triage === 'can_try'
    ? { label: 'Ahoy can try', tone: 'fit', detail: defect.reasons.join(' · ') }
    : { label: 'Not for Ahoy', tone: 'out', detail: defect.reasons.join('; ') };
}

/** Who started a defect's voyage, or why the watch could not, as the tab reads them. */
export interface DefectStartFacts {
  readonly key: string;
  readonly started: {
    readonly by: string;
    readonly byName: string | null;
  } | null;
  readonly startError: string | null;
  readonly voyage: unknown;
  readonly ignored: unknown;
}

/** The actor of the voyages the watch starts by itself (`ahoy-hosted`'s `DEFECT_WATCH_ACTOR`). */
export const DEFECT_WATCH_ACTOR = 'ahoy-defect-watch';

/** The line under a defect's voyage: "Started by Ahoy" or "Started by Sam", why the watch could not, or null. */
export function defectStartLine(defect: DefectStartFacts): {
  readonly text: string;
  readonly failed: boolean;
} | null {
  if (defect.started !== null)
    return {
      text:
        defect.started.by === DEFECT_WATCH_ACTOR
          ? 'Started by Ahoy'
          : `Started by ${defect.started.byName ?? defect.started.by}`,
      failed: false,
    };
  if (
    defect.startError !== null &&
    defect.voyage === null &&
    defect.ignored === null
  )
    return {
      text: `Ahoy could not start it: ${defect.startError}`,
      failed: true,
    };
  return null;
}

/** Whether a person may Try to fix the defect: it has no voyage yet, nobody ignored it, and its key may be a voyage's. */
export function canTryToFix(defect: DefectStartFacts): boolean {
  return (
    defect.voyage === null && defect.ignored === null && isStoryKey(defect.key)
  );
}

/** What the tab reads of a defect's latest reproduction. */
export interface ReproductionFacts {
  readonly status: string;
  /** The environment's name when the run was queued. */
  readonly environment: string;
  /** Whether it tried the defect as Jira has it now. */
  readonly current: boolean;
  readonly result: {
    readonly verdict: 'reproduced' | 'not_reproduced' | 'inconclusive';
    readonly why: string;
  } | null;
}

/** The tone of a reproduction's tag. */
export type ReproductionTone =
  'reproduced' | 'not_reproduced' | 'inconclusive' | 'busy';

/** Whether a reproduction's run is queued or running: it has no verdict yet. */
export function reproductionInProgress(
  reproduction: { readonly status: string } | null
): boolean {
  return (
    reproduction !== null &&
    (reproduction.status === 'queued' || reproduction.status === 'running')
  );
}

/**
 * The reproduction tag and the line under it: "Reproducing…" while the run is queued or running, then "Reproduced",
 * "Not reproduced" or "Inconclusive" with the environment and why. A verdict for an older version of the defect says
 * so: the watch does not count it. Null without a reproduction.
 */
export function reproductionView(reproduction: ReproductionFacts | null): {
  readonly label: string;
  readonly tone: ReproductionTone;
  readonly detail: string;
} | null {
  if (reproduction === null) return null;
  const on = `On ${reproduction.environment}`;
  if (reproduction.result === null)
    return {
      label: 'Reproducing…',
      tone: 'busy',
      detail: reproduction.status === 'queued' ? `${on}, queued` : on,
    };
  const { verdict, why } = reproduction.result;
  const label =
    verdict === 'reproduced'
      ? 'Reproduced'
      : verdict === 'not_reproduced'
        ? 'Not reproduced'
        : 'Inconclusive';
  const reason = why.trim() === '' ? on : `${on}: ${why.trim()}`;
  return {
    label,
    tone: verdict,
    detail: reproduction.current
      ? reason
      : `${reason} · The defect changed in Jira since.`,
  };
}

/** What the detail reads of one screenshot or recording a reproduction kept. */
export interface EvidenceFacts {
  readonly kind: 'screenshot' | 'video';
  readonly sizeBytes: number;
  /** When Ahoy removes it. */
  readonly expiresAt: string;
}

/** A file's size in words: "812 KB", "4.2 MB". */
export function evidenceSize(bytes: number): string {
  return bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * A reproduction's screenshots and recordings apart, each named by its place ("Screenshot 2 of 5", "Recording 1 of
 * 1"), a recording with its size, and the day Ahoy removes the first of them ("Sun 22 Nov"); null without any.
 */
export function evidenceView<T extends EvidenceFacts>(
  evidence: readonly T[],
  now: Date
): {
  readonly screenshots: readonly { readonly file: T; readonly label: string }[];
  readonly recordings: readonly {
    readonly file: T;
    readonly label: string;
    readonly size: string;
  }[];
  readonly keptUntil: string;
} | null {
  if (evidence.length === 0) return null;
  const shots = evidence.filter((e) => e.kind === 'screenshot');
  const videos = evidence.filter((e) => e.kind === 'video');
  const first = evidence.reduce((a, b) =>
    Date.parse(b.expiresAt) < Date.parse(a.expiresAt) ? b : a
  );
  return {
    screenshots: shots.map((file, i) => ({
      file,
      label: `Screenshot ${i + 1} of ${shots.length}`,
    })),
    recordings: videos.map((file, i) => ({
      file,
      label: `Recording ${i + 1} of ${videos.length}`,
      size: evidenceSize(file.sizeBytes),
    })),
    keptUntil: absoluteDay(first.expiresAt, now),
  };
}

/** A request the browser saw fail, in one line: "GET https://test.example.com/api/orders · 500", or "· no answer". */
export function failedRequestLine(request: {
  readonly method: string;
  readonly url: string;
  readonly status: number | null;
}): string {
  return `${request.method} ${request.url} · ${request.status ?? 'no answer'}`;
}

/**
 * Whether a person may ask for a reproduction: the defect has no voyage, nobody ignored it and none is in progress.
 * The API takes any listed defect; the tab offers it where a verdict still helps decide what to start.
 */
export function canReproduce(
  defect: DefectStartFacts & {
    readonly reproduction: { readonly status: string } | null;
  }
): boolean {
  return (
    defect.voyage === null &&
    defect.ignored === null &&
    !reproductionInProgress(defect.reproduction)
  );
}

/** "4 defects" or "1 defect". */
export function defectsLabel(n: number): string {
  return n === 1 ? '1 defect' : `${n} defects`;
}
