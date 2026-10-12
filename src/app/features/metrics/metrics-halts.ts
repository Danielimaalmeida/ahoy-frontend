import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  changeVsPrevious,
  ERROR_SOURCE_LABELS,
  ERROR_SOURCES,
  fixerLabel,
  formatMetricsAiu,
  formatPercent,
  formatSeconds,
  type ErrorSource,
} from '@domain/metrics';
import { EmptyState } from '@ui/empty-state/empty-state';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { SectionTabs, type SectionTab } from '@ui/section-tabs/section-tabs';
import { Api, Key, Table } from '@ui/table/table';
import { MetricsStore } from './metrics-store';

/** Halts & errors: why voyages halted, which halts a Resume did not fix, and the errors grouped by message. */
@Component({
  selector: 'ah-metrics-halts',
  imports: [
    RouterLink,
    RelativePipe,
    EmptyState,
    Panel,
    PanelBody,
    PanelHead,
    SectionTabs,
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
            <span class="kpi__label">Halts</span>
            <span class="kpi__value"
              >{{ r.totals.halts }}
              <span class="kpi__unit"
                >in {{ r.totals.haltedStories }} voyages</span
              ></span
            >
            <span class="kpi__note">{{
              haltChange() ?? 'No earlier period to compare'
            }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__label">Halted until resumed (median)</span>
            <span class="kpi__value">{{
              seconds(resumeWait()?.medianSeconds ?? null)
            }}</span>
            <span class="kpi__note"
              >p90 {{ seconds(resumeWait()?.p90Seconds ?? null) }} ·
              {{ resumeWait()?.waitingNow ?? 0 }} still halted</span
            >
          </div>
          <div class="kpi">
            <span class="kpi__label">Fixed by the first Resume</span>
            <span class="kpi__value">{{ fixedShare() }}</span>
            <span class="kpi__note"
              >the rest halted again with the same diagnosis or were not
              resumed</span
            >
          </div>
          <div class="kpi">
            <span class="kpi__label">Halted again, same cause</span>
            <span class="kpi__value"
              >{{ r.repeatHalts.length }}
              <span class="kpi__unit">voyages</span></span
            >
            <span class="kpi__note">{{ repeatNote() }}</span>
          </div>
        </div>

        <ah-panel>
          <ah-panel-head
            heading="Halts by reason"
            subtitle="Cause and fix come from the same rules as the voyage's Diagnosis tab"
          />
          @if (r.haltReasons.length === 0) {
            <ah-panel-body
              ><ah-empty-state heading="No halts in this period"
            /></ah-panel-body>
          } @else {
            <div class="scroll">
              <table ahTable>
                <thead>
                  <tr>
                    <th scope="col">Halt reason</th>
                    <th scope="col">Diagnosis</th>
                    <th scope="col" class="num">Halts</th>
                    <th scope="col" class="num">Voyages</th>
                    <th scope="col" class="num">Fixed by 1st Resume</th>
                    <th scope="col" class="num">Median halted</th>
                    <th scope="col">Who fixes it</th>
                    <th scope="col">What fixes it</th>
                  </tr>
                </thead>
                <tbody>
                  @for (h of r.haltReasons; track h.reason + h.kind) {
                    <tr>
                      <th scope="row">
                        <span ahApi>{{ h.reason }}</span>
                      </th>
                      <td>
                        <span ahApi>{{ h.kind }}</span>
                      </td>
                      <td class="num">{{ h.halts }}</td>
                      <td class="num">{{ h.stories }}</td>
                      <td class="num">
                        {{ percent(h.fixedByFirstResume, h.resumed) }}
                      </td>
                      <td class="num">{{ seconds(h.medianHaltedSeconds) }}</td>
                      <td>{{ fixer(h.actor) }}</td>
                      <td>{{ h.action }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </ah-panel>

        <ah-panel>
          <ah-panel-head
            heading="Halted again after Resume"
            subtitle="Same diagnosis twice or more in a row: the Resume did not fix the cause"
          />
          @if (r.repeatHalts.length === 0) {
            <ah-panel-body
              ><ah-empty-state
                heading="No voyage halted twice for the same cause"
            /></ah-panel-body>
          } @else {
            <div class="scroll">
              <table ahTable>
                <thead>
                  <tr>
                    <th scope="col">Voyage</th>
                    <th scope="col">Diagnosis</th>
                    <th scope="col" class="num">Halts</th>
                    <th scope="col" class="num">Resumes</th>
                    <th scope="col" class="num">AIU between halts</th>
                    <th scope="col">Now</th>
                  </tr>
                </thead>
                <tbody>
                  @for (h of r.repeatHalts; track h.storyKey + h.kind) {
                    <tr>
                      <th scope="row">
                        <a ahKey [routerLink]="['/voyages', h.storyKey]">{{
                          h.storyKey
                        }}</a>
                      </th>
                      <td>
                        <span ahApi>{{ h.kind }}</span>
                      </td>
                      <td class="num">{{ h.halts }}</td>
                      <td class="num">{{ h.resumes }}</td>
                      <td class="num">{{ aiu(h.nanoAiuBetween) }}</td>
                      <td>
                        <span ahApi>{{ h.status }}</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </ah-panel>

        <ah-panel>
          <ah-panel-head heading="Common errors">
            <ah-section-tabs
              variant="pill"
              label="Kind of error"
              [items]="sourceTabs()"
              [selected]="source()"
              (selectedChange)="source.set($event ?? 'all')"
            />
          </ah-panel-head>
          @if (errors().length === 0) {
            <ah-panel-body
              ><ah-empty-state heading="No errors of this kind in this period"
            /></ah-panel-body>
          } @else {
            <div class="scroll">
              <table ahTable>
                <thead>
                  <tr>
                    <th scope="col">Error (grouped by message)</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Phase</th>
                    <th scope="col">Agent</th>
                    <th scope="col" class="num">Times</th>
                    <th scope="col" class="num">Voyages</th>
                    <th scope="col">First seen</th>
                    <th scope="col">Last seen</th>
                    <th scope="col">Example</th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of errors(); track e.source + e.code + e.signature) {
                    <tr>
                      <td>{{ e.signature }}</td>
                      <td>
                        {{ sourceLabel(e.source) }}
                        <span ahApi>{{ e.code }}</span>
                      </td>
                      <td>
                        <span ahApi>{{ e.phase ?? '—' }}</span>
                      </td>
                      <td>{{ e.agent ?? '—' }}</td>
                      <td class="num">{{ e.times }}</td>
                      <td class="num">{{ e.stories }}</td>
                      <td>{{ e.firstSeen | ahRelative }}</td>
                      <td>{{ e.lastSeen | ahRelative }}</td>
                      <td>
                        @if (e.exampleRunId !== null) {
                          <a
                            ahKey
                            [routerLink]="[
                              '/voyages',
                              e.exampleStory,
                              'runs',
                              e.exampleRunId,
                            ]"
                            >{{ e.exampleStory }}</a
                          >
                        } @else {
                          <a
                            ahKey
                            [routerLink]="['/voyages', e.exampleStory]"
                            >{{ e.exampleStory }}</a
                          >
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <ah-panel-body>
            <p class="note">
              A tooling error is never counted as a gate failure. Messages are
              agent and tool text, shown as plain text.
            </p>
          </ah-panel-body>
        </ah-panel>
      </div>
    }
  `,
})
export class MetricsHalts {
  protected readonly store = inject(MetricsStore);
  protected readonly aiu = formatMetricsAiu;
  protected readonly percent = formatPercent;
  protected readonly seconds = formatSeconds;
  protected readonly fixer = fixerLabel;

  /** The kind of error shown: `all` or an `ErrorSource`. */
  protected readonly source = signal<string>('all');

  protected readonly haltChange = computed(() => {
    const now = this.store.report();
    const before = this.store.previous();
    return now === null || before === null
      ? null
      : changeVsPrevious(
          now.totals.halts,
          before.totals.halts,
          this.store.period()
        );
  });

  protected readonly resumeWait = computed(
    () => this.store.report()?.waits.find((w) => w.kind === 'resume') ?? null
  );

  protected readonly fixedShare = computed(() => {
    const reasons = this.store.report()?.haltReasons ?? [];
    const fixed = reasons.reduce((sum, h) => sum + h.fixedByFirstResume, 0);
    const resumed = reasons.reduce((sum, h) => sum + h.resumed, 0);
    return formatPercent(fixed, resumed);
  });

  protected readonly repeatNote = computed(() => {
    const repeats = this.store.report()?.repeatHalts ?? [];
    const halts = repeats.reduce((sum, h) => sum + h.halts, 0);
    const between = repeats.reduce((sum, h) => sum + h.nanoAiuBetween, 0);
    return `${halts} halts · ${formatMetricsAiu(between)} AIU spent between them`;
  });

  protected readonly sourceTabs = computed((): readonly SectionTab[] => {
    const errors = this.store.report()?.errors ?? [];
    return [
      { id: 'all', label: 'All', count: errors.length },
      ...ERROR_SOURCES.map((s) => ({
        id: s,
        label: ERROR_SOURCE_LABELS[s],
        count: errors.filter((e) => e.source === s).length,
      })),
    ];
  });

  protected readonly errors = computed(() => {
    const source = this.source();
    return (this.store.report()?.errors ?? [])
      .filter((e) => source === 'all' || e.source === source)
      .sort(
        (a, b) => b.times - a.times || b.lastSeen.localeCompare(a.lastSeen)
      );
  });

  protected sourceLabel(source: ErrorSource): string {
    return ERROR_SOURCE_LABELS[source];
  }
}
