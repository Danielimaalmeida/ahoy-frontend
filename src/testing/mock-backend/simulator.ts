/**
 * The mock's reconciler: what happens to a story after a person acts, on the mock's clock. A `ready` story gets a run
 * (or, at a human gate, `awaiting_decision`); a run is dispatched, logs `run.progress` batches (steps, then one `spend`),
 * and finishes; its gate judges it and the story moves on per the phase table:
 *
 * intake → planning (first run asks questions: `awaiting_input`; the next writes a plan revision) → plan_review
 * (`awaiting_decision`) → implementation → pr_review (one run per reviewer lens) → delivery_gate (`awaiting_decision`) →
 * done. Event types and payloads follow `apps/reconciler/src/reconciler.ts` of `ahoy-hosted`.
 */
import type { ModelSlot, Run } from "@core/api/types";
import type { Cancel } from "./clock";
import { iso } from "./clock";
import {
  implementationPlan,
  implementationReport,
  jiraSnapshot,
  planContent,
  planningQuestions,
  progressSteps,
  type ProgressStep,
} from "./content";
import { sha256Hex } from "./sha256";
import { artifactFile, PHASE_TABLE, PLAN_FILE, resolveSlot, SYSTEM_ACTOR, type Voyage, type Writable } from "./voyage";
import type { World } from "./world";

/** How long each simulated step takes, in milliseconds. */
export interface SimulationTiming {
  /** From `ready` to the reconciler's next step (a run queued, or a human gate opened). */
  readonly stepMs: number;
  /** From queued to dispatched. */
  readonly dispatchMs: number;
  /** Between two `run.progress` batches. */
  readonly tickMs: number;
  /** From a stop to the run's cancellation. */
  readonly cancelMs: number;
}

/** Timings that feel live in the browser. */
export const LIVE_TIMING: SimulationTiming = { stepMs: 1_500, dispatchMs: 1_000, tickMs: 2_000, cancelMs: 800 };

/** The most a single run may spend, before the story's own cap. */
export const RUN_CAP_NANO_AIU = 8_000_000_000;

/** What a run of each phase spends, in nano-AIU, and how many batches it logs. */
const RUN_SHAPE: Readonly<Record<string, { readonly cost: number; readonly ticks: number }>> = {
  intake: { cost: 400_000_000, ticks: 2 },
  planning: { cost: 1_800_000_000, ticks: 4 },
  implementation: { cost: 4_200_000_000, ticks: 4 },
  pr_review: { cost: 900_000_000, ticks: 2 },
};

/** Steps per `run.progress` batch. */
const STEPS_PER_TICK = 2;

/** The progress of an active run. */
export interface RunProgress {
  line: number;
  steps: number;
  omitted: number;
  events: number;
  ticks: number;
  readonly totalTicks: number;
  readonly cost: number;
  /** Where in the phase's step list the next step comes from. */
  next: number;
}

/** The slot whose model a run of `phase` uses; `pr_review` runs the design lens first, then the defect lens. */
function slotOf(phase: string, reviewsDone: number): ModelSlot {
  if (phase === "pr_review") return reviewsDone === 0 ? "review-design" : "review-defect";
  if (phase === "intake" || phase === "planning" || phase === "implementation") return phase;
  return "implementation";
}

/** A run id in the real API's form: `<key>-<phase>-<attempt>-<4 hex>` (deterministic here). */
export function runIdFor(key: string, phase: string, attempt: number): string {
  const suffix = sha256Hex(`${key}/${phase}/${attempt}`).slice(0, 4);
  return `${key.toLowerCase()}-${phase}-${String(attempt).padStart(3, "0")}-${suffix}`;
}

/** Drives every voyage of a world on its clock. */
export class Simulator {
  private readonly world: World;
  private readonly timing: SimulationTiming;
  private readonly timers = new Map<string, Set<Cancel>>();
  private readonly progress = new Map<string, RunProgress>();
  private readonly reviewsDone = new Map<string, number>();

  constructor(world: World, timing: SimulationTiming) {
    this.world = world;
    this.timing = timing;
  }

  /** Lets the reconciler look at a story soon: a `ready` story gets its next step. */
  poke(voyage: Voyage): void {
    if (voyage.story.status !== "ready") return;
    this.after(voyage, this.timing.stepMs, () => this.step(voyage));
  }

  /** Picks up a run that a seed left running, at `ticks` batches already logged. */
  resume(voyage: Voyage, run: Writable<Run>, progress: RunProgress): void {
    this.progress.set(run.id, progress);
    this.after(voyage, this.timing.tickMs, () => this.tick(voyage, run));
  }

