import type { DialogRef } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';
import type { KnowledgeReview, Refinement, Story } from '@core/api/types';
import { DialogService } from '@ui/dialog/dialog';
import type { VoyageContext } from '../context/voyage-context';
import {
  AgentDiagnosisDialog,
  CancelAgentDiagnosisDialog,
  type AgentDiagnosisDialogData,
  type CancelAgentDiagnosisDialogData,
} from './agent-diagnosis-dialogs';
import { BudgetDialog } from './budget-dialog';
import {
  CancelKnowledgeReviewDialog,
  KnowledgeReviewDialog,
  type CancelKnowledgeReviewDialogData,
  type KnowledgeReviewDialogData,
} from './knowledge-review-dialogs';
import type { VoyageDialogData } from './dialog-support';
import {
  PackageDecisionDialog,
  type PackageDecisionDialogData,
} from './package-decision-dialog';
import { RefreshIntakeDialog } from './refresh-intake-dialog';
import { ResumeDialog } from './resume-dialog';
import { StopDialog } from './stop-dialog';

/**
 * Opens the voyage's Stop, Resume, Back to intake, Budget, work package decision, agent diagnosis and knowledge review
 * dialogs over the page. The first five close with the story the API answered, the others with the diagnosis or the review, or `undefined` when
 * cancelled; the page needs nothing from the result, since the stores already hold it.
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

  /** "Retry WP2?" or "Accept WP2 as it stands?" Closes with the story. */
  decidePackage(
    data: PackageDecisionDialogData
  ): DialogRef<Story, PackageDecisionDialog> {
    return this.dialogs.open<
      Story,
      PackageDecisionDialogData,
      PackageDecisionDialog
    >(PackageDecisionDialog, { data });
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

  /** "Ask for the lessons of PROJ-097?" Closes with the queued review. */
  reviewKnowledge(
    data: KnowledgeReviewDialogData
  ): DialogRef<KnowledgeReview, KnowledgeReviewDialog> {
    return this.dialogs.open<
      KnowledgeReview,
      KnowledgeReviewDialogData,
      KnowledgeReviewDialog
    >(KnowledgeReviewDialog, { data });
  }

  /** "Cancel the knowledge review of PROJ-097?" Closes with the review, cancelled or being cancelled. */
  cancelKnowledgeReview(
    data: CancelKnowledgeReviewDialogData
  ): DialogRef<KnowledgeReview, CancelKnowledgeReviewDialog> {
    return this.dialogs.open<
      KnowledgeReview,
      CancelKnowledgeReviewDialogData,
      CancelKnowledgeReviewDialog
    >(CancelKnowledgeReviewDialog, { data });
  }
}
