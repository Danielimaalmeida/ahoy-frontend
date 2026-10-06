import type { Environment } from "./environment.model";

/** Development build (`npm start`; `npm run start:mock` until lane 2D adds its own file). */
export const environment: Environment = {
  production: false,
  devRoutes: [
    {
      path: "_kit",
      title: "Kit · Ahoy",
      loadChildren: () => import("@ui/_kit/kit.routes").then((m) => m.KIT_ROUTES),
    },
  ],
};
