import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import type { BranchRelease, BranchReleaseTarget } from '@core/api/types';
import { inputsSummary } from '@domain/branch-releases';
import { Banner } from '@ui/banner/banner';
import { DialogShell } from '@ui/dialog/dialog';
import { ToastService } from '@ui/toast/toast';
import type { BranchReleases } from '../context/branch-releases';
import { CommandState } from './dialog-support';

/** What the release dialog is opened with: the tab's releases, and the package's target with its workflow. */
export interface BranchReleaseDialogData {
  readonly releases: BranchReleases;
  readonly target: BranchReleaseTarget & {
    readonly workflow: NonNullable<BranchReleaseTarget['workflow']>;
  };
  /** Whether the deployment's reconciler starts workflows; where it does not, the release stays queued. */
  readonly dispatchable: boolean;
}

/**
 * "Deploy WP2's branch to TEST?": the repository's own workflow runs on the pull request's branch with the inputs Team
 * settings › Branch releases holds, which builds the test image and, with the ops tag on, deploys it to the shared TEST
 * environment through Argo CD. It replaces what TEST ran for that service. Spends no AIU.
 */
@Component({
  selector: 'ah-branch-release-dialog',
  imports: [Banner, DialogShell],
  styles: `
    dl {
      margin: 0;
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 16px;
    }
    dt {
      font-weight: 600;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  `,
  template: `
    <ah-dialog
      icon="anchor"
      [heading]="'Deploy ' + target.workPackageId + '’s branch to TEST?'"
      confirmLabel="Deploy to TEST"
      busyLabel="Asking for the release…"
      [busy]="busy()"
      [error]="error()"
      (confirm)="submit()"
    >
      <span ahDialogLead
        >{{ target.repo }}'s workflow builds the pull request's branch and
        deploys it to TEST, in place of what TEST runs for that service now.
        Colleagues testing there see this branch.</span
      >
      @if (!dispatchable) {
        <ah-banner
          ahDialogCost
          variant="notice"
          heading="This deployment cannot start workflows"
          announce="status"
          >The release is queued, but its reconciler reads no real GitHub, so it
          stays queued.</ah-banner
        >
      }
      <dl>
        <dt>Branch</dt>
        <dd class="ah-mono">{{ target.branch }}</dd>
        <dt>Pull request</dt>
        <dd>
          <a [href]="target.prUrl" target="_blank" rel="noopener"
            >#{{ target.prNumber }}</a
          >
        </dd>
        <dt>Workflow</dt>
        <dd class="ah-mono">{{ target.workflow.workflow }}</dd>
        <dt>Inputs</dt>
        <dd class="ah-mono">{{ inputs }}</dd>
      </dl>
    </ah-dialog>
  `,
})
export class BranchReleaseDialog {
  private readonly data = inject<BranchReleaseDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<BranchRelease>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly command = new CommandState<BranchRelease>();

  protected readonly target = this.data.target;
  protected readonly dispatchable = this.data.dispatchable;
  protected readonly inputs = inputsSummary(this.target.workflow.inputs);
  protected readonly busy = computed(() => this.data.releases.pending());
  protected readonly error = this.command.error;

  protected async submit(): Promise<void> {
    const release = this.command.settle(
      await this.data.releases.request(this.target.workPackageId)
    );
    if (release === null) return;
    this.toasts.show(
      `Release of ${release.branch} queued: the reconciler starts ${release.workflow} on GitHub.`
    );
    this.ref.close(release);
  }
}
