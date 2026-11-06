/**
 * The defect watch's list in words (`ahoy-hosted` design §5 "Defect watch"): what the Backlog's Defects tab says of
 * each defect's triage, and of the watch's last pass. Pure.
 */

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
  if (defect.startError !== null && defect.voyage === null)
    return {
      text: `Ahoy could not start it: ${defect.startError}`,
      failed: true,
    };
  return null;
}

/** Whether a person may Try to fix the defect: it has no voyage yet and nobody ignored it. */
export function canTryToFix(defect: DefectStartFacts): boolean {
  return defect.voyage === null && defect.ignored === null;
}

/** "4 defects" or "1 defect". */
export function defectsLabel(n: number): string {
  return n === 1 ? '1 defect' : `${n} defects`;
}
