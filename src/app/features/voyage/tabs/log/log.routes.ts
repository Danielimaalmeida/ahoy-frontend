import type { Routes } from "@angular/router";
import { LogTab } from "./log-tab";

/** Ship's log: every event of the voyage, newest first (lane 5B). */
export const LOG_ROUTES: Routes = [{ path: "", title: "Ship's log · Ahoy", component: LogTab }];
