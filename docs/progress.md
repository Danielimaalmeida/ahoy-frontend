# Ahoy frontend · progress

Updated 2026-11-04 (Release to TEST, with `ahoy-hosted`'s `feat/deploy-all-to-test`; tested on fakes, and seen in
Chromium with the test fixtures as every API answer, only). One page: replace it,
do not append; git history is the archive (the 3,692-line page before this one: `git show b1f9b88:docs/progress.md`).
The review of both repositories, with its proposals (not yet agreed), is `ahoy-hosted`'s `docs/harness-review-2026-10-20.md`; the user
kept Meetings outside its freeze on 2026-10-24 (`ahoy-hosted` `design.md` §1 and §5).

## Where we are

- **This branch (`feat/deploy-all-to-test`, 2026-11-04):** **Release to TEST** (`ahoy-hosted` design §4 "Branch
  releases", asked for by the user on 2026-11-04: one click releases everything). The voyage header has a green pill
  with a rocket, "Release to TEST" and how many repositories it releases, while at least one repository of the voyage
  has an open pull request and a release workflow (not on a cancelled voyage). It opens "Deploy N repositories'
  branches to TEST?", listing each repository once (its packages share the branch) with the branch, the pull request,
  the workflow and its inputs, and naming the repositories left out for want of a workflow; confirming sends
  `POST /stories/{key}/branch-releases/all` (`confirm: true`), says in a toast what was queued and what was left out
  and why, and reads the releases again. The per-package Deploy to TEST stays on the Work packages tab; the releases
  are now read once for the voyage (`context/branch-releases.ts`, provided by the shell). The header, dialog and toast
  were opened in Chromium (Playwright) on `ng serve` with the test fixtures as every API answer, for screenshots.
- **Merged before (`feat/cancel-voyage`, #58, with `ahoy-hosted` #83):** a person can cancel a voyage for good
  (`POST /stories/{key}/cancel`, `ahoy-hosted` design §4 "Cancel", asked for by the user on 2026-11-04 from R3DA-14682, which
  could only stay halted). The header has **Cancel voyage** on every voyage that is not over; its dialog needs a reason,
  says a run under way is cancelled in the background, that Jira and pull requests are left as they are, and that it
  cannot be undone. The new status `cancelled` shows as an outlined **Cancelled** badge (`ah-badge--cancelled`, the app's own, since the bundle has none), has its own chip on the Voyages
  board (it is out of Halted and Needs you), opens on the Activity tab, marks the phase it was cancelled in as stopped
  ("Cancelled at phase N"), and the row note says "Cancelled in <phase>". The mock backend answers `cancelStory`. In
  this cloud session `@acme-fedev/*` could not be installed: typecheck, lint, format and 190 of the 197 spec files
  (3,251 tests) pass without it; the 7 that import it, `ng build` and e2e were not run.
- **Merged before (`feat/branch-release`, with `ahoy-hosted` #82):** branch releases (`ahoy-hosted` design §4
  "Branch releases", asked for by the user on 2026-11-04). On the voyage's Work packages tab, each package with an
  open pull request has a "TEST release" line: the latest release (Queued, Started on GitHub or Refused by GitHub,
  with the branch, who asked and when, and a link to the workflow's runs on GitHub), and **Deploy to TEST…** when its
  repository has a release workflow. The button opens a confirmation with the branch, the pull request, the workflow
  and its inputs, then `POST /stories/{key}/branch-releases` (`confirm: true`); the tab reads again on each `branch_release.*` event
  (the reconciler's start or refusal) and, while a release is queued, every 5 seconds for a minute. Without a workflow the line links to the settings. Team settings has a
  new section, **Branch releases** (`/settings/branch-releases`): per repository (`owner/name` or its slug, not a plan alias), the workflow file
  (`branch-release.yaml` by default) and its inputs, one `name=value` a line (`environment=test` and
  `update-ops-tag=true` by default; the backend and the importer take `TEST`), with its history; the navigation shows
  how many repositories or "Cannot start" when the API's dispatch never starts workflows. No workflow was started.
- **Merged before:** the defect watch, slice 1: Backlog › Defects and Team settings › Defects (#56, with
  `ahoy-hosted` #81).
- **Merged before:** Assess comments, the pull request comments panel and Team settings › Pull request comments
  (`feat/assess-comments`, with `ahoy-hosted` #79).
- **Merged before:** Team settings › Phases (`feat/phase-settings`).
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
- **Contract:** `openapi/ahoy-v1.yaml` is vendored from `ahoy-hosted`'s `feat/deploy-all-to-test` (`b299a45`; the
  commit in its header changes if that branch moves before merging), formatted with this repository's Prettier;
  `schema.d.ts` and the test mirror are regenerated from it. Needs on the API: migration 0036 (and 0025 to 0035 before
  it). Merge and deploy with the `ahoy-hosted` pull request.
- **Never run against an API.** No record of the app against a local `ahoy-hosted --simulate` or TEST: every screen was
  checked by unit and component tests on the mock backend only (Crew and Team settings over
  `HttpTestingController`). No Teams, Figma or Jira was called. On 2026-11-01 the first six Team settings sections were
  also opened in Chromium (Playwright) on `ng serve`, with the test fixtures as every API answer, for screenshots. The
  Defects and Branch releases screens were never opened in a browser.

## Proof

- **Last full run** (2026-11-04, `feat/deploy-all-to-test` on `main` after #58, cloud container, Node 22, a local
  stand-in for `@acme-fedev/auth` in `node_modules` because the private registry is not reachable, dependencies
  installed from the lock file with the `@acme-fedev` entries left out): Vitest 198 files, 3,368 tests, all passed (new: the
  header's Release to TEST 5, `releasesQueuedText`, the client and request body of `requestAllBranchReleases` and the
  contract's operation count, 123); `npm run typecheck` (app, specs, `check-boundaries`), `npm run lint` (eslint,
  stylelint), `ng build` and `prettier --check .` passed (the `crew-page.ts`, `docks.ts` and `metrics.scss` styles are
  over the 4 kB warning budget and a meetings dialog warns NG8011, as on `main`). Not run: Node 24, the real
  `@acme-fedev/auth`, nginx, the Playwright suite, and the pages against a real API.
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
1. Merge `ahoy-hosted`'s `feat/deploy-all-to-test` (no migration; 0036 before it) and this branch together. On a machine with the
   private registry and Node 24, repeat the full check with the real `@acme-fedev/auth`: `npm ci`, then
   `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix or drop `test:scripts`.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, migrations up to 0036): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings (migrations 0018, 0019 and 0022: an action ticked done, two browsers on one meeting in progress, a
   screenshot pasted into a note and opened large, a meeting cancelled and one marked done, a question answered after
   its meeting ended and reopened) and Crew (migration 0021 and the board in Team settings › Jira: add the team, a swap for a
   holiday, its Undo) and Team settings (`AHOY_SECRETS_KEY`, `AHOY_ADMIN_QNUMBERS`: add a server, put a
   repository on it, change its host with the token, and read the history; connect a fake Jira, preview a query, set
   a board and add a fixed field; connect a fake Teams webhook and send a test card, save a fake Figma token and test it,
   turn Business-rule review on and see the confirmation; lower a phase's cap, raise one with the confirmation, and save
   a catalogue; at the delivery gate, Assess comments with a note; set a defects query and a component map, wait
   for a pass, ignore a defect and undo it; add a repository's release workflow and deploy a package's branch with a fake `gh`). The Copilot token page waits on security.
4. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click,
   then publishing to Confluence through its API (today the page copies wiki markup).
5. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
