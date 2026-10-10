/**
 * The eight voyages of the wireframes, as the mock starts with them (plan, lane 2D, deliverable 6). All data is fictional
 * (PROJ-123, alex@example.com). Every time is given in minutes before `seedAt`, so the history always leads up to the
 * moment the mock starts (in specs, a fixed instant). Event ids increase with time across all stories.
 *
 * | Key      | State                                                                                                  |
 * | -------- | ------------------------------------------------------------------------------------------------------ |
 * | PROJ-123 | `plan_review`, `awaiting_decision`, round 2 of 4: 2 questions answered, sent back once by jordan, plan rev. 2 |
 * | PROJ-131 | `planning`, `awaiting_input`: 1 of 3 questions answered                                                |
 * | PROJ-140 | `planning`, `running`: its run is logging `run.progress` (a gap of 38 steps, a `[REDACTED]` line)       |
 * | PROJ-118 | `implementation`, `halted` / `run_failed`, with a `workerLog`                                          |
 * | PROJ-126 | `planning`, `halted` / `stopped_by_user`                                                               |
 * | PROJ-109 | `intake`, `ready` (the simulated reconciler picks it up)                                               |
 * | PROJ-097 | `done`, `terminal`                                                                                     |
 * | PROJ-102 | `blocked`, `terminal`: rejected by jordan at the plan gate                                             |
 */
import type { GateResult, Run, RunStatus, Story } from '@core/api/types';
import { iso } from './clock';
import {
  implementationPlan,
  implementationReport,
  jiraSnapshot,
  planContent,
} from './content';
import { runIdFor, type RunProgress, type Simulator } from './simulator';
import {
  artifactFile,
  DEFAULT_CONTROL_SHA,
  PHASE_TABLE,
  PLAN_FILE,
  resolveSlot,
  SYSTEM_ACTOR,
  Voyage,
  type ArtifactFile,
  type Writable,
} from './voyage';
import type { NewEvent, World } from './world';

const AIU = 1_000_000_000;

/** The plan PROJ-123 is waiting on (revision 2), as in `src/testing/fixtures/getArtifactContent.json`. */
const PROJ_123_PLAN_2 = `# Implementation plan: PROJ-123 Show invoice due date on the billing page

## Summary

Show each invoice's due date on the billing page and in the invoice list,
in the customer's timezone, with a clear overdue state.

## Acceptance criteria

- AC1 The billing page shows the due date of each invoice.
- AC2 The invoice list has a due date column.
- AC3 Dates use the viewer's locale format; exports use ISO 8601.
- AC4 Due dates and overdue checks use the customer's timezone.
- AC5 Overdue invoices show an "Overdue" badge.

## WP1 Due date in the invoice API

- Add \`dueDate\` and \`isOverdue\` to the invoice response.
- Compute \`isOverdue\` against the customer's timezone, not the server's.

## WP2 Billing page and invoice list

- Show the due date on the billing page and as a column in the invoice list.
- An "Overdue" badge and sort order for overdue invoices.
`;

/** Revision 1 of the same plan, the one jordan sent back. */
const PROJ_123_PLAN_1 = `# Implementation plan: PROJ-123 Show invoice due date on the billing page

## Summary

Show each invoice's due date on the billing page and in the invoice list.

## Acceptance criteria

- AC1 The billing page shows the due date of each invoice.
- AC2 The invoice list has a due date column.
- AC3 Dates use the viewer's locale format; exports use ISO 8601.

## WP1 Due date in the invoice API

- Add \`dueDate\` to the invoice response.

## WP2 Billing page and invoice list

- Show the due date on the billing page and as a column in the invoice list.
`;

const PROJ_123_SOURCES_BEFORE = `# Plan sources

- Jira snapshot and answered planning questions.
`;

const PROJ_123_SOURCES_AFTER = `${PROJ_123_SOURCES_BEFORE}- Customer timezone is the source of truth for overdue checks.
- The invoice list sorts overdue invoices first.
`;

/** A finished run of a seed. */
interface PastRun {
  readonly phase: string;
  readonly attempt: number;
  readonly status: RunStatus;
  readonly from: number;
  readonly to: number;
  readonly aiu: number;
  readonly requests: number;
  readonly exitReason: string;
  readonly gate?: readonly [GateResult, string];
  readonly files?:
    readonly ArtifactFile[] | ((runId: string) => readonly ArtifactFile[]);
  /** The slot whose model it ran on, when not the phase's own. */
  readonly slot?: 'review';
}

