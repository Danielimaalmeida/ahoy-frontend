import { Injectable, inject } from "@angular/core";
import { ApiClient } from "@core/api/api-client";
import type { ModelPlan, ModelPlanChange } from "@core/api/types";
import type { CommandOutcome } from "@core/commands/command-runner";
import { StoryStore } from "@core/stores/story-store";
import type { VoyageContext } from "../../context/voyage-context";
import { modelsRequest } from "./models-change";

/**
 * Sends `setStoryModels` for the open voyage through its `CommandRunner` (plan §5.5): one at a time, with the version the
 * user saw. `VoyageContext` (lane 4A) has no method for it, so the models tab does the same as its `stop`/`resume`: the
 * `202` model plan goes to the store, and the story is read again because its version moved on.
 */
@Injectable({ providedIn: "root" })
export class ModelsCommand {
  private readonly api = inject(ApiClient);
  private readonly store = inject(StoryStore);

  /**
   * Changes the models of some slots (`null` gives a slot back to the default). Nothing is sent when `models` is empty:
   * the API wants at least one slot.
   */
  async save(context: VoyageContext, models: ModelPlanChange, reason: string): Promise<CommandOutcome<ModelPlan>> {
    const key = context.key();
    if (key === null || Object.keys(models).length === 0) return { kind: "skipped" };
    const outcome = await context.commands.run(
      (expectedVersion) => this.api.setStoryModels(key, modelsRequest(expectedVersion, models, reason)),
      { onOk: (plan) => this.store.acceptModels(plan) },
    );
    if (outcome.kind === "ok") await context.handle()?.story.refresh();
    return outcome;
  }
}
