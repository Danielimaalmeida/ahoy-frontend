import { Component, computed, inject } from '@angular/core';
import type { MetricsTrends, TrendSignals } from '@core/api/types';
import { stackWeeks, weekLabel } from '@domain/metrics';
import {
  changeLabel,
  formatTrend,
  isTrendSpan,
  lastWeekPartial,
  MIN_VOYAGES,
  RECENT_WEEKS,
  sparkline,
  sparkX,
  TREND_GROUPS,
  TREND_SIGNALS,
  TREND_SPANS,
  trendVerdict,
  versionWeeks,
  weekPosition,
  weekStartLabel,
  type Sparkline,
  type TrendSignal,
  type TrendVerdict,
} from '@domain/metrics-trends';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { SectionTabs, type SectionTab } from '@ui/section-tabs/section-tabs';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Api, Table } from '@ui/table/table';
import { metricsFailure } from './metrics-shell';
import { MetricsStore } from './metrics-store';

/** The view box of a card's sparkline. */
const SPARK_W = 300;
const SPARK_H = 54;

const SPAN_TABS: readonly SectionTab[] = TREND_SPANS.map((weeks) => ({
  id: String(weeks),
  label: `${weeks} weeks`,
}));

/** The words of a verdict on a pill, for screen readers too. */
const VERDICT_WORDS: Readonly<Record<TrendVerdict, string>> = {
  better: 'better',
  worse: 'worse',
  flat: 'about the same',
  none: 'nothing to compare',
};

/** One card: a signal, its value now and before, its verdict and its sparkline. */
interface TrendCard {
  readonly signal: TrendSignal;
  readonly now: string;
  readonly was: string;
  readonly verdict: TrendVerdict;
  readonly change: string;
  readonly verdictWords: string;
  readonly basis: string;
  readonly spark: Sparkline;
}

/** One row of the versions table: a cell per signal, coloured against the version before it. */
interface VersionRow {
  readonly sha: string;
  readonly short: string;
  readonly current: boolean;
  readonly from: string;
  readonly voyages: number;
  readonly cells: readonly {
    readonly id: string;
    readonly text: string;
    readonly verdict: TrendVerdict;
  }[];
}

/** The signals the versions table shows, in its column order. */
const VERSION_COLUMNS = [
  'halts',
  'gatePass',
  'rework',
  'unverified',
  'aiuPerDone',
  'timeToDone',
] as const;

/** A signal by id; every id above is one of `TREND_SIGNALS`, and the domain's tests hold it so. */
function signalOf(id: string): TrendSignal {
  const signal = TREND_SIGNALS.find((s) => s.id === id);
  if (signal === undefined) throw new Error(`No trend signal ${id}`);
  return signal;
}

/** The weeks a window spans, for the per-week signals: 28 days are 4 weeks. */
function weeksOf(from: string, to: string): number {
  return Math.max(1, (Date.parse(to) - Date.parse(from)) / (7 * 86_400_000));
}

/** The cards of a trend, per group. */
function cardsOf(t: MetricsTrends): {
  readonly id: string;
  readonly label: string;
  readonly lede: string;
  readonly cards: readonly TrendCard[];
}[] {
  const recentWeeks = weeksOf(t.recent.from, t.recent.to);
  const previousWeeks = weeksOf(t.previous.from, t.previous.to);
  const partial = lastWeekPartial(
    t.series.map((w) => w.weekStart),
    t.to
  );
  const last = t.series.length - 1;
  // The current week has only its first days: it is drawn faded and named so, never read as a fall.
  const labels = t.series.map(
    (w, i) =>
      `${weekLabel(w.weekStart)}${partial && i === last ? ' (so far)' : ''}`
  );
  const faded = t.series.map(
    (w, i) => w.signals.voyages < MIN_VOYAGES || (partial && i === last)
  );
  return TREND_GROUPS.map((group) => ({
    ...group,
    cards: TREND_SIGNALS.filter((s) => s.group === group.id).map((signal) => {
      const now = signal.value(t.recent.signals, recentWeeks);
      const was = signal.value(t.previous.signals, previousWeeks);
      const { verdict, change } = trendVerdict(now, was, signal.better);
      const values = t.series.map((w) => signal.value(w.signals, 1));
      return {
        signal,
        now: formatTrend(signal.format, now),
        was: formatTrend(signal.format, was),
        verdict,
        change: changeLabel(verdict, change, now, was),
        verdictWords: VERDICT_WORDS[verdict],
        basis: signal.basis(t.recent.signals),
        spark: sparkline(
          values,
          labels.map(
            (l, i) => `${l}: ${formatTrend(signal.format, values[i] ?? null)}`
          ),
          faded,
          SPARK_W,
          SPARK_H
        ),
      };
    }),
  }));
}

