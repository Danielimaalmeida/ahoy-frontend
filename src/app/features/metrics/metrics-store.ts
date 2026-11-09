import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import { ApiClient } from '@core/api/api-client';
import { CLOCK } from '@core/realtime/clock';
import type {
  MetricsFormat,
  MetricsQuery,
  MetricsReport,
  MetricsTable,
  MetricsTrends,
  PlanPanelMetrics,
} from '@core/api/types';
import type { TrendSpan } from '@domain/metrics-trends';
import {
  periodRange,
  previousRange,
  type MetricsPeriod,
} from '@domain/metrics';

/** The filters of the page, as typed: empty means "all". */
export interface MetricsFilters {
  readonly owner: string;
  readonly repo: string;
  readonly model: string;
}

const NO_FILTERS: MetricsFilters = { owner: '', repo: '', model: '' };

/** What the export last did, for the line next to its buttons. */
export type ExportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving'; readonly table: MetricsTable }
  | { readonly kind: 'saved'; readonly filename: string }
  | { readonly kind: 'failed'; readonly error: ApiError };

/**
 * The state of the Metrics pages: the period, the filters, the report of the period and the one before it (for the
 * "vs previous" lines), and the export. Provided by the shell, so every tab reads the same report. Read-only, 0 AIU.
 */
@Injectable()
export class MetricsStore {
  private readonly api = inject(ApiClient);
  private readonly document = inject(DOCUMENT);
  private readonly clock = inject(CLOCK);
  /** Counts loads, so an answer to an older one is dropped. */
  private generation = 0;

  /** The period, in days before now. */
  readonly period = signal<MetricsPeriod>(30);
  /** The filters applied to the report. */
  readonly filters = signal<MetricsFilters>(NO_FILTERS);
  /** The report of the period, once read. */
  readonly report = signal<MetricsReport | null>(null);
  /** The report of the period before, for comparisons; null when it could not be read. */
  readonly previous = signal<MetricsReport | null>(null);
  /** Why the report could not be read. */
  readonly error = signal<ApiError | null>(null);
  /** Whether a load is in flight. */
  readonly loading = signal(false);
  /** What the export last did. */
  readonly exported = signal<ExportState>({ kind: 'idle' });
  /** The models seen in the unfiltered report, for the Model filter. */
  readonly models = signal<readonly string[]>([]);
  /** How the judges rated each model's plans in the period, once read; null before, and while it is read again. */
  readonly planPanels = signal<PlanPanelMetrics | null>(null);
  /** Why the plan panel ratings could not be read; the rest of the page does not depend on them. */
  readonly planPanelsError = signal<ApiError | null>(null);

  /** How many weeks the Trends section reads. */
  readonly trendSpan = signal<TrendSpan>(12);
  /** The trend of those weeks, once read; null before, and while it is read again. */
  readonly trends = signal<MetricsTrends | null>(null);
  /** Why the trend could not be read; the other sections do not depend on it. */
  readonly trendsError = signal<ApiError | null>(null);
  /** Whether the Trends section has been opened, so a change of filters reads the trend again too. */
  private trendsWanted = false;
  /** Counts trend loads, so an answer to an older one is dropped. */
  private trendGeneration = 0;

  /** Whether any filter is set. */
  readonly filtered = computed(() => {
    const f = this.filters();
    return f.owner !== '' || f.repo !== '' || f.model !== '';
  });

  /** Reads the report of the period and of the one before it, and the plan panel ratings of the period. */
  async load(now = this.clock.now()): Promise<void> {
    const generation = ++this.generation;
    const span = periodRange(this.period(), now);
    this.loading.set(true);
    const reports = Promise.all([
      this.api.getMetrics(this.query(span)),
      this.api.getMetrics(this.query(previousRange(span))),
    ]);
    // After the reports are asked for: the ratings are a side section, and a failure of the page's own reads comes first.
    void this.loadPlanPanels(span, generation);
    const [current, before] = await reports;
    if (generation !== this.generation) return;
    this.loading.set(false);
    if (!current.ok) {
      this.error.set(current.error);
      return;
    }
    this.error.set(null);
    this.report.set(current.value);
    this.previous.set(before.ok ? before.value : null);
    if (!this.filtered())
      this.models.set(
        [
          ...new Set(
            current.value.agents
              .map((a) => a.model)
              .filter((m): m is string => m !== null)
          ),
        ].sort()
      );
  }

