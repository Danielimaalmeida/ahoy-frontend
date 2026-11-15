import { Component, computed, inject } from '@angular/core';
import { VoyageContext } from '../../context/voyage-context';
import { DecisionConflictPanel } from './decision-conflict';
import { DecisionPanel } from './decision-panel';
import { PLAN_GATE } from './decision-view';
import { PlanDecision } from './plan-decision';

/**
 * The decision of an open gate other than the plan's (the delivery gate, `delivery_accepted`), right under the voyage
 * header so its buttons are in view without scrolling past the tabs: the conflict panel and "Accept the delivery?" with
 * the cards side by side. The plan's decision stays beside the plan, in the Plan tab. Hidden while no such gate is open.
 */
@Component({
  selector: 'ah-delivery-decision',
  imports: [DecisionConflictPanel, DecisionPanel],
  providers: [PlanDecision],
  styles: `
    :host {
      display: contents;
    }
  `,
  template: `
    @if (open()) {
      <ah-decision-conflict />
      <ah-decision-panel wide />
    }
  `,
})
export class DeliveryDecision {
  private readonly context = inject(VoyageContext);

  /** Whether a gate other than the plan's waits for a person. */
  protected readonly open = computed(() => {
    const gate = this.context.gateKey();
    return gate !== null && gate !== PLAN_GATE;
  });
}