/** The versions table: newest first, each cell judged against the next older version. */
function versionRows(t: MetricsTrends): readonly VersionRow[] {
  const value = (id: string, s: TrendSignals) => signalOf(id).value(s, 1);
  return t.versions.map((v, i) => {
    const older = t.versions[i + 1];
    return {
      sha: v.controlSha,
      short: v.controlSha.slice(0, 7),
      current: i === 0,
      from: v.firstRunAt.slice(0, 10),
      voyages: v.signals.voyages,
      cells: VERSION_COLUMNS.map((id) => {
        const signal = signalOf(id);
        const now = value(id, v.signals);
        return {
          id,
          text: formatTrend(signal.format, now),
          verdict: older
            ? trendVerdict(now, value(id, older.signals), signal.better).verdict
            : 'none',
        };
      }),
    };
  });
}

/**
 * Trends: whether the harness is getting better. The signals of the last four weeks against the four before, each with
 * its weekly sparkline, the halts per week by diagnosis, and the signals per harness version. Read-only, 0 AIU.
 */
@Component({
  selector: 'ah-metrics-trends',
  imports: [
    Banner,
    Button,
    EmptyState,
    Panel,
    PanelBody,
    PanelHead,
    SectionTabs,
    Skeleton,
    Table,
    Api,
  ],
  styleUrl: './metrics.scss',
  template: `
    <div class="section">
      <div class="trends__head">
        <p class="ah-muted trends__lede">
          The same signals week by week: the last {{ recentWeeks * 7 }} days
          against the {{ recentWeeks * 7 }} before. A trend always ends today,
          so the period of the other sections does not apply; the owner,
          repository and model filters do.
        </p>
        <ah-section-tabs
          variant="pill"
          label="Weeks"
          [items]="spanTabs"
          [selected]="span()"
          (selectedChange)="chooseSpan($event)"
        />
      </div>

      @if (failure(); as f) {
        <ah-banner variant="error" [heading]="f.heading" [tech]="f.tech">
          Nothing changed in Ahoy.
          <button ahButton size="sm" type="button" (click)="store.loadTrends()">
            Try again
          </button>
        </ah-banner>
      } @else if (store.trends(); as t) {
        @if (noRuns()) {
          <ah-empty-state
            [heading]="'No runs in these ' + t.weeks + ' weeks'"
          />
        } @else {
          <section class="verdict" aria-label="Verdict">
            <div>
              <span class="ah-muted"
                >Last {{ recentWeeks }} weeks against the
                {{ recentWeeks }} before</span
              >
              <strong class="verdict__line">{{ verdict().line }}</strong>
            </div>
            <ul class="verdict__pills">
              <li class="pill pill--better">{{ verdict().better }} better</li>
              <li class="pill pill--worse">{{ verdict().worse }} worse</li>
              <li class="pill pill--flat">{{ verdict().flat }} flat</li>
            </ul>
          </section>
          <p class="note">
            Arrows show which way a number moved; green means that is better for
            the harness, red that it is worse. The shaded band is the last
            {{ recentWeeks * 7 }} days, dashed lines mark a new harness version
            (the control commit the runs used), and weeks with fewer than
            {{ minVoyages }} voyages, and this week so far, are drawn faded.
          </p>

          @for (g of groups(); track g.id) {
            <section class="trend-group" [attr.aria-label]="g.label">
              <h2 class="trend-group__title">
                {{ g.label }} <span class="ah-muted">{{ g.lede }}</span>
              </h2>
              <div class="trend-cards">
                @for (c of g.cards; track c.signal.id) {
                  <article class="trend-card">
                    <div class="trend-card__label">
                      <span>{{ c.signal.label }}</span>
                      <span class="trend-card__better"
                        >{{ c.signal.better }} is better</span
                      >
                    </div>
                    <div class="trend-card__value">
                      <strong>{{ c.now }}</strong>
                      <span
                        class="pill"
                        [class]="'pill pill--' + c.verdict"
                        [attr.aria-label]="c.change + ', ' + c.verdictWords"
                        >{{ c.change }}</span
                      >
                      <span class="ah-muted">was {{ c.was }}</span>
                    </div>
                    <svg
                      class="spark"
                      [attr.viewBox]="'0 0 ' + sparkW + ' ' + sparkH"
                      preserveAspectRatio="none"
                      role="img"
                      [attr.aria-label]="c.signal.label + ' per week'"
                    >
                      <rect
                        class="spark__recent"
                        [attr.x]="band().x"
                        y="0"
                        [attr.width]="band().width"
                        [attr.height]="sparkH"
                      />
                      @for (m of markers(); track m) {
                        <line
                          class="spark__version"
                          [attr.x1]="m"
                          [attr.x2]="m"
                          y1="0"
                          [attr.y2]="sparkH"
                        />
                      }
                      @for (l of c.spark.lines; track $index) {
                        <polyline class="spark__line" [attr.points]="l" />
                      }
                      @for (d of c.spark.dots; track $index) {
                        <circle
                          class="spark__dot"
                          [class.spark__dot--faded]="d.faded"
                          [attr.cx]="d.x"
                          [attr.cy]="d.y"
                          r="2.2"
                        >
                          <title>{{ d.title }}</title>
                        </circle>
                      }
                    </svg>
                    <div class="trend-card__foot">
                      <span>{{ firstWeek() }}</span>
                      <span>{{ c.basis }}</span>
                      <span>{{ lastWeek() }}</span>
                    </div>
                  </article>
                }
              </div>
            </section>
          }

          <ah-panel>
            <ah-panel-head
              heading="Halts per week, by diagnosis"
              subtitle="Which kind of stop is going away"
            />
            <ah-panel-body>
              @if (haltChart().columns.length === 0) {
                <ah-empty-state heading="No halts in these weeks" />
              } @else {
                <ul class="legend" aria-label="Diagnoses">
                  @for (s of haltChart().series; track s.label) {
                    <li class="legend__item">
                      <i class="swatch" [class]="'s' + s.slot"></i
                      ><span ahApi>{{ s.label }}</span>
                    </li>
                  }
                </ul>
                <div class="weeks" aria-hidden="true">
                  @for (c of haltColumns(); track c.label) {
                    <div
                      class="week"
                      [class.week--faded]="c.faded"
                      [class.week--version]="c.version"
                      [title]="c.title"
                    >
                      @for (p of c.parts; track p.slot) {
                        @if (p.value > 0) {
                          <i
                            class="week__part"
                            [class]="'s' + p.slot"
                            [style.height.%]="(p.value / haltMax()) * 100"
                          ></i>
                        }
                      }
                    </div>
                  }
                </div>
                <div class="week-labels" aria-hidden="true">
                  @for (c of haltColumns(); track c.label) {
                    <span>{{ c.short }}</span>
                  }
                </div>
                <details>
                  <summary class="ah-link">View as table</summary>
                  <div class="scroll">
                    <table ahTable>
                      <thead>
                        <tr>
                          <th scope="col">Week</th>
                          <th scope="col" class="num">Voyages</th>
                          @for (s of haltChart().series; track s.label) {
                            <th scope="col" class="num">{{ s.label }}</th>
                          }
                          <th scope="col" class="num">Halts</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (c of haltColumns(); track c.label) {
                          <tr>
                            <th scope="row">{{ c.label }}</th>
                            <td class="num">{{ c.voyages }}</td>
                            @for (p of c.parts; track p.slot) {
                              <td class="num">{{ p.value }}</td>
                            }
                            <td class="num strong">{{ c.total }}</td>
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
              heading="By harness version"
              subtitle="Signals of the runs that used each control commit, against the version before it"
            />
            <ah-panel-body>
              @if (versions().length === 0) {
                <ah-empty-state heading="No runs in these weeks" />
              } @else {
                <div class="scroll">
                  <table ahTable>
                    <thead>
                      <tr>
                        <th scope="col">Version</th>
                        <th scope="col">First run</th>
                        <th scope="col" class="num">Voyages</th>
                        @for (h of versionHeads; track h) {
                          <th scope="col" class="num">{{ h }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (v of versions(); track v.sha) {
                        <tr>
                          <th scope="row" class="nowrap">
                            <span ahApi [title]="v.sha">{{ v.short }}</span>
                            @if (v.current) {
                              <span class="ah-muted"> latest</span>
                            }
                          </th>
                          <td class="nowrap">{{ v.from }}</td>
                          <td class="num">{{ v.voyages }}</td>
                          @for (cell of v.cells; track cell.id) {
                            <td
                              class="num"
                              [class.is-better]="cell.verdict === 'better'"
                              [class.is-worse]="cell.verdict === 'worse'"
                            >
                              {{ cell.text }}
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </ah-panel-body>
          </ah-panel>
        }
      } @else {
        <div
          class="metrics__loading"
          aria-busy="true"
          aria-label="Loading trends"
        >
          <ah-skeleton [height]="72" />
          <ah-skeleton [height]="240" />
        </div>
      }
    </div>
  `,
})
export class MetricsTrendsSection {
  protected readonly store = inject(MetricsStore);
  protected readonly spanTabs = SPAN_TABS;
  protected readonly recentWeeks = RECENT_WEEKS;
  protected readonly minVoyages = MIN_VOYAGES;
  protected readonly sparkW = SPARK_W;
  protected readonly sparkH = SPARK_H;
  protected readonly versionHeads = [
    'Halts / voyage',
    'Gate pass',
    'Rework',
    'Unverified WPs',
    'AIU / done voyage',
    'Time to done',
  ];

