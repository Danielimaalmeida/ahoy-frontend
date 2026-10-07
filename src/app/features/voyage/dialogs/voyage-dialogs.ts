import type { DialogRef } from "@angular/cdk/dialog";
import { Injectable, inject } from "@angular/core";
import type { Story } from "@core/api/types";
import { DialogService } from "@ui/dialog/dialog";
import type { VoyageContext } from "../context/voyage-context";
import { BudgetDialog } from "./budget-dialog";
import type { VoyageDialogData } from "./dialog-support";
import { ResumeDialog } from "./resume-dialog";
import { StopDialog } from "./stop-dialog";

/**
 * Opens the voyage's Stop, Resume and Budget dialogs over the page. Each closes with the story the API answered, or
 * `undefined` when cancelled; the page needs nothing from the result, since the store already holds the new story.
 */
@Injectable({ providedIn: "root" })
export class VoyageDialogs {
  private readonly dialogs = inject(DialogService);

  /** "Drop anchor on PROJ-140?" */
  stop(context: VoyageContext): DialogRef<Story, StopDialog> {
    return this.dialogs.open<Story, VoyageDialogData, StopDialog>(StopDialog, { data: { context } });
  }

  /** "Weigh anchor and resume?" */
  resume(context: VoyageContext): DialogRef<Story, ResumeDialog> {
    return this.dialogs.open<Story, VoyageDialogData, ResumeDialog>(ResumeDialog, { data: { context } });
  }

  /** "Change the budget" */
  budget(context: VoyageContext): DialogRef<Story, BudgetDialog> {
    return this.dialogs.open<Story, VoyageDialogData, BudgetDialog>(BudgetDialog, { data: { context } });
  }
}
