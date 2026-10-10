import { Component } from '@angular/core';
import { StatusBadge } from '@ui/status-badge/status-badge';

/** Gallery: the StatusBadge preview, every status in the crew's words, then the badge with its API word. */
@Component({
  selector: 'ah-kit-status-badge',
  imports: [StatusBadge],
  template: `
    <div class="kit-row">
      <ah-status-badge status="ready" />
      <ah-status-badge status="running" />
      <ah-status-badge status="awaiting_input" />
      <ah-status-badge status="awaiting_decision" />
      <ah-status-badge status="halted" />
      <ah-status-badge status="terminal" phase="done" />
      <ah-status-badge status="terminal" phase="blocked" />
    </div>
    <div class="kit-row">
      <ah-status-badge
        status="awaiting_decision"
        phase="plan_review"
        showApi
        detail="plan_accepted"
      />
      <ah-status-badge
        status="halted"
        phase="planning"
        showApi
        detail="run_failed"
      />
      <ah-status-badge status="running" phase="planning" showApi />
      <ah-status-badge status="terminal" phase="blocked" showApi />
    </div>
  `,
})
export class KitStatusBadge {}
