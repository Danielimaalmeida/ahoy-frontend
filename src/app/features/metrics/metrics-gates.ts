import { Component, computed, inject } from '@angular/core';
import {
  barWidth,
  formatPercent,
  formatSeconds,
  outcomesLine,
  waitLabel,
} from '@domain/metrics';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Api, Table } from '@ui/table/table';
import { MetricsStore } from './metrics-store';

/** The parts of a gate's outcome bar, in the legend's order. */
const OUTCOME_PARTS = [
  { key: 'pass', label: 'pass' },
  { key: 'fail', label: 'fail or rework' },
  { key: 'rejectOrHalt', label: 'reject or halt' },
  { key: 'error', label: 'tooling error' },
] as const;

/** Gates & human wait: how each automated gate judged, what reviews found, rework rounds and how long people took. */
@Component({
  selector: 'ah-metrics-gates',
  imports: [EmptyState, Panel, PanelBody, PanelHead, Table, Api],
  styleUrl: './metrics.scss',
  template: `
    @if (store.report(); as r) {
      <div class="section">
        <div class="kpis">
          <div class="kpi">
            <span class="kpi__label">Gate pass on first run</span>
            <span class="kpi__value">{{
              percent(r.totals.gatePasses, r.totals.gateEvaluations)
            }}</span>
            <span class="kpi__note"
              >{{ r.totals.gatePasses }} of
              {{ r.totals.gateEvaluations }} evaluations</span
            >
          </div>
          <div class="kpi">
            <span class="kpi__label">Rework rounds per finished voyage</span>
            <span class="kpi__value"
              >{{ reworkMedian() ?? '—' }}
              <span class="kpi__unit">median</span></span
            >
            <span class="kpi__note">max {{ reworkMax() ?? '—' }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__label">Slowest wait on a person (median)</span>
            <span class="kpi__value">{{
              seconds(slowest()?.medianSeconds ?? null)
            }}</span>
            <span class="kpi__note">{{
              slowest() === null ? 'Nobody was waited on' : slowestLabel()
            }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__label">Tooling errors</span>
            <span class="kpi__value">{{ r.totals.gateErrors }}</span>
            <span class="kpi__note">never counted as a failure</span>
          </div>
        </div>

        <ah-panel>
          <ah-panel-head
            heading="Automated gates"
            subtitle="One evaluation per agent run"
          >
            <ul class="legend" ahPanelActions aria-label="Outcomes">
              @for (o of outcomeParts; track o.key) {
                <li class="legend__item">
                  <i class="swatch" [class]="partClass(o.key)"></i>{{ o.label }}
                </li>
              }
            </ul>
          </ah-panel-head>
          @if (r.gates.length === 0) {
            <ah-panel-body
              ><ah-empty-state heading="No gate ran in this period"
            /></ah-panel-body>
          } @else {
            <div class="scroll">
              <table ahTable>
                <thead>
                  <tr>
                    <th scope="col">Gate</th>
                    <th scope="col">Phase</th>
                    <th scope="col" class="num">Runs</th>
                    <th scope="col">Outcomes</th>
                    <th scope="col" class="num">Pass</th>
                    <th scope="col" class="num">Fail / rework</th>
                    <th scope="col" class="num">Reject / halt</th>
                    <th scope="col" class="num">Error</th>
                    <th scope="col">Top failure</th>
                  </tr>
                </thead>
                <tbody>
                  @for (g of r.gates; track g.gate + g.phase) {
                    <tr>
                      <th scope="row">
                        <span ahApi>{{ g.gate }}</span>
                      </th>
                      <td>
                        <span ahApi>{{ g.phase }}</span>
                      </td>
                      <td class="num">{{ g.runs }}</td>
                      <td>
                        <span class="outcomes" aria-hidden="true">
                          @for (o of outcomeParts; track o.key) {
                            @if (g[o.key] > 0) {
                              <i
                                class="outcomes__part"
                                [class]="partClass(o.key)"
                                [style.flex]="g[o.key]"
                              ></i>
                            }
                          }
                        </span>
                      </td>
                      <td class="num">{{ g.pass }}</td>
                      <td
                        class="num"
                        [class.strong]="g.fail * 4 >= g.runs && g.fail > 0"
                      >
                        {{ g.fail }}
                      </td>
                      <td class="num">{{ g.rejectOrHalt }}</td>
                      <td class="num">{{ g.error }}</td>
                      <td>
                        @if (g.topFailure; as f) {
                          {{ f.signature }} ({{ f.times }})
                        } @else {
                          —
                        }
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
            <ah-panel-head
              heading="Review findings by severity"
              [subtitle]="findingsTotal() + ' findings'"
            />
            <ah-panel-body>
              @if (r.findings.length === 0) {
                <ah-empty-state heading="No review findings in this period" />
              } @else {
                <ul class="hbars">
                  @for (f of r.findings; track f.severity) {
                    <li class="hbar">
                      <span ahApi>{{ f.severity }}</span>
                      <span class="hbar__track"
                        ><i
                          class="hbar__fill fail"
                          [style.width.%]="barWidth(f.count, findingsMax())"
                        ></i
                      ></span>
                      <span class="num">{{ f.count }}</span>
                    </li>
                  }
                </ul>
              }
            </ah-panel-body>
          </ah-panel>
          <ah-panel>
            <ah-panel-head
              heading="Rework rounds per finished voyage"
              [subtitle]="reworkVoyages() + ' voyages'"
            />
            <ah-panel-body>
              @if (r.reworkRounds.length === 0) {
                <ah-empty-state heading="No voyage finished in this period" />
              } @else {
                <ul class="hbars">
                  @for (w of r.reworkRounds; track w.rounds) {
                    <li class="hbar">
                      <span
                        >{{ w.rounds }}
                        {{ w.rounds === 1 ? 'round' : 'rounds' }}</span
                      >
                      <span class="hbar__track"
                        ><i
                          class="hbar__fill"
                          [style.width.%]="
                            barWidth(w.stories, reworkStoriesMax())
                          "
                        ></i
                      ></span>
                      <span class="num">{{ w.stories }}</span>
                    </li>
                  }
                </ul>
              }
            </ah-panel-body>
          </ah-panel>
        </div>

        <ah-panel>
          <ah-panel-head
            heading="Human gates and waiting time"
            subtitle="From the moment a voyage needs a person until someone acts"
          />
          @if (r.waits.length === 0) {
            <ah-panel-body
              ><ah-empty-state heading="Nobody was waited on in this period"
            /></ah-panel-body>
          } @else {
            <div class="scroll">
              <table ahTable>
                <thead>
                  <tr>
                    <th scope="col">Waiting for</th>
                    <th scope="col" class="num">Times</th>
                    <th scope="col">Outcome</th>
                    <th scope="col" class="num">Median wait</th>
                    <th scope="col" class="num">p90 wait</th>
                    <th scope="col" class="num">Waiting now</th>
                    <th scope="col" class="num">Longest now</th>
                  </tr>
                </thead>
                <tbody>
                  @for (w of r.waits; track w.kind + (w.gate ?? '')) {
                    <tr>
                      <th scope="row">
                        {{ wait(w.kind, w.gate) }}
                        @if (w.gate !== null) {
                          <span ahApi>{{ w.gate }}</span>
                        }
                      </th>
                      <td class="num">{{ w.times }}</td>
                      <td>{{ outcomes(w.outcomes) }}</td>
                      <td class="num">{{ seconds(w.medianSeconds) }}</td>
                      <td class="num">{{ seconds(w.p90Seconds) }}</td>
                      <td class="num">{{ w.waitingNow }}</td>
                      <td class="num">{{ seconds(w.longestNowSeconds) }}</td>
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
export class MetricsGates {
  protected readonly store = inject(MetricsStore);
  protected readonly percent = formatPercent;
  protected readonly seconds = formatSeconds;
  protected readonly barWidth = barWidth;
  protected readonly wait = waitLabel;
  protected readonly outcomes = outcomesLine;
  protected readonly outcomeParts = OUTCOME_PARTS;

  protected partClass(key: (typeof OUTCOME_PARTS)[number]['key']): string {
    return key === 'rejectOrHalt' ? 'reject' : key;
  }

  protected readonly findingsTotal = computed(() =>
    (this.store.report()?.findings ?? []).reduce((sum, f) => sum + f.count, 0)
  );
  protected readonly findingsMax = computed(() =>
    Math.max(1, ...(this.store.report()?.findings ?? []).map((f) => f.count))
  );

  private readonly rounds = computed(() =>
    [...(this.store.report()?.reworkRounds ?? [])].sort(
      (a, b) => a.rounds - b.rounds
    )
  );
  protected readonly reworkVoyages = computed(() =>
    this.rounds().reduce((sum, w) => sum + w.stories, 0)
  );
  protected readonly reworkStoriesMax = computed(() =>
    Math.max(1, ...this.rounds().map((w) => w.stories))
  );
  protected readonly reworkMax = computed(
    () => this.rounds().at(-1)?.rounds ?? null
  );
  /** The median number of rounds (nearest rank, as the API computes its medians). */
  protected readonly reworkMedian = computed(() => {
    const rank = Math.ceil(this.reworkVoyages() / 2);
    let seen = 0;
    for (const w of this.rounds()) {
      seen += w.stories;
      if (seen >= rank && rank > 0) return w.rounds;
    }
    return null;
  });

  /** The wait with the longest median. */
  protected readonly slowest = computed(() => {
    let slowest: {
      kind: string;
      gate: string | null;
      medianSeconds: number;
    } | null = null;
    for (const w of this.store.report()?.waits ?? [])
      if (
        w.medianSeconds !== null &&
        (slowest === null || w.medianSeconds > slowest.medianSeconds)
      )
        slowest = {
          kind: w.kind,
          gate: w.gate,
          medianSeconds: w.medianSeconds,
        };
    return slowest;
  });
  protected readonly slowestLabel = computed(() => {
    const s = this.slowest();
    return s === null ? '' : `${waitLabel(s.kind, s.gate)} is the slowest`;
  });
}
