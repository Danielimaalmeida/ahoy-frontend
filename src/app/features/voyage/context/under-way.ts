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
  /** The live part after the heading: "4 m 12 s", "waiting for a worker, 38 s", "queued". */
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

/** "claude-sonnet-5 · high", or "agent's own · default". The Runs tab words it the same way. */
function modelLabel(run: Run): string {
  return `${run.model ?? "agent's own"} · ${run.reasoningEffort ?? 'default'}`;
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

  if (
    current !== undefined &&
    (current.status === 'queued' || current.status === 'running')
  ) {
    const crew = runCrew(current);
    const runLabel = `${current.id} · ${modelLabel(current)}`;
    const startup = workerStartup(current, now);
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
      step: newestStep(input.entries),
    };
  }

  const last = lastRun(runs);
  const waited = formatDuration(story.updatedAt, now);
  if (last === null)
    return {
      kind: 'between',
      heading: `Queued for ${phase}`,
      time: waited,
      detail: 'Ahoy starts the first run shortly.',
      runId: null,
      runLabel: '',
      step: null,
    };
  return {
    kind: 'between',
    heading: `Moving on in ${phase}`,
    time: story.status === 'ready' ? `queued ${waited}` : waited,
    detail: `Ahoy is starting the next run. Last run: ${last.id} · ${runCrew(last)} · ${last.status}.`,
    runId: last.id,
    runLabel: '',
    step: null,
  };
}
