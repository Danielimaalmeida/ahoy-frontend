/**
 * What the mock keeps per story (a voyage), and how it renders it in the contract's shapes. The rules follow `ahoy-hosted`
 * at the commit `openapi/ahoy-v1.yaml` was vendored from (`packages/core/src/service/commands.ts`,
 * `domain/story-state.ts`, `domain/models.ts`): versions, human gates, revision rounds, the model plan.
 */
import type {
  AhoyEvent,
  Artifact,
  GateRecord,
  ModelChoice,
  ModelPlan,
  ModelSlot,
  Question,
  ReasoningEffort,
  Run,
  SlotModel,
  Story,
} from '@core/api/types';
import { iso } from './clock';
import { sha256Hex, utf8Length } from './sha256';

/** A writable copy of a contract type. */
export type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** The control-repo commit stories are pinned to unless `controlRef` says otherwise. */
export const DEFAULT_CONTROL_SHA = 'a41f9c2bc3feeb1b5eebeaeddd73a3d21b767302';

/** The file the planner writes. */
export const PLAN_FILE = 'implementation-plan.md';

/** The system actor of the reconciler; the UI shows it as "Ahoy". */
export const SYSTEM_ACTOR = 'ahoy-reconciler';

/** The most revisions one human gate allows when the state sets none (`DEFAULT_REVISION_CEILING`). */
export const REVISION_CEILING = 4;

/** One row of the pinned `phases.tsv` (control sha ddfb28e6), as far as the mock simulates it. */
export interface PhaseRow {
  readonly kind: 'auto' | 'human' | 'terminal';
  /** Who runs the phase: the agent of its runs. */
  readonly agent: string | null;
  /** The automated gate that judges its runs, or the human gate key. */
  readonly gate: string | null;
  readonly onPass: string | null;
  /** The phase that produced what a human gate judges (where `send_back` goes). */
  readonly producer?: string;
}

/** The phase table the mock follows (`packages/core/src/testing/support.ts` of `ahoy-hosted`). */
export const PHASE_TABLE: Readonly<Record<string, PhaseRow>> = {
  intake: {
    kind: 'auto',
    agent: 'navigator',
    gate: 'intake',
    onPass: 'planning',
  },
  planning: {
    kind: 'auto',
    agent: 'cartographer',
    gate: 'plan',
    onPass: 'plan_review',
  },
  plan_review: {
    kind: 'human',
    agent: null,
    gate: 'plan_accepted',
    onPass: 'implementation',
    producer: 'planning',
  },
  implementation: {
    kind: 'auto',
    agent: 'implementer',
    gate: 'child_ready',
    onPass: 'pr_review',
  },
  pr_review: {
    kind: 'auto',
    agent: 'lookout',
    gate: 'review',
    onPass: 'delivery_gate',
  },
  delivery_gate: {
    kind: 'human',
    agent: null,
    gate: 'delivery_accepted',
    onPass: 'done',
    producer: 'implementation',
  },
  done: { kind: 'terminal', agent: null, gate: null, onPass: null },
  blocked: { kind: 'terminal', agent: null, gate: null, onPass: null },
};

/** The phase of each model slot. */
export const SLOT_PHASE: Readonly<
  Record<ModelSlot, { readonly phase: string }>
> = {
  intake: { phase: 'intake' },
  planning: { phase: 'planning' },
  implementation: { phase: 'implementation' },
  review: { phase: 'pr_review' },
};

/** The slots in the order `getStoryModels` lists them. */
export const SLOTS: readonly ModelSlot[] = [
  'intake',
  'planning',
  'implementation',
  'review',
];

/** What a slot runs on when nobody chose: the server's phase configuration, else the pinned phase table. */
interface SlotDefault {
  readonly model: string;
  readonly modelSource: 'configuration' | 'phase_table';
  readonly effort: ReasoningEffort | null;
  readonly effortSource: 'configuration' | 'phase_table' | 'model_default';
}

