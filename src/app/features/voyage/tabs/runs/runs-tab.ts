import { Component, computed, inject, linkedSignal } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { Run } from "@core/api/types";
import { apiErrorView } from "@core/commands/command-error";
import { RunProgressBuffer } from "@core/stores/run-progress-buffer";
import { budgetPercent, formatAiu } from "@domain/aiu";
import { Banner } from "@ui/banner/banner";
import { formatCap } from "@ui/budget-meter/budget-meter";
import { EmptyState } from "@ui/empty-state/empty-state";
import { LiveSteps, stepTime } from "@ui/live-steps/live-steps";
import { OutcomePill } from "@ui/outcome-pill/outcome-pill";
import { Panel, PanelHead } from "@ui/panel/panel";
import { ActorPipe } from "@ui/pipes/actor.pipe";
import { AiuPipe } from "@ui/pipes/aiu.pipe";
import { DateTimePipe } from "@ui/pipes/date-time.pipe";
import { RelativePipe } from "@ui/pipes/relative.pipe";
import { SkeletonRows, type SkeletonColumn } from "@ui/skeleton/skeleton";
import { Key, Nowrap, Table } from "@ui/table/table";
import { runById, runCrew } from "../../context/crew";
import { VoyageContext } from "../../context/voyage-context";
import { isRunActive, oldestFirst, runModelLabel, runRequests, runSpendNanoAiu, toLiveSteps } from "./run-rows";

/** The columns of the Runs table, for its placeholder rows. */
const RUN_COLUMNS: readonly SkeletonColumn[] = [
  { track: "minmax(0, 1.4fr)" },
  { track: "90px" },
  { track: "100px" },
  { track: "minmax(0, 1.4fr)" },
  { track: "90px", height: 20 },
  { track: "80px" },
  { track: "80px" },
  { track: "70px" },
  { track: "60px", height: 20 },
  { track: "minmax(0, 1fr)" },
];

/** One row of the Runs table. */
interface RunRow {
  readonly run: Run;
  readonly crew: string;
  readonly model: string;
  /** Spent, in nano-AIU; for the active run, what its progress says now. */
  readonly nanoAiu: number;
  /** The row is the active run: its AIU reads "live". */
  readonly live: boolean;
}

/** The live panel: the run being watched, and what it is spending. */
interface LiveView {
  readonly run: Run;
  readonly crew: string;
  /** "Cartographer is at work", or "Cartographer's run has ended". */
  readonly heading: string;
  readonly model: string;
  readonly active: boolean;
  readonly spent: string;
  readonly cap: string;
  readonly percent: number;
  readonly requests: number;
  /** "10:40:51", from the run's own start. */
  readonly startedTime: string;
}

/**
 * The Runs tab (plan, lane 5A). While a run is on, a live panel shows what it spends against its own cap and the steps
 * the agent takes, then "This run"; under them the table of the voyage's runs, oldest first. The panel belongs to the run
 * that was current: when it ends, its final spend replaces the live one and its steps stay, until the page is left.
 *
 * Progress is a view, never a control: the steps come from the `RunProgressBuffer`, which the voyage's event feed fills.
 */
