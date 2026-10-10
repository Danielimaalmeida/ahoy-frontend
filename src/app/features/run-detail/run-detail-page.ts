import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiClient } from '@core/api/api-client';
import { isNotFound } from '@core/api/api-error';
import { apiErrorView } from '@core/commands/command-error';
import { RunProgressBuffer } from '@core/stores/run-progress-buffer';
import { StoreResource } from '@core/stores/resource';
import { StoryStore, type StoryHandle } from '@core/stores/story-store';
import type { StoryEventsHandle } from '@core/stores/story-events-feed';
import type { Run } from '@core/api/types';
import { actorLabel, isStoryKey, shortSha } from '@domain/identifiers';
import { crewLabel } from '@domain/models';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { LiveSteps } from '@ui/live-steps/live-steps';
import { OutcomePill } from '@ui/outcome-pill/outcome-pill';
import { Panel, PanelHead } from '@ui/panel/panel';
import { CLOCK } from '@ui/pipes/clock';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Source } from '@ui/tags/source';
import {
  effortSourceLabel,
  momentLabel,
  neighbours,
  revisionRound,
  runTiles,
  toLiveSteps,
} from './run-view';

/** What the page holds for the run in the URL: the voyage (kept fresh), its events and the run itself. */
interface Held {
  readonly handle: StoryHandle;
  readonly events: StoryEventsHandle;
  readonly run: StoreResource<Run>;
}

/** Where the page stands: the run is being read, is there, does not exist, or could not be read. */
type PageStatus = 'loading' | 'ready' | 'notFound' | 'error';

/**
 * Run detail at `/voyages/:key/runs/:runId` (plan, lane 5A): the pager, the four tiles, Details, the automated gate and
 * the run's steps kept as history. The run comes from `getRun`; the voyage, its runs (for the pager) and its gate
 * records (for the revision round) from the `StoryStore`; the steps from the `RunProgressBuffer`, which the voyage's event
 * feed fills. A view, never a control: no chat and no action on a step.
 */
