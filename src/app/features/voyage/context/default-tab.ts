import { Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { StoryStatus } from '@core/api/types';
import { VoyageContext } from './voyage-context';

/** The tabs of a voyage, by their path under `/voyages/:key`. */
export const VOYAGE_TABS = [
  'plan',
  'questions',
  'runs',
  'gates',
  'artifacts',
  'log',
  'models',
] as const;

/** A tab of a voyage. */
export type VoyageTab = (typeof VOYAGE_TABS)[number];

/** The label of each tab, as the wireframes word it. */
export const VOYAGE_TAB_LABELS: Readonly<Record<VoyageTab, string>> = {
  plan: 'Plan',
  questions: 'Questions',
  runs: 'Runs',
  gates: 'Gates',
  artifacts: 'Artifacts',
  log: 'Activity',
  models: 'Models',
};

/**
 * The tab `/voyages/:key` opens on (plan §5.3): Questions while the crew asks, Plan while a decision waits, Runs while it
 * sails or is queued, Models while it is anchored (as the `Halted` wireframe), and Plan otherwise.
 */
export function defaultTab(status: StoryStatus): VoyageTab {
  switch (status) {
    case 'awaiting_input':
      return 'questions';
    case 'awaiting_decision':
      return 'plan';
    case 'running':
    case 'ready':
      return 'runs';
    case 'halted':
      return 'models';
    case 'terminal':
      return 'plan';
  }
}

/**
 * Stands at `/voyages/:key` until the story is read, then replaces the URL with the default tab's. The shell shows the
 * header's skeleton meanwhile; this renders nothing.
 */
@Component({ selector: 'ah-voyage-default-tab', template: `` })
export class VoyageDefaultTab {
  private readonly context = inject(VoyageContext);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private done = false;

  constructor() {
    effect(() => {
      const status = this.context.story()?.status;
      if (status === undefined || this.done) return;
      this.done = true;
      void this.router.navigate([defaultTab(status)], {
        relativeTo: this.route,
        replaceUrl: true,
      });
    });
  }
}
