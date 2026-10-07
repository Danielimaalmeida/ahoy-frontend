import { Component } from "@angular/core";
import type { LiveStep } from "@ui/live-steps/live-steps";
import { LiveSteps } from "@ui/live-steps/live-steps";

/** Gallery: the LiveSteps preview (tool, message, gap and a masked credential). */
@Component({
  selector: "ah-kit-live-steps",
  imports: [LiveSteps],
  template: `<div class="ah-panel"><ah-live-steps [steps]="steps" /></div>`,
})
export class KitLiveSteps {
  protected readonly steps: readonly LiveStep[] = [
    { kind: "tool", at: "2026-10-06T10:41:05", tool: "grep", summary: '"assignRole|revokeRole" in services/' },
    {
      kind: "message",
      at: "2026-10-06T10:41:19",
      text:
        "Role changes go through RoleService only. An audit event can be written in the same transaction, so the " +
        "audit table never disagrees with the roles table. I'll read the migration history next to see how the " +
        "events table was created and whether it is partitioned.",
    },
    { kind: "gap", count: 38 },
    {
      kind: "tool",
      at: "2026-10-06T10:43:40",
      tool: "bash",
      summary: "psql -c '\\d audit_events' PGPASSWORD=[REDACTED]",
    },
  ];
}
