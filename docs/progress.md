# Ahoy frontend · progress

Updated 2026-11-01 (Team settings › Phases, with `ahoy-hosted`'s `feat/phase-settings`; tested on the mock HTTP
backend only). One page:
replace it, do not append; git history is the archive (the 3,692-line page before this one:
`git show b1f9b88:docs/progress.md`). The review of both repositories, with its
proposals (not yet agreed), is `ahoy-hosted`'s `docs/harness-review-2026-10-20.md`; the user kept Meetings outside its
freeze on 2026-10-24 (`ahoy-hosted` `design.md` §1 and §5).

## Where we are

- **This branch (`feat/phase-settings`, 2026-11-01, on `main` after #51):** Team settings has a sixth section,
  **Phases** (`/settings/phases`, "As deployed", "1 changed" or "Models changed" in the navigation). An admin sets
  each phase's default model and effort (from the catalogue; the efforts the chosen model takes), the AIU cap of one
  run, the timeout in minutes and, for implementation, how long it waits for CI; "Default" or an empty field is the
  deployment's value, which shows in grey under the field. A field `AHOY_PHASE_CONFIG` sets shows as text with "Set by
  the deployment". A cap above the phase's most allowed (`AHOY_MAX_PHASE_BUDGET_AIU` or the deployment's own cap,
  whichever is higher; unset, a banner says caps can only be lowered) or a timeout that is not whole minutes is
  refused under its field before anything is sent, and so is an effort the chosen model does not take; only the fields
  the admin changed are judged. Raising a cap, including giving a lowered one back to the deployment's, shows a
  banner, asks in a dialog ("Raise and save") and is sent with `confirmSpend: true`; lowering one saves at once. The
  model catalogue is edited as a list (id, label, efforts), saved whole, or given back to the built-in list; it is
  text when `AHOY_MODEL_CATALOG` sets it. An admin's save that another beat shows theirs; non-admins read everything;
  the history reads each field in words. The SonarQube servers table keeps a token on one line ("Set" and the day
  under it, who set it on hover and to screen readers), puts Default under the server's name and heads the count
  "Repos", so it fits at 1440 px without scrolling.
- **Merged on 2026-11-01:** Team settings › Teams, Figma and Agents (PR #51, with `ahoy-hosted`'s
  `feat/teams-figma-agents-settings`): the channel's webhook and test card, the Figma token and UI builders, and who
  runs the four agents' jobs, turning on the two that spend AIU after a confirmation.
