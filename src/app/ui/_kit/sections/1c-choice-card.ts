import { Component } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import type { ChoiceOption } from "@ui/choice-card/choice-card";
import { ChoiceCardGroup } from "@ui/choice-card/choice-card";

type KitDecision = "approve" | "send_back" | "reject";

/** Gallery: the ChoiceCard preview (the human-gate decision), with "Send back" picked. */
@Component({
  selector: "ah-kit-choice-card",
  imports: [ChoiceCardGroup, ReactiveFormsModule],
  template: `
    <div class="kit-grid-2">
      <ah-choice-card-group label="Your decision" [options]="options" [formControl]="decision" />
      <span class="ah-hint"
        >Picked: <span class="ah-api">{{ decision.value }}</span
        >. Arrow keys move the choice.</span
      >
    </div>
  `,
})
export class KitChoiceCard {
  protected readonly options: readonly ChoiceOption<KitDecision>[] = [
    { value: "approve", title: "Approve", description: "The voyage moves on to implementation." },
    {
      value: "send_back",
      title: "Send back",
      description: "Cartographer revises the plan. This would be round 3 of 4.",
    },
    { value: "reject", title: "Reject", description: "The voyage runs aground (blocked)." },
  ];
  protected readonly decision = new FormControl<KitDecision>("send_back", { nonNullable: true });
}
