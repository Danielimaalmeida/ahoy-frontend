import type { DiagnosisActor, DiagnosisKind } from './types';

/** Who a finding asks to act, in words for the screens. */
export const DIAGNOSIS_ACTOR_LABELS: Readonly<Record<DiagnosisActor, string>> =
  {
    story_owner: "For the voyage's owner",
    operator: 'For the Ahoy operators',
    agent_maintainer: "For whoever maintains the agents' instructions",
  };

/** The part of a diagnosis finding the screens read. */
export interface FindingSummary {
  readonly kind: DiagnosisKind;
  readonly title: string;
  readonly actor: DiagnosisActor;
}

/** The findings worth showing: none when they only repeat a person's stop, which the screens already say. */
export function shownFindings<T extends FindingSummary>(
  findings: readonly T[]
): readonly T[] {
  return findings.every((f) => f.kind === 'stopped_by_user') ? [] : findings;
}

/**
 * The diagnosis in one line, for a list: the first cause and who acts on it, and how many more there are ("… · For the
 * Ahoy operators (+1 more)"). Null when there is nothing worth showing.
 */
export function diagnosisLine(
  findings: readonly FindingSummary[]
): string | null {
  const shown = shownFindings(findings);
  const first = shown[0];
  if (first === undefined) return null;
  const more = shown.length > 1 ? ` (+${shown.length - 1} more)` : '';
  return `${first.title} · ${DIAGNOSIS_ACTOR_LABELS[first.actor]}${more}`;
}
