import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { createAppConfig } from './app/app.config';
import { loadRuntimeEnvironment } from '@core/config/runtime-environment';
import { environment } from './environments/environment';

/** Shows why the app did not start, as plain text: an unusable `auth` must not fall back to another realm. */
function showConfigurationError(problems: readonly string[]): void {
  const heading = document.createElement('h1');
  heading.textContent = 'Ahoy cannot start: its configuration is invalid';
  const list = document.createElement('ul');
  for (const problem of problems) {
    const item = document.createElement('li');
    item.textContent = `config.json: ${problem}`;
    list.append(item);
  }
  const main = document.createElement('main');
  main.append(heading, list);
  document.body.replaceChildren(main);
}

// The team's sign-in comes from /config.json, read before the auth library is provided (one image for every team).
loadRuntimeEnvironment(
  environment,
  globalThis.fetch.bind(globalThis),
  globalThis.location.origin
)
  .then(({ environment: env, document: config, problems }) => {
    if (problems.length > 0) {
      for (const problem of problems) console.error(`config.json: ${problem}`);
      showConfigurationError(problems);
      return;
    }
    return bootstrapApplication(
      App,
      createAppConfig(env, { document: config })
    );
  })
  .catch((e: unknown) => console.error(e));
