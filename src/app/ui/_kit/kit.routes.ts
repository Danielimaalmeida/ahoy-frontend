import type { Routes } from "@angular/router";
import { Placeholder } from "@ui/placeholder/placeholder";

/** Component gallery, development builds only (lane 1A builds it). */
export const KIT_ROUTES: Routes = [{ path: "", component: Placeholder, data: { heading: "Kit", lane: "1A" } }];