  protected readonly span = computed(() => String(this.store.trendSpan()));
  protected readonly failure = computed(() => {
    const error = this.store.trendsError();
    return error === null ? null : metricsFailure(error);
  });

  protected readonly groups = computed(() => {
    const t = this.store.trends();
    return t === null ? [] : cardsOf(t);
  });

  protected readonly verdict = computed(() => {
    const cards = this.groups().flatMap((g) => g.cards);
    const count = (v: TrendVerdict) =>
      cards.filter((c) => c.verdict === v).length;
    const better = count('better');
    const worse = count('worse');
    const flat = count('flat');
    const judged = better + worse + flat;
    const line =
      judged === 0
        ? 'Not enough data to compare yet'
        : `Better on ${better} of ${judged} signals, worse on ${worse}`;
    return { better, worse, flat, line };
  });

  private readonly weekStarts = computed(
    () => this.store.trends()?.series.map((w) => w.weekStart) ?? []
  );

  /** The x of each week a new harness version started in, in the sparklines' box. */
  private readonly versionIndexes = computed(() =>
    versionWeeks(
      this.weekStarts(),
      this.store.trends()?.versions.map((v) => v.firstRunAt) ?? []
    )
  );

  protected readonly markers = computed(() =>
    this.versionIndexes().map((i) =>
      sparkX(i, this.weekStarts().length, SPARK_W)
    )
  );

