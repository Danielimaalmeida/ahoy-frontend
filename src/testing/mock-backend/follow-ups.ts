/**
 * The mock's follow-up voyages (`previewFollowUp`, `startFollowUp`, `getStoryLineage`, `raiseRevisionCeiling`), after
 * `packages/core/src/service/follow-ups.ts` of `r3da-fio-hosted-ahoy`: the root keeps the count of the revision rounds
 * for the whole lineage, a start costs one, and only one follow-up of a lineage is open at a time.
 */
import {
  FOLLOW_UP_ISSUE_TYPES,
  type FollowUpGrill,
  type FollowUpGrillRequest,
  type FollowUpImage,
  type FollowUpPreview,
  type FollowUpRoute,
  type RevisionRounds,
  type StartFollowUpRequest,
  type StoryLineage,
} from '@core/api/types';
import {
  MAX_FOLLOW_UP_IMAGES,
  MAX_FOLLOW_UP_IMAGE_BYTES,
  MAX_FOLLOW_UP_IMAGES_TOTAL_BYTES,
} from '@domain/follow-up-images';
import { sniffImageType } from '@domain/meetings';
import { isOver } from '@domain/status';
import { iso, type Cancel, type MockClock } from './clock';
import { MockProblem } from './http';
import type { Voyage } from './voyage';
import type { World } from './world';

/** The gate whose rounds a follow-up uses. */
export const FOLLOW_UP_GATE = 'delivery_accepted';

/** The repositories the mock's plans worked in when a seeded story has no plan content. */
const MOCK_REPOS: readonly string[] = ['api', 'web'];

/** The most criteria and characters a brief may have for Ahoy to suggest the fast path. */
const FAST_PATH_CRITERIA = 3;
const FAST_PATH_CHARS = 1500;

/** The most rounds one raise adds, and the most a lineage may be given. */
export const CEILING_MAX = 20;

/** The root of the lineage `voyage` belongs to. */
export function rootOf(world: World, voyage: Voyage): Voyage {
  const rootKey = voyage.story.followUp?.rootKey ?? voyage.story.key;
  return world.voyages.get(rootKey) ?? voyage;
}

/** The root first, then its follow-ups by number. */
function lineageVoyages(world: World, root: Voyage): Voyage[] {
  const followUps = [...world.voyages.values()]
    .filter((v) => v.story.followUp?.rootKey === root.story.key)
    .sort(
      (a, b) =>
        (a.story.followUp?.number ?? 0) - (b.story.followUp?.number ?? 0)
    );
  return [root, ...followUps];
}

function rounds(root: Voyage): RevisionRounds {
  return {
    used: root.revisionRounds[FOLLOW_UP_GATE] ?? 0,
    ceiling: root.revisionCeiling,
  };
}

function plannedRepos(root: Voyage): readonly string[] {
  return root.plan.repos.length > 0 ? root.plan.repos : MOCK_REPOS;
}

/** Why a follow-up cannot start from `voyage` now, or null. */
function blockedReason(world: World, voyage: Voyage): string | null {
  const { story } = voyage;
  if (story.phase !== 'done' || story.status !== 'terminal')
    return `Story ${story.key} is not done: only a done voyage can be continued`;
  const root = rootOf(world, voyage);
  const open = lineageVoyages(world, root).find(
    (v) => v !== voyage && !isOver(v.story.status) && v.story.phase !== 'done'
  );
  if (open !== undefined)
    return `Follow-up ${open.story.key} of this voyage is still open`;
  const { used, ceiling } = rounds(root);
  if (used >= ceiling)
    return `The voyage was revised ${used} time(s), at the ceiling of ${ceiling}: raise the revision ceiling first`;
  return null;
}

function nextKey(world: World, root: Voyage): string {
  const numbers = lineageVoyages(world, root).map(
    (v) => v.story.followUp?.number ?? 0
  );
  return `${root.story.key}-FU${Math.max(...numbers) + 1}`;
}

