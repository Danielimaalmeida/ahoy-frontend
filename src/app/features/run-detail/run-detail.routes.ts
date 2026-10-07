import type { Routes } from "@angular/router";
import { RunDetailPage } from "./run-detail-page";

/** Run detail at `/voyages/:key/runs/:runId` (lane 5A). */
export const RUN_DETAIL_ROUTES: Routes = [{ path: "", title: "Run · Ahoy", component: RunDetailPage }];
