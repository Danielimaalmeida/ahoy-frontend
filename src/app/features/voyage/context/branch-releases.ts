import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import type {
  BranchRelease,
  BranchReleaseBatch,
  BranchReleaseTarget,
  StoryBranchReleases,
} from '@core/api/types';
import type { CommandOutcome } from '@core/commands/command-runner';
import { latestReleaseOf } from '@domain/branch-releases';
import { VoyageContext } from './voyage-context';

/** How often a queued release is read again until the reconciler has started it, and for how many reads at most. */
export const RELEASE_FOLLOW_MS = 5_000;
export const RELEASE_FOLLOW_READS = 12;

/** A target whose repository has a release workflow. */
export type ReleasableTarget = BranchReleaseTarget & {
  readonly workflow: NonNullable<BranchReleaseTarget['workflow']>;
};

/** What "Release to TEST" would do: one release per repository with a workflow, and the repositories left out. */
export interface AllReleases {
  /** The first package of each repository with a workflow, in plan order: a repository's packages share its branch. */
  readonly releasable: readonly ReleasableTarget[];
  /** The repositories with an open pull request and no release workflow. */
  readonly withoutWorkflow: readonly BranchReleaseTarget[];
}

/** What a work package can release, and its repository's newest release. */
export interface PackageRelease {
  readonly target: BranchReleaseTarget;
  readonly latest: BranchRelease | undefined;
}

/**
 * The branch releases of the voyage on screen (`getStoryBranchReleases`, `ahoy-hosted` design §4, "Branch releases"):
 * which work packages have an open pull request whose branch their repository's workflow can deploy to TEST, and the
 * releases so far. Read when the voyage opens, when its version moves and when a `branch_release.*` event arrives (the
 * reconciler's start or refusal, or someone else's request, none of which moves the version); while a release is
 * queued, also read every few seconds for a minute, in case the event stream is down. A failed read keeps what was
 * read before. Provided by the voyage's shell, so the header's Release to TEST and the Work packages tab share one
 * read. 0 AIU.
 */
@Injectable()
export class BranchReleases {
  private readonly api = inject(ApiClient);
  private readonly context = inject(VoyageContext);

  private readonly read = signal<StoryBranchReleases | null>(null);
  /** Counts the reads, so that an answer a later read replaced is dropped. */
  private sequence = 0;
  private follow: ReturnType<typeof setTimeout> | null = null;
  /** The reads left while a release stays queued. */
  private followsLeft = 0;

  /** The id of the voyage's newest `branch_release.*` event, or null before the first. */
  private readonly lastReleaseEvent = computed(() => {
    let last: string | null = null;
    for (const event of this.context.events())
      if (event.type.startsWith('branch_release.')) last = event.id;
    return last;
  });

  /** The voyage on screen as its key, version and newest release event; equal while only other fields change. */
  private readonly target = computed(
    () => {
      const story = this.context.story();
      return story === null
        ? null
        : {
            key: story.key,
            version: story.version,
            event: this.lastReleaseEvent(),
          };
    },
    {
      equal: (a, b) =>
        a?.key === b?.key && a?.version === b?.version && a?.event === b?.event,
    }
  );

  /** What was read for the voyage on screen; null until then, or when it was read for another voyage. */
  readonly releases = computed((): StoryBranchReleases | null => {
    const read = this.read();
    return read !== null && read.key === this.context.key() ? read : null;
  });

  /** A release is being asked for: no second one can be sent meanwhile. */
  readonly pending = this.context.commands.pending;

  constructor() {
    effect(() => {
      const target = this.target();
      if (target !== null) untracked(() => void this.load(target.key));
    });
    inject(DestroyRef).onDestroy(() => this.stopFollowing());
  }

  /** What each work package can release, by its id, worked out once per read. */
  private readonly byPackage = computed(() => {
    const read = this.releases();
    const found = new Map<string, PackageRelease>();
    for (const target of read?.targets ?? [])
      found.set(target.workPackageId, {
        target,
        latest: latestReleaseOf(read?.releases ?? [], target.repo),
      });
    return found;
  });

  /** What a release of the whole voyage would queue, one per repository, and which repositories it leaves out. */
  readonly all = computed((): AllReleases => {
    const seen = new Set<string>();
    if (this.context.story()?.status === 'cancelled')
      return { releasable: [], withoutWorkflow: [] };
    const releasable: ReleasableTarget[] = [];
    const withoutWorkflow: BranchReleaseTarget[] = [];
    for (const target of this.releases()?.targets ?? []) {
      if (seen.has(target.repo)) continue;
      seen.add(target.repo);
      const workflow = target.workflow;
      if (workflow === null) withoutWorkflow.push(target);
      else releasable.push({ ...target, workflow });
    }
    return { releasable, withoutWorkflow };
  });

  /** What a work package can release, or undefined when it has no open pull request. */
  forPackage(workPackageId: string): PackageRelease | undefined {
    return this.byPackage().get(workPackageId);
  }

  /** Reads the voyage's releases again; a read that is not one of the follow's starts the follow over. */
  async load(key = this.context.key(), following = false): Promise<void> {
    if (key === null) return;
    const mine = ++this.sequence;
    const result = await this.api.getStoryBranchReleases(key);
    if (mine !== this.sequence || !result.ok) return;
    this.read.set(result.value);
    if (!following) this.followsLeft = RELEASE_FOLLOW_READS;
    this.followQueued(key);
  }

  /**
   * Asks for a release of the package's pull request branch, confirmed by the person. One command at a time with the
   * voyage's others. The releases are read again whatever the answer: a refusal may be about a release this page has
   * not read yet (one already queued).
   */
  async request(workPackageId: string): Promise<CommandOutcome<BranchRelease>> {
    const key = this.context.key();
    if (key === null) return { kind: 'skipped' };
    const outcome = await this.context.commands.run(() =>
      this.api.requestBranchRelease(key, { workPackageId, confirm: true })
    );
    if (outcome.kind !== 'skipped') await this.load(key);
    return outcome;
  }

  /**
   * Asks for a release of every repository with an open pull request and a workflow, once each, confirmed by the
   * person. The API leaves out a repository whose release is still queued and says so. The releases are read again
   * whatever the answer.
   */
  async requestAll(): Promise<CommandOutcome<BranchReleaseBatch>> {
    const key = this.context.key();
    if (key === null) return { kind: 'skipped' };
    const outcome = await this.context.commands.run(() =>
      this.api.requestAllBranchReleases(key, { confirm: true })
    );
    if (outcome.kind !== 'skipped') await this.load(key);
    return outcome;
  }

  /** Reads again after a while, as long as a release is queued, the deployment starts them and reads are left. */
  private followQueued(key: string): void {
    this.stopFollowing();
    const read = this.releases();
    const queued =
      read?.dispatchable === true &&
      read.releases.some((r) => r.status === 'queued');
    if (!queued || this.followsLeft <= 0) return;
    this.follow = setTimeout(() => {
      this.follow = null;
      this.followsLeft--;
      void this.load(key, true);
    }, RELEASE_FOLLOW_MS);
  }

  private stopFollowing(): void {
    if (this.follow !== null) clearTimeout(this.follow);
    this.follow = null;
  }
}
