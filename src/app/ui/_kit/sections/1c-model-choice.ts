import { Component } from "@angular/core";
import { FormControl } from "@angular/forms";
import type { ModelSlot } from "@domain/types";
import { Button } from "@ui/button/button";
import type { EffortChoice, ModelChoiceControls, ModelChoiceRowSpec } from "@ui/model-choice/model-choice";
import { ModelChoiceTable } from "@ui/model-choice/model-choice";

function slot(model = "", effort: EffortChoice = ""): ModelChoiceControls {
  return {
    model: new FormControl(model, { nonNullable: true }),
    effort: new FormControl<EffortChoice>(effort, { nonNullable: true }),
  };
}

/** Gallery: the ModelChoice preview, with both Lookouts on claude-sonnet-5 so the error shows under both rows. */
@Component({
  selector: "ah-kit-model-choice",
  imports: [Button, ModelChoiceTable],
  template: `
    <div class="kit-stack">
      <ah-model-choice-table #table [rows]="rows" [controls]="controls" />
      <div class="kit-row">
        <button ahButton="primary" type="button" [disabled]="table.conflict() !== null">Save models</button>
        <span class="ah-hint">A change applies from that phase's next run; an active run keeps its model.</span>
      </div>
    </div>
  `,
})
export class KitModelChoice {
  protected readonly rows: readonly ModelChoiceRowSpec[] = [
    { slot: "intake", defaultModel: "gpt-5.6-terra", defaultEffort: "medium", source: "Server default" },
    { slot: "planning", source: "Chosen for this voyage", chosen: true },
    { slot: "implementation", defaultModel: "claude-sonnet-5", source: "Agent config" },
    { slot: "review-design", defaultEffort: "high", source: "Server default" },
    { slot: "review-defect", defaultModel: "claude-sonnet-5", source: "Server default" },
  ];
  protected readonly controls: Record<ModelSlot, ModelChoiceControls> = {
    intake: slot(),
    planning: slot("claude-sonnet-5", "high"),
    implementation: slot(),
    "review-design": slot("claude-sonnet-5"),
    "review-defect": slot(),
  };
}
