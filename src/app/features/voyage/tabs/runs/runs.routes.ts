import type { Routes } from "@angular/router";
import { RunsTab } from "./runs-tab";

/** Runs (lane 5A): the live panel and the table of the voyage's runs. */
export const RUNS_ROUTES: Routes = [{ path: "", title: "Runs · Ahoy", component: RunsTab }];
