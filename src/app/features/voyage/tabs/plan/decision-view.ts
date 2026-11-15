import type {
  DecisionRequest,
  GateRecord,
  HumanDecision,
} from '@core/api/types';
import type { ChoiceOption } from '@ui/choice-card/choice-card';

/** The human gate of the plan (`plan_accepted`, phase `plan_review`): the one this tab decides. */
export const PLAN_GATE = 'plan_accepted';

/** The human gate of the delivery (`delivery_accepted`, phase `delivery_gate`): decided above the tabs. */
export const DELIVERY_GATE = 'delivery_accepted';

/** Which words a human gate's decision takes: the plan's, the delivery's, or the plain ones of any other gate. */
export type GateKind = 'plan' | 'delivery' | 'other';

/** The kind of `gate`, for its words. */
export function gateKind(gate: string | null): GateKind {
  if (gate === PLAN_GATE) return 'plan';
  if (gate === DELIVERY_GATE) return 'delivery';
  return 'other';
}

/** What is decided at a gate of each kind, in "Send the {subject} back", "Reject the {subject}?". */
export const GATE_SUBJECT: Readonly<Record<GateKind, string>> = {
  plan: 'plan',
  delivery: 'delivery',
  other: 'work',
};

/** The most characters of a reason (`maxLength: 5000` in the plan's brief; the API trims nothing). */
export const DECISION_REASON_MAX = 5000;

/** What a send-back starts at a gate of each kind, before the round count. */
function revisesText(crew: string, kind: GateKind): string {
  switch (kind) {
    case 'plan':
      return `${crew} revises the plan.`;
    case 'delivery':
      return `${crew} reworks the pull requests, then the Lookout reviews them again.`;
    case 'other':
      return `${crew} revises the work.`;
  }
}

/**
 * What a send-back would start, in words: "Cartographer revises the plan. This would be round 3 of 4." `round` is the
 * round the voyage is in now (`VoyageContext.revisionRound`). Past the ceiling the API may refuse the send-back
 * (`revision_ceiling_reached`), and the text says what happens then. Without the round or the ceiling it says no count.
 */
export function roundText(
  crew: string,
  round: number | null,
  ceiling: number | null,
  kind: GateKind = 'plan'
): string {
  const revises = revisesText(crew, kind);
  if (round === null || ceiling === null) return revises;
  const next = round + 1;
  if (next <= ceiling)
    return `${revises} This would be round ${next} of ${ceiling}.`;
  return `${revises} This would be round ${next}, past the ${ceiling} rounds a ${GATE_SUBJECT[kind]} gets: Ahoy may refuse it, and then the voyage anchors and needs a person to decide.`;
}

/**
 * The Send back dialog's lead: which round it starts and what comes after the last one. Past the ceiling it says the send
 * back may be refused. Without the round or the ceiling it only says what a send-back does.
 */
export function sendBackLead(
  round: number | null,
  ceiling: number | null
): string {
  if (round === null || ceiling === null)
    return 'This starts another revision round.';
  const next = round + 1;
  if (next <= ceiling) {
    return `This starts revision round ${next} of ${ceiling}. After round ${ceiling} the voyage anchors and needs a person to decide.`;
  }
  return `This would be revision round ${next}, past the ${ceiling} rounds a plan gets. Ahoy may refuse it, and then the voyage anchors and needs a person to decide.`;
}

/** What approving a gate of each kind does. */
const APPROVE_TEXT: Readonly<Record<GateKind, string>> = {
  plan: 'The voyage moves on to implementation.',
  delivery: 'The voyage is done. Its pull requests stay open for you to merge.',
  other: 'The voyage moves on to its next phase.',
};

/** The three cards of "Your decision", each with its consequence (wireframe `PlanReview`), in the words of the gate. */
export function choiceOptions(
  crew: string,
  round: number | null,
  ceiling: number | null,
  kind: GateKind = 'plan'
): readonly ChoiceOption<HumanDecision>[] {
  return [
    {
      value: 'approve',
      title: 'Approve',
      description: APPROVE_TEXT[kind],
    },
    {
      value: 'send_back',
      title: 'Send back',
      description: roundText(crew, round, ceiling, kind),
    },
    {
      value: 'reject',
      title: 'Reject',
      description: "The voyage becomes blocked. This can't be undone here.",
    },
  ];
}