- **Merged before:** Team settings › Jira (PR #50, with `ahoy-hosted` #73).
- **Merged on 2026-10-31:** Team settings › SonarQube (PR #49, with `ahoy-hosted` #72).
- **Merged on 2026-10-30:** one image for every team, toward a Helm chart (PR #48, F17, architecture "Runtime
  configuration"): `/config.json` read once before bootstrap. `environment.test.ts` still holds FIO's realm and client
  as the fallback until the TEST deployment mounts `/config.json`.
- **On `main`:** the shell with All hands and Needs you, Voyages, Set sail with the model catalogue, the Docks (the Jira
  backlog with readiness, harness fit and Refine), the voyage page (header with Stop, Resume, Budget, Models, Unblock,
  Refresh design and the pull request links; tabs Plan, Questions, Work packages, Runs, Gates, Artifacts, Log and
  Models), the run detail with live steps, Metrics, the halt diagnosis, knowledge-review lessons, WebEAM sign-in with
  the qnumber allow-list, Meetings slices 1 to 3 and the Crew page.
- **Contract:** `openapi/ahoy-v1.yaml` is vendored from `ahoy-hosted`'s `feat/phase-settings` (`92bf13b`, PR #75;
  the commit in its header changes if that branch moves before merging), formatted with this repository's Prettier; `schema.d.ts` and the test mirror are regenerated
  from it. Needs on the API: migrations 0025 to 0031, `AHOY_SECRETS_KEY` and `AHOY_ADMIN_QNUMBERS`, and optionally
  `AHOY_MAX_PHASE_BUDGET_AIU`. Merge and deploy with the `ahoy-hosted` pull request.
- **Never run against an API.** No record of the app against a local `ahoy-hosted --simulate` or TEST: every screen was
  checked by unit and component tests on the mock backend only (Crew and Team settings over
  `HttpTestingController`). No Teams, Figma or Jira was called. On 2026-11-01 the six Team settings sections were
  also opened in Chromium (Playwright) on `ng serve`, with the test fixtures as every API answer, for screenshots.

## Proof

- **Last full run** (2026-11-01, `feat/phase-settings`, cloud container, Node 22, a local stand-in for
  `@acme-fedev/auth` in `node_modules` because the private registry is not reachable, dependencies installed from the
  lock file with the `@acme-fedev` entries left out), after the code review's high and medium findings were fixed:
  Vitest 186 files, 3,242 tests, all passed (new: the Phases page 14, `domain/phase-settings` 9, its guard and client
  5, the frame's Phases state 1, two contract fixtures; the frame's four tests and the contract's operation list now
  include Phases); `npm run typecheck` (app, specs, `check-boundaries`), `npm run lint` (eslint, stylelint), `ng build` and `prettier --check .` passed (the
  `crew-page.ts`, `docks.ts` and `metrics.scss` styles are over the 4 kB warning budget and two meetings dialogs warn
  NG8011, as on `main`). Not run: Node 24, the real `@acme-fedev/auth`, nginx, the Playwright suite, and the page against a
  real API (the pages were only looked at in Chromium over fixtures).
- **`api:check`:** its mirror half passes; its `schema.d.ts` half fails, also on `main`, because the file is kept
  Prettier-formatted and `openapi-typescript --check` compares the raw output. The formatted output of
  `npm run api:types` is byte-identical to the committed file.
- **Merged without any Angular check:** "Blocked is not Ended" (PR #31) and its review fixes, Meetings slice 2, slice 3
  and the grill discard fix (their sessions ran only a stand-in `tsc`, the pure specs and Prettier).
- **CI:** none runs on github.com. `test.yml` and `lints-format.yml` call `ATC-GitHub/reusable-workflows` on
  `atc-ubuntu-latest`, which do not exist there, and `npm ci` needs the private registry for `@acme-fedev/*`.

## Open decisions

- Which Prettier configuration stays: `.prettierrc` (single quotes, 80 columns) is read before `.prettierrc.json`
  (double quotes, 120 columns), while CLAUDE.md asks for double quotes.
- Whether to wire the mock backend back into a build (`start:mock`) or delete it.
- `@acme-fedev/auth` is `^8.0.0` in runtime dependencies (the rule is exact pins) and `@acme-fedev/playwright-helpers`,
  a test helper, is a runtime dependency. Changing either is a dependency change and needs approval.

## Next, in order

- **Before the next TEST deploy of the front end** (2026-10-30): mount a `/config.json` with FIO's `auth` (realm and
  client from `environment.test.ts`, and the three redirect URIs exactly as FIO's client registered them: today's
  build sends `<origin>/`, and `<origin>//ui/oauth/silent-refresh.html` for silent refresh), `jiraBaseUrl` (`https://atc.acmegroup.net/jira`) and `allowedQnumbers`, then
  sign in once on TEST; after that, drop the values from `environment.test.ts` so the image carries no team's.

0. **Decide on the review** (its §7): above all, nothing merges without a check that ran.
1. Merge `ahoy-hosted`'s `feat/phase-settings` (migration 0031) and this branch together. On a machine with the
   private registry and Node 24, repeat the full check with the real `@acme-fedev/auth`: `npm ci`, then
   `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix or drop `test:scripts`.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, migrations up to 0031): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings (migrations 0018, 0019 and 0022: an action ticked done, two browsers on one meeting in progress, a
   screenshot pasted into a note and opened large, a meeting cancelled and one marked done, a question answered after
   its meeting ended and reopened) and Crew (migration 0021 and the board in Team settings › Jira: add the team, a swap for a
   holiday, its Undo) and Team settings (`AHOY_SECRETS_KEY`, `AHOY_ADMIN_QNUMBERS`: add a server, put a
   repository on it, change its host with the token, and read the history; connect a fake Jira, preview a query, set
   a board and add a fixed field; connect a fake Teams webhook and send a test card, save a fake Figma token and test it,
   turn Business-rule review on and see the confirmation; lower a phase's cap, raise one with the confirmation, and save
   a catalogue). The Copilot token page waits on security.
4. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click,
   then publishing to Confluence through its API (today the page copies wiki markup).
5. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
