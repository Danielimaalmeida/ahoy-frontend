import { installMockBackend } from "@core/mock/install";
import { environment as development } from "./environment.development";
import type { Environment } from "./environment.model";

// The mock backend answers /api/v1 in the browser from here on (lane 2D). Only the `mock` configuration of
// `angular.json` replaces `environment.ts` with this file, so the production build never contains the mock.
installMockBackend();

/** Mock build (`npm run start:mock`): the development build, with the API answered by the in-browser mock. */
export const environment: Environment = { ...development };
