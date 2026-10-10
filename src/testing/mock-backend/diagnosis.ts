/**
 * The mock's `getStoryDiagnosis`: a simulated diagnosis of a halted voyage, made from its halt reason, its last
 * `story.halted` event and its last run, as `packages/core/src/domain/diagnosis.ts` of `ahoy-hosted` does with fixed
 * rules. Fictional text; the mock reads no cluster.
 */
import type {
  AhoyEvent,
  Diagnosis,
  DiagnosisFinding,
  DiagnosisKind,
} from '@core/api/types';
import type { Voyage } from './voyage';

/** What the mock says per halt reason: the cause, the action and who takes it. */
const RULES: Readonly<
  Record<
    string,
    Pick<DiagnosisFinding, 'kind' | 'title' | 'action' | 'actor' | 'resumable'>
  >
> = {
  run_auth_failed: {
    kind: 'copilot_auth',
    title:
      "Copilot did not accept the worker's token, so the agent never started.",
    action:
      "Renew the Copilot token (COPILOT_GITHUB_TOKEN in the worker's Secret), then resume the story. Nothing was spent.",
    actor: 'operator',
    resumable: false,
  },
  gate_rejected: {
    kind: 'gate_rejected',
    title: 'The gate refused what the agent wrote.',
    action:
      "Resume the story: the agent runs again and is told why. If it repeats, the agent's instructions need to ask for what the gate checks.",
    actor: 'story_owner',
    resumable: true,
  },
  budget_exhausted: {
    kind: 'budget_exhausted',
    title: 'The voyage has spent its budget.',
    action: "Raise the story's budget, then resume it.",
    actor: 'story_owner',
    resumable: false,
  },
  run_timed_out: {
    kind: 'run_timed_out',
    title: 'The run hit its time limit.',
    action:
      "Resume the story to try again. If it times out again, raise the phase's timeoutSeconds.",
    actor: 'story_owner',
    resumable: true,
  },
  run_lost: {
    kind: 'run_lost',
    title: 'Ahoy lost track of the run and cannot tell how it ended.',
    action:
      'Resume the story: the run starts again. If it happens again, the operators should check the worker pods.',
    actor: 'story_owner',
    resumable: true,
  },
  run_result_invalid: {
    kind: 'run_lost',
    title: 'The run ended without a result Ahoy could read.',
    action:
      'Resume the story: the run starts again. If it happens again, the operators should check the worker pods.',
    actor: 'story_owner',
    resumable: true,
  },
  run_failed: {
    kind: 'agent_failed',
    title: "The agent's run failed before it finished.",
    action:
      'Resume the story to try again. If it fails the same way, report the message to the Ahoy operators.',
    actor: 'story_owner',
    resumable: true,
  },
  dispatch_failed: {
    kind: 'configuration',
    title: "Ahoy's configuration is missing something the run needs.",
    action:
      'Fix the setting the message names in the deployment, then resume the story.',
    actor: 'operator',
    resumable: false,
  },
  stopped_by_user: {
    kind: 'stopped_by_user',
    title: 'Someone stopped the story.',
    action: 'Resume it when the reason no longer holds.',
    actor: 'story_owner',
    resumable: true,
  },
  reconciler_error: {
    kind: 'reconciler_error',
    title: 'Something went wrong inside Ahoy while it moved the story on.',
    action:
      'Resume the story. If it halts the same way again, report the message to the Ahoy operators.',
    actor: 'operator',
    resumable: true,
  },
  revision_ceiling_reached: {
    kind: 'revision_ceiling',
    title: 'The plan was sent back the maximum number of times.',
    action:
      'Decide on the plan as it is, or rework the story in Jira and send it back to intake.',
    actor: 'story_owner',
    resumable: false,
  },
};

const OTHER: DiagnosisKind = 'other';

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** The diagnosis of a voyage: no findings unless it is halted; `halted` is its newest `story.halted` event, if any. */
export function diagnosisOf(
  voyage: Voyage,
  halted: AhoyEvent | undefined
): Diagnosis {
  const story = voyage.story;
  const base = {
    key: story.key,
    status: story.status,
    phase: story.phase,
    haltReason: story.haltReason,
  };
  if (story.status !== 'halted') return { ...base, findings: [] };
  const reason = story.haltReason ?? '';
  const payload = halted?.payload ?? {};
  const runId = text(payload['runId']) ?? voyage.runs.at(-1)?.id ?? null;
  const run = voyage.runs.find((r) => r.id === runId);
  const detail = text(payload['detail']);
  const log = text(payload['workerLog']);
  const evidence = [
    ...(reason === 'stopped_by_user' && detail !== null
      ? [`${halted?.actor ?? 'someone'}: ${detail}`]
      : detail !== null
        ? [detail]
        : []),
    ...(run?.exitReason ? [`run ${run.id}: ${run.exitReason}`] : []),
    ...(log === null
      ? []
      : log
          .split('\n')
          .filter(Boolean)
          .slice(-3)
          .map((l) => `worker: ${l}`)),
  ];
  const rule = RULES[reason] ?? {
    kind: OTHER,
    title: `The story halted with ${reason || 'no recorded reason'}, which no rule explains yet.`,
    action:
      "Read the evidence and the story's activity; resume it once the cause is fixed.",
    actor: 'story_owner' as const,
    resumable: false,
  };
  return {
    ...base,
    findings: [{ ...rule, evidence, runId: runId ?? null }],
  };
}