/** `previewFollowUp`: whether a follow-up can start, the rounds left and Ahoy's suggestion of a route. */
export function previewFollowUp(
  world: World,
  voyage: Voyage,
  query: Readonly<Record<string, unknown>>
): FollowUpPreview {
  const root = rootOf(world, voyage);
  const earlier = plannedRepos(root);
  const chosen =
    typeof query['repos'] === 'string' && query['repos'] !== ''
      ? query['repos'].split(',')
      : [];
  const criteria =
    typeof query['criteria'] === 'number' ? query['criteria'] : 0;
  const chars =
    typeof query['briefChars'] === 'number' ? query['briefChars'] : 0;
  const reasons: string[] = [];
  if (criteria > FAST_PATH_CRITERIA)
    reasons.push(`More than ${FAST_PATH_CRITERIA} new criteria`);
  if (chars > FAST_PATH_CHARS)
    reasons.push(`A brief of more than ${FAST_PATH_CHARS} characters`);
  if (chosen.length !== 1)
    reasons.push('The change touches more than one repository, or none yet');
  else if (!earlier.includes(chosen[0]!))
    reasons.push('The repository is not one the earlier plan worked in');
  const route: FollowUpRoute = reasons.length === 0 ? 'fast_path' : 'planning';
  const blocked = blockedReason(world, voyage);
  return {
    key: voyage.story.key,
    rootKey: root.story.key,
    nextKey: nextKey(world, root),
    canCreateInJira: true,
    issueTypes: [...FOLLOW_UP_ISSUE_TYPES],
    linkedDefects: world.voyages.has('QA-410')
      ? []
      : [
          {
            key: 'QA-410',
            summary: 'VAT number missing on the invoice export',
            issueType: 'Bug',
            status: 'Open',
            priority: 'High',
          },
        ],
    canStart: blocked === null,
    ...(blocked !== null ? { blockedReason: blocked } : {}),
    revisions: rounds(root),
    repos: earlier.map((alias) => ({
      alias,
      slug: `acme/${alias}`,
      inEarlierPlan: true,
    })),
    suggestion: { route, reasons },
  };
}

/** What `startFollowUp` makes of a request: the story to create, after the checks. */
export function followUpToStart(
  world: World,
  voyage: Voyage,
  body: StartFollowUpRequest
): {
  readonly key: string;
  readonly root: Voyage;
  readonly number: number;
  readonly source: 'jira' | 'ahoy';
} {
  const blocked = blockedReason(world, voyage);
  if (blocked !== null) {
    const { used, ceiling } = rounds(rootOf(world, voyage));
    throw new MockProblem(
      used >= ceiling && voyage.story.phase === 'done'
        ? 'revision_ceiling_reached'
        : 'invalid_state',
      blocked
    );
  }
  const root = rootOf(world, voyage);
  const number =
    Math.max(
      0,
      ...lineageVoyages(world, root).map((v) => v.story.followUp?.number ?? 0)
    ) + 1;
  const existing = 'jiraKey' in body.source;
  const creating = 'createInJira' in body.source;
  const isJira = existing || creating;
  const key = existing
    ? (body.source as { jiraKey: string }).jiraKey
    : creating
      ? createdKey(world, root)
      : nextKey(world, root);
  if (world.voyages.has(key))
    throw new MockProblem('story_exists', `Story ${key} already exists`);
  if (creating && (body.title ?? '').trim() === '')
    throw new MockProblem(
      'validation_failed',
      'An issue created in Jira needs a title',
      { errors: [{ path: '/title', message: 'is required' }] }
    );
  if (!existing && body.brief.criteria.length === 0)
    throw new MockProblem(
      'validation_failed',
      'A follow-up that is not in Jira needs at least one acceptance criterion',
      {
        errors: [
          {
            path: '/brief/criteria',
            message: 'needs at least one criterion',
          },
        ],
      }
    );
  if (body.route === 'fast_path') {
    const repos = body.repos ?? [];
    if (repos.length !== 1 || !plannedRepos(root).includes(repos[0]!))
      throw new MockProblem(
        'validation_failed',
        'The fast path takes exactly one repository the earlier plan worked in',
        {
          errors: [
            {
              path: '/repos',
              message: 'exactly one repository of the earlier plan',
            },
          ],
        }
      );
  }
  return { key, root, number, source: isJira ? 'jira' : 'ahoy' };
}

/** The key Jira would give the issue Ahoy creates: the root's project and the next free number. */
function createdKey(world: World, root: Voyage): string {
  const project = root.story.key.replace(/-.*$/, '');
  let number = 900 + world.voyages.size;
  while (world.voyages.has(`${project}-${number}`)) number += 1;
  return `${project}-${number}`;
}

