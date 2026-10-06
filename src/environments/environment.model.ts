import type { Routes } from "@angular/router";

/** Build-time settings that differ between production, development and mock builds. */
export interface Environment {
  readonly production: boolean;
  /** Routes that exist only outside production, such as the `/_kit` gallery. */
  readonly devRoutes: Routes;
}