/** The mock's defaults per slot (fictional model ids, as in the wireframes). */
export const SLOT_DEFAULTS: Readonly<Record<ModelSlot, SlotDefault>> = {
  intake: {
    model: 'claude-haiku-4.5',
    modelSource: 'configuration',
    effort: null,
    effortSource: 'model_default',
  },
  planning: {
    model: 'claude-sonnet-5',
    modelSource: 'configuration',
    effort: 'high',
    effortSource: 'configuration',
  },
  implementation: {
    model: 'gpt-5.6-terra',
    modelSource: 'phase_table',
    effort: 'medium',
    effortSource: 'phase_table',
  },
  review: {
    model: 'gpt-5.6-terra',
    modelSource: 'configuration',
    effort: 'high',
    effortSource: 'configuration',
  },
};

/** The model and effort a slot's next run gets, and where each comes from. A choice applies as a pair. */
export function resolveSlot(
  slot: ModelSlot,
  chosen: ModelChoice | undefined
): SlotModel {
  const fallback = SLOT_DEFAULTS[slot];
  const { phase } = SLOT_PHASE[slot];
  const model = chosen?.model ?? fallback.model;
  const modelSource =
    chosen?.model !== undefined ? 'story' : fallback.modelSource;
  let reasoningEffort: ReasoningEffort | null;
  let effortSource: SlotModel['effortSource'];
  if (chosen?.reasoningEffort !== undefined) {
    reasoningEffort = chosen.reasoningEffort;
    effortSource = 'story';
  } else if (chosen?.model !== undefined) {
    // An effort configured for another model is not carried onto the model a person chose.
    reasoningEffort = null;
    effortSource = 'model_default';
  } else {
    reasoningEffort = fallback.effort;
    effortSource = fallback.effortSource;
  }
  return {
    slot,
    phase,
    chosen: chosen === undefined ? null : { ...chosen },
    model,
    reasoningEffort,
    modelSource,
    effortSource,
  };
}

/** One file of an artifact revision. */
export interface ArtifactFile {
  readonly path: string;
  readonly text: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly runId: string | null;
}

/** An artifact file with its hash and size worked out. */
export function artifactFile(
  path: string,
  text: string,
  runId: string | null
): ArtifactFile {
  const mediaType = path.endsWith('.json')
    ? 'application/json'
    : path.endsWith('.md')
      ? 'text/markdown'
      : 'text/plain';
  return {
    path,
    text,
    mediaType,
    sha256: sha256Hex(text),
    sizeBytes: utf8Length(text),
    runId,
  };
}

/** One complete artifact set. */
export interface ArtifactRevision {
  readonly number: number;
  readonly createdAt: string;
  readonly files: readonly ArtifactFile[];
}

/** A decision-log entry of the state document. */
export interface DecisionLogEntry {
  readonly timestamp: string;
  readonly actor: string;
  readonly type: string;
  readonly summary: string;
}

/** A human gate's recorded decision in the state document. */
export interface HumanGateEntry {
  readonly status: 'approved' | 'rejected';
  readonly timestamp: string;
  readonly reason?: string;
}

/** The parts of `state.json` the mock renders beyond the ones it derives. */
export interface PlanContent {
  readonly criteria: readonly Readonly<Record<string, unknown>>[];
  readonly packages: readonly Readonly<Record<string, unknown>>[];
  readonly repos: readonly string[];
}

/** Everything the mock keeps for one story. */
export class Voyage {
  story: Writable<Story>;
  readonly runs: Writable<Run>[] = [];
  readonly questions: Writable<Question>[] = [];
  readonly gates: GateRecord[] = [];
  readonly revisions: ArtifactRevision[] = [];
  chosen: Partial<Record<ModelSlot, ModelChoice>> = {};
  readonly humanGates: Record<string, HumanGateEntry> = {};
  readonly revisionRounds: Record<string, number> = {};
  readonly decisionLog: DecisionLogEntry[] = [];
  /** The reason of the last send-back, for the planner's next revision. */
  revisionReason: string | null = null;
  plan: PlanContent = { criteria: [], packages: [], repos: [] };
  /** Runs started per phase, for the run ids. */
  readonly attempts: Record<string, number> = {};
  /** Whether the planner already asked its questions (it asks once per story). */
  asked = false;
  /** Whether the story predates the relational state model (every change answers `409 legacy_story`). */
  legacy = false;

