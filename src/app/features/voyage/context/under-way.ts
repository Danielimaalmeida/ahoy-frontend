/**
 * What the voyage page's "Under way" strip says while a voyage is moving: who is at work and in which phase, since
 * when, the newest step and what the run has spent. Asked for by the user on 2026-11-05: people using Ahoy wanted a
 * clearer, more immediate sign on a voyage's page that it is running, on every tab, not only on Runs.
 *
 * It is shown while the story is `running` or `ready` (queued for its next run), and never while Ahoy waits for a pull
 * request's CI, which has its own banner.
 */
import type { Run, Story } from '@core/api/types';
import type { ProgressEntry } from '@core/stores/run-progress-buffer';
import { formatDuration } from '@domain/time';
import { workerStartup } from '@domain/worker-startup';
import { isRunActive, runModelLabel } from '../tabs/runs/run-rows';
import { lastRun, runById, runCrew } from './crew';

/** The newest step of a run, as the strip shows it: "10:44:21", "create", "services/admin/roles/RoleAuditWriter.ts". */
export interface UnderWayStep {
  readonly at: string;
  /** The tool's name, or "message" for agent text. */
  readonly tool: string;
  /** The tool's summary or the message's text, on one line; may be empty. */
  readonly text: string;
}

/** What the strip shows. */
export interface UnderWay {
  /** `running`: an agent is at work. `starting`: its run is queued or its worker is starting. `between`: no run is on. */
  readonly kind: 'running' | 'starting' | 'between';
  /** "Developer is at work on implementation". */
  readonly heading: string;
  /** The live part after the heading: "4 m 12 s", "waiting for a worker, 38 s"; empty when there is no time to give. */
  readonly time: string;
  /** One line under the heading; empty when the step line says it all. */
  readonly detail: string;
  /** The run the strip is about, for "Open run": the current one, else the last one; null without runs. */
  readonly runId: string | null;
  /** "r-05 · claude-sonnet-5 · high", while a run is on; empty otherwise. */
  readonly runLabel: string;
  /** The newest step, while an agent is at work and one has arrived. */
  readonly step: UnderWayStep | null;
}

/** Text on one line, at most `max` characters, with "…" when it was longer. */
function oneLine(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : flat;
}

/** The newest step among a run's progress entries, or null before the first one. */
export function newestStep(
  entries: readonly ProgressEntry[]
): UnderWayStep | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.kind !== 'step') continue;
    const { step, at } = entry;
    return step.kind === 'message'
      ? { at, tool: 'message', text: oneLine(step.text) }
      : { at, tool: step.tool, text: oneLine(step.summary ?? '') };
  }
  return null;
}

/** The inputs of {@link underWay}. */
export interface UnderWayInput {
  readonly story: Story | null;
  readonly runs: readonly Run[];
  /** Ahoy is waiting for a pull request's CI: the CI banner says so instead. */
  readonly waitingForCi: boolean;
  /** The current run's progress entries (empty before any arrive). */
  readonly entries: readonly ProgressEntry[];
  readonly now: Date;
}

/** What the strip shows, or null when the voyage is not under way. */
export function underWay(input: UnderWayInput): UnderWay | null {
  const { story, runs, now } = input;
  if (story === null || input.waitingForCi) return null;
  if (story.status !== 'running' && story.status !== 'ready') return null;
  const phase = story.phase;
  const current =
    story.status === 'running' ? runById(runs, story.currentRunId) : undefined;

  if (current !== undefined && isRunActive(current)) {
    const crew = runCrew(current);
    const runLabel = `${current.id} · ${runModelLabel(current)}`;
    const step = newestStep(input.entries);
    // Steps arriving prove the worker is up, whatever an older runtime observation said.
    const startup = step === null ? workerStartup(current, now) : null;
    if (current.status === 'queued' || startup !== null) {
      return {
        kind: 'starting',
        heading: `Starting ${crew} for ${phase}`,
        time: `waiting for a worker, ${formatDuration(current.createdAt, now)}`,
        detail:
          startup?.detail ??
          'The run is queued and starts when a worker is free.',
        runId: current.id,
        runLabel,
        step: null,
      };
    }
    return {
      kind: 'running',
      heading: `${crew} is at work on ${phase}`,
      time: formatDuration(current.startedAt ?? current.createdAt, now),
      detail: '',
      runId: current.id,
      runLabel,
      step,
    };
  }

  // Running on a run the list does not hold yet (it is still being read, or it was read before the run started).
  if (
    story.status === 'running' &&
    story.currentRunId !== null &&
    current === undefined
  )
    return {
      kind: 'running',
      heading: `At work on ${phase}`,
      time: '',
      detail: '',
      runId: story.currentRunId,
      runLabel: story.currentRunId,
      step: null,
    };

  const last = lastRun(runs);
  if (last === null)
    return {
      kind: 'between',
      heading: `Queued for ${phase}`,
      time: formatDuration(story.updatedAt, now),
      detail: 'Ahoy starts the first run on its own.',
      runId: null,
      runLabel: '',
      step: null,
    };
  // Measured from the last run's end, which later edits of the story (budget, models) do not move.
  const since = last.endedAt ?? story.updatedAt;
  return {
    kind: 'between',
    heading: `Moving on in ${phase}`,
    time: `last run ended ${formatDuration(since, now)} ago`,
    detail: `No agent is at work right now; Ahoy goes on to the next step on its own. Last run: ${last.id} · ${runCrew(last)} · ${last.status}.`,
    runId: last.id,
    runLabel: '',
    step: null,
  };
}