  /** The progress kept for a run (seeds and tests read it). */
  progressOf(runId: string): RunProgress | undefined {
    return this.progress.get(runId);
  }

  /** Cancels the story's active run after a stop: its ticks end now, its `run.finished` comes a moment later. */
  cancelRun(voyage: Voyage): void {
    this.clear(voyage);
    const runId = voyage.story.currentRunId;
    const run = runId === null ? null : this.world.findRun(runId);
    if (!run) return;
    this.after(voyage, this.timing.cancelMs, () => {
      const progress = this.progress.get(run.id);
      this.progress.delete(run.id);
      const spent = progress ? Math.floor((progress.cost * progress.ticks) / progress.totalTicks) : 0;
      this.end(run, "cancelled", spent, "cancelled");
      voyage.story.currentRunId = null;
      this.world.touch(voyage);
      this.world.append(voyage, "run.finished", SYSTEM_ACTOR, {
        runId: run.id,
        status: "cancelled",
        nanoAiu: spent,
        requests: run.usage.requests,
      });
    });
  }

  /** Cancels every timer of every story (the server is closing or being reset). */
  stopAll(): void {
    for (const set of this.timers.values()) for (const cancel of set) cancel();
    this.timers.clear();
  }

  /** Cancels the pending steps of one story. */
  clear(voyage: Voyage): void {
    const set = this.timers.get(voyage.story.key);
    if (!set) return;
    for (const cancel of set) cancel();
    set.clear();
  }

  private after(voyage: Voyage, ms: number, callback: () => void): void {
    const key = voyage.story.key;
    let set = this.timers.get(key);
    if (!set) {
      set = new Set();
      this.timers.set(key, set);
    }
    const timers = set;
    const cancel = this.world.clock.schedule(ms, () => {
      timers.delete(cancel);
      callback();
    });
    timers.add(cancel);
  }

  /** The reconciler's step for a `ready` story. */
  private step(voyage: Voyage): void {
    const story = voyage.story;
    if (story.status !== "ready") return;
    const row = PHASE_TABLE[story.phase];
    if (!row || row.kind === "terminal") return;
    if (row.kind === "human") {
      story.status = "awaiting_decision";
      this.world.touch(voyage);
      this.world.append(voyage, "story.awaiting_decision", SYSTEM_ACTOR, { phase: story.phase, gate: row.gate });
      return;
    }
    const remaining = story.budgetNanoAiu - story.spentNanoAiu;
    if (remaining <= 0) {
      this.halt(voyage, "budget_exhausted", null, `The story has spent its cap of ${story.budgetNanoAiu} nano-AIU`);
      return;
    }
    this.queue(voyage, Math.min(RUN_CAP_NANO_AIU, remaining));
  }

  private queue(voyage: Voyage, budget: number): void {
    const story = voyage.story;
    const phase = story.phase;
    const attempt = (voyage.attempts[phase] ?? 0) + 1;
    voyage.attempts[phase] = attempt;
    const slot = slotOf(phase, this.reviewsDone.get(story.key) ?? 0);
    const plan = resolveSlot(slot, voyage.chosen[slot]);
    const now = this.world.nowIso();
    const run: Writable<Run> = {
      id: runIdFor(story.key, phase, attempt),
      storyKey: story.key,
      phase,
      agent: PHASE_TABLE[phase]?.agent ?? "agent",
      model: plan.model,
      reasoningEffort: plan.reasoningEffort,
      status: "queued",
      runtime: "fake",
      controlSha: story.controlSha,
      budgetNanoAiu: budget,
      usage: { requests: 0, nanoAiu: 0, inputTokens: 0, outputTokens: 0 },
      replayOf: null,
      exitReason: null,
      gate: null,
      startedBy: story.owner,
      createdAt: now,
      startedAt: null,
      endedAt: null,
    };
    this.world.addRun(voyage, run);
    story.status = "running";
    story.currentRunId = run.id;
    this.world.touch(voyage);
    this.world.append(voyage, "run.queued", SYSTEM_ACTOR, {
      runId: run.id,
      phase,
      agent: run.agent,
      model: run.model,
      reasoningEffort: run.reasoningEffort,
      modelSource: plan.modelSource,
      effortSource: plan.effortSource,
      budgetNanoAiu: budget,
      runtime: run.runtime,
      attempt,
    });
    const shape = RUN_SHAPE[phase] ?? { cost: 500_000_000, ticks: 2 };
    this.progress.set(run.id, {
      line: 1,
      steps: 0,
      omitted: 0,
      events: 0,
      ticks: 0,
      totalTicks: shape.ticks,
      cost: shape.cost,
      next: 0,
    });
    this.after(voyage, this.timing.dispatchMs, () => {
      run.status = "running";
      run.startedAt = this.world.nowIso();
      this.world.append(voyage, "run.dispatched", SYSTEM_ACTOR, { runId: run.id, runtime: run.runtime });
      this.after(voyage, this.timing.tickMs, () => this.tick(voyage, run));
    });
  }

