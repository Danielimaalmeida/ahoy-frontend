import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorView } from '@core/commands/command-error';
import { crewLabel } from '@domain/models';
import { currentQuestions } from '@domain/questions';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Markdown } from '@ui/markdown/markdown';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Skeleton } from '@ui/skeleton/skeleton';
import { runById, runCrew } from '../../context/crew';
import { VoyageContext } from '../../context/voyage-context';
import { DecisionConflictPanel } from './decision-conflict';
import { DecisionPanel } from './decision-panel';
import { PLAN_GATE, earlierSendBack } from './decision-view';
import { criteriaOf } from './plan-criteria';
import { PlanDecision } from './plan-decision';
import { PlanDocument } from './plan-document';

/**
 * The Plan tab (plan, lane 4B; wireframe `PlanReview`): the plan the Cartographer wrote, with the blocks that changed
 * since the last revision marked; the acceptance criteria; "Your decision"; and the earlier round. It reads only: the
 * decision goes through the `CommandRunner` of the voyage's context, one command at a time.
 */
@Component({
  selector: 'ah-plan-tab',
  imports: [
    Banner,
    Button,
    DecisionConflictPanel,
    DecisionPanel,
    EmptyState,
    Markdown,
    Panel,
    PanelBody,
    PanelHead,
    RelativePipe,
    RouterLink,
    Skeleton,
  ],
  providers: [PlanDecision, PlanDocument],
  styleUrl: './plan-tab.scss',
  template: `
    <div class="plan">
      <article class="plan__main">
        <ah-panel>
          <ah-panel-head heading="Implementation plan">
            @if (revision(); as n) {
              <span class="ah-tag">revision {{ n }}</span>
            }
            @if (artifact(); as a) {
              <span class="ah-muted"
                >by {{ author() }}
                @if (a.runId; as runId) {
                  · run <span class="ah-mono">{{ runId }}</span>
                }
                · {{ a.createdAt | ahRelative }}</span
              >
            }
            @if (revision(); as n) {
              @if (n > 1) {
                <a
                  ahPanelActions
                  class="plan__compare"
                  [routerLink]="['/voyages', key(), 'artifacts']"
                  >Compare with revision {{ n - 1 }}</a
                >
              }
            }
          </ah-panel-head>
          <ah-panel-body>
            @switch (plan.status()) {
              @case ('ready') {
                <ah-markdown
                  [source]="plan.text() ?? ''"
                  [changedBlocks]="plan.changed()"
                />
                @if (plan.changed().length > 0) {
                  <p class="ah-hint plan__legend">
                    <span class="ah-mark">Highlighted</span> blocks changed
                    since the last plan revision.
                  </p>
                }
              }
              @case ('none') {
                <ah-empty-state heading="No plan yet"
                  >{{ author() }} hasn't written one. It shows up here when a
                  planning run finishes.</ah-empty-state
                >
              }
              @case ('error') {
                @if (planError(); as e) {
                  <ah-banner
                    [variant]="e.variant"
                    [heading]="e.heading"
                    [tech]="e.tech ?? ''"
                    icon="offline"
                    >{{ e.text }}
                    <span class="plan__retry"
                      ><button
                        type="button"
                        ahButton
                        size="sm"
                        (click)="plan.retry()"
                      >
                        Try again
                      </button></span
                    ></ah-banner
                  >
                }
              }
              @default {
                <div aria-busy="true" class="plan__loading">
                  <span class="ah-sr" role="status">Loading the plan…</span>
                  <ah-skeleton width="40%" [height]="18" />
                  <ah-skeleton width="90%" />
                  <ah-skeleton width="75%" />
                  <ah-skeleton width="85%" />
                </div>
              }
            }
          </ah-panel-body>
        </ah-panel>
      </article>

      <aside class="plan__side" aria-label="Decision and criteria">
        <ah-decision-conflict />
        <ah-decision-panel />

        <ah-panel>
          <ah-panel-head
            heading="Acceptance criteria"
            [subtitle]="'' + criteria().length"
          />
          <ah-panel-body>
            <div class="plan__acs">
              @for (c of criteria(); track c.id) {
                <div class="plan__ac">
                  <b class="ah-mono">{{ c.id }}</b>
                  <span>{{ c.text }}</span>
                </div>
              } @empty {
                <p class="ah-muted">The plan has no acceptance criteria yet.</p>
              }
            </div>
          </ah-panel-body>
        </ah-panel>

        @if (earlier(); as e) {
          <ah-panel>
            <ah-panel-head heading="Earlier round" />
            <ah-panel-body>
              @if (e.record; as r) {
                <div class="plan__quote">
                  <span
                    ><b>Sent back</b> by {{ r.actor }} ·
                    <span [title]="r.createdAt">{{
                      r.createdAt | ahRelative
                    }}</span></span
                  >
                  @if (r.message) {
                    <span>“{{ r.message }}”</span>
                  }
                </div>
              }
              @if (e.answered > 0) {
                <a
                  class="plan__more"
                  [routerLink]="['/voyages', key(), 'questions']"
                  >{{ e.answered }}
                  {{ e.answered === 1 ? 'question' : 'questions' }} answered
                  before this plan</a
                >
              }
            </ah-panel-body>
          </ah-panel>
        }
      </aside>
    </div>
  `,
})
export class PlanTab {
  private readonly context = inject(VoyageContext);
  private readonly decision = inject(PlanDecision);

  protected readonly plan = inject(PlanDocument);
  protected readonly key = computed(() => this.context.key() ?? '');
  protected readonly artifact = this.plan.artifact;
  protected readonly criteria = computed(() =>
    criteriaOf(this.context.state()?.criteria ?? [], this.plan.text())
  );

  /** The plan's revision number: the send-backs of the plan gate and one (G10), not the artifact set's revision. */
  protected readonly revision = computed(() => {
    const state = this.context.state();
    return state === null ? null : (state.revisions.get(PLAN_GATE) ?? 0) + 1;
  });

  /** Who wrote the plan: the crew member of its run, else the Cartographer. */
  protected readonly author = computed(() => {
    const run = runById(this.context.runs(), this.artifact()?.runId ?? null);
    return run === undefined ? crewLabel('planning') : runCrew(run);
  });

  protected readonly planError = computed(() => {
    const error = this.plan.error();
    return error === null ? null : apiErrorView(error);
  });

  /** The last send-back and the answers before this plan, for "Earlier round"; null when there is neither. */
  protected readonly earlier = computed(() => {
    const record = earlierSendBack(this.decision.records(), PLAN_GATE);
    const answered = currentQuestions(
      this.context.handle()?.questions.value() ?? []
    ).filter((q) => q.answer !== null).length;
    return record === null && answered === 0 ? null : { record, answered };
  });
}
