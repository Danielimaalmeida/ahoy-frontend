# Ahoy frontend · progress

Updated 2026-11-06 (`feat/portability-4-copilot-token`; offline checks passed with a stubbed `@acme-fedev/auth`). One
page: replace it, do not append; git history is the archive (the 3,692-line page before this one:
`git show b1f9b88:docs/progress.md`). The review of both repositories, with its proposals (not yet agreed), is
`ahoy-hosted`'s `docs/harness-review-2026-10-20.md`; the user kept Meetings outside its freeze on 2026-10-24
(`ahoy-hosted` `design.md` §1 and §5).

## Where we are

- **This branch (`feat/portability-5-mcp-defaults`, 2026-11-06, D23 step 5, on top of step 4):** Team settings ›
  Phases shows, under each phase's name, the MCP servers its runs get and where they come from, read-only since only
  the deployment sets them: "Jira, Confluence (set by the deployment)", "density-mcp (built in)", "the agent profile's
  own" (the built-in phases name no other server) or "none"; under the table, each agent profile's own servers at the
  content repository's HEAD. Setup's MCP step comes from the API, which now lists what the phases and agent profiles
  ask for and points at the reconciler's preflight. The contract is `ahoy-hosted`'s `feat/portability-5-mcp-defaults`
  (140 operations implemented). With `@acme-fedev/auth` stubbed in `node_modules`, the whole suite (218 files, 3,736 tests),
  `ng build`, typecheck, lint and format pass; e2e was not run and nothing ran against an API.
- **Step 4 (`feat/portability-4-copilot-token`, 2026-11-06, D23 step 4, on top of step 3):** Team settings has a
  "You" group with **My Copilot token** (`/settings/copilot-token`): each person pastes their own Copilot PAT, which
  the API seals and never shows again (only `••••` and its last four characters); Test asks GitHub who it is (0 AIU)
  and keeps the answer as the last test (a refusal shows a banner with what to do); Replace and Remove (after a second
  press). Nobody else sees it, admins included. Without `AHOY_SECRETS_KEY`, or when the key no longer opens the
  stored token, a banner says so; a sign-in without a qnumber is told the page is not for it. Setup lists it in a
  "You" panel, never required, with a link for admins and members alike, and the side navigation says "Saved" or
  "Check" from Setup. The settings history names "Saved/Replaced/Removed their Copilot token". The contract is
  `ahoy-hosted`'s `feat/portability-4-copilot-token` (140 operations implemented).
- **Step 3 (`feat/portability-3-setup`, 2026-11-06, D23 step 3, on top of step 2):** Team settings opens on a
  new section, **Setup** (`/settings/setup`, "Start here"): how many required steps are done ("6 of 8") with a bar,
  what is left by who fixes it, and when the API checked; the installation's steps read-only (the chart fixes them);
  the team's, each with a way to the section that fixes it (Open, Set, Fix in…, Review) and, for an admin, Keep
  defaults on Phases. A member sees the steps and a link to People. While a required step is not done, every page shows
  a banner under the top bar (admins: the next step and where it is fixed; members: that the admins are setting Ahoy
  up) with Open setup; while not ready, each page checks again, so a step fixed in Team settings clears it. Start voyage stays on: the API does not refuse a story while a step is missing (`ahoy-hosted`
  design §5 "Setup"). The Phases history reads "Kept the defaults (from Setup)". The contract is `ahoy-hosted`'s
  `feat/portability-3-setup` (136 operations implemented).
- **Step 2 (`feat/portability-2-people`, 2026-11-06, D23 step 2, on top of step 1):** Team settings has a new
  section, **People** (`/settings/people`): an admin adds a qnumber as member or admin, makes an admin a member or the
  reverse, and removes someone after a second click; their own row shows no controls. The deployment's own people
  (`AHOY_ALLOWED_QNUMBERS`, `AHOY_ADMIN_QNUMBERS`) are listed read-only. The box refuses what is not a qnumber and
  someone already listed before sending; the API's refusals show as a banner. The navigation counts the people. The app no longer refuses on `/config.json`'s
  `allowedQnumbers`: the API decides, so a person added in People gets in. The
  contract is `ahoy-hosted`'s `feat/portability-2-people` (migration 0042), which deploys with this branch (134
  operations implemented). With `@acme-fedev/auth` stubbed in `node_modules`, the whole suite (212 files, 3,701
  tests), `ng build`, typecheck, lint and format pass; e2e was not run and nothing ran against an API.
