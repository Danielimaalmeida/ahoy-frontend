import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorView } from '@core/commands/command-error';
import type { WorkPackageDecision } from '@core/api/types';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { OutcomePill } from '@ui/outcome-pill/outcome-pill';
import { Panel, PanelHead } from '@ui/panel/panel';
import { ActorPipe } from '@ui/pipes/actor.pipe';
import { DateTimePipe } from '@ui/pipes/date-time.pipe';
import { SkeletonRows, type SkeletonColumn } from '@ui/skeleton/skeleton';
import { VoyageContext } from '../../context/voyage-context';
import {
  canDecidePackage,
  packageRows,
  reportWords,
  type PackageRow,
} from '../../context/work-packages';
import { VoyageDialogs } from '../../dialogs/voyage-dialogs';

/** The placeholder rows while the state is read. */
const PACKAGE_COLUMNS: readonly SkeletonColumn[] = [
  { track: '60px' },
  { track: 'minmax(0, 1fr)' },
  { track: '120px', height: 20 },
];

/**
 * The Work packages tab: the plan's packages from the state (`work_packages[]`), before implementation too, each with its
 * repository, agent, dependencies, status and why it needs rework or is stuck; the runs its `run.queued` events name
 * ("WP2 — implementation"), with each run's own status beside what Ahoy made of its report; and, while the voyage is halted
 * in implementation and the package is failed, stalled, blocked or unverified, Retry… and Accept….
 *
 * A run's success is not the package's acceptance: the package's status is the state's, the run's is the run's, and the
 * report's routing is shown as words of its own. The state holds no goal or description for a package; the plan's prose
 * does, so the tab points there instead of inventing one.
 */
