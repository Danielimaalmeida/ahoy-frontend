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
  BranchReleaseTarget,
  StoryBranchReleases,
} from '@core/api/types';
import type { CommandOutcome } from '@core/commands/command-runner';
import { latestReleaseOf } from '@domain/branch-releases';
import { VoyageContext } from '../../context/voyage-context';

/** How often a queued release is read again until the reconciler has started it, and for how many reads at most. */
export const RELEASE_FOLLOW_MS = 5_000;
export const RELEASE_FOLLOW_READS = 12;

/** What a work package can release, and its repository's newest release. */
export interface PackageRelease {
  readonly target: BranchReleaseTarget;
  readonly latest: BranchRelease | undefined;
}

/**
 * The branch releases of the voyage on screen (`getStoryBranchReleases`, `ahoy-hosted` design §4, "Branch releases"):
 * which work packages have an open pull request whose branch their repository's workflow can deploy to TEST, and the
 * releases so far. Read when the voyage opens and when its version moves; after a release is asked for, read again
 * every few seconds while one is queued, until the reconciler has started it (or a minute has passed). A failed read
 * keeps what was read before. 0 AIU.
 */
@Injectable()
export class BranchReleases {
  private readonly api = inject(ApiClient);
  private readonly context = inject(VoyageContext);

  private readonly read = signal<StoryBranchReleases | null>(null);
  /** Counts the reads, so that an answer a later read replaced is dropped. */
  private sequence = 0;
  private follow: ReturnType<typeof setTimeout> | null = null;

  /** The voyage on screen as its key and version; equal while only other fields change. */
  private readonly target = computed(
    () => {
      const story = this.context.story();
      return story === null ? null : { key: story.key, version: story.version };
    },
    { equal: (a, b) => a?.key === b?.key && a?.version === b?.version }
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

  /** What a work package can release, or undefined when it has no open pull request. */
  forPackage(workPackageId: string): PackageRelease | undefined {
    const read = this.releases();
    const target = read?.targets.find((t) => t.workPackageId === workPackageId);
    if (read === null || target === undefined) return undefined;
    return { target, latest: latestReleaseOf(read.releases, target.repo) };
  }

  /** Reads the voyage's releases again. */
  async load(key = this.context.key()): Promise<void> {
    if (key === null) return;
    const mine = ++this.sequence;
    const result = await this.api.getStoryBranchReleases(key);
    if (mine !== this.sequence || !result.ok) return;
    this.read.set(result.value);
  }

  /**
   * Asks for a release of the package's pull request branch, confirmed by the person. One command at a time with the
   * voyage's others; on success the releases are read again until the reconciler has started it.
   */
  async request(workPackageId: string): Promise<CommandOutcome<BranchRelease>> {
    const key = this.context.key();
    if (key === null) return { kind: 'skipped' };
    const outcome = await this.context.commands.run(() =>
      this.api.requestBranchRelease(key, { workPackageId, confirm: true })
    );
    if (outcome.kind === 'ok') {
      await this.load(key);
      this.followQueued(key, RELEASE_FOLLOW_READS);
    }
    return outcome;
  }

  /** Reads again after a while, as long as a release is queued and the deployment starts them. */
  private followQueued(key: string, left: number): void {
    this.stopFollowing();
    const read = this.releases();
    const queued =
      read?.dispatchable === true &&
      read.releases.some((r) => r.status === 'queued');
    if (!queued || left <= 0) return;
    this.follow = setTimeout(() => {
      this.follow = null;
      void this.load(key).then(() => this.followQueued(key, left - 1));
    }, RELEASE_FOLLOW_MS);
  }

  private stopFollowing(): void {
    if (this.follow !== null) clearTimeout(this.follow);
    this.follow = null;
  }
}