/** Builds the seeded history: voyages first, then every event in time order. */
class SeedBuilder {
  private readonly world: World;
  private readonly anchor: number;
  private readonly pending: {
    readonly order: number;
    readonly event: NewEvent;
  }[] = [];

  constructor(world: World, anchor: number) {
    this.world = world;
    this.anchor = anchor;
  }

  /** The instant `minutes` before the anchor, as milliseconds. */
  at(minutes: number): number {
    return this.anchor - Math.round(minutes * 60_000);
  }

  /** The instant `minutes` before the anchor, as the API writes it. */
  iso(minutes: number): string {
    return iso(this.at(minutes));
  }

  /** A new voyage, started `minutes` ago at intake. */
  voyage(
    fields: Pick<Story, 'key' | 'title' | 'owner' | 'budgetNanoAiu'>,
    minutes: number
  ): Voyage {
    const voyage = new Voyage({
      key: fields.key,
      title: fields.title,
      owner: fields.owner,
      phase: 'intake',
      status: 'ready',
      haltReason: null,
      budgetNanoAiu: fields.budgetNanoAiu,
      spentNanoAiu: 0,
      controlSha: DEFAULT_CONTROL_SHA,
      currentRunId: null,
      version: 1,
      createdAt: this.iso(minutes),
      updatedAt: this.iso(minutes),
    });
    this.world.voyages.set(voyage.story.key, voyage);
    this.event(voyage, 'story.started', voyage.story.owner, minutes, {
      phase: 'intake',
      controlSha: voyage.story.controlSha,
      budgetNanoAiu: voyage.story.budgetNanoAiu,
    });
    return voyage;
  }

  /** An event of `voyage`, `minutes` ago. */
  event(
    voyage: Voyage,
    type: string,
    actor: string,
    minutes: number,
    payload: Readonly<Record<string, unknown>>
  ): void {
    this.pending.push({
      order: this.pending.length,
      event: {
        storyKey: voyage.story.key,
        type,
        actor,
        payload,
        createdAt: this.iso(minutes),
      },
    });
  }

  /** A run that ended, with its events, its gate verdict and the files it wrote. */
  run(voyage: Voyage, spec: PastRun): Writable<Run> {
    const story = voyage.story;
    const id = runIdFor(story.key, spec.phase, spec.attempt);
    voyage.attempts[spec.phase] = Math.max(
      voyage.attempts[spec.phase] ?? 0,
      spec.attempt
    );
    const slot =
      spec.slot ?? (spec.phase as 'intake' | 'planning' | 'implementation');
    const plan = resolveSlot(slot, voyage.chosen[slot]);
    const nanoAiu = Math.round(spec.aiu * AIU);
    const gateName = PHASE_TABLE[spec.phase]?.gate ?? spec.phase;
    const verdict = spec.gate;
    const run: Writable<Run> = {
      id,
      storyKey: story.key,
      phase: spec.phase,
      agent: PHASE_TABLE[spec.phase]?.agent ?? 'agent',
      model: plan.model,
      reasoningEffort: plan.reasoningEffort,
      status: spec.status,
      runtime: 'fake',
      controlSha: story.controlSha,
      budgetNanoAiu: 8 * AIU,
      usage: {
        requests: spec.requests,
        nanoAiu,
        inputTokens: spec.requests * 18_000,
        outputTokens: spec.requests * 950,
      },
      replayOf: null,
      exitReason: spec.exitReason,
      gate:
        verdict === undefined
          ? null
          : {
              gate: gateName,
              code: verdict[0] === 'pass' ? 0 : verdict[0] === 'branch' ? 2 : 1,
              result: verdict[0],
              message: verdict[1],
            },
      startedBy: story.owner,
      createdAt: this.iso(spec.from + 0.5),
      startedAt: this.iso(spec.from),
      endedAt: this.iso(spec.to),
    };
    this.world.addRun(voyage, run);
    story.spentNanoAiu += nanoAiu;
    this.event(voyage, 'run.queued', SYSTEM_ACTOR, spec.from + 0.5, {
      runId: id,
      phase: spec.phase,
      agent: run.agent,
      model: run.model,
      reasoningEffort: run.reasoningEffort,
      modelSource: plan.modelSource,
      effortSource: plan.effortSource,
      budgetNanoAiu: run.budgetNanoAiu,
      runtime: run.runtime,
      attempt: spec.attempt,
    });
    this.event(voyage, 'run.dispatched', SYSTEM_ACTOR, spec.from, {
      runId: id,
      runtime: run.runtime,
    });
    this.event(voyage, 'run.progress', SYSTEM_ACTOR, spec.from - 1, {
      runId: id,
      kind: 'message',
      line: 2,
      at: this.iso(spec.from - 1),
      text: 'Reading what the phase needs.',
    });
    this.event(voyage, 'run.progress', SYSTEM_ACTOR, spec.to, {
      runId: id,
      kind: 'spend',
      line: 2,
      offset: 480,
      nanoAiu,
      requests: spec.requests,
      steps: 1,
      omitted: 0,
      skipped: 0,
      events: 2,
    });
    this.event(voyage, 'run.finished', SYSTEM_ACTOR, spec.to, {
      runId: id,
      status: spec.status,
      nanoAiu,
      requests: spec.requests,
    });
    if (verdict !== undefined && run.gate !== null) {
      this.world.addGateRecord(voyage, {
        source: 'gate',
        gate: gateName,
        phase: spec.phase,
        outcome: verdict[0],
        message: verdict[1],
        actor: SYSTEM_ACTOR,
        runId: id,
        createdAt: this.iso(spec.to),
      });
      this.event(voyage, 'gate.evaluated', SYSTEM_ACTOR, spec.to, {
        runId: id,
        ...run.gate,
      });
    }
    const files =
      typeof spec.files === 'function' ? spec.files(id) : spec.files;
    if (files !== undefined && files.length > 0) {
      const revision = voyage.addRevision(files, this.at(spec.to));
      this.event(voyage, 'artifacts.updated', SYSTEM_ACTOR, spec.to, {
        revision,
        runId: id,
      });
    }
    return run;
  }