@Component({
  selector: "ah-runs-tab",
  imports: [
    ActorPipe,
    AiuPipe,
    Banner,
    DateTimePipe,
    EmptyState,
    Key,
    LiveSteps,
    Nowrap,
    OutcomePill,
    Panel,
    PanelHead,
    RelativePipe,
    RouterLink,
    SkeletonRows,
    Table,
  ],
  styleUrl: "./runs-tab.scss",
  template: `
    @if (live(); as l) {
      <div class="runs__live">
        <ah-panel class="runs__main">
          <ah-panel-head [heading]="l.heading">
            @if (l.active) {
              <span class="runs__pulse" aria-hidden="true"></span>
            }
            <span class="ah-mono ah-muted">{{ l.run.id }} · {{ l.model }}</span>
            <span class="runs__spacer"></span>
            <span class="ah-hint">{{
              l.active ? "Live, a few seconds behind the agent" : "Ended. The steps below are kept as history."
            }}</span>
          </ah-panel-head>
          <div class="runs__spend">
            <span class="ah-hint runs__spend-label">{{ l.active ? "Run spend" : "Run spent" }}</span>
            <div
              class="ah-meter runs__meter"
              role="meter"
              aria-label="Run spend"
              aria-valuemin="0"
              aria-valuemax="100"
              [attr.aria-valuenow]="l.percent"
              [attr.aria-valuetext]="l.spent + ' of ' + l.cap + ' AIU'"
            >
              <i class="ah-meter__fill" [style.width.%]="l.percent"></i>
            </div>
            <span
              ><b class="ah-mono runs__spent">{{ l.spent }}</b
              >&ngsp;<span class="ah-hint">of this run's {{ l.cap }} AIU cap</span></span
            >
          </div>
          <ah-live-steps [steps]="steps()" [label]="'Steps of ' + l.run.id" />
        </ah-panel>

        <ah-panel class="runs__side">
          <ah-panel-head heading="This run">
            <ah-outcome-pill [value]="l.run.status" />
          </ah-panel-head>
          <div class="ah-panel__body">
            <dl class="runs__dl">
              <dt>Agent</dt>
              <dd>{{ l.crew }}</dd>
              <dt>Model</dt>
              <dd class="ah-mono">{{ l.run.model ?? "agent's own" }}</dd>
              <dt>Effort</dt>
              <dd>{{ l.run.reasoningEffort ?? "default" }}</dd>
              <dt>Started</dt>
              <dd>
                @if (l.run.startedAt !== null) {
                  {{ l.startedTime }} · {{ l.run.startedAt | ahRelative }}
                } @else {
                  Not started yet
                }
              </dd>
              <dt>Started by</dt>
              <dd>{{ l.run.startedBy | ahActor }}</dd>
              <dt>Requests</dt>
              <dd>{{ l.requests }}</dd>
            </dl>
            <a class="runs__open" [routerLink]="['/voyages', key(), 'runs', l.run.id]">Open run detail</a>
          </div>
        </ah-panel>
      </div>
    }

    <ah-panel>
      <ah-panel-head heading="Runs" subtitle="oldest first" />
      @if (failure(); as f) {
        <div class="ah-panel__body">
          <ah-banner
            [variant]="f.variant"
            [heading]="f.heading"
            [tech]="f.tech ?? ''"
            icon="offline"
            announce="alert"
            >{{ f.text }}</ah-banner
          >
        </div>
      } @else if (loading()) {
        <div class="ah-panel__body">
          <span class="ah-sr" role="status">Loading the runs…</span>
          <ah-skeleton-rows [rows]="3" [columns]="columns" />
        </div>
      } @else if (rows().length === 0) {
        <ah-empty-state heading="No runs yet" icon="anchor"
          >Runs show up here when an agent starts work on this voyage.</ah-empty-state
        >
      } @else {
        <table ahTable>
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Phase</th>
              <th scope="col">Agent</th>
              <th scope="col">Model · effort</th>
              <th scope="col">Status</th>
              <th scope="col">Started</th>
              <th scope="col">Ended</th>
              <th scope="col">AIU</th>
              <th scope="col">Gate</th>
              <th scope="col">Started by</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.run.id) {
              <tr>
                <td ahNowrap>
                  <a ahKey [routerLink]="['/voyages', key(), 'runs', row.run.id]">{{ row.run.id }}</a>
                </td>
                <td class="ah-mono">{{ row.run.phase }}</td>
                <td>{{ row.crew }}</td>
                <td class="ah-mono">{{ row.model }}</td>
                <td ahNowrap><ah-outcome-pill [value]="row.run.status" /></td>
                <td ahNowrap>{{ row.run.startedAt | ahDateTime }}</td>
                <td ahNowrap>{{ row.run.endedAt | ahDateTime }}</td>
                <td ahNowrap class="ah-mono">
                  {{ row.nanoAiu | ahAiu: 2 }}
                  @if (row.live) {
                    <span class="ah-hint">live</span>
                  }
                </td>
                <td ahNowrap>
                  @if (row.run.gate; as gate) {
                    <ah-outcome-pill [value]="gate.result" [attr.title]="gate.gate + ' · ' + gate.message" />
                  } @else {
                    <span aria-label="No gate">—</span>
                  }
                </td>
                <td>{{ row.run.startedBy | ahActor }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </ah-panel>
  `,
})
export class RunsTab {
  protected readonly context = inject(VoyageContext);
  private readonly progress = inject(RunProgressBuffer);

  protected readonly columns = RUN_COLUMNS;
  protected readonly key = this.context.key;

  /** The run the story is on, while it is `running`. */
  private readonly currentRunId = computed(() => {
    const story = this.context.story();
    return story?.status === "running" ? story.currentRunId : null;
  });

  /** The run the live panel is about: the current one, and after it ended, the same one until the page is left. */
  private readonly watchedRunId = linkedSignal<string | null, string | null>({
    source: this.currentRunId,
    computation: (current, previous) => current ?? previous?.value ?? null,
  });

  private readonly watchedRun = computed(() => runById(this.context.runs(), this.watchedRunId()) ?? null);

  /** The run's progress rows; empty until its events arrive. */
  private readonly view = computed(() => {
    const run = this.watchedRun();
    return run === null ? null : this.progress.run(run.id)();
  });

  protected readonly live = computed<LiveView | null>(() => {
    const run = this.watchedRun();
    if (run === null) return null;
    const spend = this.view()?.spend ?? null;
    const crew = runCrew(run);
    const active = isRunActive(run);
    const nanoAiu = runSpendNanoAiu(run, spend);
    return {
      run,
      crew,
      heading: active ? `${crew} is at work` : `${crew}'s run has ended`,
      model: runModelLabel(run),
      active,
      spent: formatAiu(nanoAiu, 2),
      cap: formatCap(run.budgetNanoAiu, 1),
      percent: budgetPercent(run.budgetNanoAiu, nanoAiu),
      requests: runRequests(run, spend),
      startedTime: stepTime(run.startedAt ?? undefined),
    };
  });

  protected readonly steps = computed(() => toLiveSteps(this.view()?.entries ?? []));

  protected readonly rows = computed<readonly RunRow[]>(() =>
    oldestFirst(this.context.runs()).map((run) => {
      const live = isRunActive(run);
      return {
        run,
        crew: runCrew(run),
        model: runModelLabel(run),
        nanoAiu: live ? runSpendNanoAiu(run, this.progress.run(run.id)().spend) : run.usage.nanoAiu,
        live,
      };
    }),
  );

  /** The runs are being read for the first time. */
  protected readonly loading = computed(() => {
    const runs = this.context.handle()?.runs;
    return runs !== undefined && runs.value() === undefined && runs.error() === null;
  });

  /** Why the runs could not be read, while there is nothing to show. */
  protected readonly failure = computed(() => {
    const runs = this.context.handle()?.runs;
    const error = runs?.value() === undefined ? (runs?.error() ?? null) : null;
    return error === null ? null : apiErrorView(error);
  });
}