/** `getStoryLineage`. */
export function lineageOf(world: World, voyage: Voyage): StoryLineage {
  const root = rootOf(world, voyage);
  return {
    rootKey: root.story.key,
    items: lineageVoyages(world, root).map((v) => ({
      key: v.story.key,
      title: v.story.title,
      phase: v.story.phase,
      status: v.story.status,
      number: v.story.followUp?.number ?? null,
      source: v.story.followUp?.source ?? null,
      route: v.story.followUp?.route ?? null,
      spentNanoAiu: v.story.spentNanoAiu,
    })),
    revisions: rounds(root),
  };
}

/** `raiseRevisionCeiling`: more rounds for the whole lineage, whichever of its voyages the command names. */
export function raiseCeiling(root: Voyage, by: number): number {
  const next = Math.min(CEILING_MAX, root.revisionCeiling + by);
  if (next === root.revisionCeiling)
    throw new MockProblem(
      'invalid_state',
      `The revision ceiling is already at the most, ${CEILING_MAX}`
    );
  root.revisionCeiling = next;
  return next;
}

interface StagedImage {
  readonly image: FollowUpImage;
  readonly bytes: Uint8Array;
  readonly storyKey: string;
  readonly actor: string;
  claimed: boolean;
}

/**
 * The screenshots staged for a follow-up's brief, as `follow_up_images` of `ahoy-hosted`: each is its uploader's, for
 * one done story, and `startFollowUp` claims it once; at most {@link MAX_FOLLOW_UP_IMAGES} wait per person and story.
 */
export class FollowUpImages {
  private readonly staged = new Map<string, StagedImage>();
  private nextId = 1;

  constructor(private readonly nowIso: () => string) {}

  /** Stages an image of `bytes` for the follow-up of `storyKey`; its format comes from its bytes. */
  add(actor: string, voyage: Voyage, bytes: Uint8Array): FollowUpImage {
    const mediaType = sniffImageType(bytes);
    if (bytes.length > MAX_FOLLOW_UP_IMAGE_BYTES)
      throw new MockProblem(
        'validation_failed',
        `The image is larger than ${MAX_FOLLOW_UP_IMAGE_BYTES} bytes`,
        { errors: [{ path: 'body', message: 'is too large' }] }
      );
    if (mediaType === null)
      throw new MockProblem(
        'validation_failed',
        'The file is not a PNG, JPEG, WebP or GIF image',
        { errors: [{ path: 'body', message: 'is not an image' }] }
      );
    if (voyage.story.phase !== 'done')
      throw new MockProblem(
        'invalid_state',
        `Story ${voyage.story.key} is not done`
      );
    const key = voyage.story.key;
    const waiting = [...this.staged.values()].filter(
      (s) => !s.claimed && s.storyKey === key && s.actor === actor
    );
    if (waiting.length >= MAX_FOLLOW_UP_IMAGES)
      throw new MockProblem(
        'invalid_state',
        `At most ${MAX_FOLLOW_UP_IMAGES} screenshots wait for a follow-up of ${key}`
      );
    const waitingBytes = waiting.reduce((sum, s) => sum + s.image.sizeBytes, 0);
    if (waitingBytes + bytes.length > MAX_FOLLOW_UP_IMAGES_TOTAL_BYTES)
      throw new MockProblem(
        'invalid_state',
        `The screenshots waiting for a follow-up of ${key} may add up to ${MAX_FOLLOW_UP_IMAGES_TOTAL_BYTES} bytes`
      );
    const id = `00000000-0000-4000-9000-${(this.nextId++).toString(16).padStart(12, '0')}`;
    const image: FollowUpImage = {
      id,
      mediaType,
      sizeBytes: bytes.length,
      createdAt: this.nowIso(),
    };
    this.staged.set(id, {
      image,
      bytes: bytes.slice(),
      storyKey: key,
      actor,
      claimed: false,
    });
    return image;
  }

  /** The bytes and format of a staged image. */
  read(id: string): {
    readonly bytes: Uint8Array;
    readonly mediaType: FollowUpImage['mediaType'];
  } {
    const staged = this.staged.get(id);
    if (staged === undefined)
      throw new MockProblem('not_found', `Image ${id} does not exist`);
    return { bytes: staged.bytes, mediaType: staged.image.mediaType };
  }

  /** Removes an image its uploader has not used. */
  remove(actor: string, id: string): void {
    const staged = this.staged.get(id);
    if (staged === undefined)
      throw new MockProblem('not_found', `Image ${id} does not exist`);
    if (staged.actor !== actor)
      throw new MockProblem('forbidden', "The image is another person's");
    if (staged.claimed)
      throw new MockProblem(
        'invalid_state',
        'The image is already part of a follow-up'
      );
    this.staged.delete(id);
  }

