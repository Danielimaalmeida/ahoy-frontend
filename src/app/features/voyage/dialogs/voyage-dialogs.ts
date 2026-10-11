import type { DialogRef } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';
import type { Refinement, Story } from '@core/api/types';
import { DialogService } from '@ui/dialog/dialog';
import type { VoyageContext } from '../context/voyage-context';
import {
  AgentDiagnosisDialog,
  CancelAgentDiagnosisDialog,
  type AgentDiagnosisDialogData,
  type CancelAgentDiagnosisDialogData,
} from './agent-diagnosis-dialogs';
import { BudgetDialog } from './budget-dialog';
import type { VoyageDialogData } from './dialog-support';
import { RefreshIntakeDialog } from './refresh-intake-dialog';
import { ResumeDialog } from './resume-dialog';
import { StopDialog } from './stop-dialog';

/**
 * Opens the voyage's Stop, Resume, Back to intake, Budget and agent diagnosis dialogs over the page. The first four
 * close with the story the API answered, the diagnosis ones with the diagnosis, or `undefined` when cancelled; the page
 * needs nothing from the result, since the store already holds the new story.
 */
@Injectable({ providedIn: 'root' })
export class VoyageDialogs {
  private readonly dialogs = inject(DialogService);

  /** "Stop PROJ-140?" */
  stop(context: VoyageContext): DialogRef<Story, StopDialog> {
    return this.dialogs.open<Story, VoyageDialogData, StopDialog>(StopDialog, {
      data: { context },
    });
  }

  /** "Resume PROJ-118?" */
  resume(context: VoyageContext): DialogRef<Story, ResumeDialog> {
    return this.dialogs.open<Story, VoyageDialogData, ResumeDialog>(
      ResumeDialog,
      { data: { context } }
    );
  }

  /** "Send PROJ-123 back to intake?" */
  refreshIntake(context: VoyageContext): DialogRef<Story, RefreshIntakeDialog> {
    return this.dialogs.open<Story, VoyageDialogData, RefreshIntakeDialog>(
      RefreshIntakeDialog,
      { data: { context } }
    );
  }

  /** "Change the budget" */
  budget(context: VoyageContext): DialogRef<Story, BudgetDialog> {
    return this.dialogs.open<Story, VoyageDialogData, BudgetDialog>(
      BudgetDialog,
      { data: { context } }
    );
  }

  /** "Ask an agent to diagnose PROJ-118?" Closes with the queued diagnosis. */
  diagnose(
    data: AgentDiagnosisDialogData
  ): DialogRef<Refinement, AgentDiagnosisDialog> {
    return this.dialogs.open<
      Refinement,
      AgentDiagnosisDialogData,
      AgentDiagnosisDialog
    >(AgentDiagnosisDialog, { data });
  }

  /** "Cancel the diagnosis of PROJ-118?" Closes with the diagnosis, cancelled or being cancelled. */
  cancelDiagnosis(
    data: CancelAgentDiagnosisDialogData
  ): DialogRef<Refinement, CancelAgentDiagnosisDialog> {
    return this.dialogs.open<
      Refinement,
      CancelAgentDiagnosisDialogData,
      CancelAgentDiagnosisDialog
    >(CancelAgentDiagnosisDialog, { data });
  }
}
