import type { Routes } from "@angular/router";
import { QuestionsTab } from "./questions-tab";

/** Questions (lane 4C): the rounds of questions, their answer forms and "What happens next". */
export const QUESTIONS_ROUTES: Routes = [{ path: "", title: "Questions · Ahoy", component: QuestionsTab }];