@Component({
  selector: 'ah-packages-tab',
  imports: [
    ActorPipe,
    Banner,
    Button,
    DateTimePipe,
    EmptyState,
    OutcomePill,
    Panel,
    PanelHead,
    RouterLink,
    SkeletonRows,
  ],
  styleUrl: './packages-tab.scss',
  template: `
    <ah-panel>
      <ah-panel-head heading="Work packages" subtitle="in plan order" />
      @if (failure(); as f) {
        <div class="ah-panel__body">
          <ah-banner
            [variant]="f.variant"
            [heading]="f.heading"
            [tech]="f.tech ?? ''"
            icon="offline"
            announce="alert"
            >{{ f.text }}</ah-banner
          >
        </div>
      } @else if (loading()) {
        <div class="ah-panel__body">
          <span class="ah-sr" role="status">Loading the work packages…</span>
          <ah-skeleton-rows [rows]="2" [columns]="columns" />
        </div>
      } @else if (rows().length === 0) {
        <ah-empty-state heading="No work packages yet" icon="anchor"
          >The plan names its work packages; they show up here once it
          does.</ah-empty-state
        >
      } @else {
        <p class="ah-panel__body ah-hint packages__goal-note">
          Ahoy's state names no goal for a package. What each one is for is in
          <a [routerLink]="['/voyages', key(), 'plan']">the plan</a>.
        </p>
        <ul class="packages" role="list">
          @for (row of rows(); track row.pkg.id) {
            <li class="packages__item">
              <article
                class="packages__card"
                [attr.aria-labelledby]="'wp-' + row.pkg.id"
              >
                <div class="packages__head">
                  <h3 class="packages__id ah-key" [id]="'wp-' + row.pkg.id">
                    {{ row.pkg.id }}
                  </h3>
                  <span
                    class="ah-tag packages__status packages__status--{{
                      row.status.tone
                    }}"
                    >{{ row.status.label }}</span
                  >
                  @if (row.active) {
                    <span class="ah-tag ah-tag--accent">A run is on</span>
                  }
                  <span class="ah-api">{{ row.pkg.status }}</span>
                  @if (decidable(row)) {
                    <span class="packages__actions">
                      <button
                        type="button"
                        ahButton
                        size="sm"
                        [attr.aria-label]="'Retry ' + row.pkg.id"
                        (click)="decide(row, 'retry')"
                      >
                        Retry…
                      </button>
                      <button
                        type="button"
                        ahButton
                        size="sm"
                        [attr.aria-label]="'Accept ' + row.pkg.id"
                        (click)="decide(row, 'accept')"
                      >
                        Accept…
                      </button>
                    </span>
                  }
                </div>
                <dl class="packages__facts">
                  <div>
                    <dt>Repository</dt>
                    <dd class="ah-mono">{{ row.pkg.repo || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Agent</dt>
                    <dd>{{ row.pkg.agent || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Depends on</dt>
                    <dd>
                      @if (row.pkg.dependsOn.length === 0) {
                        none
                      } @else {
                        {{ row.pkg.dependsOn.join(', ') }}
                        @if (row.waitingOn.length > 0) {
                          <span class="ah-hint"
                            >(not done: {{ row.waitingOn.join(', ') }})</span
                          >
                        }
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Opens the pull request</dt>
                    <dd>{{ row.pkg.openPr ? 'yes' : 'no' }}</dd>
                  </div>
                  @if (row.pkg.handbackTo; as target) {
                    <div>
                      <dt>Waiting on</dt>
                      <dd>{{ target }}</dd>
                    </div>
                  }
                </dl>
                @if (row.reason; as reason) {
                  <div class="packages__reason">
                    <span class="packages__label">{{
                      row.pkg.status === 'blocked' ? 'Blocked on' : 'Why'
                    }}</span>
                    <p class="packages__text">{{ reason }}</p>
                  </div>
                }
                @if (row.pkg.reworkNote; as note) {
                  <div class="packages__reason">
                    <span class="packages__label">Rework note</span>
                    <p class="packages__text">{{ note }}</p>
                  </div>
                }
                @if (row.pkg.accepted; as accepted) {
                  <p class="packages__accepted">
                    Accepted as it stood ({{ accepted.fromStatus }}) by
                    {{ accepted.by | ahActor }}, {{ accepted.at | ahDateTime }}:
                    {{ accepted.reason }}
                  </p>
                }
                @if (row.decisions.length > 0) {
                  <ul class="packages__decisions" aria-label="Decisions">
                    @for (d of row.decisions; track $index) {
                      <li>
                        {{ d.decision === 'retry' ? 'Retried' : 'Accepted' }}
                        by {{ d.actor | ahActor }}, {{ d.at | ahDateTime }}:
                        {{ d.reason }}
                      </li>
                    }
                  </ul>
                }
                <div class="packages__runs">
                  <span class="packages__label">Runs</span>
                  @if (row.runs.length === 0) {
                    <p class="ah-hint">No run has worked on it yet.</p>
                  } @else {
                    <ol class="packages__run-list">
                      @for (r of row.runs; track r.runId) {
                        <li class="packages__run">
                          <a
                            class="ah-mono"
                            [routerLink]="['/voyages', key(), 'runs', r.runId]"
                            [attr.aria-label]="r.label + ', run ' + r.runId"
                            >{{ r.label }} · {{ r.runId }}</a
                          >
                          @if (r.run; as run) {
                            <span class="packages__run-part"
                              ><span class="ah-hint">Run</span>
                              <ah-outcome-pill [value]="run.status"
                            /></span>
                          }
                          @if (r.report; as report) {
                            <span class="packages__run-part"
                              ><span class="ah-hint">Ahoy:</span>
                              {{ reportWords(report.status) }}
                              @if (
                                report.deliveryKind === 'verified_existing'
                              ) {
                                · found done, only verified
                              }
                            </span>
                          } @else if (
                            r.run !== null && !isActive(r.run.status)
                          ) {
                            <span class="ah-hint packages__run-part"
                              >No report from this run</span
                            >
                          }
                        </li>
                      }
                    </ol>
                  }
                </div>
              </article>
            </li>
          }
        </ul>
      }
    </ah-panel>
  `,
})
export class PackagesTab {
  private readonly context = inject(VoyageContext);
  private readonly dialogs = inject(VoyageDialogs);

  protected readonly columns = PACKAGE_COLUMNS;
  protected readonly key = this.context.key;
  protected readonly reportWords = reportWords;

  protected readonly rows = computed<readonly PackageRow[]>(() =>
    packageRows(
      this.context.state()?.packages ?? [],
      this.context.events(),
      this.context.runs()
    )
  );

  /** The state is being read for the first time. */
  protected readonly loading = computed(() => {
    const state = this.context.handle()?.state;
    return (
      state !== undefined &&
      state.value() === undefined &&
      state.error() === null
    );
  });

  /** Why the state could not be read, while there is nothing to show. */
  protected readonly failure = computed(() => {
    const state = this.context.handle()?.state;
    const error =
      state?.value() === undefined ? (state?.error() ?? null) : null;
    return error === null ? null : apiErrorView(error);
  });

  protected isActive(status: string): boolean {
    return status === 'queued' || status === 'running';
  }

  /** Retry… and Accept… show only when the voyage and the package allow the decision. */
  protected decidable(row: PackageRow): boolean {
    return canDecidePackage(this.context.story(), row.pkg);
  }

  protected decide(row: PackageRow, decision: WorkPackageDecision): void {
    this.dialogs.decidePackage({
      context: this.context,
      workPackageId: row.pkg.id,
      decision,
    });
  }
}
