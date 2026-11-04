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

/** "4 defects" or "1 defect". */
export function defectsLabel(n: number): string {
  return n === 1 ? '1 defect' : `${n} defects`;
}