@Component({
  selector: 'ah-run-detail',
  imports: [
    Banner,
    Button,
    EmptyState,
    LiveSteps,
    OutcomePill,
    Panel,
    PanelHead,
    RouterLink,
    Skeleton,
    Source,
  ],
  styleUrl: './run-detail-page.scss',
  template: `
    <div class="run">
      <nav class="run__crumbs" aria-label="Breadcrumb">
        <a routerLink="/voyages">Voyages</a> /
        <a [routerLink]="['/voyages', key()]">{{ key() }}</a> /
        <a [routerLink]="['/voyages', key(), 'runs']">Runs</a> /
        <span aria-current="page">{{ runId() }}</span>
      </nav>

      @switch (status()) {
        @case ('ready') {
          @if (run(); as r) {
            <header class="run__head">
              <div class="run__title">
                <div class="run__badges">
                  <ah-outcome-pill [value]="r.status" />
                  <span class="ah-mono run__sub">{{ phaseLine() }}</span>
                </div>
                <h1>Run {{ r.id }} · {{ crew() }}</h1>
                <div class="run__sub">{{ subtitle() }}</div>
              </div>
              <div
                class="run__pager"
                role="group"
                aria-label="Runs of the voyage"
              >
                @if (pager().prev; as prev) {
                  <a
                    ahButton
                    size="sm"
                    [routerLink]="['/voyages', key(), 'runs', prev.id]"
                    >← {{ prev.id }}</a
                  >
                } @else {
                  <button ahButton size="sm" type="button" disabled>←</button>
                }
                <a ahButton size="sm" [routerLink]="['/voyages', key(), 'runs']"
                  >All runs</a
                >
                @if (pager().next; as next) {
                  <a
                    ahButton
                    size="sm"
                    [routerLink]="['/voyages', key(), 'runs', next.id]"
                    >{{ next.id }} →</a
                  >
                } @else {
                  <button ahButton size="sm" type="button" disabled>→</button>
                }
              </div>
            </header>

            @if (tiles(); as t) {
              <div class="run__tiles">
                <div class="run__tile">
                  <span>AIU spent</span>
                  <b>{{ t.spent }}</b>
                  <div
                    class="ah-meter"
                    role="meter"
                    aria-label="AIU spent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    [attr.aria-valuenow]="t.percent"
                    [attr.aria-valuetext]="t.spent + ' of ' + t.cap + ' AIU'"
                  >
                    <i class="ah-meter__fill" [style.width.%]="t.percent"></i>
                  </div>
                  <small>of this run's {{ t.cap }} AIU cap</small>
                </div>
                <div class="run__tile">
                  <span>Requests</span>
                  <b>{{ t.requests }}</b>
                  <small>model requests</small>
                </div>
                <div class="run__tile">
                  <span>Tokens</span>
                  <b>{{ t.tokens }}</b>
                  <small>{{ t.tokensDetail }}</small>
                </div>
                <div class="run__tile">
                  <span>Duration</span>
                  <b>{{ t.duration }}</b>
                  <small>{{ t.range }}</small>
                </div>
              </div>
            }

            <div class="run__cols">
              <ah-panel class="run__details">
                <ah-panel-head heading="Details" />
                <div class="ah-panel__body">
                  <dl class="run__dl">
                    <dt>Agent</dt>
                    <dd>{{ crew() }}</dd>
                    <dt>Model</dt>
                    <dd class="ah-mono run__small">
                      {{ r.model ?? "agent's own" }}
                    </dd>
                    <dt>Reasoning effort</dt>
                    <dd>
                      {{ r.reasoningEffort ?? 'default' }}
                      @if (effortSource(); as source) {
                        <ah-source
                          [chosen]="source === 'Chosen for this voyage'"
                          >{{ source }}</ah-source
                        >
                      }
                    </dd>
                    <dt>Status</dt>
                    <dd>{{ r.status }}</dd>
                    <dt>Exit reason</dt>
                    <dd>{{ r.exitReason ?? '—' }}</dd>
                    <dt>Started by</dt>
                    <dd>{{ startedBy() }}</dd>
                    <dt>Queued</dt>
                    <dd>{{ moment(r.createdAt) }}</dd>
                    <dt>Started</dt>
                    <dd>{{ moment(r.startedAt) }}</dd>
                    <dt>Ended</dt>
                    <dd>{{ moment(r.endedAt) }}</dd>
                    <dt>Runtime</dt>
                    <dd class="ah-mono run__small">{{ r.runtime }}</dd>
                    <dt>Agent config</dt>
                    <dd
                      class="ah-mono run__sha"
                      [attr.title]="shortSha(r.controlSha)"
                    >
                      {{ r.controlSha }}
                    </dd>
                  </dl>
                  @if (r.replayOf; as original) {
                    <p class="ah-hint run__note">
                      Offline replay of {{ original }}: usage is not charged
                      again.
                    </p>
                  }
                </div>
              </ah-panel>

              <div class="run__side">
                <ah-panel>
                  <ah-panel-head heading="Automated gate" />
                  <div class="ah-panel__body">
                    @if (r.gate; as gate) {
                      <div class="run__verdict">
                        <ah-outcome-pill [value]="gate.result" />
                        <b>{{ gate.gate }} · {{ gate.message }}</b>
                      </div>
                    } @else {
                      <div class="run__verdict run__verdict--none">
                        <span aria-label="No gate">—</span>
                        <span class="ah-hint"
                          >No automated gate judged this run.</span
                        >
                      </div>
                    }
                  </div>
                </ah-panel>

                <ah-panel>
                  <ah-panel-head
                    heading="Steps"
                    subtitle="The live steps, kept as history"
                  />
                  <ah-live-steps
                    [steps]="steps()"
                    [label]="'Steps of ' + r.id"
                    footer="Some steps are left out on purpose, so this list is never complete."
                  />
                </ah-panel>
              </div>
            </div>
          }
        }
        @case ('notFound') {
          <ah-panel>
            <ah-empty-state heading="This run doesn't exist"
              >There is no run {{ runId() }} on {{ key() }}. It may have been
              mistyped.
              <a ahEmptyAction ahButton [routerLink]="voyageLink()"
                >Go to the voyage</a
              >
            </ah-empty-state>
          </ah-panel>
        }
        @case ('error') {
          @if (errorView(); as e) {
            <ah-banner
              [variant]="e.variant"
              [heading]="e.heading"
              [tech]="e.tech ?? ''"
              icon="offline"
              announce="alert"
              >{{ e.text }}
              <span class="run__retry"
                ><button type="button" ahButton size="sm" (click)="retry()">
                  Try again
                </button></span
              ></ah-banner
            >
          }
        }
        @default {
          <ah-panel>
            <div class="ah-panel__body run__skeleton" aria-busy="true">
              <span class="ah-sr" role="status">Loading the run…</span>
              <ah-skeleton width="30%" [height]="20" />
              <ah-skeleton width="55%" [height]="22" />
              <ah-skeleton width="85%" [height]="28" />
            </div>
          </ah-panel>
        }
      }
    </div>
  `,
})
export class RunDetailPage {
  /** The Jira key from the URL. */
  readonly key = input.required<string>();
  /** The run id from the URL. */
  readonly runId = input.required<string>();

