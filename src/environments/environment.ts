import type { Environment } from "./environment.model";

/** Production build: no dev-only routes, so `_kit` never reaches `dist/`. */
export const environment: Environment = {
  production: true,
  devRoutes: [],
};
