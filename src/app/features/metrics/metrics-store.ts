import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import { ApiClient } from '@core/api/api-client';
import { CLOCK } from '@core/realtime/clock';
import type {
  MetricsFormat,
  MetricsQuery,
  MetricsReport,
  MetricsTable,
} from '@core/api/types';
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

  /** Whether any filter is set. */
  readonly filtered = computed(() => {
    const f = this.filters();
    return f.owner !== '' || f.repo !== '' || f.model !== '';
  });

  /** Reads the report of the period and of the one before it. */
  async load(now = this.clock.now()): Promise<void> {
    const generation = ++this.generation;
    const span = periodRange(this.period(), now);
    this.loading.set(true);
    const [current, before] = await Promise.all([
      this.api.getMetrics(this.query(span)),
      this.api.getMetrics(this.query(previousRange(span))),
    ]);
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

  /** Changes the filters and reads the report again. */
  setFilters(filters: MetricsFilters): Promise<void> {
    this.filters.set({
      owner: filters.owner.trim(),
      repo: filters.repo.trim(),
      model: filters.model.trim(),
    });
    return this.load();
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
