import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  barWidth,
  changeVsPrevious,
  ERROR_SOURCE_LABELS,
  fixerLabel,
  formatMetricsAiu,
  formatPercent,
  stackWeeks,
  type ErrorSource,
} from '@domain/metrics';
import { EmptyState } from '@ui/empty-state/empty-state';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Api, Table } from '@ui/table/table';
import { MetricsStore } from './metrics-store';

/** How many errors the overview lists; the Halts & errors section has them all. */
const TOP_ERRORS = 5;

/**
 * The overview of the Metrics page: the four headline figures, AIU by phase per week, halts by reason, the patterns the
 * fixed rules found and the most common errors.
 */
@Component({
  selector: 'ah-metrics-overview',
  imports: [
    RouterLink,
    RelativePipe,
    EmptyState,
    Panel,
    PanelBody,
    PanelHead,
    Table,
    Api,
  ],
  styleUrl: './metrics.scss',
  template: `
    @if (store.report(); as r) {
      <div class="section">
        <div class="kpis">
          <div class="kpi">
            <span class="kpi__label">AIU spent</span>
            <span class="kpi__value">{{ aiu(r.totals.nanoAiu) }}</span>
            <span class="kpi__note">{{
              spendChange() ?? r.totals.runs + ' runs'
            }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__label">AIU per finished voyage (median)</span>
            <span class="kpi__value">{{
              r.totals.medianNanoAiuPerDoneStory === null
                ? '—'
                : aiu(r.totals.medianNanoAiuPerDoneStory)
            }}</span>
            <span class="kpi__note"
              >{{ r.totals.storiesFinished }} finished ·
              {{ r.totals.storiesDone }} done ·
              {{ r.totals.storiesBlocked }} blocked</span
            >
          </div>
          <div class="kpi">
            <span class="kpi__label">Halts</span>
            <span class="kpi__value"
              >{{ r.totals.halts }}
              <span class="kpi__unit"
                >in {{ r.totals.haltedStories }} voyages</span
              ></span
            >
            <span class="kpi__note"
              >{{ r.totals.repeatHaltStories }} voyages halted again after
              Resume</span
            >
          </div>
          <div class="kpi">
            <span class="kpi__label">Gate pass on first run</span>
            <span class="kpi__value">{{
              formatPercent(r.totals.gatePasses, r.totals.gateEvaluations)
            }}</span>
            <span class="kpi__note"
              >{{ r.totals.gateEvaluations }} evaluations,
              {{ r.totals.gateErrors }} tooling errors</span
            >
          </div>
        </div>

        <div class="two">
          <ah-panel>
            <ah-panel-head heading="AIU by phase, per week">
              <a class="ah-link" routerLink="/metrics/cost" ahPanelActions
                >Cost detail</a
              >
            </ah-panel-head>
            <ah-panel-body>
              @if (chart().columns.length === 0) {
                <ah-empty-state heading="No runs in this period" />
              } @else {
                <ul class="legend" aria-label="Phases">
                  @for (s of chart().series; track s.label) {
                    <li class="legend__item">
                      <i class="swatch" [class]="'s' + s.slot"></i>{{ s.label }}
                    </li>
                  }
                </ul>
                <div class="weeks" aria-hidden="true">
                  @for (c of chart().columns; track c.label) {
                    <div
                      class="week"
                      [title]="c.label + ': ' + aiu(c.total) + ' AIU'"
                    >
                      @for (p of c.parts; track p.slot) {
                        @if (p.value > 0) {
                          <i
                            class="week__part"
                            [class]="'s' + p.slot"
                            [style.height.%]="(p.value / chartMax()) * 100"
                          ></i>
                        }
                      }
                    </div>
                  }
                </div>
                <div class="week-labels" aria-hidden="true">
                  @for (c of chart().columns; track c.label) {
                    <span>{{ c.label }}</span>
                  }
                </div>
                <details>
                  <summary class="ah-link">View as table</summary>
                  <div class="scroll">
                    <table ahTable>
                      <thead>
                        <tr>
                          <th scope="col">Week</th>
                          @for (s of chart().series; track s.label) {
                            <th scope="col" class="num">{{ s.label }}</th>
                          }
                          <th scope="col" class="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (c of chart().columns; track c.label) {
                          <tr>
                            <th scope="row">{{ c.label }}</th>
                            @for (p of c.parts; track p.slot) {
                              <td class="num">{{ aiu(p.value) }}</td>
                            }
                            <td class="num strong">{{ aiu(c.total) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </details>
              }
            </ah-panel-body>
          </ah-panel>

          <ah-panel>
            <ah-panel-head
              heading="Halts by reason"
              [subtitle]="r.totals.halts + ' halts'"
            >
              <a class="ah-link" routerLink="/metrics/halts" ahPanelActions
                >All halts</a
              >
            </ah-panel-head>
            <ah-panel-body>
              @if (reasons().length === 0) {
                <ah-empty-state heading="No halts in this period" />
              } @else {
                <ul class="hbars">
                  @for (h of reasons(); track h.reason) {
                    <li class="hbar">
                      <span ahApi>{{ h.reason }}</span>
                      <span class="hbar__track"
                        ><i
                          class="hbar__fill reject"
                          [style.width.%]="barWidth(h.halts, reasonMax())"
                        ></i
                      ></span>
                      <span class="num">{{ h.halts }}</span>
                    </li>
                  }
                </ul>
                <p class="note">
                  Who can fix them:
                  @for (f of fixers(); track f.actor; let last = $last) {
                    {{ f.label }} {{ f.halts }}{{ last ? '' : ' · ' }}
                  }
                </p>
              }
            </ah-panel-body>
          </ah-panel>
        </div>

        <ah-panel>
          <ah-panel-head
            heading="Where to improve the harness"
            subtitle="Patterns found by fixed rules over the period"
          />
          <ah-panel-body>
            @if (r.insights.length === 0) {
              <ah-empty-state heading="No pattern stands out in this period" />
            } @else {
              <ul class="insights">
                @for (i of r.insights; track i.rule + i.title) {
                  <li class="insight">
                    <strong>{{ i.title }}</strong>
                    <p class="insight__evidence">{{ i.evidence }}</p>
                    <p class="insight__action">{{ i.action }}</p>
                  </li>
                }
              </ul>
            }
          </ah-panel-body>
        </ah-panel>

        <ah-panel>
          <ah-panel-head
            heading="Most common errors"
            subtitle="Run exits, gate failures and halts grouped by message"
          >
            <a class="ah-link" routerLink="/metrics/halts" ahPanelActions
              >All errors</a
            >
          </ah-panel-head>
          @if (topErrors().length === 0) {
            <ah-panel-body
              ><ah-empty-state heading="No errors in this period"
            /></ah-panel-body>
          } @else {
            <div class="scroll">
              <table ahTable>
                <thead>
                  <tr>
                    <th scope="col">Error</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Phase</th>
                    <th scope="col" class="num">Times</th>
                    <th scope="col" class="num">Voyages</th>
                    <th scope="col">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  @for (
                    e of topErrors();
                    track e.source + e.code + e.signature
                  ) {
                    <tr>
                      <td>{{ e.signature }}</td>
                      <td>
                        {{ sourceLabel(e.source) }}
                        <span ahApi>{{ e.code }}</span>
                      </td>
                      <td>
                        <span ahApi>{{ e.phase ?? '—' }}</span>
                      </td>
                      <td class="num">{{ e.times }}</td>
                      <td class="num">{{ e.stories }}</td>
                      <td>{{ e.lastSeen | ahRelative }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </ah-panel>
      </div>
    }
  `,
})
export class MetricsOverview {
  protected readonly store = inject(MetricsStore);
  protected readonly aiu = formatMetricsAiu;
  protected readonly formatPercent = formatPercent;
  protected readonly barWidth = barWidth;