  constructor(story: Writable<Story>) {
    this.story = story;
  }

  /** The current artifact set, or null before the first. */
  get current(): ArtifactRevision | null {
    return this.revisions.at(-1) ?? null;
  }

  /** The story as the API answers it. */
  storyDto(): Story {
    return { ...this.story };
  }

  /** The runs, oldest first. */
  runDtos(): Run[] {
    return this.runs.map(runDto);
  }

  /** The current artifact set as `listArtifacts` lists it. */
  artifactDtos(): Artifact[] {
    const current = this.current;
    if (!current) return [];
    return current.files.map((file) => artifactDto(file, current));
  }

  /** One file of a revision, or null. */
  file(path: string, revision: number): ArtifactFile | null {
    return (
      this.revisions[revision - 1]?.files.find((f) => f.path === path) ?? null
    );
  }

  /** Adds a complete artifact set made of the current one with `changes` applied; returns its number. */
  addRevision(changes: readonly ArtifactFile[], at: number): number {
    const files = new Map((this.current?.files ?? []).map((f) => [f.path, f]));
    for (const change of changes) files.set(change.path, change);
    const number = this.revisions.length + 1;
    this.revisions.push({
      number,
      createdAt: iso(at),
      files: [...files.values()],
    });
    return number;
  }

  /** The model plan, at the story's version. */
  modelPlan(): ModelPlan {
    return {
      storyKey: this.story.key,
      version: this.story.version,
      slots: SLOTS.map((slot) => resolveSlot(slot, this.chosen[slot])),
    };
  }

  /** The state document, as `getStoryState` renders it from the story's tables. */
  stateDocument(): Readonly<Record<string, unknown>> {
    const key = this.story.key;
    const models: Record<string, unknown> = {};
    for (const slot of SLOTS) {
      const choice = this.chosen[slot];
      if (choice)
        models[slot] = {
          ...(choice.model !== undefined ? { model: choice.model } : {}),
          ...(choice.reasoningEffort !== undefined
            ? { effort: choice.reasoningEffort }
            : {}),
        };
    }
    return {
      story_id: key,
      phase: this.story.phase,
      ...(this.current?.files.some((f) => f.path === PLAN_FILE)
        ? { plan_path: `specs/${key}/${PLAN_FILE}` }
        : {}),
      branch_prefix: 'feature',
      human_gates: structuredClone(this.humanGates),
      revisions: { ...this.revisionRounds },
      revision_ceiling: REVISION_CEILING,
      models,
      acceptance_criteria: structuredClone(this.plan.criteria),
      work_packages: structuredClone(this.plan.packages),
      child_repos: this.plan.repos.map((repo) => ({ repo })),
      lookout_reviews: [],
      gate_results: this.gates
        .filter((g) => g.source === 'gate')
        .map((g) => ({
          gate: g.gate,
          story_id: key,
          result: g.outcome,
          message: g.message ?? '',
          timestamp: g.createdAt.replace(/\.\d{3}Z$/, 'Z'),
          recorded_by: 'gate',
        })),
      decision_log: structuredClone(this.decisionLog),
    };
  }
}

/** A run as the API answers it. */
export function runDto(run: Writable<Run>): Run {
  return {
    ...run,
    usage: { ...run.usage },
    gate: run.gate === null ? null : { ...run.gate },
  };
}

/** An artifact entry as `listArtifacts` lists it. */
export function artifactDto(
  file: ArtifactFile,
  revision: ArtifactRevision
): Artifact {
  return {
    path: file.path,
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
    mediaType: file.mediaType,
    revision: revision.number,
    runId: file.runId,
    createdAt: revision.createdAt,
  };
}

/** An event with a copy of its payload. */
export function eventDto(event: AhoyEvent): AhoyEvent {
  return { ...event, payload: structuredClone(event.payload) };
}