  private readonly store = inject(StoryStore);
  private readonly api = inject(ApiClient);
  private readonly progress = inject(RunProgressBuffer);
  private readonly clock = inject(CLOCK);

  private readonly held = signal<Held | null>(null);

  protected readonly shortSha = shortSha;
  protected readonly moment = momentLabel;

  /** The run as `getRun` last gave it; null until it is read. */
  protected readonly run = computed<Run | null>(() => {
    const run = this.held()?.run.value() ?? null;
    // The route's key and the run's story must agree: a run of another voyage is not this voyage's run.
    return run !== null && run.storyKey === this.key() ? run : null;
  });

  protected readonly status = computed<PageStatus>(() => {
    const held = this.held();
    if (held === null) return isStoryKey(this.key()) ? 'loading' : 'notFound';
    const value = held.run.value();
    if (value !== undefined)
      return value.storyKey === this.key() ? 'ready' : 'notFound';
    const error = held.run.error();
    if (error === null) return 'loading';
    return isNotFound(error) ? 'notFound' : 'error';
  });

  protected readonly errorView = computed(() => {
    const error = this.held()?.run.error() ?? null;
    return error === null ? null : apiErrorView(error);
  });

  protected readonly crew = computed(() => {
    const run = this.run();
    return run === null
      ? ''
      : crewLabel(run.phase === 'pr_review' ? run.agent : run.phase, run.agent);
  });

  protected readonly startedBy = computed(() => {
    const run = this.run();
    return run === null ? '—' : actorLabel(run.startedBy);
  });

  /** "PROJ-123 · Show invoice due date on the billing page". */
  protected readonly subtitle = computed(() => {
    const title = this.held()?.handle.story.value()?.title ?? null;
    return title === null || title === ''
      ? this.key()
      : `${this.key()} · ${title}`;
  });

  /** "planning · revision round 2", the round only when the gate records tell it. */
  protected readonly phaseLine = computed(() => {
    const run = this.run();
    if (run === null) return '';
    const round = revisionRound(run, this.held()?.handle.gates.value() ?? []);
    return round === null
      ? run.phase
      : `${run.phase} · revision round ${round}`;
  });

  protected readonly pager = computed(() =>
    neighbours(this.held()?.handle.runs.value() ?? [], this.runId())
  );

  private readonly view = computed(() => this.progress.run(this.runId())());

  protected readonly tiles = computed(() => {
    const run = this.run();
    // The live spend only counts while the run is on; `runTiles` drops it for a run that ended.
    return run === null ? null : runTiles(run, this.view().spend, this.clock());
  });

  protected readonly steps = computed(() => toLiveSteps(this.view().entries));

  protected readonly effortSource = computed(() => {
    const events = this.held()?.events.events();
    return events === undefined
      ? null
      : effortSourceLabel(events, this.runId());
  });

  protected readonly voyageLink = computed(() =>
    isStoryKey(this.key()) ? ['/voyages', this.key()] : ['/voyages']
  );

  constructor() {
    // Open the voyage and the run when the URL gives them, and let go when it changes or the page is left.
    effect((onCleanup) => {
      const key = this.key();
      const runId = this.runId();
      if (!isStoryKey(key)) {
        this.held.set(null);
        return;
      }
      // Opening reads signals of its own (a store, a resource): none of them is this effect's business.
      const { handle, run } = untracked(() => {
        const handle = this.store.for(key, {
          watch: ['story', 'runs', 'gates'],
        });
        const run = new StoreResource(() => this.api.getRun(runId));
        this.held.set({ handle, events: handle.events(), run });
        void run.refresh();
        return { handle, run };
      });
      onCleanup(() => {
        run.dispose();
        handle.release();
      });
    });

    // The run is read once; when the voyage's list of runs shows it changed (it ended, was charged), read it again.
    effect(() => {
      const held = this.held();
      if (held === null) return;
      const listed = held.handle.runs
        .value()
        ?.find((run) => run.id === this.runId());
      if (listed === undefined) return;
      untracked(() => {
        const loaded = held.run.value();
        if (loaded !== undefined && changed(loaded, listed))
          void held.run.refresh();
      });
    });
  }

  protected retry(): void {
    void this.held()?.run.refresh();
  }
}

/** Whether the list shows something the loaded run does not: its status, end, charge or verdict. */
function changed(loaded: Run, listed: Run): boolean {
  return (
    loaded.status !== listed.status ||
    loaded.endedAt !== listed.endedAt ||
    loaded.usage.nanoAiu !== listed.usage.nanoAiu ||
    loaded.gate?.result !== listed.gate?.result
  );
}
