import { Component } from "@angular/core";
import { PhaseStepper } from "@ui/phase-stepper/phase-stepper";

/**
 * Gallery: the PhaseStepper preview (current, stopped), the voyage that is Docked and the one that is Aground, then the
 * compact bars of the voyages table for the same cases.
 */
@Component({
  selector: "ah-kit-phase-stepper",
  imports: [PhaseStepper],
  template: `
    <ah-phase-stepper phase="plan_review" status="awaiting_decision" />
    <ah-phase-stepper phase="planning" status="halted" />
    <ah-phase-stepper phase="blocked" status="terminal" stoppedAt="plan_review" />
    <ah-phase-stepper phase="done" status="terminal" />
    <div class="kit-row">
      <ah-phase-stepper phase="planning" status="running" compact />
      <ah-phase-stepper phase="plan_review" status="awaiting_decision" compact />
      <ah-phase-stepper phase="planning" status="halted" compact />
      <ah-phase-stepper phase="blocked" status="terminal" stoppedAt="plan_review" compact />
      <ah-phase-stepper phase="done" status="terminal" compact />
    </div>
  `,
})
export class KitPhaseStepper {}