  /** One poll of the run's log: a batch of steps, then a `spend`; the last batch ends the run. */
  private tick(voyage: Voyage, run: Writable<Run>): void {
    const progress = this.progress.get(run.id);
    if (!progress || run.status !== "running") return;
    const steps = progressSteps(run.phase, run.storyKey);
    for (let i = 0; i < STEPS_PER_TICK && progress.next < steps.length; i++) {
      const step = steps[progress.next++];
      if (step) this.writeStep(voyage, run, progress, step);
    }
    progress.ticks += 1;
    const spent = Math.floor((progress.cost * progress.ticks) / progress.totalTicks);
    run.usage = { ...run.usage, requests: progress.ticks * 3, nanoAiu: Math.min(spent, run.budgetNanoAiu) };
    progress.events += 1;
    this.world.append(voyage, "run.progress", SYSTEM_ACTOR, {
      runId: run.id,
      kind: "spend",
      line: progress.line,
      offset: progress.line * 240,
      nanoAiu: run.usage.nanoAiu,
      requests: run.usage.requests,
      steps: progress.steps,
      omitted: progress.omitted,
      skipped: 0,
      events: progress.events,
    });
    if (progress.ticks >= progress.totalTicks) this.finish(voyage, run, progress);
    else this.after(voyage, this.timing.tickMs, () => this.tick(voyage, run));
  }

  private writeStep(voyage: Voyage, run: Writable<Run>, progress: RunProgress, step: ProgressStep): void {
    progress.line += 1;
    progress.steps += 1;
    progress.events += 1;
    const base = { runId: run.id, line: progress.line, at: this.world.nowIso() };
    const payload =
      step.kind === "tool"
        ? { ...base, kind: "tool", tool: step.tool, ...(step.summary !== undefined ? { summary: step.summary } : {}) }
        : { ...base, kind: "message", text: step.text };
    this.world.append(voyage, "run.progress", SYSTEM_ACTOR, payload);
  }

  private finish(voyage: Voyage, run: Writable<Run>, progress: RunProgress): void {
    this.progress.delete(run.id);
    const story = voyage.story;
    const over = progress.cost > run.budgetNanoAiu;
    const charged = over ? run.budgetNanoAiu : progress.cost;
    const status = over ? "budget_exceeded" : this.successStatus(voyage, run);
    this.end(run, status, charged, over ? "budget_exceeded" : status === "awaiting_input" ? "asked_questions" : "ok");
    story.spentNanoAiu += charged;
    story.currentRunId = null;
    this.world.append(voyage, "run.finished", SYSTEM_ACTOR, {
      runId: run.id,
      status,
      nanoAiu: charged,
      requests: run.usage.requests,
    });
    if (over) {
      this.halt(voyage, "budget_exhausted", run.id, `Run ${run.id} reached its cap of ${run.budgetNanoAiu} nano-AIU`);
      return;
    }
    switch (run.phase) {
      case "intake":
        this.judge(voyage, run, "pass", "Jira snapshot is complete.");
        this.writeFiles(voyage, run, [
          artifactFile("jira-snapshot.md", jiraSnapshot(story.key, story.title ?? story.key), run.id),
        ]);
        this.moveTo(voyage, "planning");
        return;
      case "planning":
        this.finishPlanning(voyage, run);
        return;
      case "implementation":
        this.judge(voyage, run, "pass", "Every work package has an open pull request with green checks.");
        this.writeFiles(voyage, run, [
          artifactFile("implementation-report.md", implementationReport(story.key), run.id),
        ]);
        this.reviewsDone.set(story.key, 0);
        this.moveTo(voyage, "pr_review");
        return;
      case "pr_review": {
        const done = (this.reviewsDone.get(story.key) ?? 0) + 1;
        this.reviewsDone.set(story.key, done);
        if (done < 2) {
          story.status = "ready";
          this.world.touch(voyage);
          this.poke(voyage);
          return;
        }
        this.reviewsDone.delete(story.key);
        this.judge(voyage, run, "pass", "Both Lookouts approve; no blocking findings.");
        this.moveTo(voyage, "delivery_gate");
        return;
      }
      default:
        story.status = "ready";
        this.world.touch(voyage);
    }
  }

