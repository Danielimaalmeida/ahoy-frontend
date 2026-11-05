import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  Router,
  RouterLink,
  isActive,
  type IsActiveMatchOptions,
} from '@angular/router';
import { CLOCK as CORE_CLOCK, type Timer } from '@core/realtime/clock';
import { RunProgressBuffer } from '@core/stores/run-progress-buffer';
import { formatAiu } from '@domain/aiu';
import { Button } from '@ui/button/button';
import { stepTime } from '@ui/live-steps/live-steps';
import { ciWait } from '../context/ci-wait';
import { runById } from '../context/crew';
import { underWay } from '../context/under-way';
import { runSpendNanoAiu } from '../tabs/runs/run-rows';
import { VoyageContext } from '../context/voyage-context';

/** The Runs tab and nothing below it (a run's own page is not the tab). */
const RUNS_TAB_MATCH: Partial<IsActiveMatchOptions> = {
  paths: 'exact',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};

/** How often the strip's timer moves on, in ms. */
export const UNDER_WAY_TICK_MS = 1_000;

/**
 * "Under way": a strip under the voyage header, on every tab, while the voyage is running or queued for its next run
 * (not while it waits for CI, which has its own banner). It says who is at work and in which phase, for how long (the
 * timer moves every second), the agent's newest step and what the run has spent, with Watch live (the Runs tab, left out
 * there) and Open run. See {@link underWay} for the words.
 */
@Component({
  selector: 'ah-under-way-strip',
  imports: [Button, RouterLink],
  styles: `
    :host {
      display: contents;
    }

    .underway {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2\\.5) var(--space-4);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--status-running-bg);
      color: var(--status-running-fg);
      border: 1px solid
        color-mix(in srgb, var(--status-running-fg) 22%, transparent);
    }

    .underway--starting {
      background: var(--status-queued-bg);
      color: var(--status-queued-fg);
      border-color: color-mix(
        in srgb,
        var(--status-queued-fg) 22%,
        transparent
      );
    }

    .underway__pulse {
      flex: none;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--live);
      box-shadow: 0 0 0 4px var(--live-halo);
    }

    .underway--starting .underway__pulse {
      background: var(--status-queued-fg);
      box-shadow: 0 0 0 4px var(--surface);
    }

    @media (prefers-reduced-motion: no-preference) {
      .underway__pulse {
        animation: underway-pulse 1.8s ease-in-out infinite;
      }
    }

    @keyframes underway-pulse {
      50% {
        box-shadow: 0 0 0 7px transparent;
      }
    }

    .underway__main {
      flex: 1 1 360px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .underway__head {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--ink);
    }

    .underway__time {
      font-weight: 600;
      color: inherit;
      font-variant-numeric: tabular-nums;
    }

    .underway__sub {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      align-items: baseline;
      font-size: 12.5px;
      color: var(--ink-soft);
      min-width: 0;
    }

    .underway__step {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--ink);
      background: var(--surface);
      border-radius: var(--radius-sm);
      padding: 2px 8px;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .underway__tool {
      color: var(--live-text);
      margin-right: 6px;
    }

    .underway__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
  template: `
    @if (view(); as v) {
      <section
        [class]="'underway underway--' + v.kind"
        aria-label="Voyage under way"
      >
        <span class="ah-sr" role="status">{{ v.announce }}</span>
        <span class="underway__pulse" aria-hidden="true"></span>
        <div class="underway__main">
          <p class="underway__head">
            {{ v.heading }}
            @if (v.time !== '') {
              ·
              <span class="underway__time" aria-hidden="true">{{
                v.time
              }}</span>
            }
          </p>
          <div class="underway__sub">
            @if (v.step; as step) {
              <span class="underway__step" [title]="step.text"
                ><span class="underway__tool"
                  >{{ step.time }} {{ step.tool }}</span
                >{{ step.text }}</span
              >
            }
            @if (v.detail !== '') {
              <span>{{ v.detail }}</span>
            }
            @if (v.runLabel !== '') {
              <span>{{ v.runLabel }}</span>
            }
            @if (v.spent !== null) {
              <span>{{ v.spent }} AIU so far</span>
            }
          </div>
        </div>
        @if (v.runId !== null) {
          <div class="underway__actions">
            @if (v.kind === 'running' && !onRunsTab()) {
              <a
                ahButton="primary"
                size="sm"
                [routerLink]="['/voyages', v.key, 'runs']"
                >Watch live</a
              >
            }
            <a
              ahButton
              size="sm"
              [routerLink]="['/voyages', v.key, 'runs', v.runId]"
              >Open run</a
            >
          </div>
        }
      </section>
    }
  `,
})
export class UnderWayStrip {
  private readonly context = inject(VoyageContext);
  private readonly progress = inject(RunProgressBuffer);
  private readonly clock = inject(CORE_CLOCK);
  private readonly router = inject(Router);
  private readonly now = signal(this.clock.now());

  /** The page is on the Runs tab, which already shows the live steps: Watch live is left out. */
  /** Whether the voyage's Runs tab is the page, per key (the shell keeps the strip when only the key changes). */
  private readonly runsTab = computed(() => {
    const key = this.context.key();
    return key === null
      ? null
      : isActive(
          this.router.createUrlTree(['/voyages', key, 'runs']),
          this.router,
          RUNS_TAB_MATCH
        );
  });
  protected readonly onRunsTab = computed(() => this.runsTab()?.() ?? false);

  /** The voyage is running or queued: only then does the timer tick. */
  private readonly active = computed(() => {
    const status = this.context.story()?.status;
    return status === 'running' || status === 'ready';
  });

  protected readonly view = computed(() => {
    const story = this.context.story();
    const runs = this.context.runs();
    const runId = story?.status === 'running' ? story.currentRunId : null;
    const record = runId === null ? null : this.progress.run(runId)();
    const now = this.now();
    const view = underWay({
      story,
      runs,
      waitingForCi:
        ciWait(
          story,
          this.context.events(),
          this.context.state()?.pullRequests ?? []
        ) !== null,
      entries: record?.entries ?? [],
      now,
    });
    if (view === null || story === null) return null;
    const run = view.kind === 'running' ? runById(runs, view.runId) : undefined;
    const spend = record?.spend ?? null;
    const spent =
      run === undefined ? null : formatAiu(runSpendNanoAiu(run, spend), 2);
    return {
      ...view,
      key: story.key,
      // Read out once per state, never per tick: the timer and the steps stay out of the live region.
      announce: `${view.heading}.`,
      spent,
      step:
        view.step === null
          ? null
          : { ...view.step, time: stepTime(view.step.at) },
    };
  });

  constructor() {
    let timer: Timer | null = null;
    const tick = (): void => {
      this.now.set(this.clock.now());
      timer = this.clock.schedule(UNDER_WAY_TICK_MS, tick);
    };
    effect(() => {
      timer?.cancel();
      timer = null;
      if (this.active()) {
        this.now.set(this.clock.now());
        timer = this.clock.schedule(UNDER_WAY_TICK_MS, tick);
      }
    });
    inject(DestroyRef).onDestroy(() => timer?.cancel());
  }
}