  /** The shaded band of the recent weeks. */
  /** Nothing ran in any week of the span. */
  protected readonly noRuns = computed(
    () => this.store.trends()?.series.every((w) => w.signals.runs === 0) ?? true
  );

  /** The shaded band of the recent window: from its start (a rolling 28 days, not a Monday) to now. */
  protected readonly band = computed(() => {
    const n = this.weekStarts().length;
    const from = this.store.trends()?.recent.from;
    const at =
      from === undefined
        ? Math.max(0, n - RECENT_WEEKS)
        : weekPosition(this.weekStarts(), from);
    const first = sparkX(at, n, SPARK_W);
    return { x: first, width: SPARK_W - first };
  });

  protected readonly firstWeek = computed(() => {
    const first = this.weekStarts()[0];
    return first === undefined ? '' : weekStartLabel(first);
  });

  protected readonly lastWeek = computed(() => {
    const last = this.weekStarts().at(-1);
    return last === undefined ? '' : weekStartLabel(last);
  });

  protected readonly haltChart = computed(() => {
    const t = this.store.trends();
    if (t === null) return { series: [], columns: [] };
    const totals = new Map<string, number>();
    for (const w of t.series)
      for (const [kind, n] of Object.entries(w.haltsByKind))
        totals.set(kind, (totals.get(kind) ?? 0) + n);
    const order = [...totals]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([kind]) => kind);
    if (order.length === 0) return { series: [], columns: [] };
    return stackWeeks(
      t.series.map((w) => ({ weekStart: w.weekStart, byPhase: w.haltsByKind })),
      order
    );
  });

  protected readonly haltColumns = computed(() => {
    const t = this.store.trends();
    const versions = new Set(this.versionIndexes());
    const partial = t !== null && lastWeekPartial(this.weekStarts(), t.to);
    const last = this.haltChart().columns.length - 1;
    return this.haltChart().columns.map((c, i) => {
      const soFar = partial && i === last;
      const week = t?.series[i];
      const voyages = week?.signals.voyages ?? 0;
      const perVoyage = formatTrend(
        'ratio',
        voyages > 0 ? c.total / voyages : null
      );
      return {
        ...c,
        short: week ? weekStartLabel(week.weekStart) : c.label,
        voyages,
        faded: voyages < MIN_VOYAGES || soFar,
        version: versions.has(i),
        title: `${c.label}${soFar ? ' (so far)' : ''}: ${c.total} halts in ${voyages} voyages (${perVoyage} per voyage)${versions.has(i) ? ', new harness version' : ''}`,
      };
    });
  });

  protected readonly haltMax = computed(() =>
    Math.max(1, ...this.haltChart().columns.map((c) => c.total))
  );

  protected readonly versions = computed(() => {
    const t = this.store.trends();
    return t === null ? [] : versionRows(t);
  });

  constructor() {
    void this.store.ensureTrends();
  }

  protected chooseSpan(id: string | null): void {
    const weeks = Number(id);
    if (isTrendSpan(weeks)) void this.store.setTrendSpan(weeks);
  }
}
