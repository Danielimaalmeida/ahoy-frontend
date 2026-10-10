import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { shortSha } from '@domain/identifiers';
import { BudgetMeter } from '@ui/budget-meter/budget-meter';
import { Button } from '@ui/button/button';
import { PhaseStepper } from '@ui/phase-stepper/phase-stepper';
import { StatusBadge } from '@ui/status-badge/status-badge';
import { currentRunView } from '../context/crew';
import { VoyageContext } from '../context/voyage-context';
import { VoyageDialogs } from '../dialogs/voyage-dialogs';
import {
  canRefreshIntake,
  headerActions,
  primaryAction,
} from './primary-action';

/**
 * The voyage header (wireframes `PlanReview` and `Halted`): key, status badge with the API words (`awaiting_decision ·
 * plan_accepted`, `halted · run_failed`), title, the primary action for the status with Budget, Models, Back to intake
 * (in planning and plan review) and Stop, the
 * phase stepper, and the meta line (owner, budget, current run, revision round, agent config). Shown once the story
 * is read.
 */
@Component({
  selector: 'ah-voyage-header',
  imports: [BudgetMeter, Button, PhaseStepper, RouterLink, StatusBadge],
  styleUrl: './voyage-header.scss',
  template: `
    @if (view(); as v) {
      <section class="ah-panel" aria-labelledby="voyage-title">
        <div class="ah-panel__body header">
          <div class="header__top">
            <div class="header__name">
              <div class="header__line">
                <span class="ah-key">{{ v.story.key }}</span>
                <ah-status-badge
                  [status]="v.story.status"
                  [phase]="v.story.phase"
                  showApi
                  [detail]="v.apiDetail"
                />
              </div>
              <h1 id="voyage-title" class="header__title">
                {{ v.story.title ?? v.story.key }}
              </h1>
            </div>
            <div class="header__actions">
              @if (v.primary; as primary) {
                @if (primary.kind === 'tab') {
                  <a
                    ahButton="primary"
                    [routerLink]="['/voyages', v.story.key, primary.tab]"
                    >{{ primary.label }}</a
                  >
                } @else {
                  <button
                    type="button"
                    ahButton="primary"
                    (click)="openResume()"
                  >
                    {{ primary.label }}
                  </button>
                }
              }
              @if (v.actions.budget) {
                <button type="button" ahButton (click)="openBudget()">
                  Budget
                </button>
              }
              <a ahButton [routerLink]="['/voyages', v.story.key, 'models']">{{
                v.story.status === 'halted' ? 'Change models' : 'Models'
              }}</a>
              @if (v.intake) {
                <button type="button" ahButton (click)="openRefreshIntake()">
                  Back to intake
                </button>
              }
              @if (v.actions.stop) {
                <button
                  type="button"
                  ahButton="danger-outline"
                  (click)="openStop()"
                >
                  Stop
                </button>
              }
            </div>
          </div>
          <ah-phase-stepper
            [phase]="v.story.phase"
            [status]="v.story.status"
            [stoppedAt]="stoppedAt()"
          />
          <dl class="header__meta">
            <div>
              <dt>Owner · billed</dt>
              <dd>
                {{ v.story.owner }}
                @if (isOwner()) {
                  <span class="ah-hint">(you)</span>
                }
              </dd>
            </div>
            <div class="header__budget">
              <dt>Budget</dt>
              <dd>
                <ah-budget-meter
                  [spentNanoAiu]="v.story.spentNanoAiu"
                  [capNanoAiu]="v.story.budgetNanoAiu"
                  [width]="120"
                />
              </dd>
            </div>
            <div>
              <dt>Current run</dt>
              <dd>
                {{ v.run.prefix }}
                @if (v.run.runId; as runId) {
                  <a
                    class="ah-mono"
                    [routerLink]="['/voyages', v.story.key, 'runs', runId]"
                    >{{ runId }}</a
                  >
                }
                {{ v.run.suffix }}
              </dd>
            </div>
            @if (v.round; as round) {
              <div>
                <dt>Revision round</dt>
                <dd>{{ round }}</dd>
              </div>
            }
            <div>
              <dt>Agent config</dt>
              <dd>
                <span class="ah-mono ah-muted" [title]="v.story.controlSha">{{
                  v.sha
                }}</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>
    }
  `,
})
export class VoyageHeader {
  private readonly context = inject(VoyageContext);
  private readonly dialogs = inject(VoyageDialogs);

  protected readonly stoppedAt = this.context.stoppedAt;
  protected readonly isOwner = this.context.isOwner;

  protected readonly view = computed(() => {
    const story = this.context.story();
    if (story === null) return null;
    const gateKey = this.context.gateKey();
    const apiDetail =
      story.status === 'awaiting_decision'
        ? (gateKey ?? '')
        : story.status === 'halted'
          ? (story.haltReason ?? '')
          : '';
    return {
      story,
      apiDetail,
      primary: primaryAction(story.status, gateKey),
      actions: headerActions(story.status),
      intake: canRefreshIntake(
        story,
        this.context.counts().runs === null ? null : this.context.runs()
      ),
      run: currentRunView(story.currentRunId, this.context.runs()),
      round: this.roundText(),
      sha: shortSha(story.controlSha),
    };
  });

  /** "2 of 4", shown while a gate is open or once a plan has been sent back. */
  private roundText(): string | null {
    const round = this.context.revisionRound();
    const ceiling = this.context.revisionCeiling();
    if (round === null || ceiling === null) return null;
    return this.context.gateKey() !== null || round > 1
      ? `${round} of ${ceiling}`
      : null;
  }

  protected openStop(): void {
    this.dialogs.stop(this.context);
  }

  protected openResume(): void {
    this.dialogs.resume(this.context);
  }

  protected openBudget(): void {
    this.dialogs.budget(this.context);
  }

  protected openRefreshIntake(): void {
    this.dialogs.refreshIntake(this.context);
  }
}
