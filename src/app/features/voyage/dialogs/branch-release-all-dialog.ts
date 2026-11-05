import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import type { BranchReleaseBatch, BranchReleaseTarget } from '@core/api/types';
import { inputsSummary, releasesQueuedText } from '@domain/branch-releases';
import { Banner } from '@ui/banner/banner';
import { DialogShell } from '@ui/dialog/dialog';
import { ToastService } from '@ui/toast/toast';
import type {
  BranchReleases,
  ReleasableTarget,
} from '../context/branch-releases';
import { CommandState } from './dialog-support';

/** What "Deploy N repositories' branches to TEST?" is opened with: the tab's releases, what it would queue and what it leaves out. */
export interface BranchReleaseAllDialogData {
  readonly releases: BranchReleases;
  readonly releasable: readonly ReleasableTarget[];
  readonly withoutWorkflow: readonly BranchReleaseTarget[];
  /** Whether the deployment's reconciler starts workflows; where it does not, the releases stay queued. */
  readonly dispatchable: boolean;
}

/**
 * "Deploy every branch of PROJ-123 to TEST?": one click queues, for each repository with an open pull request and a
 * release workflow, that workflow on the pull request's branch with the inputs Team settings › Branch releases holds,
 * once per repository. Each replaces what TEST ran for that service. A repository without a workflow, or whose release
 * is still queued, is left out and named. Spends no AIU.
 */
@Component({
  selector: 'ah-branch-release-all-dialog',
  imports: [Banner, DialogShell],
  styles: `
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    li {
      overflow-wrap: anywhere;
    }
    .repo {
      font-weight: 600;
    }
    .left-out {
      margin: 12px 0 0;
    }
  `,
  template: `
    <ah-dialog
      icon="sail"
      [heading]="heading"
      confirmLabel="Release to TEST"
      busyLabel="Asking for the releases…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >Each repository's workflow builds its pull request's branch and deploys
        it to TEST, in place of what TEST runs for that service now. Colleagues
        testing there see these branches.</span
      >
      @if (!dispatchable) {
        <ah-banner
          ahDialogCost
          variant="notice"
          heading="This deployment cannot start workflows"
          announce="status"
          >The releases are queued, but its reconciler reads no real GitHub, so
          they stay queued.</ah-banner
        >
      }
      <ul aria-label="Releases to queue">
        @for (target of releasable; track target.repo) {
          <li>
            <span class="repo">{{ target.repo }}</span> ·
            <span class="ah-mono">{{ target.branch }}</span> ·
            <a [href]="target.prUrl" target="_blank" rel="noopener"
              >#{{ target.prNumber }}</a
            >
            <div class="ah-hint ah-mono">
              {{ target.workflow.workflow }} · {{ inputsOf(target) }}
            </div>
          </li>
        }
      </ul>
      @if (withoutWorkflow.length > 0) {
        <p class="left-out ah-hint">
          Left out, without a release workflow in Team settings › Branch
          releases: {{ leftOut }}.
        </p>
      }
    </ah-dialog>
  `,
})
export class BranchReleaseAllDialog {
  private readonly data = inject<BranchReleaseAllDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<BranchReleaseBatch>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<BranchReleaseBatch>();

  protected readonly releasable = this.data.releasable;
  protected readonly withoutWorkflow = this.data.withoutWorkflow;
  protected readonly dispatchable = this.data.dispatchable;
  protected readonly heading =
    this.releasable.length === 1
      ? 'Deploy 1 repository’s branch to TEST?'
      : `Deploy ${this.releasable.length} repositories’ branches to TEST?`;
  protected readonly leftOut = this.withoutWorkflow
    .map((t) => t.repo)
    .join(', ');
  protected readonly busy = computed(() => this.data.releases.pending());
  protected readonly error = this.command.error;

  protected inputsOf(target: ReleasableTarget): string {
    return inputsSummary(target.workflow.inputs);
  }

  protected async submit(): Promise<void> {
    const batch = this.command.settle(await this.data.releases.requestAll());
    if (batch === null) return;
    this.toasts.show(releasesQueuedText(batch));
    this.ref.close(batch);
  }
}