  protected readonly spendChange = computed(() => {
    const now = this.store.report();
    const before = this.store.previous();
    return now === null || before === null
      ? null
      : changeVsPrevious(
          now.totals.nanoAiu,
          before.totals.nanoAiu,
          this.store.period()
        );
  });

  protected readonly chart = computed(() => {
    const r = this.store.report();
    return r === null
      ? { series: [], columns: [] }
      : stackWeeks(
          r.weeks,
          r.phases.map((p) => p.phase)
        );
  });
  protected readonly chartMax = computed(() =>
    Math.max(1, ...this.chart().columns.map((c) => c.total))
  );

  /** Halts per reason, the reason's diagnoses added up, most first. */
  protected readonly reasons = computed(() => {
    const totals = new Map<string, number>();
    for (const h of this.store.report()?.haltReasons ?? [])
      totals.set(h.reason, (totals.get(h.reason) ?? 0) + h.halts);
    return [...totals]
      .map(([reason, halts]) => ({ reason, halts }))
      .sort((a, b) => b.halts - a.halts || a.reason.localeCompare(b.reason));
  });
  protected readonly reasonMax = computed(() =>
    Math.max(1, ...this.reasons().map((r) => r.halts))
  );

  /** Halts per person who can fix them. */
  protected readonly fixers = computed(() => {
    const totals = new Map<string, number>();
    for (const h of this.store.report()?.haltReasons ?? [])
      totals.set(h.actor, (totals.get(h.actor) ?? 0) + h.halts);
    return [...totals].map(([actor, halts]) => ({
      actor,
      label: fixerLabel(actor),
      halts,
    }));
  });

  protected readonly topErrors = computed(() =>
    [...(this.store.report()?.errors ?? [])]
      .sort((a, b) => b.times - a.times)
      .slice(0, TOP_ERRORS)
  );

  protected sourceLabel(source: ErrorSource): string {
    return ERROR_SOURCE_LABELS[source];
  }
}