/** The label of the decision button for the card that is picked: "Approve plan", "Accept delivery", "Reject". */
export function confirmLabel(
  choice: HumanDecision,
  crew: string,
  kind: GateKind = 'plan'
): string {
  switch (choice) {
    case 'approve':
      return kind === 'plan'
        ? 'Approve plan'
        : kind === 'delivery'
          ? 'Accept delivery'
          : 'Approve';
    case 'send_back':
      return `Send back to ${crew}`;
    case 'reject':
      return kind === 'other' ? 'Reject' : `Reject ${GATE_SUBJECT[kind]}`;
  }
}

/**
 * The body of `decideHumanGate`. The reason is trimmed and left out when empty, and out of an approval altogether (a
 * reason typed before switching to Approve is not what the person is approving with).
 */
export function decisionBody(
  gate: string,
  decision: HumanDecision,
  reason: string,
  expectedVersion: number
): DecisionRequest {
  const text = reason.trim();
  return {
    gate,
    decision,
    ...(decision !== 'approve' && text !== '' ? { reason: text } : {}),
    expectedVersion,
  };
}

/** The toast after a decision, in the past tense, saying what is next. `round` is the round before the decision. */
export function decisionToast(
  decision: HumanDecision,
  crew: string,
  round: number | null,
  ceiling: number | null,
  kind: GateKind = 'plan'
): string {
  const subject =
    kind === 'plan' ? 'Plan' : kind === 'delivery' ? 'Delivery' : 'Gate';
  switch (decision) {
    case 'approve':
      return kind === 'plan'
        ? 'Plan approved. The voyage moves on to implementation.'
        : kind === 'delivery'
          ? 'Delivery accepted. The voyage is done.'
          : 'Gate approved. The voyage moves on.';
    case 'reject':
      return `${subject} rejected. The voyage became blocked.`;
    case 'send_back': {
      const sent = `${subject} sent back to ${crew}.`;
      if (round === null) return sent;
      const next = round + 1;
      return ceiling !== null && next <= ceiling
        ? `${sent} Round ${next} of ${ceiling} is running.`
        : `${sent} Round ${next} is running.`;
    }
  }
}

/** A decision in the past tense ("sent back"), or null for an outcome that is not a decision (an automated gate's). */
export function outcomeWord(outcome: string): string | null {
  switch (outcome) {
    case 'approve':
      return 'approved';
    case 'send_back':
      return 'sent back';
    case 'reject':
      return 'rejected';
    default:
      return null;
  }
}

/** Whether a record is a person's decision at `gate`. */
function isHumanDecision(record: GateRecord, gate: string): boolean {
  return (
    record.source === 'human' &&
    record.gate === gate &&
    outcomeWord(record.outcome) !== null
  );
}

/**
 * The last decision a person recorded at `gate` (records are oldest first). By default only one that settled the gate
 * (approved or rejected): a send-back is a round, not the end. `settledOnly: false` takes any decision, which is what
 * "{actor} already sent this back" needs.
 */
export function decidedRecord(
  records: readonly GateRecord[],
  gate: string,
  options: { readonly settledOnly?: boolean } = {}
): GateRecord | null {
  const settledOnly = options.settledOnly ?? true;
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record === undefined || !isHumanDecision(record, gate)) continue;
    if (!settledOnly || record.outcome !== 'send_back') return record;
  }
  return null;
}

/** The last time a person sent the plan back at `gate`: the "Earlier round" panel's quote. */
export function earlierSendBack(
  records: readonly GateRecord[],
  gate: string
): GateRecord | null {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (
      record !== undefined &&
      isHumanDecision(record, gate) &&
      record.outcome === 'send_back'
    )
      return record;
  }
  return null;
}