  /** A phase change. */
  phase(
    voyage: Voyage,
    to: string,
    minutes: number,
    actor = SYSTEM_ACTOR
  ): void {
    const from = voyage.story.phase;
    voyage.story.phase = to;
    this.event(voyage, 'story.phase_changed', actor, minutes, { from, to });
  }

  /** Questions the planner asked with `runId`, and `story.awaiting_input`. */
  ask(
    voyage: Voyage,
    runId: string,
    minutes: number,
    questions: readonly {
      readonly text: string;
      readonly recommendation: string | null;
    }[]
  ): void {
    voyage.asked = true;
    const ids: string[] = [];
    for (const q of questions) {
      const id = `Q${voyage.questions.length + 1}`;
      ids.push(id);
      voyage.questions.push({
        id,
        round: 1,
        runId,
        text: q.text,
        recommendation: q.recommendation,
        answer: null,
        answeredBy: null,
        answeredAt: null,
        consumed: false,
      });
      this.event(voyage, 'question.asked', SYSTEM_ACTOR, minutes, {
        questionId: id,
        runId,
      });
    }
    this.event(voyage, 'story.awaiting_input', SYSTEM_ACTOR, minutes, {
      questions: ids,
    });
  }

  /** A person's answer. */
  answer(
    voyage: Voyage,
    id: string,
    actor: string,
    minutes: number,
    text: string
  ): void {
    const question = voyage.questions.find((q) => q.id === id);
    if (!question) throw new Error(`seed: ${voyage.story.key} has no ${id}`);
    question.answer = text;
    question.answeredBy = actor;
    question.answeredAt = this.iso(minutes);
    const pending = voyage.questions.filter((q) => q.answer === null).length;
    this.event(voyage, 'question.answered', actor, minutes, {
      questionId: id,
      pending,
    });
  }

  /** A person's decision at a human gate. */
  decide(
    voyage: Voyage,
    gate: string,
    decision: 'approve' | 'send_back' | 'reject',
    actor: string,
    minutes: number,
    reason: string | null,
    to: string
  ): void {
    const round = (voyage.revisionRounds[gate] ?? 0) + 1;
    const stamp = this.iso(minutes).replace(/\.\d{3}Z$/, 'Z');
    if (decision === 'send_back') {
      voyage.revisionRounds[gate] = round;
      voyage.decisionLog.push({
        timestamp: stamp,
        actor,
        type: 'revision',
        summary: `${gate} sent back to ${to} for revision, round ${round} by ${actor}: ${reason ?? ''}`,
      });
    } else {
      const approve = decision === 'approve';
      voyage.humanGates[gate] = {
        status: approve ? 'approved' : 'rejected',
        timestamp: stamp,
        ...(reason !== null ? { reason } : {}),
      };
      voyage.decisionLog.push({
        timestamp: stamp,
        actor,
        type: approve ? 'human_approval' : 'human_rejection',
        summary: `${gate} ${approve ? 'approved' : 'rejected'} at phase ${voyage.story.phase} by ${actor}${reason !== null ? `: ${reason}` : ''}`,
      });
    }
    const record = this.world.addGateRecord(voyage, {
      source: 'human',
      gate,
      phase: voyage.story.phase,
      outcome: decision,
      message: reason,
      actor,
      runId: null,
      createdAt: this.iso(minutes),
    });
    this.event(voyage, 'decision.recorded', actor, minutes, {
      gate,
      decision,
      round,
      recordId: record.id,
    });
    this.phase(voyage, to, minutes, actor);
  }

