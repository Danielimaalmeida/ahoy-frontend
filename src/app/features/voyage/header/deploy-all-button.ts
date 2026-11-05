import { Component, computed, inject } from '@angular/core';
import { BranchReleases } from '../context/branch-releases';
import { VoyageDialogs } from '../dialogs/voyage-dialogs';

/**
 * Release to TEST, in the voyage header: a pill of its own, green with a rocket and the number of repositories it
 * releases, shown while at least one repository of the voyage has an open pull request and a release workflow (Team
 * settings › Branch releases). It opens "Deploy N repositories' branches to TEST?", which queues one release per
 * repository in one click (`requestAllBranchReleases`). 0 AIU.
 */
@Component({
  selector: 'ah-deploy-all-button',
  styles: `
    .release {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: var(--control-md);
      padding: 0 6px 0 12px;
      border: 1px solid currentColor;
      border-radius: var(--radius-pill);
      background: var(--status-done-bg);
      color: var(--status-done-fg);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .release:hover:not(:disabled) {
      filter: brightness(0.96);
    }
    .release:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    .release:disabled {
      cursor: default;
      opacity: 0.6;
    }
    .release__count {
      display: inline-grid;
      place-items: center;
      min-width: 24px;
      height: 24px;
      padding: 0 6px;
      border-radius: var(--radius-pill);
      background: var(--status-done-fg);
      color: var(--status-done-bg);
      font-size: 13px;
    }
  `,
  template: `
    @if (count() > 0) {
      <button
        type="button"
        class="release"
        [disabled]="releases.pending()"
        [attr.aria-label]="label()"
        [title]="label()"
        (click)="open()"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 2c3 2 5 5.5 5 9.5V16H7v-4.5C7 7.5 9 4 12 2z" />
          <circle cx="12" cy="10" r="1.8" />
          <path d="M7 12.5l-3 3V19l3-2M17 12.5l3 3V19l-3-2" />
          <path d="M10 19c0 1.4.9 2.4 2 3 1.1-.6 2-1.6 2-3" />
        </svg>
        Release to TEST
        <span class="release__count" aria-hidden="true">{{ count() }}</span>
      </button>
    }
  `,
})
export class DeployAllButton {
  protected readonly releases = inject(BranchReleases);
  private readonly dialogs = inject(VoyageDialogs);

  /** How many repositories the click would release. */
  protected readonly count = computed(
    () => this.releases.all().releasable.length
  );
  protected readonly label = computed(() =>
    this.count() === 1
      ? 'Release to TEST: 1 repository'
      : `Release to TEST: ${this.count()} repositories`
  );

  protected open(): void {
    const all = this.releases.all();
    if (all.releasable.length === 0) return;
    this.dialogs.branchReleaseAll({
      releases: this.releases,
      releasable: all.releasable,
      withoutWorkflow: all.withoutWorkflow,
      dispatchable: this.releases.releases()?.dispatchable === true,
    });
  }
}
