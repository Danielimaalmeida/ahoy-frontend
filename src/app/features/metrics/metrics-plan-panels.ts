import { Component, computed, inject } from '@angular/core';
import { barWidth, formatMetricsAiu } from '@domain/metrics';
import {
  MAX_SCORE,
  formatAverageScore,
  formatGateRatio,
  formatScoreRange,
} from '@domain/plan-panel';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Api, Table } from '@ui/table/table';
import { metricsFailure } from './metrics-shell';
import { MetricsStore } from './metrics-store';

/**
 * "Plan panel ratings": how the judges rated each model's plans in the period (`getPlanPanelMetrics`): per model and
 * judge model the drafts it wrote, how many were rated, the average and the range of the scores, how often it had the
 * best draft of a panel, how many drafts the plan gate passed of those it checked, the planners that did not finish and
 * the average AIU of a draft; and how many panels each judge model ran. A judge's scores are its own, so a model that
 * two judges rated has a row for each and their averages are never mixed. Read-only, 0 AIU. It has no owner, repository
 * or model filter. A read that fails or finds no panel says so here and leaves the rest of the page as it is.
 */
@Component({
  selector: 'ah-metrics-plan-panels',
  imports: [
    Api,
    Banner,
    Button,
    EmptyState,
    Panel,
    PanelBody,
    PanelHead,
    Skeleton,
    Table,
  ],
  styleUrl: './metrics.scss',
  template: `
    <ah-panel>
      <ah-panel-head
        heading="Plan panel ratings"
        subtitle="How the judges rated each model's plans, with a row for each judge. The owner, repository and model filters do not apply."
      />
      @if (failure(); as f) {
        <ah-panel-body>
          <ah-banner variant="error" [heading]="f.heading" [tech]="f.tech">
            The ratings could not be read; nothing changed in Ahoy.
            <button
              ahButton
              size="sm"
              type="button"
              (click)="store.reloadPlanPanels()"
            >
              Try again
            </button>
          </ah-banner>
        </ah-panel-body>
      } @else if (store.planPanels(); as r) {
        @if (r.panels === 0) {
          <ah-panel-body>
            <ah-empty-state heading="No panel ran in this period" />
            <p class="note">
              Choose Panel on Set sail, or on a voyage's Models tab, to compare
              how models plan.
            </p>
          </ah-panel-body>
        } @else {
          <div class="scroll">
            <table ahTable>
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Judge</th>
                  <th scope="col" class="num">Drafts</th>
                  <th scope="col" class="num">Rated</th>
                  <th scope="col">Average score</th>
                  <th scope="col" class="num">Range</th>
                  <th scope="col" class="num">Best</th>
                  <th scope="col" class="num">Plan gate passed</th>
                  <th scope="col" class="num">Not finished</th>
                  <th scope="col" class="num">Average AIU</th>
                </tr>
              </thead>
              <tbody>
                @for (
                  m of r.models;
                  track m.model + '/' + (m.judgeModel ?? '')
                ) {
                  <tr>
                    <th scope="row">
                      <span ahApi>{{ m.model }}</span>
                    </th>
                    <td>
                      @if (m.judgeModel; as judge) {
                        <span ahApi>{{ judge }}</span>
                      } @else {
                        <span class="ah-muted">No judge ran</span>
                      }
                    </td>
                    <td class="num">{{ m.plans }}</td>
                    <td class="num">{{ m.rated }}</td>
                    <td>
                      <span class="share"
                        ><span class="hbar__track" aria-hidden="true"
                          ><i
                            class="hbar__fill"
                            [style.width.%]="
                              barWidth(m.averageScore ?? 0, maxScore)
                            "
                          ></i></span
                        ><span class="mono">{{
                          averageScore(m.averageScore)
                        }}</span></span
                      >
                    </td>
                    <td class="num">{{ range(m.minScore, m.maxScore) }}</td>
                    <td class="num">{{ m.best }}</td>
                    <td class="num">
                      {{ gate(m.gatePassed, m.gateChecked) }}
                    </td>
                    <td class="num" [class.strong]="m.unfinished > 0">
                      {{ m.unfinished }}
                    </td>
                    <td class="num">
                      {{
                        m.averageNanoAiu === null ? '—' : aiu(m.averageNanoAiu)
                      }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <ah-panel-body>
            <p class="note">
              {{ r.panels }} {{ r.panels === 1 ? 'panel' : 'panels' }} in the
              period. Scores are 1 to 10 and are not comparable between judges,
              so each judge has its own row; Best counts the rated drafts with
              the highest score of their panel, ties included. Judges:
              {{ judges() }}.
            </p>
          </ah-panel-body>
        }
      } @else {
        <ah-panel-body>
          <div aria-busy="true" aria-label="Loading the plan panel ratings">
            <ah-skeleton [height]="88" />
          </div>
        </ah-panel-body>
      }
    </ah-panel>
  `,
})
export class MetricsPlanPanels {
  protected readonly store = inject(MetricsStore);
  protected readonly maxScore = MAX_SCORE;
  protected readonly barWidth = barWidth;
  protected readonly averageScore = formatAverageScore;
  protected readonly range = formatScoreRange;
  protected readonly gate = formatGateRatio;
  protected readonly aiu = formatMetricsAiu;

  protected readonly failure = computed(() => {
    const error = this.store.planPanelsError();
    return error === null ? null : metricsFailure(error);
  });

  /** "claude-opus-5.5 ran 3 panels, claude-sonnet-5 1 panel": the judges' own models, counted apart. */
  protected readonly judges = computed(() => {
    const judges = this.store.planPanels()?.judges ?? [];
    return judges.length === 0
      ? 'none ran'
      : judges
          .map(
            (j) =>
              `${j.model} ran ${j.panels} ${j.panels === 1 ? 'panel' : 'panels'}`
          )
          .join(', ');
  });
}