- **Step 1 (`feat/portability-1-meeting-labels`, 2026-11-06, asked for by the user on 2026-11-06: another team of
  the company installs its own Ahoy, `ahoy-hosted` D23):** the names of a meeting's two sides are a team setting.
  Team settings has a new section, **Meetings** (`/settings/meetings`): "Our side" and "Stakeholders' side", 1 to 40
  characters on one line, with their history; the navigation says "Defaults" until an admin saves them. The meeting
  pages (topic tags, composer, end-of-meeting summary, story draft, Confluence page) read them through
  `MeetingLabelsStore` instead of the fixed names, and show "Us" and "Stakeholders" until then. The contract is
  `ahoy-hosted`'s `feat/portability-1-meeting-labels` (migration 0041), which deploys with this branch (131
  operations implemented). The `build:compress` and `analyze` scripts now read `dist/ahoy-frontend`, the folder the
  build writes. `environment.test.ts` and the dev proxy still name our TEST host and SSO: another team's image takes
  its realm and client from `/config.json` (F17), and our TEST build keeps its fallback until its deployment mounts
  that file. With `@acme-fedev/auth` stubbed in `node_modules`, the whole suite (210 files, 3,694 tests), `ng build`,
  typecheck and lint pass; `npm run format` passes on every changed file (`docs/architecture.md` was already
  unformatted on main); e2e was not run and nothing ran against an API.
- **Merged before (`feature/R3DA-14787-auto-defects`, 2026-11-06):** merges `origin/main` at `1330060b` without
  rewriting history. The combined contract preserves automatic defect handling, voyage restart and the new plan
  panel endpoints. No API or TEST environment was used for validation.
- **Included (`feat/restart-voyage`, 2026-11-06, asked for by the user on 2026-11-06: a cancelled voyage could not
  be started again later):** a cancelled voyage's header has **Start again…** as its primary action
  (`dialogs/restart-voyage-dialog.ts`): a total cap (the current one when it leaves room, more than what is already
  spent) and a required reason, sent as `restartStory`; the voyage sets sail from intake as a fresh attempt, owned by
  the person, and the page reads everything again. The dialog says nothing of the cancelled attempt is carried over,
  its history stays and its spend stays spent; Cancel voyage now says a voyage can only start again that way. The
  mock backend answers `restartStory` as `ahoy-hosted`'s `feat/restart-cancelled-story` does, which deploys with this
  branch. Without `@acme-fedev/auth` (not reachable from the cloud session) the suite ran without `src/app`'s own
  spec, `core/auth` and `features/meetings`: 193 files, 3,314 tests pass; typecheck (outside those), lint and format
  pass; `ng build` and e2e were not run. `api:check` reports the generated types as not up to date on main too
  (formatting).
