import type { Routes } from "@angular/router";
import { AllHandsPage } from "./all-hands";

/** All hands (`/`): the voyages that wait on a person, and the ones at sea. */
export const HARBOUR_ROUTES: Routes = [{ path: "", title: "All hands · Ahoy", component: AllHandsPage }];