  private successStatus(voyage: Voyage, run: Writable<Run>): "succeeded" | "awaiting_input" {
    return run.phase === "planning" && !voyage.asked ? "awaiting_input" : "succeeded";
  }

  private finishPlanning(voyage: Voyage, run: Writable<Run>): void {
    const story = voyage.story;
    for (const q of voyage.questions) if (q.answer !== null) q.consumed = true;
    if (run.status === "awaiting_input") {
      voyage.asked = true;
      const ids = planningQuestions(story.title ?? story.key).map((q) => {
        const id = `Q${voyage.questions.length + 1}`;
        voyage.questions.push({
          id,
          round: 1,
          runId: run.id,
          text: q.text,
          recommendation: q.recommendation,
          answer: null,
          answeredBy: null,
          answeredAt: null,
          consumed: false,
        });
        return id;
      });
      this.judge(voyage, run, "branch", `${ids.length} questions need a human (${ids.join(", ")}).`);
      story.status = "awaiting_input";
      this.world.touch(voyage);
      for (const id of ids)
        this.world.append(voyage, "question.asked", SYSTEM_ACTOR, { questionId: id, runId: run.id });
      this.world.append(voyage, "story.awaiting_input", SYSTEM_ACTOR, { questions: ids });
      return;
    }
    const round = (voyage.revisionRounds["plan_accepted"] ?? 0) + 1;
    voyage.plan = planContent(story.key);
    const text = implementationPlan(story.key, story.title ?? story.key, round, voyage.revisionReason);
    voyage.revisionReason = null;
    this.judge(voyage, run, "pass", `Plan revision ${round} passes all checks.`);
    this.writeFiles(voyage, run, [artifactFile(PLAN_FILE, text, run.id)]);
    this.moveTo(voyage, "plan_review");
  }

  /** Records the verdict of the phase's gate on the run. */
  private judge(voyage: Voyage, run: Writable<Run>, result: "pass" | "branch" | "fail", message: string): void {
    const gate = PHASE_TABLE[run.phase]?.gate ?? run.phase;
    const code = result === "pass" ? 0 : result === "branch" ? 2 : 1;
    run.gate = { gate, code, result, message };
    this.world.addGateRecord(voyage, {
      source: "gate",
      gate,
      phase: run.phase,
      outcome: result,
      message,
      actor: SYSTEM_ACTOR,
      runId: run.id,
      createdAt: this.world.nowIso(),
    });
    this.world.append(voyage, "gate.evaluated", SYSTEM_ACTOR, { runId: run.id, gate, code, result, message });
  }

  private writeFiles(voyage: Voyage, run: Writable<Run>, files: Parameters<Voyage["addRevision"]>[0]): void {
    const revision = voyage.addRevision(files, this.world.clock.now());
    this.world.append(voyage, "artifacts.updated", SYSTEM_ACTOR, { revision, runId: run.id });
  }

  private moveTo(voyage: Voyage, phase: string): void {
    const from = voyage.story.phase;
    voyage.story.phase = phase;
    voyage.story.status = PHASE_TABLE[phase]?.kind === "terminal" ? "terminal" : "ready";
    this.world.touch(voyage);
    this.world.append(voyage, "story.phase_changed", SYSTEM_ACTOR, { from, to: phase });
    this.poke(voyage);
  }

  private end(run: Writable<Run>, status: Run["status"], nanoAiu: number, exitReason: string): void {
    run.status = status;
    run.endedAt = iso(this.world.clock.now());
    run.exitReason = exitReason;
    const requests = Math.max(run.usage.requests, 1);
    run.usage = { requests, nanoAiu, inputTokens: requests * 15_000, outputTokens: requests * 900 };
  }

  /** Halts the story for `reason`. */
  private halt(voyage: Voyage, reason: string, runId: string | null, detail: string): void {
    voyage.story.status = "halted";
    voyage.story.haltReason = reason;
    this.world.touch(voyage);
    this.world.append(voyage, "story.halted", SYSTEM_ACTOR, { reason, ...(runId ? { runId } : {}), detail });
  }
}
