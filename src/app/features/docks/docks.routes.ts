import type { Routes } from "@angular/router";
import { Docks } from "./docks";

/** The Docks: the Jira backlog beside each story's state in Ahoy (a planned screen, see `BacklogPort`). */
export const DOCKS_ROUTES: Routes = [{ path: "", title: "The Docks · Ahoy", component: Docks }];
