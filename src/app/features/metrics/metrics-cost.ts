import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  barWidth,
  changeVsPrevious,
  formatMetricsAiu,
  formatPercent,
  formatSeconds,
  formatTokens,
  percentOf,
} from '@domain/metrics';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Api, Key, Table } from '@ui/table/table';
import { MetricsStore } from './metrics-store';

/** A voyage is near its cap from this share of its budget spent. */
const NEAR_CAP_PERCENT = 90;

/** Cost: AIU by phase, by agent and model, how runs ended and the voyages that spent most. */
@Component({
  selector: 'ah-metrics-cost',
  imports: [
    RouterLink,
    EmptyState,
    Panel,
    PanelBody,
    PanelHead,
    Table,
    Api,
    Key,
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
              spendChange() ?? 'No earlier period to compare'
            }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__label">Runs</span>
            <span class="kpi__value">{{ r.totals.runs }}</span>
            <span class="kpi__note"
              >{{ r.totals.runsSucceeded }} succeeded ·
              {{ r.totals.runs - r.totals.runsSucceeded }} ended otherwise</span
            >
          </div>
          <div class="kpi">
            <span class="kpi__label">Tokens</span>
            <span class="kpi__value"
              >{{ tokens(r.totals.inputTokens) }}
              <span class="kpi__unit">in</span></span
            >
            <span class="kpi__note"
              >{{ tokens(r.totals.outputTokens) }} out</span
            >
          </div>
          <div class="kpi">
            <span class="kpi__label">Voyages near their cap</span>
            <span class="kpi__value">{{ nearCap().length }}</span>
            <span class="kpi__note">{{ nearCapNote() }}</span>
          </div>
        </div>

        <ah-panel>
          <ah-panel-head
            heading="By phase"
            subtitle="Run cap is the per-run AIU budget the phase gives a run"
          />
          @if (r.phases.length === 0) {
            <ah-panel-body
              ><ah-empty-state heading="No runs in this period"
            /></ah-panel-body>
          } @else {
            <div class="scroll">
              <table ahTable>
                <thead>
                  <tr>
                    <th scope="col">Phase</th>
                    <th scope="col" class="num">Runs</th>
                    <th scope="col" class="num">AIU</th>
                    <th scope="col" class="num">Share</th>
                    <th scope="col" class="num">Median / run</th>
                    <th scope="col" class="num">p90 / run</th>
                    <th scope="col" class="num">Run cap</th>
                    <th scope="col" class="num">Runs at cap</th>
                    <th scope="col" class="num">Median duration</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of r.phases; track p.phase) {
                    <tr>
                      <th scope="row">
                        <span ahApi>{{ p.phase }}</span>
                      </th>
                      <td class="num">{{ p.runs }}</td>
                      <td class="num">{{ aiu(p.nanoAiu) }}</td>
                      <td class="num">
                        {{ percent(p.nanoAiu, r.totals.nanoAiu) }}
                      </td>
                      <td class="num">{{ aiu(p.medianNanoAiu) }}</td>
                      <td class="num">{{ aiu(p.p90NanoAiu) }}</td>
                      <td class="num">{{ aiu(p.runCapNanoAiu) }}</td>
                      <td class="num" [class.strong]="p.runsAtCap > 0">
                        {{ p.runsAtCap }}
                      </td>
                      <td class="num">
                        {{ seconds(p.medianDurationSeconds) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </ah-panel>

        <div class="two">
          <ah-panel>
            <ah-panel-head heading="By agent and model" />
            @if (r.agents.length === 0) {
              <ah-panel-body
                ><ah-empty-state heading="No runs in this period"
              /></ah-panel-body>
            } @else {
              <div class="scroll">
                <table ahTable>
                  <thead>
                    <tr>
                      <th scope="col">Agent</th>
                      <th scope="col">Model</th>
                      <th scope="col" class="num">Runs</th>
                      <th scope="col" class="num">AIU</th>
                      <th scope="col" class="num">Median</th>
                      <th scope="col" class="num">Not succeeded</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (a of r.agents; track a.agent + (a.model ?? '')) {
                      <tr>
                        <th scope="row">{{ a.agent }}</th>
                        <td>
                          <span ahApi>{{ a.model ?? 'profile default' }}</span>
                        </td>
                        <td class="num">{{ a.runs }}</td>
                        <td class="num">{{ aiu(a.nanoAiu) }}</td>
                        <td class="num">{{ aiu(a.medianNanoAiu) }}</td>
                        <td class="num">
                          {{ percent(a.notSucceeded, a.runs) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </ah-panel>

          <ah-panel>
            <ah-panel-head
              heading="How runs ended"
              [subtitle]="r.totals.runs + ' runs'"
            />
            <ah-panel-body>
              @if (r.runOutcomes.length === 0) {
                <ah-empty-state heading="No runs in this period" />
              } @else {
                <ul class="hbars">
                  @for (o of r.runOutcomes; track o.status) {
                    <li class="hbar">
                      <span ahApi>{{ o.status }}</span>
                      <span class="hbar__track"
                        ><i
                          class="hbar__fill"
                          [class.pass]="o.status === 'succeeded'"
                          [style.width.%]="barWidth(o.runs, outcomeMax())"
                        ></i
                      ></span>
                      <span class="num">{{ o.runs }}</span>
                    </li>
                  }
                </ul>
                <p class="note">
                  awaiting_input is a normal end: the agent asked questions.
                </p>
              }
            </ah-panel-body>
          </ah-panel>
        </div>

        <ah-panel>
          <ah-panel-head
            heading="Voyages by spend"
            subtitle="The most AIU spent in the period"
          />
          @if (r.topStories.length === 0) {
            <ah-panel-body
              ><ah-empty-state heading="No voyage spent AIU in this period"
            /></ah-panel-body>
          } @else {
            <div class="scroll">
              <table ahTable>
                <thead>
                  <tr>
                    <th scope="col">Voyage</th>
                    <th scope="col">Phase now</th>
                    <th scope="col" class="num">In the period</th>
                    <th scope="col" class="num">Spent / cap (AIU)</th>
                    <th scope="col" class="num">Runs</th>
                    <th scope="col">Most spent in</th>
                    <th scope="col" class="num">Halts</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of r.topStories; track s.key) {
                    <tr>
                      <th scope="row">
                        <a ahKey [routerLink]="['/voyages', s.key]">{{
                          s.key
                        }}</a>
                      </th>
                      <td>
                        <span ahApi>{{ s.phase }}</span>
                      </td>
                      <td class="num">{{ aiu(s.periodNanoAiu) }}</td>
                      <td class="num">
                        {{ aiu(s.spentNanoAiu) }} / {{ aiu(s.budgetNanoAiu) }}
                      </td>
                      <td class="num">{{ s.runs }}</td>
                      <td>
                        <span ahApi>{{ s.topPhase }}</span>
                        {{ aiu(s.topPhaseNanoAiu) }}
                      </td>
                      <td class="num">{{ s.halts }}</td>
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
export class MetricsCost {
  protected readonly store = inject(MetricsStore);
  protected readonly aiu = formatMetricsAiu;
  protected readonly percent = formatPercent;
  protected readonly seconds = formatSeconds;
  protected readonly tokens = formatTokens;
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

  /** The voyages among the top spenders that have spent 90% of their budget or more. */
  protected readonly nearCap = computed(() =>
    (this.store.report()?.topStories ?? []).filter(
      (s) =>
        (percentOf(s.spentNanoAiu, s.budgetNanoAiu) ?? 0) >= NEAR_CAP_PERCENT
    )
  );
  protected readonly nearCapNote = computed(() => {
    const keys = this.nearCap().map((s) => s.key);
    return keys.length === 0
      ? `None above ${NEAR_CAP_PERCENT}%`
      : `Above ${NEAR_CAP_PERCENT}%: ${keys.join(', ')}`;
  });

  protected readonly outcomeMax = computed(() =>
    Math.max(1, ...(this.store.report()?.runOutcomes ?? []).map((o) => o.runs))
  );
}