- **Merged before (#66, `feat/defect-auto-start`, 2026-11-06, asked for by the user on 2026-11-06):** Ahoy starts defects.
  Backlog › Defects has **Try to fix** on each defect with no voyage that nobody ignored and whose key may be a
  voyage's (`try-to-fix-dialog.ts`): it
  asks for the voyage's AIU cap, starting at Team settings › Defects' cap per defect, calls `startDefect` and opens the
  voyage; a refusal (a voyage started first, a defect the watch no longer lists) says so, and closing reads the list
  again. Each row says who started its voyage ("Started by Ahoy" for the watch's own starts) or why the watch could
  not, and a banner says when the watch starts nothing by itself. Team settings › Defects adds **Automatic starts**
  (on/off), **AIU cap per defect** (at most 200 AIU, required while on), **Starts per day** and **Open voyages at
  once**; turning the starts on, or raising the cap or the starts per day while on, shows the most it may spend a day
  and asks for a yes, sent as `confirmSpend` (as the API's `spendsMore` decides). The log and every "by" read
  `ahoy-defect-watch` as Ahoy. The side
  navigation says "Fixing" while it starts defects. The contract is `ahoy-hosted`'s `feat/defect-auto-start`
  (migration 0039), which deploys with this branch. With `@acme-fedev/auth` stubbed in `node_modules`, the whole suite
  (201 files, 3,420 tests), `ng build`, typecheck, lint and format pass; e2e was not run.
- **Plan panel (`feature/plan-panel-mode`, with `ahoy-hosted` D22, migration 0039):** a voyage is planned by one
  planner, as before, unless it is planned by a **panel**: three cheaper planners each write a plan in parallel, then a
  judge writes the final plan from the best of each and rates every draft 1 to 10. Tested on fakes and the mock backend
  only; never run against an API or in a browser.
  - **Set sail** has a "Planning" choice (standard preselected, or panel, which costs more AIU and shows the panel's
    models from `GET /models` `planPanel`); `planningMode` is in the start request only for a panel.
  - **Voyage › Models** shows the mode and has **Change planning** (`POST /stories/{key}/planning-mode`, from the next
    planning run). **Voyage › Plan** has a "Plan panel" section (judge, drafts with score, gate verdict and reasons, each
    draft's plan on demand, earlier panel runs). **Metrics › Cost** has "Plan panel ratings" per model and judge.
  - `Story.planningMode` and `ModelCatalog.planPanel` are optional in the guards (an older API sends neither).
- **Included (`feature/R3DA-14787-defects-ux`, PR #24, 2026-11-06):** a Jira backlog containing a Defect no longer
  fails as `invalid_response`. The contract sync had removed Defect from the backlog guard and types, and deleted its
  client regression tests. `JiraBacklogIssue` and `JiraBacklog` now explicitly retain Defect compatibility at the API
  boundary, with a shared, compile-time-checked list of supported types; the vendored contract and generated files stay
  untouched. The restored client tests cover Story, Task, Bug and Defect in a mixed backlog, reject Epic, and still
  validate a Defect's readiness. The existing adapter test confirms Defects are preserved in the displayed backlog.
- **Included on this branch (`feat/defects-without-repositories`, 2026-11-05, agreed with the user on 2026-11-05):** Team settings
  › Defects has no component map any more, and a defect no longer shows or needs a repository: the planner finds the
  repositories from the content repository's routing and the code (`ahoy-hosted` D21, its
  `feat/defects-without-repositories`, migration 0038). The section keeps the watch, the query with Preview and the
  priorities; the history no longer names components in new saves (an old save's still reads "Components: N").
- **Merged before (#63, `feat/running-indicator`, 2026-11-05, asked for by the user on 2026-11-05: the people using Ahoy found
  no immediate sign on a voyage's page that it is running):** while a voyage is `running` or `ready`, an **Under way**
  strip (`header/under-way-strip.ts`, words in `context/under-way.ts`) sits under the header on every tab: who is at
  work and in which phase, a timer that moves every second, the agent's newest step (from the `RunProgressBuffer`), the
  run, its model and what it has spent, with **Watch live** (the Runs tab; left out there) and **Open run**. It says
  "Starting … for …" while the run is queued or its worker is starting (the `workerStartup` words, until steps
  arrive), "At work on …" while the current run is not in the list yet, "Moving on in …" between runs (timed from the
  last run's end) and "Queued for …" before the first; only the heading is announced, not the timer; it is not shown while Ahoy waits for CI (that banner stays). While
  `running`, a bar sweeps along the header's top edge, the badge's dot pulses (`ah-status-badge` `pulse`), the current
  phase is ringed (`ah-phase-stepper` `live`), the Runs tab has a live dot (`SectionTab.live`) and the browser tab's
  title starts with "● Running · PROJ-140 · " (`runningTitle`). Motion stops under reduced motion. The design was
  approved by the user on 2026-11-05 (there was no "stop requested" state to show: Stop halts at once). With
  `@acme-fedev/auth` stubbed in `node_modules`, the whole suite (201 files, 3,402 tests), `ng build`, typecheck, lint and format
  pass; e2e was not run.
- **Merged before (`feat/artifacts-list-redesign`, #62, 2026-11-05, asked for by the user on 2026-11-03):** the voyage's
  **Artifacts** list is grouped: top-level files first, then one collapsible heading per folder (`design/frames/`, with
  its count, or how many changed in Compare); a design frame's PNG, its JSON and its `--` variants are one collapsible
  entry (`file-tree.ts`), the variants named "↳ 118-4994". Each row has a type badge (MD, JSON, PNG), the name without
  its folder, and the size (View) or a coloured change badge (Compare); the per-row View and Compare links are gone
  (the pill sets the mode). A filter box and, in Compare, "Changed only" sit above the list, which scrolls on its own.
  **Images** (PNG, JPEG, GIF, WebP; SVG stays text) are read as bytes (`getArtifactBlob`, same endpoint) and shown as
  pictures through cached object URLs (`artifact-images.ts`) instead of their bytes as text; Compare shows a changed
  image's two revisions side by side and a new or removed one alone. The API types PNGs `text/plain`, so the kind
  comes from the extension. The tab was screenshotted from its rendered test DOM in Chromium; not run on `ng serve`.
- **Merged before (`feat/deploy-all-to-test`, #59, 2026-11-04):** **Release to TEST** (`ahoy-hosted` design §4 "Branch
  releases", asked for by the user on 2026-11-04: one click releases everything). The voyage header has a green pill
  with a rocket, "Release to TEST" and how many repositories it releases, while at least one repository of the voyage
  has an open pull request and a release workflow (not on a cancelled voyage). It opens "Deploy N repositories'
  branches to TEST?", listing each repository once (its packages share the branch) with the branch, the pull request,
  the workflow and its inputs, and naming the repositories left out for want of a workflow; confirming sends
  `POST /stories/{key}/branch-releases/all` (`confirm: true`), says in a toast what was queued and what was left out
  and why, and reads the releases again. The per-package Deploy to TEST stays on the Work packages tab; the releases
  are now read once for the voyage (`context/branch-releases.ts`, provided by the shell). The header, dialog and toast
  were opened in Chromium (Playwright) on `ng serve` with the test fixtures as every API answer, for screenshots.
- **Merged before (`feat/christmas-decorations`, #60, 2026-11-05):** the temporary Halloween decorations of the top bar become
  Christmas ones, asked for by the user on 2026-11-04: a tree for the logo, a star on the current destination, fairy
  lights under the bar, snowflakes between Crew and the search box (hidden below 1360px), and a bauble swinging on the
  right. The 🎄 button turns them off (`ahoy.christmas` in `localStorage`); motion stops under reduced motion.
  `HalloweenService` is now `ChristmasService`. With `@acme-fedev/auth` stubbed in a scratch copy, the top-bar and
  service specs pass (37 tests) and the app was screenshotted on the in-browser mock backend; `ng build`, typecheck,
  the full suite and e2e were not run (no private registry here).
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
- **Contract:** `openapi/ahoy-v1.yaml` combines `ahoy-hosted`'s plan-panel contract at `63f1e9e` and its automatic
  defect/voyage-restart contract at `ec2a793d`, retaining `Defect` in `JiraBacklogIssue.issueType`. `schema.d.ts`
  and the test mirror are generated from the combined contract. Merge the corresponding backend features and their
  migrations before deploying this frontend; this merge does not change the backend.
- **Never run against an API.** No record of the app against a local `ahoy-hosted --simulate` or TEST: every screen was
  checked by unit and component tests on the mock backend only (Crew and Team settings over
  `HttpTestingController`). No Teams, Figma or Jira was called. On 2026-11-01 the first six Team settings sections were
  also opened in Chromium (Playwright) on `ng serve`, with the test fixtures as every API answer, for screenshots. The
  Defects and Branch releases screens were never opened in a browser.

## Proof

- **Current merge** (2026-11-06, local checkout, Node 24.22.2): `npm run build`, typecheck (app, specs and boundaries),
  lint (ESLint and Stylelint), `npm test -- --watch=false` (207 files, 3,680 tests) and format all passed. The build
  reports component-style budget warnings, no errors. API artifacts were regenerated from the combined contract;
  the mirror check passes. The focused Angular regression run also passed (4 files, 558 tests, Node 26). Installed
  dependencies were used without an auth stub. Not run: Playwright, a browser, a local hosted API, a live API or TEST.
  No AIU was spent.
- **Run before** (2026-11-05, `feat/defects-without-repositories` merged with `main` after #63, same setup as below):
  Vitest 201 files, 3,400 tests, all passed (the component map's specs removed, its refusal test replaced by one for priorities, and one for an old save's history entry); typecheck, eslint,
  stylelint, `ng build` and `prettier --check .` passed. Not run: Node 24, the real `@acme-fedev/auth`, the Playwright
  suite, a real API.
- **After merging main into the plan panel branch** (2026-11-06, Node 24.22.1, contract `ahoy-hosted` `63f1e9e`):
  typecheck with the boundary check, eslint, stylelint, Prettier, `ng build` and all Vitest tests passed (206 files,
  3,653 tests); the contract mirror check passes. Not run: Playwright, a browser, a local API or TEST.
- **Run before** (2026-11-06, `feature/R3DA-14787-defects-ux`, local checkout, Node 24.22.2 through `npx node@24`,
  installed dependencies without an auth stub): `npm run build`, typecheck (app, specs and boundaries), lint (eslint
  and stylelint), `npm test -- --watch=false` (201 files, 3,407 tests) and format all passed. Build has component-style
  budget warnings, no errors. The focused client, backlog adapter, defect client and contract specs also passed
  (4 files, 473 tests) through the Angular tool on Node 26. The initial targeted run caught the existing adapter's
  Defect type error before the fix. The Node 24 wrapper initially passed its npx configuration into nested npx calls,
  preventing lint; clearing those inherited options let lint, tests and format finish. Not run: Playwright, a local
  hosted API, a live API or TEST. No auth stub, real Jira call or AIU spend was used.
- **Run before** (2026-11-05, `feat/artifacts-list-redesign` on `main` after #59, same setup as below): Vitest 200
  files, 3,386 tests, all passed (new: `file-tree` 6, `artifact-images` 3, `getArtifactBlob` 2, the image kinds 1, the
  tab's grouping, filter, "Changed only" and three image cases 6); typecheck, eslint, stylelint, `ng build` and
  `prettier --check .` passed. Not run: Node 24, the real `@acme-fedev/auth`, the Playwright suite, a real API.
- **Run before** (2026-11-04, `feat/deploy-all-to-test` on `main` after #58, cloud container, Node 22, a local
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

- **After `feat/portability-1-meeting-labels` deploys with its API** (2026-11-06, D23): an admin saves our team's own
  two names in Team settings › Meetings, or TEST's meeting pages and Confluence copies say "Us" and "Stakeholders".
- **After `feat/portability-4-copilot-token` deploys with its API** (2026-11-06, D23): each person saves their Copilot
  token in Team settings › My Copilot token and tests it; once everyone has, the cluster's `ahoy-copilot-<qnumber>`
  Secrets can be deleted (implementation on Actions still reads the repository secrets).
- **Before the next TEST deploy of the front end** (2026-10-30): mount a `/config.json` with FIO's `auth` (realm and
  client from `environment.test.ts`, and the three redirect URIs exactly as FIO's client registered them: today's
  build sends `<origin>/`, and `<origin>//ui/oauth/silent-refresh.html` for silent refresh), `jiraBaseUrl` (`https://atc.acmegroup.net/jira`) (no `allowedQnumbers`: the API decides, D23), then
  sign in once on TEST; after that, drop the values from `environment.test.ts` so the image carries no team's (audit #16).

0. **Decide on the review** (its §7): above all, nothing merges without a check that ran.
1. Merge `ahoy-hosted`'s `feat/defects-without-repositories` (migration 0038) and ahoy-agents'
   `feat/planner-finds-repositories` together with this branch. On a machine with the
   private registry and Node 24, repeat the full check with the real `@acme-fedev/auth`: `npm ci`, then
   `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix or drop `test:scripts`.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, migrations up to 0038): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings (migrations 0018, 0019 and 0022: an action ticked done, two browsers on one meeting in progress, a
   screenshot pasted into a note and opened large, a meeting cancelled and one marked done, a question answered after
   its meeting ended and reopened) and Crew (migration 0021 and the board in Team settings › Jira: add the team, a swap for a
   holiday, its Undo) and Team settings (`AHOY_SECRETS_KEY`, `AHOY_ADMIN_QNUMBERS`: add a server, put a
   repository on it, change its host with the token, and read the history; connect a fake Jira, preview a query, set
   a board and add a fixed field; connect a fake Teams webhook and send a test card, save a fake Figma token and test it,
   turn Business-rule review on and see the confirmation; lower a phase's cap, raise one with the confirmation, and save
   a catalogue; at the delivery gate, Assess comments with a note; set a defects query and priorities, wait
   for a pass, ignore a defect and undo it; add a repository's release workflow and deploy a package's branch with a fake `gh`). The Copilot token page waits on security.
4. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click,
   then publishing to Confluence through its API (today the page copies wiki markup).
5. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