  /** `story.awaiting_decision` at a human gate. */
  awaitDecision(voyage: Voyage, minutes: number): void {
    const gate = PHASE_TABLE[voyage.story.phase]?.gate ?? '';
    voyage.story.status = 'awaiting_decision';
    this.event(voyage, 'story.awaiting_decision', SYSTEM_ACTOR, minutes, {
      phase: voyage.story.phase,
      gate,
    });
  }

  /** Sets the story's version and `updatedAt`. */
  settle(voyage: Voyage, version: number, minutes: number): void {
    voyage.story.version = version;
    voyage.story.updatedAt = this.iso(minutes);
  }

  /** Writes every collected event in time order (ties in the order they were collected). */
  flush(): void {
    const sorted = [...this.pending].sort(
      (a, b) =>
        a.event.createdAt.localeCompare(b.event.createdAt) || a.order - b.order
    );
    for (const { event } of sorted) this.world.record(event);
  }
}

/** Loads the eight voyages into `world` and hands the live ones to the simulator. */
export function seedVoyages(
  world: World,
  simulator: Simulator,
  seedAt: number
): void {
  const b = new SeedBuilder(world, seedAt);
  const live: (() => void)[] = [];

  // PROJ-123: plan review, round 2 of 4.
  {
    const v = b.voyage(
      {
        key: 'PROJ-123',
        title: 'Show invoice due date on the billing page',
        owner: 'alex@example.com',
        budgetNanoAiu: 30 * AIU,
      },
      1448
    );
    v.chosen.planning = { model: 'claude-sonnet-5', reasoningEffort: 'high' };
    v.chosen.review = { reasoningEffort: 'xhigh' };
    const title = v.story.title ?? '';
    b.run(v, {
      phase: 'intake',
      attempt: 1,
      status: 'succeeded',
      from: 1447,
      to: 1444,
      aiu: 2.1,
      requests: 14,
      exitReason: 'ok',
      gate: ['pass', 'Jira snapshot is complete.'],
      files: (id) => [
        artifactFile('jira-snapshot.md', jiraSnapshot('PROJ-123', title), id),
      ],
    });
    b.phase(v, 'planning', 1444);
    const asked = b.run(v, {
      phase: 'planning',
      attempt: 1,
      status: 'awaiting_input',
      from: 1443,
      to: 1419,
      aiu: 3.2,
      requests: 22,
      exitReason: 'asked_questions',
      gate: ['branch', '2 questions need a human (Q1, Q2).'],
    });
    b.ask(v, asked.id, 1419, [
      {
        text: "Should the due date use the customer's timezone or the viewer's?",
        recommendation:
          "The customer's timezone: overdue checks must agree with the invoice itself.",
      },
      {
        text: 'Should overdue invoices be sorted to the top of the invoice list?',
        recommendation: null,
      },
    ]);
    b.answer(
      v,
      'Q1',
      'alex@example.com',
      1240,
      "The customer's timezone, everywhere."
    );
    b.answer(
      v,
      'Q2',
      'alex@example.com',
      1238,
      'Yes, overdue first, then by due date.'
    );
    const questionsRevision = v.addRevision(
      [
        artifactFile(
          'questions.json',
          JSON.stringify(v.questions, null, 2),
          asked.id
        ),
      ],
      b.at(1238)
    );
    b.event(v, 'artifacts.updated', SYSTEM_ACTOR, 1238, {
      revision: questionsRevision,
    });
    v.plan = {
      criteria: ['AC1', 'AC2', 'AC3'].map((id) => ({
        id,
        repo: 'billing-web',
        verification_mode: 'test',
      })),
      packages: [
        { id: 'WP1', repo: 'billing-api', agent: 'implementer', open_pr: true },
        {
          id: 'WP2',
          repo: 'billing-web',
          agent: 'implementer',
          open_pr: true,
          depends_on: ['WP1'],
        },
      ],
      repos: ['billing-api', 'billing-web'],
    };
    b.run(v, {
      phase: 'planning',
      attempt: 2,
      status: 'succeeded',
      from: 1237,
      to: 1205,
      aiu: 3.5,
      requests: 25,
      exitReason: 'ok',
      gate: [
        'pass',
        'Plan has acceptance criteria and work packages for every repository.',
      ],
      files: (id) => [
        artifactFile(PLAN_FILE, PROJ_123_PLAN_1, id),
        artifactFile('plan-sources.md', PROJ_123_SOURCES_BEFORE, null),
        artifactFile(
          'state.json',
          JSON.stringify(
            {
              ...v.stateDocument(),
              plan_path: `specs/${v.story.key}/${PLAN_FILE}`,
            },
            null,
            2
          ),
          null
        ),
      ],
    });
    for (const q of v.questions) q.consumed = true;
    b.phase(v, 'plan_review', 1205);
    b.awaitDecision(v, 1205);
    b.decide(
      v,
      'plan_accepted',
      'send_back',
      'jordan@example.com',
      1050,
      "Due date must use the customer's timezone; add an AC for the overdue state.",
      'planning'
    );
    const sendBackRevision = v.addRevision([], b.at(1050));
    b.event(v, 'artifacts.updated', 'jordan@example.com', 1050, {
      revision: sendBackRevision,
    });
    v.plan = {
      criteria: ['AC1', 'AC2', 'AC3', 'AC4', 'AC5'].map((id) => ({
        id,
        repo: 'billing-web',
        verification_mode: 'test',
      })),
      packages: [
        { id: 'WP1', repo: 'billing-api', agent: 'implementer', open_pr: true },
        {
          id: 'WP2',
          repo: 'billing-web',
          agent: 'implementer',
          open_pr: true,
          depends_on: ['WP1'],
        },
      ],
      repos: ['billing-api', 'billing-web'],
    };
    b.run(v, {
      phase: 'planning',
      attempt: 3,
      status: 'succeeded',
      from: 60,
      to: 22,
      aiu: 3.6,
      requests: 26,
      exitReason: 'ok',
      gate: ['pass', 'Plan revision 2 passes all checks.'],
      files: (id) => [
        artifactFile(PLAN_FILE, PROJ_123_PLAN_2, id),
        artifactFile('plan-sources.md', PROJ_123_SOURCES_AFTER, id),
        artifactFile(
          'plan-round-1.md',
          PROJ_123_PLAN_1,
          runIdFor('PROJ-123', 'planning', 2)
        ),
        artifactFile(
          'state.json',
          JSON.stringify(
            { ...v.stateDocument(), phase: 'plan_review' },
            null,
            2
          ),
          id
        ),
      ],
    });
    b.phase(v, 'plan_review', 22);
    b.awaitDecision(v, 22);
    b.settle(v, 9, 22);
  }

  // PROJ-131: questions for a human, 1 of 3 answered.
  {
    const v = b.voyage(
      {
        key: 'PROJ-131',
        title: 'Let customers download receipts as PDF',
        owner: 'sam@example.com',
        budgetNanoAiu: 25 * AIU,
      },
      90
    );
    const title = v.story.title ?? '';
    b.run(v, {
      phase: 'intake',
      attempt: 1,
      status: 'succeeded',
      from: 89,
      to: 84,
      aiu: 2.9,
      requests: 15,
      exitReason: 'ok',
      gate: ['pass', 'Jira snapshot is complete.'],
      files: (id) => [
        artifactFile('jira-snapshot.md', jiraSnapshot('PROJ-131', title), id),
      ],
    });
    b.phase(v, 'planning', 84);
    const asked = b.run(v, {
      phase: 'planning',
      attempt: 1,
      status: 'awaiting_input',
      from: 83,
      to: 60,
      aiu: 3.2,
      requests: 22,
      exitReason: 'asked_questions',
      gate: ['branch', '3 questions need a human (Q1, Q2, Q3).'],
    });
    b.ask(v, asked.id, 60, [
      {
        text: "Should the PDF include the company's VAT number and address block, or only the line items and totals?",
        recommendation: null,
      },
      {
        text: 'Where should the download be offered: on the receipt page only, or also as a bulk download from the order history?',
        recommendation:
          'Receipt page only for now; bulk download needs a background job and is better as its own story.',
      },
      {
        text: 'The receipts service stores amounts in cents. Should the PDF round tax per line or on the total?',
        recommendation: 'On the total, to match the amount charged.',
      },
    ]);
    v.story.status = 'awaiting_input';
    b.answer(
      v,
      'Q1',
      'sam@example.com',
      58,
      'Include the VAT number and the full address block, same as the emailed receipt.'
    );
    b.settle(v, 4, 58);
  }

  // PROJ-140: under way, its planning run logging progress now.
  {
    const v = b.voyage(
      {
        key: 'PROJ-140',
        title: 'Add audit trail to admin role changes',
        owner: 'priya@example.com',
        budgetNanoAiu: 20 * AIU,
      },
      40
    );
    const title = v.story.title ?? '';
    b.run(v, {
      phase: 'intake',
      attempt: 1,
      status: 'succeeded',
      from: 39,
      to: 33,
      aiu: 3.2,
      requests: 16,
      exitReason: 'ok',
      gate: ['pass', 'Jira snapshot is complete.'],
      files: (id) => [
        artifactFile('jira-snapshot.md', jiraSnapshot('PROJ-140', title), id),
      ],
    });
    b.phase(v, 'planning', 33);
    v.asked = true; // this planner has no questions: its run writes the plan
    const plan = resolveSlot('planning', undefined);
    const id = runIdFor('PROJ-140', 'planning', 1);
    v.attempts['planning'] = 1;
    const run: Writable<Run> = {
      id,
      storyKey: 'PROJ-140',
      phase: 'planning',
      agent: 'cartographer',
      model: plan.model,
      reasoningEffort: plan.reasoningEffort,
      status: 'running',
      runtime: 'fake',
      controlSha: v.story.controlSha,
      budgetNanoAiu: 8 * AIU,
      usage: {
        requests: 9,
        nanoAiu: 600_000_000,
        inputTokens: 0,
        outputTokens: 0,
      },
      replayOf: null,
      exitReason: null,
      gate: null,
      startedBy: v.story.owner,
      createdAt: b.iso(32.5),
      startedAt: b.iso(32),
      endedAt: null,
    };
    world.addRun(v, run);
    b.event(v, 'run.queued', SYSTEM_ACTOR, 32.5, {
      runId: id,
      phase: 'planning',
      agent: 'cartographer',
      model: plan.model,
      reasoningEffort: plan.reasoningEffort,
      modelSource: plan.modelSource,
      effortSource: plan.effortSource,
      budgetNanoAiu: run.budgetNanoAiu,
      runtime: 'fake',
      attempt: 1,
    });
    b.event(v, 'run.dispatched', SYSTEM_ACTOR, 32, {
      runId: id,
      runtime: 'fake',
    });
    const step = (
      line: number,
      minutes: number,
      payload: Readonly<Record<string, unknown>>
    ): void =>
      b.event(v, 'run.progress', SYSTEM_ACTOR, minutes, {
        runId: id,
        line,
        at: b.iso(minutes),
        ...payload,
      });
    const spend = (
      line: number,
      minutes: number,
      nanoAiu: number,
      requests: number,
      steps: number,
      omitted: number,
      events: number
    ): void =>
      b.event(v, 'run.progress', SYSTEM_ACTOR, minutes, {
        runId: id,
        kind: 'spend',
        line,
        offset: line * 240,
        nanoAiu,
        requests,
        steps,
        omitted,
        skipped: 0,
        events,
      });
    step(2, 31, {
      kind: 'message',
      text: 'Reading the Jira snapshot and the admin roles code.',
    });
    step(3, 30.5, {
      kind: 'tool',
      tool: 'view',
      summary: 'specs/PROJ-140/jira-snapshot.md',
    });
    spend(3, 30.5, 200_000_000, 3, 2, 0, 3);
    // The worker logged 38 steps in one poll; only the last ones are written (`omitted` rises by 38).
    step(42, 12, {
      kind: 'tool',
      tool: 'bash',
      summary:
        "curl -s -H 'Authorization: Bearer [REDACTED]' localhost:8080/roles",
    });
    step(43, 11.5, {
      kind: 'message',
      text: 'The roles endpoint has no audit hook yet; the plan adds one.',
    });
    spend(43, 11.5, 600_000_000, 9, 4, 38, 6);
    v.story.status = 'running';
    v.story.currentRunId = id;
    b.settle(v, 5, 32);
    const progress: RunProgress = {
      line: 43,
      steps: 4,
      omitted: 38,
      events: 6,
      ticks: 2,
      totalTicks: 5,
      cost: 1_800_000_000,
      next: 5,
    };
    live.push(() => simulator.resume(v, run, progress));
  }

  // PROJ-118: anchored, a run failed in implementation.
  {
    const v = b.voyage(
      {
        key: 'PROJ-118',
        title: 'Retry failed webhook deliveries',
        owner: 'alex@example.com',
        budgetNanoAiu: 30 * AIU,
      },
      2900
    );
    const title = v.story.title ?? '';
    b.run(v, {
      phase: 'intake',
      attempt: 1,
      status: 'succeeded',
      from: 2899,
      to: 2895,
      aiu: 1.9,
      requests: 12,
      exitReason: 'ok',
      gate: ['pass', 'Jira snapshot is complete.'],
      files: (id) => [
        artifactFile('jira-snapshot.md', jiraSnapshot('PROJ-118', title), id),
      ],
    });
    b.phase(v, 'planning', 2895);
    v.asked = true;
    b.run(v, {
      phase: 'planning',
      attempt: 1,
      status: 'succeeded',
      from: 2894,
      to: 2860,
      aiu: 3.9,
      requests: 27,
      exitReason: 'ok',
      gate: ['pass', 'Plan revision 1 passes all checks.'],
      files: (id) => [
        artifactFile(
          PLAN_FILE,
          implementationPlan('PROJ-118', title, 1, null),
          id
        ),
      ],
    });
    v.plan = planContent('PROJ-118');
    b.phase(v, 'plan_review', 2860);
    b.awaitDecision(v, 2860);
    b.decide(
      v,
      'plan_accepted',
      'approve',
      'alex@example.com',
      2700,
      'Looks right.',
      'implementation'
    );
    const failed = b.run(v, {
      phase: 'implementation',
      attempt: 1,
      status: 'failed',
      from: 2699,
      to: 2650,
      aiu: 6.2,
      requests: 41,
      exitReason: 'worker_exit_1',
    });
    v.story.status = 'halted';
    v.story.haltReason = 'run_failed';
    b.event(v, 'story.halted', SYSTEM_ACTOR, 2650, {
      reason: 'run_failed',
      runId: failed.id,
      detail: 'The worker exited with code 1 before it wrote a result.',
      workerLog:
        '[ahoy-worker] cloning api (WP1)\n[ahoy-worker] npm test: 2 failed, 118 passed\n[ahoy-worker] token [REDACTED] refused by the registry\n[ahoy-worker] exit 1',
    });
    b.settle(v, 14, 2650);
  }

  // PROJ-126: anchored by a person during planning.
  {
    const v = b.voyage(
      {
        key: 'PROJ-126',
        title: 'Export audit log as CSV',
        owner: 'priya@example.com',
        budgetNanoAiu: 15 * AIU,
      },
      300
    );
    const title = v.story.title ?? '';
    b.run(v, {
      phase: 'intake',
      attempt: 1,
      status: 'succeeded',
      from: 299,
      to: 295,
      aiu: 1.4,
      requests: 9,
      exitReason: 'ok',
      gate: ['pass', 'Jira snapshot is complete.'],
      files: (id) => [
        artifactFile('jira-snapshot.md', jiraSnapshot('PROJ-126', title), id),
      ],
    });
    b.phase(v, 'planning', 295);
    v.asked = true;
    const cancelled = b.run(v, {
      phase: 'planning',
      attempt: 1,
      status: 'cancelled',
      from: 294,
      to: 280,
      aiu: 0.8,
      requests: 6,
      exitReason: 'cancelled',
    });
    v.story.status = 'halted';
    v.story.haltReason = 'stopped_by_user';
    b.event(v, 'story.halted', 'priya@example.com', 281, {
      reason: 'stopped_by_user',
      detail: "Waiting for the compliance team's answer on retention.",
      runId: cancelled.id,
    });
    b.settle(v, 8, 280);
  }

  // PROJ-109: queued; the reconciler takes it from here.
  {
    const v = b.voyage(
      {
        key: 'PROJ-109',
        title: 'Dark mode for the customer portal',
        owner: 'jordan@example.com',
        budgetNanoAiu: 20 * AIU,
      },
      3
    );
    live.push(() => simulator.poke(v));
  }

  // PROJ-097: docked (done).
  {
    const v = b.voyage(
      {
        key: 'PROJ-097',
        title: 'Show order status in the mobile app',
        owner: 'sam@example.com',
        budgetNanoAiu: 25 * AIU,
      },
      8700
    );
    const title = v.story.title ?? '';
    b.run(v, {
      phase: 'intake',
      attempt: 1,
      status: 'succeeded',
      from: 8699,
      to: 8695,
      aiu: 1.6,
      requests: 10,
      exitReason: 'ok',
      gate: ['pass', 'Jira snapshot is complete.'],
      files: (id) => [
        artifactFile('jira-snapshot.md', jiraSnapshot('PROJ-097', title), id),
      ],
    });
    b.phase(v, 'planning', 8695);
    v.asked = true;
    b.run(v, {
      phase: 'planning',
      attempt: 1,
      status: 'succeeded',
      from: 8694,
      to: 8660,
      aiu: 3.1,
      requests: 24,
      exitReason: 'ok',
      gate: ['pass', 'Plan revision 1 passes all checks.'],
      files: (id) => [
        artifactFile(
          PLAN_FILE,
          implementationPlan('PROJ-097', title, 1, null),
          id
        ),
      ],
    });
    v.plan = planContent('PROJ-097');
    b.phase(v, 'plan_review', 8660);
    b.awaitDecision(v, 8660);
    b.decide(
      v,
      'plan_accepted',
      'approve',
      'sam@example.com',
      8500,
      null,
      'implementation'
    );
    b.run(v, {
      phase: 'implementation',
      attempt: 1,
      status: 'succeeded',
      from: 8499,
      to: 8400,
      aiu: 7.4,
      requests: 52,
      exitReason: 'ok',
      gate: [
        'pass',
        'Every work package has an open pull request with green checks.',
      ],
      files: (id) => [
        artifactFile(
          'implementation-report.md',
          implementationReport('PROJ-097'),
          id
        ),
      ],
    });
    b.phase(v, 'pr_review', 8400);
    b.run(v, {
      phase: 'pr_review',
      attempt: 1,
      slot: 'review',
      status: 'succeeded',
      from: 8399,
      to: 8360,
      aiu: 2.5,
      requests: 18,
      exitReason: 'ok',
      gate: ['pass', 'The Lookout approves; no blocking findings.'],
    });
    b.phase(v, 'delivery_gate', 8360);
    b.awaitDecision(v, 8360);
    b.decide(
      v,
      'delivery_accepted',
      'approve',
      'sam@example.com',
      8200,
      'Shipped behind the flag.',
      'done'
    );
    v.story.status = 'terminal';
    b.event(v, 'story.terminal', SYSTEM_ACTOR, 8200, { phase: 'done' });
    b.settle(v, 21, 8200);
  }

  // PROJ-102: aground (blocked), rejected at the plan gate.
  {
    const v = b.voyage(
      {
        key: 'PROJ-102',
        title: 'Merge duplicate customer accounts',
        owner: 'alex@example.com',
        budgetNanoAiu: 20 * AIU,
      },
      5800
    );
    const title = v.story.title ?? '';
    b.run(v, {
      phase: 'intake',
      attempt: 1,
      status: 'succeeded',
      from: 5799,
      to: 5795,
      aiu: 1.8,
      requests: 11,
      exitReason: 'ok',
      gate: ['pass', 'Jira snapshot is complete.'],
      files: (id) => [
        artifactFile('jira-snapshot.md', jiraSnapshot('PROJ-102', title), id),
      ],
    });
    b.phase(v, 'planning', 5795);
    v.asked = true;
    b.run(v, {
      phase: 'planning',
      attempt: 1,
      status: 'succeeded',
      from: 5794,
      to: 5760,
      aiu: 3.4,
      requests: 25,
      exitReason: 'ok',
      gate: ['pass', 'Plan revision 1 passes all checks.'],
      files: (id) => [
        artifactFile(
          PLAN_FILE,
          implementationPlan('PROJ-102', title, 1, null),
          id
        ),
      ],
    });
    v.plan = planContent('PROJ-102');
    b.phase(v, 'plan_review', 5760);
    b.awaitDecision(v, 5760);
    b.decide(
      v,
      'plan_accepted',
      'reject',
      'jordan@example.com',
      5600,
      'Merging accounts needs a data-protection review first; this cannot ship as planned.',
      'blocked'
    );
    v.story.status = 'terminal';
    b.event(v, 'story.terminal', SYSTEM_ACTOR, 5600, { phase: 'blocked' });
    b.settle(v, 7, 5600);
  }

  b.flush();
  for (const start of live) start();
}
