import type { KitSection } from "../kit-section";
import { KitArtifactDiff } from "./1c-artifact-diff";
import { KitChoiceCard } from "./1c-choice-card";
import { KitDialog } from "./1c-dialog";
import { KitLiveSteps } from "./1c-live-steps";
import { KitMarkdown } from "./1c-markdown";
import { KitModelChoice } from "./1c-model-choice";
import { KitQuestionCard } from "./1c-question-card";
import { KitShipsLog } from "./1c-ships-log";

/** Lane 1C's gallery sections, in page order. Lane 1C owns this file: add its sections here, not in `kit.ts`. */
export const KIT_SECTIONS_1C: readonly KitSection[] = [
  { id: "dialog", title: "Dialog", lane: "1C", component: KitDialog },
  { id: "choice-card", title: "ChoiceCard", lane: "1C", component: KitChoiceCard },
  { id: "question-card", title: "QuestionCard", lane: "1C", component: KitQuestionCard },
  { id: "model-choice", title: "ModelChoice", lane: "1C", component: KitModelChoice },
  { id: "live-steps", title: "LiveSteps", lane: "1C", component: KitLiveSteps },
  { id: "ships-log", title: "ShipsLog", lane: "1C", component: KitShipsLog },
  { id: "artifact-diff", title: "ArtifactDiff", lane: "1C", component: KitArtifactDiff },
  { id: "markdown", title: "Markdown", lane: "1C", component: KitMarkdown },
];
