import type { DialogRef } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';
import type {
  BranchRelease,
  BranchReleaseBatch,
  KnowledgeReview,
  ModelPlan,
  ModelSlot,
  Refinement,
  Story,
} from '@core/api/types';
import { DialogService } from '@ui/dialog/dialog';
import type { VoyageContext } from '../context/voyage-context';
import {
  ChangeModelsDialog,
  type ChangeModelsData,
} from '../tabs/models/change-models-dialog';
import {
  AgentDiagnosisDialog,
  CancelAgentDiagnosisDialog,
  type AgentDiagnosisDialogData,
  type CancelAgentDiagnosisDialogData,
} from './agent-diagnosis-dialogs';
import {
  AssessCommentsDialog,
  type AssessCommentsDialogData,
} from './assess-comments-dialog';
import {
  BranchReleaseAllDialog,
  type BranchReleaseAllDialogData,
} from './branch-release-all-dialog';
import {
  BranchReleaseDialog,
  type BranchReleaseDialogData,
} from './branch-release-dialog';
import { BudgetDialog } from './budget-dialog';
import { CancelVoyageDialog } from './cancel-voyage-dialog';
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
import { RefreshDesignDialog } from './refresh-design-dialog';
import { RefreshIntakeDialog } from './refresh-intake-dialog';
import { RestartVoyageDialog } from './restart-voyage-dialog';
import { ResumeDialog } from './resume-dialog';
import { StopDialog } from './stop-dialog';
import { UnblockDialog } from './unblock-dialog';

/**
 * Opens voyage command dialogs over the page. They close with the resource the API answered, or `undefined` when
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

  /** "Cancel PROJ-140?" */
  cancel(context: VoyageContext): DialogRef<Story, CancelVoyageDialog> {
    return this.dialogs.open<Story, VoyageDialogData, CancelVoyageDialog>(
      CancelVoyageDialog,
      { data: { context } }
    );
  }

  /** "Start PROJ-140 again?" */
  restart(context: VoyageContext): DialogRef<Story, RestartVoyageDialog> {
    return this.dialogs.open<Story, VoyageDialogData, RestartVoyageDialog>(
      RestartVoyageDialog,
      { data: { context } }
    );
  }

  /** "Resume PROJ-118?" */
  resume(context: VoyageContext): DialogRef<Story, ResumeDialog> {
    return this.dialogs.open<Story, VoyageDialogData, ResumeDialog>(
      ResumeDialog,
      { data: { context } }
    );
  }

  /** "Unblock PROJ-123?" */
  unblock(context: VoyageContext): DialogRef<Story, UnblockDialog> {
    return this.dialogs.open<Story, VoyageDialogData, UnblockDialog>(
      UnblockDialog,
      { data: { context }, width: '640px' }
    );
  }

  /** "Send PROJ-123 back to intake?" */
  refreshIntake(context: VoyageContext): DialogRef<Story, RefreshIntakeDialog> {
    return this.dialogs.open<Story, VoyageDialogData, RefreshIntakeDialog>(
      RefreshIntakeDialog,
      { data: { context } }
    );
  }

  /** "Refresh the design of PROJ-123?" */
  refreshDesign(context: VoyageContext): DialogRef<Story, RefreshDesignDialog> {
    return this.dialogs.open<Story, VoyageDialogData, RefreshDesignDialog>(
      RefreshDesignDialog,
      { data: { context } }
    );
  }

  /** "Assess the comments on PROJ-123's pull requests?" Closes with the story. */
  assessComments(
    data: AssessCommentsDialogData
  ): DialogRef<Story, AssessCommentsDialog> {
    return this.dialogs.open<
      Story,
      AssessCommentsDialogData,
      AssessCommentsDialog
    >(AssessCommentsDialog, { data });
  }

  /** "Deploy WP2's branch to TEST?" Closes with the release, queued. */
  branchRelease(
    data: BranchReleaseDialogData
  ): DialogRef<BranchRelease, BranchReleaseDialog> {
    return this.dialogs.open<
      BranchRelease,
      BranchReleaseDialogData,
      BranchReleaseDialog
    >(BranchReleaseDialog, { data, width: '520px' });
  }

  /** "Deploy N repositories' branches to TEST?" */
  branchReleaseAll(
    data: BranchReleaseAllDialogData
  ): DialogRef<BranchReleaseBatch, BranchReleaseAllDialog> {
    return this.dialogs.open<
      BranchReleaseBatch,
      BranchReleaseAllDialogData,
      BranchReleaseAllDialog
    >(BranchReleaseAllDialog, { data, width: '560px' });
  }

  /** "Change the budget" */
  budget(context: VoyageContext): DialogRef<Story, BudgetDialog> {
    return this.dialogs.open<Story, VoyageDialogData, BudgetDialog>(
      BudgetDialog,
      { data: { context } }
    );
  }

  /** "Models per phase", optionally focused on one slot. */
  models(
    context: VoyageContext,
    slot: ModelSlot | null = null
  ): DialogRef<ModelPlan, ChangeModelsDialog> {
    return this.dialogs.open<ModelPlan, ChangeModelsData, ChangeModelsDialog>(
      ChangeModelsDialog,
      { data: { context, slot }, width: '960px' }
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
