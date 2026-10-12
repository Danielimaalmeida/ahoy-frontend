import { Component, computed, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { isUnreachable, type ApiError } from '@core/api/api-error';
import {
  METRICS_TABLES,
  type MetricsFormat,
  type MetricsTable,
} from '@core/api/types';
import { isMetricsPeriod, METRICS_PERIODS } from '@domain/metrics';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { SectionTabs, type SectionTab } from '@ui/section-tabs/section-tabs';
import { Skeleton } from '@ui/skeleton/skeleton';
import { MetricsStore } from './metrics-store';

/** The sections of the Metrics page, one route each. */
export const METRICS_SECTIONS: readonly SectionTab[] = [
  { id: 'overview', label: 'Overview', link: '/metrics', exact: true },
  { id: 'cost', label: 'Cost', link: '/metrics/cost' },
  { id: 'halts', label: 'Halts & errors', link: '/metrics/halts' },
  { id: 'gates', label: 'Gates & human wait', link: '/metrics/gates' },
];

const PERIOD_TABS: readonly SectionTab[] = METRICS_PERIODS.map((days) => ({
  id: String(days),
  label: `Last ${days} days`,
}));

/** The words of each export table in the select. */
const TABLE_LABELS: Readonly<Record<MetricsTable, string>> = {
  runs: 'Runs',
  halts: 'Halts',
  gates: 'Gate verdicts',
  errors: 'Errors',
};

/** Why the metrics could not be read, in words. A tooling failure is never a verdict about the harness. */
export function metricsFailure(error: ApiError): {
  readonly heading: string;
  readonly tech: string;
} {
  switch (error.kind) {
    case 'invalid_response':
      return {
        heading:
          'Ahoy sent metrics this page cannot read, so it shows none rather than guess',
        tech: `invalid_response · ${error.what}`,
      };
    case 'network':
      return {
        heading: "Can't reach Ahoy",
        tech:
          error.status === undefined ? 'network' : `${error.status} · network`,
      };
    case 'problem':
      return {
        heading:
          error.status === 401
            ? 'Sign-in needed'
            : isUnreachable(error)
              ? "Can't reach Ahoy"
              : (error.detail ?? error.title),
        tech: `${error.status} · ${error.code}`,
      };
  }
}

/**
 * Metrics: where the harness spends AIU, where voyages stop and which errors repeat. The shell holds the period, the
 * filters and the export, and provides the `MetricsStore` its four sections read. Read-only, 0 AIU.
 */
@Component({
  selector: 'ah-metrics-shell',
  imports: [
    ReactiveFormsModule,
    RouterOutlet,
    Banner,
    Button,
    SectionTabs,
    Skeleton,
  ],
  providers: [MetricsStore],
  styleUrl: './metrics.scss',
  template: `
    <div class="metrics">
      <header class="metrics__head">
        <div>
          <h1 class="metrics__title">Metrics</h1>
          <p class="ah-muted metrics__lede">
            Where the harness spends AIU, where voyages stop and which errors
            repeat. Read-only, built from runs, gates and events.
          </p>
        </div>
        <div class="metrics__export" role="group" aria-label="Export">
          <select
            class="ah-input metrics__select"
            aria-label="Table to export"
            [formControl]="table"
          >
            @for (t of tables; track t) {
              <option [value]="t">{{ tableLabels[t] }}</option>
            }
          </select>
          <button
            ahButton
            size="sm"
            type="button"
            [disabled]="saving()"
            (click)="exportAs('csv')"
          >
            Export CSV
          </button>
          <button
            ahButton
            size="sm"
            type="button"
            [disabled]="saving()"
            (click)="exportAs('json')"
          >
            Export JSON
          </button>
        </div>
      </header>

      <div class="metrics__filters">
        <ah-section-tabs
          variant="pill"
          label="Period"
          [items]="periodTabs"
          [selected]="period()"
          (selectedChange)="choosePeriod($event)"
        />
        <form
          class="metrics__form"
          [formGroup]="filters"
          (ngSubmit)="applyFilters()"
        >
          <input
            class="ah-input metrics__text"
            type="text"
            aria-label="Owner"
            placeholder="Owner: everyone"
            formControlName="owner"
          />
          <input
            class="ah-input metrics__text"
            type="text"
            aria-label="Repository"
            placeholder="Repository: all"
            formControlName="repo"
          />
          <select
            class="ah-input metrics__select"
            aria-label="Model"
            formControlName="model"
          >
            <option value="">Model: all</option>
            @for (m of store.models(); track m) {
              <option [value]="m">{{ m }}</option>
            }
          </select>
          <button ahButton size="sm" type="submit">Apply</button>
        </form>
      </div>

      <p class="metrics__status" role="status">{{ exportLine() }}</p>

      <ah-section-tabs label="Metrics sections" [items]="sections" />

      @if (failure(); as f) {
        <ah-banner variant="error" [heading]="f.heading" [tech]="f.tech">
          Nothing changed in Ahoy.
          <button ahButton size="sm" type="button" (click)="store.load()">
            Try again
          </button>
        </ah-banner>
      } @else if (store.report() === null) {
        <div
          class="metrics__loading"
          aria-busy="true"
          aria-label="Loading metrics"
        >
          <ah-skeleton [height]="88" />
          <ah-skeleton [height]="240" />
        </div>
      } @else {
        <router-outlet />
      }
    </div>
  `,
})
export class MetricsShell {
  protected readonly store = inject(MetricsStore);
  protected readonly sections = METRICS_SECTIONS;
  protected readonly periodTabs = PERIOD_TABS;
  protected readonly tables = METRICS_TABLES;
  protected readonly tableLabels = TABLE_LABELS;

  protected readonly table = new FormControl<MetricsTable>('runs', {
    nonNullable: true,
  });
  protected readonly filters = new FormGroup({
    owner: new FormControl('', { nonNullable: true }),
    repo: new FormControl('', { nonNullable: true }),
    model: new FormControl('', { nonNullable: true }),
  });

  protected readonly period = computed(() => String(this.store.period()));
  protected readonly failure = computed(() => {
    const error = this.store.error();
    return error === null ? null : metricsFailure(error);
  });
  protected readonly saving = computed(
    () => this.store.exported().kind === 'saving'
  );
  protected readonly exportLine = computed(() => {
    const state = this.store.exported();
    switch (state.kind) {
      case 'idle':
        return '';
      case 'saving':
        return `Exporting ${TABLE_LABELS[state.table].toLowerCase()}…`;
      case 'saved':
        return `Saved ${state.filename}. Story text and agent output are not included.`;
      case 'failed':
        return `The export failed: ${metricsFailure(state.error).heading}.`;
    }
  });

  constructor() {
    void this.store.load();
  }

  protected choosePeriod(id: string | null): void {
    const days = Number(id);
    if (isMetricsPeriod(days)) void this.store.setPeriod(days);
  }

  protected applyFilters(): void {
    void this.store.setFilters(this.filters.getRawValue());
  }

  protected exportAs(format: MetricsFormat): void {
    void this.store.export(this.table.value, format);
  }
}
