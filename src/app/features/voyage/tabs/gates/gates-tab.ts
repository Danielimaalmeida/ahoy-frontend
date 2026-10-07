import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { actorLabel } from "@domain/identifiers";
import { absoluteTime } from "@domain/time";
import { Banner } from "@ui/banner/banner";
import { Button } from "@ui/button/button";
import { EmptyState } from "@ui/empty-state/empty-state";
import { OutcomePill } from "@ui/outcome-pill/outcome-pill";
import { Panel, PanelBody, PanelHead } from "@ui/panel/panel";
import { SkeletonRows, type SkeletonColumn } from "@ui/skeleton/skeleton";
import { Key, Nowrap, Table } from "@ui/table/table";
import { VoyageContext } from "../../context/voyage-context";
import { oldestFirst, sourceLabel, waitingRow } from "./gate-rows";

const SKELETON_COLUMNS: readonly SkeletonColumn[] = [
  { track: "80px" },
  { track: "90px" },
  { track: "100px" },
  { track: "80px", height: 20 },
  { track: "70px", height: 20 },
  { track: "minmax(0, 1fr)" },
  { track: "120px" },
  { track: "50px" },
];

/**
 * The Gates tab (lane 5B, `Records` board): every automated check and human decision of the voyage, oldest first, from
 * `listGateRecords`. The outcome is the API's own word. While the voyage waits at a human gate, a last "waiting" line
 * says so and leads to the Plan tab, where the decision is made. Nothing here decides anything.
 */
@Component({
  selector: "ah-gates-tab",
  imports: [
    RouterLink,
    Banner,
    Button,
    EmptyState,
    OutcomePill,
    Panel,
    PanelBody,
    PanelHead,
    SkeletonRows,
    Table,
    Nowrap,
    Key,
  ],
  styles: `
    :host {
      display: block;
    }
    .gates__table {
      overflow-x: auto;
    }
    .gates__pending td {
      background: var(--surface-sunken);
    }
  `,
  template: `
    <ah-panel>
      <ah-panel-head
        heading="Gate history"
        subtitle="Automated checks and human decisions, oldest first. Nothing passes on silence."
      />
      @if (failed()) {
        <ah-panel-body>
          <ah-banner variant="error" heading="Could not read the gate history">
            Nothing you did is lost.
            <button ahButton size="sm" type="button" (click)="retry()">Try again</button>
          </ah-banner>
        </ah-panel-body>
      } @else if (loading()) {
        <ah-panel-body><ah-skeleton-rows [rows]="5" [columns]="skeletonColumns" /></ah-panel-body>
      } @else if (records().length === 0 && waiting() === null) {
        <ah-empty-state heading="No gate records yet" icon="compass">
          Automated checks and human decisions show up here as the voyage goes.
        </ah-empty-state>
      } @else {
        <div class="gates__table">
          <table ahTable>
            <thead>
              <tr>
                <th>When</th>
                <th>Phase</th>
                <th>Gate</th>
                <th>Source</th>
                <th>Outcome</th>
                <th>Message</th>
                <th>Who</th>
                <th>Run</th>
              </tr>
            </thead>
            <tbody>
              @for (record of records(); track record.id) {
                <tr>
                  <td ahNowrap>
                    <time [attr.datetime]="record.createdAt">{{ time(record.createdAt) }}</time>
                  </td>
                  <td ahNowrap class="ah-mono">{{ record.phase }}</td>
                  <td ahNowrap class="ah-mono">{{ record.gate }}</td>
                  <td ahNowrap>
                    <span class="ah-tag" [class.ah-tag--accent]="record.source === 'human'">{{
                      source(record.source)
                    }}</span>
                  </td>
                  <td ahNowrap><ah-outcome-pill [value]="record.outcome" /></td>
                  <td>{{ record.message ?? "—" }}</td>
                  <td ahNowrap>{{ who(record.actor) }}</td>
                  <td ahNowrap>
                    @if (record.runId; as runId) {
                      <a ahKey [routerLink]="['/voyages', key(), 'runs', runId]">{{ runId }}</a>
                    } @else {
                      —
                    }
                  </td>
                </tr>
              }
              @if (waiting(); as row) {
                <tr class="gates__pending">
                  <td ahNowrap>now</td>
                  <td ahNowrap class="ah-mono">{{ row.phase }}</td>
                  <td ahNowrap class="ah-mono">{{ row.gate }}</td>
                  <td ahNowrap><span class="ah-tag ah-tag--accent">Human</span></td>
                  <td ahNowrap><ah-outcome-pill value="waiting" /></td>
                  <td>
                    {{ row.message }}
                    <a [routerLink]="['/voyages', key(), 'plan']">Decide</a>
                  </td>
                  <td ahNowrap>—</td>
                  <td ahNowrap>—</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </ah-panel>
  `,
})
export class GatesTab {
  private readonly context = inject(VoyageContext);

  protected readonly skeletonColumns = SKELETON_COLUMNS;
  protected readonly time = absoluteTime;
  protected readonly who = actorLabel;
  protected readonly source = sourceLabel;

  protected readonly key = this.context.key;

  /** The gate resource of the open voyage, which the event stream keeps fresh. */
  private readonly resource = computed(() => this.context.handle()?.gates ?? null);

  protected readonly records = computed(() => oldestFirst(this.resource()?.value() ?? []));

  protected readonly waiting = computed(() =>
    waitingRow(
      this.context.story(),
      this.context.gateKey(),
      this.context.revisionRound(),
      this.context.revisionCeiling(),
    ),
  );

  /** No records in hand and the first read has not finished. */
  protected readonly loading = computed(() => {
    const resource = this.resource();
    return resource === null || (resource.value() === undefined && resource.status() !== "error");
  });

  /** The read failed and there is nothing earlier to show; with records in hand, the table stays. */
  protected readonly failed = computed(() => {
    const resource = this.resource();
    return resource !== null && resource.value() === undefined && resource.status() === "error";
  });

  protected retry(): void {
    void this.resource()?.refresh();
  }
}