  /** Checks that `ids` are the actor's own, for this story and unused; then they belong to the follow-up. */
  claim(actor: string, storyKey: string, ids: readonly string[]): void {
    const refuse = (message: string): never => {
      throw new MockProblem('validation_failed', message, {
        errors: [{ path: '/imageIds', message }],
      });
    };
    if (ids.length > MAX_FOLLOW_UP_IMAGES)
      refuse(`At most ${MAX_FOLLOW_UP_IMAGES} screenshots`);
    if (new Set(ids).size !== ids.length) refuse('A screenshot is repeated');
    const found = ids.map((id) => this.staged.get(id));
    for (const staged of found)
      if (
        staged === undefined ||
        staged.actor !== actor ||
        staged.storyKey !== storyKey ||
        staged.claimed
      )
        refuse('A screenshot is not yours, not of this story, or already used');
    for (const staged of found) if (staged) staged.claimed = true;
  }
}

/** How long the simulated agent takes to ask its questions. */
export const MOCK_GRILL_MS = 1_500;

interface GrillRecord {
  grill: FollowUpGrill;
  readonly actor: string;
  discarded: boolean;
  cancel: Cancel | null;
}

/** What the simulated agent asks about a brief: two questions, the first option of each recommended. */
function simulatedQuestions(): FollowUpGrill['questions'] {
  return [
    {
      id: 'Q1',
      text: 'Which part of what was delivered does this touch?',
      options: [
        {
          label: 'The behaviour as built',
          detail: 'The follow-up changes what the story delivered.',
          recommended: true,
        },
        {
          label: 'Something it left out',
          detail: 'The follow-up adds what the story did not cover.',
          recommended: false,
        },
      ],
    },
    {
      id: 'Q2',
      text: 'Must data created before the fix be corrected?',
      options: [
        {
          label: 'No, only new data',
          detail: 'Existing data stays as it is.',
          recommended: true,
        },
        {
          label: 'Yes, correct it too',
          detail: 'A data fix is part of the follow-up.',
          recommended: false,
        },
      ],
    },
  ];
}

/** The mock's "Grill me" for a follow-up's brief, after `packages/core/src/service/follow-up-grills.ts`. */
export class FollowUpGrills {
  private readonly grills = new Map<string, GrillRecord>();
  private nextId = 1;

  constructor(private readonly clock: MockClock) {}

  /** Stops every simulated agent still asking. */
  stopAll(): void {
    for (const record of this.grills.values()) record.cancel?.();
  }

  /** Starts a grill of the actor's on a done story, discarding the one they had open. */
  request(
    actor: string,
    voyage: Voyage,
    body: FollowUpGrillRequest
  ): FollowUpGrill {
    if (voyage.story.phase !== 'done')
      throw new MockProblem(
        'invalid_state',
        `Story ${voyage.story.key} is not done`
      );
    if (body.brief.text.trim() === '')
      throw new MockProblem('validation_failed', 'The brief is empty', {
        errors: [{ path: '/brief/text', message: 'must not be empty' }],
      });
    for (const record of this.grills.values())
      if (
        record.actor === actor &&
        record.grill.storyKey === voyage.story.key &&
        !record.discarded
      )
        this.stop(record);
    const grill: FollowUpGrill = {
      id: `00000000-0000-4000-a000-${(this.nextId++).toString(16).padStart(12, '0')}`,
      storyKey: voyage.story.key,
      status: 'working',
      questions: null,
      failure: null,
      spentNanoAiu: 0,
      createdBy: actor,
      createdAt: iso(this.clock.now()),
    };
    const record: GrillRecord = {
      grill,
      actor,
      discarded: false,
      cancel: null,
    };
    record.cancel = this.clock.schedule(MOCK_GRILL_MS, () => {
      record.cancel = null;
      record.grill = {
        ...record.grill,
        status: 'ready',
        questions: simulatedQuestions(),
        spentNanoAiu: 400_000,
      };
    });
    this.grills.set(grill.id, record);
    return grill;
  }

  get(id: string): FollowUpGrill {
    return this.open(id).grill;
  }

  discard(id: string): void {
    this.stop(this.open(id));
  }

  private stop(record: GrillRecord): void {
    record.cancel?.();
    record.cancel = null;
    record.discarded = true;
  }

  private open(id: string): GrillRecord {
    const record = this.grills.get(id);
    if (record === undefined || record.discarded)
      throw new MockProblem('not_found', `Grill ${id} does not exist`);
    return record;
  }
}
