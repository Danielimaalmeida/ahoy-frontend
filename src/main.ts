import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { createAppConfig } from './app/app.config';
import { loadRuntimeEnvironment } from './app/core/config/runtime-environment';
import { environment } from './environments/environment';

// The team's sign-in comes from /config.json, read before the auth library is provided (one image for every team).
loadRuntimeEnvironment(
  environment,
  globalThis.fetch.bind(globalThis),
  globalThis.location.origin
)
  .then(({ environment: env, problems }) => {
    for (const problem of problems)
      console.warn(`config.json: ${problem}; using the build's sign-in`);
    return bootstrapApplication(App, createAppConfig(env));
  })
  .catch((e: unknown) => console.error(e));