  /** Changes the period and reads it again. */
  setPeriod(period: MetricsPeriod): Promise<void> {
    this.period.set(period);
    return this.load();
  }

  /** Reads the plan panel ratings of the current period again, after they could not be read. */
  reloadPlanPanels(now = this.clock.now()): Promise<void> {
    return this.loadPlanPanels(
      periodRange(this.period(), now),
      this.generation
    );
  }

  /**
   * Reads the judges' ratings of the period (`getPlanPanelMetrics`). They have no owner, repository or model filter, so
   * the filters do not apply to them. An answer to a read that was replaced meanwhile is dropped.
   */
  private async loadPlanPanels(
    span: { readonly from: string; readonly to: string },
    generation: number
  ): Promise<void> {
    this.planPanels.set(null);
    this.planPanelsError.set(null);
    const result = await this.api.getPlanPanelMetrics({
      from: span.from,
      to: span.to,
    });
    if (generation !== this.generation) return;
    if (result.ok) this.planPanels.set(result.value);
    else this.planPanelsError.set(result.error);
  }

  /** Changes the filters and reads the report again, and the trend when the Trends section was opened. */
  setFilters(filters: MetricsFilters): Promise<void> {
    this.filters.set({
      owner: filters.owner.trim(),
      repo: filters.repo.trim(),
      model: filters.model.trim(),
    });
    return Promise.all([
      this.load(),
      this.trendsWanted ? this.loadTrends() : Promise.resolve(),
    ]).then(() => undefined);
  }

  /**
   * Reads the trend of the chosen weeks (`getMetricsTrends`) with the current filters. The period does not apply: a
   * trend always ends now. An answer to a read that was replaced meanwhile is dropped.
   */
  async loadTrends(): Promise<void> {
    this.trendsWanted = true;
    const generation = ++this.trendGeneration;
    this.trends.set(null);
    this.trendsError.set(null);
    const { owner, repo, model } = this.filters();
    const result = await this.api.getMetricsTrends({
      weeks: this.trendSpan(),
      ...(owner !== '' ? { owner } : {}),
      ...(repo !== '' ? { repo } : {}),
      ...(model !== '' ? { model } : {}),
    });
    if (generation !== this.trendGeneration) return;
    if (result.ok) this.trends.set(result.value);
    else this.trendsError.set(result.error);
  }

  /** Changes how many weeks the trend spans and reads it again. */
  setTrendSpan(span: TrendSpan): Promise<void> {
    this.trendSpan.set(span);
    return this.loadTrends();
  }

  /** Saves one table of rows behind the report, for the current period and filters, as a file. */
  async export(
    table: MetricsTable,
    format: MetricsFormat,
    now = this.clock.now()
  ): Promise<void> {
    this.exported.set({ kind: 'saving', table });
    const result = await this.api.exportMetrics(
      table,
      format,
      this.query(periodRange(this.period(), now))
    );
    if (!result.ok) {
      this.exported.set({ kind: 'failed', error: result.error });
      return;
    }
    const { text, filename, mediaType } = result.value;
    this.save(text, filename, mediaType);
    this.exported.set({ kind: 'saved', filename });
  }

  /** The query of a period with the current filters. */
  private query(span: {
    readonly from: string;
    readonly to: string;
  }): MetricsQuery {
    const { owner, repo, model } = this.filters();
    return {
      from: span.from,
      to: span.to,
      ...(owner !== '' ? { owner } : {}),
      ...(repo !== '' ? { repo } : {}),
      ...(model !== '' ? { model } : {}),
    };
  }

  /** Hands the text to the browser as a download. */
  private save(text: string, filename: string, mediaType: string): void {
    const view = this.document.defaultView;
    if (view === null) return;
    const url = view.URL.createObjectURL(new Blob([text], { type: mediaType }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    this.document.body.append(link);
    link.click();
    link.remove();
    view.URL.revokeObjectURL(url);
  }
}
