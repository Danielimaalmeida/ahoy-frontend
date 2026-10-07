import { Component } from "@angular/core";
import type { ShipsLogEntry } from "@ui/ships-log/ships-log";
import { ShipsLog } from "@ui/ships-log/ships-log";

/** Gallery: the ShipsLog preview, plus a plain system event. */
@Component({
  selector: "ah-kit-ships-log",
  imports: [ShipsLog],
  template: `<div class="ah-panel"><ah-ships-log [entries]="entries" /></div>`,
})
export class KitShipsLog {
  protected readonly entries: readonly ShipsLogEntry[] = [
    {
      id: "e4",
      at: "2026-10-06T09:49:00",
      title: "Waiting at the human gate",
      details: "plan_accepted, round 2",
      actor: "ahoy-reconciler",
      kind: "wait",
    },
    {
      id: "e3",
      at: "2026-10-06T09:48:00",
      title: "Gate evaluated",
      details: "plan · pass",
      actor: "ahoy-reconciler",
      kind: "pass",
      run: { id: "r-04", link: "/_kit" },
    },
    {
      id: "e2",
      at: "2026-10-06T09:30:00",
      title: "Budget changed",
      details: '20 → 30 AIU · "Revision needs more room"',
      actor: "alex@example.com",
      kind: "human",
    },
    {
      id: "e1",
      at: "2026-10-06T09:02:00",
      title: "Run started",
      details: "planning · r-04",
      actor: "ahoy-reconciler",
      kind: "system",
    },
  ];
}
