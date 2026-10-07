# Ahoy frontend · progress

**Updated 2026-10-07 by lane 4D (Models tab and Change models dialog), launched from `docs/paralelos4.md` section C through
`/implement` on branch `claude/gifted-einstein-2wo0ou`, from `main` at 959a7b4 (lane 4A merged as PR #15). Lane 4D is built,
tested and checked in a browser on the mock backend. It is committed and pushed with the user's approval (PR #18), and `main` at f795359 (lanes 4B and
4C, PR #16 and #17) is merged in.**

- **Ran for 4D (offline, 0 AIU, Node 24.21.0 via `npx -y node@24`, `npm ci` first):** `npm run build` (no warning),
  `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (with `tokens:check` and `api:check`), `npm test` (104 files,
  **1944 tests**: 45 new, 1 placeholder row removed from `app.routes.spec.ts`) and `npm run format:check`, all green (and again after merging `main` at f795359: 111 files, **2043 tests**); four
  mutation checks of the new tests (all caught); a two-axis `/code-review`, whose real findings were fixed; `npm run
start:mock` driven in headless Chromium at `/voyages/PROJ-118/models` (the table, the dialog, `?change=planning` with the
  focus on Planning, the two-Lookouts error on both rows; light, dark and 390 px).
- **Did not run for 4D:** anything against a real API, `--simulate` or TEST; browsers other than Chromium; a screen reader; a
  pixel diff (compared by eye with `Halted` and `Dialogs`); a real "refused model" (the mock halts PROJ-118 in
  `implementation`, see "Lane 4D" → "Deviations").

Earlier: **lane 4C (Questions), launched from `docs/paralelos4.md` section B on branch
`claude/jolly-pascal-ngq59j` through `/implement`, from `main` at 959a7b4 (lane 4A merged as PR #15). Lane 4C is built, tested
on the mock backend and checked in a browser. It is committed and pushed with the user's approval (PR #17), and `main` at f7f9909 (lane 4B,
PR #16) is merged in.**

- **Ran for 4C (offline, 0 AIU, Node 24.21.0 via `npx -y node@24`):** `npm ci`, `npm run build`, `npm run typecheck`
  (`check-boundaries: ok`), `npm run lint` (with `tokens:check` and `api:check`), `npm test` (105 files, **1946 tests**: the 1900
  of `main`, 47 new, one placeholder row removed from `app.routes.spec.ts`) and `npm run format:check`, all green; 6 mutation
  checks of the new tests (all caught); `npm run start:mock` in headless Chromium (light, dark, 390 px; PROJ-131 answered
  through Q2 and Q3, and a draft kept through a page reload).
- **Did not run for 4C:** anything against a real API, `--simulate` or TEST; browsers other than Chromium; a screen reader; a
  pixel diff (compared by eye with `Questions`); the folded earlier round and the "not waiting for answers" form in a browser
  (the mock has only one round; both are tested on the mock with a rewritten answer); `/code-review` findings are listed in
  "Lane 4C" below.

Earlier: **lane 4B (Plan tab and decision)**, launched from `docs/paralelos4.md` section A through `/implement` on branch
`claude/pensive-ritchie-9ja01b`, from `main` at 959a7b4 (lane 4A merged as PR #15). Lane 4B is built, tested and checked in a
browser on the mock backend. Merged into `main` since (PR #16).

- **Ran for 4B (offline, 0 AIU, Node 24.21.0 via `npx -y node@24`):** `npm ci`, `npm run build`, `npm run typecheck`
  (`check-boundaries: ok`), `npm run lint` (with `tokens:check` and `api:check`), `npm test` (106 files, **1953 tests**: `main` has
  102 files and 1900; 54 new in 4 files, one placeholder row removed from `app.routes.spec.ts`) and `npm run format:check`, all
  green; `npm run start:mock` in headless Chromium (PROJ-123: light, dark and 390 px, the Send back dialog, a forced
  `decision_already_recorded`); a two-axis `/code-review` (standards and spec), whose real findings were fixed.
- **Did not run for 4B:** anything against a real API, `--simulate` or TEST; a mutation check of the new tests; other browsers
  than Chromium; a screen reader; a pixel diff (compared by eye with `PlanReview`); the `States` and `Dialogs` boards only by eye
  and only for the states the mock can force (`stale_version` and `revision_ceiling_reached` are unit-tested, not seen in the browser).

Earlier: **lane 4A (voyage base: context, commands, header, tabs and dialogs), launched from
`docs/paralelos3.md` section D on branch `claude/quirky-gates-t6b390`, from `main` at a2a49fe (all of waves 1 and 2, lane 2D
included as PR #11). Lane 4A is committed and pushed with the user's approval, and `main` at 470c1e5 (lanes 3A, 3B and 3C,
PR #12, #13 and #14) is merged in, with its conflicts resolved (`README.md`, this file and `src/app/app.routes.spec.ts`). Its
pull request is merged into `main` (PR #15).**

- **Ran for 4A (offline, 0 AIU, Node 24.21.0 via `npx -y node@24`):** `npm ci`, `npm run build`, `npm run typecheck`
  (`check-boundaries: ok`), `npm run lint` (with `tokens:check` and `api:check`), `npm test` (88 files, **1607 tests**, 120 new)
  and `npm run format:check`, all green. Also 13 mutation checks (12 caught), and `npm run start:mock` in headless Chromium
  (the 8 voyages, the 3 dialogs, a forced conflict; light, dark and 390 px).
- **Did not run for 4A:** anything against a real API, `--simulate` or TEST; a screen reader; other browsers than Chromium; a
  pixel diff (the screens were compared by eye with the wireframes).

Earlier: **lane 3C (The Docks, planned), launched from `docs/paralelos3.md` section C on branch
`claude/dazzling-fermat-4tvzii`, from `main` at a2a49fe (which holds every lane of waves 1 and 2, lane 2D included as PR #11).
Lane 3C is built, tested and compared with the `Docks` wireframe in a browser. It is committed (90e9078) and pushed with the
user's approval, and `main` at 86e07ea (lanes 3A and 3B, PR #12 and PR #13) is merged in, with its conflicts resolved
(`README.md`, this file and `src/app/app.routes.spec.ts`). Merged into `main` since (PR #14).**

- **Ran for 3C (offline, 0 AIU, Node 24.21.0 via `npx -y node@24`):** `npm ci` (the tree had no `.bin`), `npm run build`,
  `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (with `tokens:check` and `api:check`), `npm test` (79 files,
  **1527 tests**: the 1487 of `main` and 40 new) and `npm run format:check`, all green; **the same chain green again after merging
  `main`** (91 files, **1780 tests**: the 1740 of `main` and 40 new); `npm run start:mock` in headless Chromium at `/docks`, light,
  dark and 390 px, and once more inside lane 3A's shell after the merge.
- **Did not run for 3C:** anything against a real API, `--simulate` or TEST; the Jira link in a browser (no `jiraBaseUrl` in the
  dev server, it is unit-tested with a configured one); Load more, the error states and the loading skeleton in a browser (unit-tested
  only: the stub has 9 items and the mock never fails by itself); other browsers than Chromium; a screen reader; a pixel diff;
  mutation checks of the new tests.

Earlier: **lane 3B (Set sail), launched from `docs/paralelos3.md` section B on branch
`claude/focused-maxwell-wcaacl` through `/implement`, from `main` at a2a49fe (every lane of waves 1 and 2, lane 2D included as PR #11). Lane 3B is built, tested and checked in a browser on the mock backend. It is committed (b42d869) and pushed with the user's explicit approval, and `main` at 503f97e (lane 3A, PR #12) is merged into the branch by a merge commit, with the conflicts resolved (see "Lane 3B" → "Bringing `main` in"). No pull request has been opened yet.**

- **Ran for 3B (offline, 0 AIU, Node 24.21.0 via `npx -y node@24`):** `npm ci`, `npm run build` (no warning),
  `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (with `tokens:check` and `api:check`), `npm test` (**89 files, 1740 tests** after the merge of `main`: the 1627 of `main` with lane 3A, 114 new, one row removed from `app.routes.spec.ts`; 81 files and 1600 tests before it) and `npm run format:check`, all green; 26 mutation checks of the new tests; a two-axis `/code-review` (standards and spec), whose real findings were fixed; `npm run start:mock` driven in headless Chromium (light and dark, 1100 px and 390 px, empty submit, a real set sail, `story_exists`, the Lookout conflict, a simulated `503` with Try again).
- **Did not run for 3B:** anything against a real API, `--simulate` or TEST; browsers other than Chromium; a pixel diff (the
  wireframe was compared by eye); nothing here ran on a real phone.

Earlier: **lane 3A (shell, All hands and Voyages), launched from `docs/paralelos3.md` section A on branch
`claude/determined-wright-jqbqht`, from `main` at a2a49fe (every lane of waves 1 and 2, lane 2D included as PR #11). Lane 3A is
committed and pushed with the user's explicit approval, in two commits: 8051c60 (the lane as first built) and a second one (the
fixes from its two-axis review, and this report). No pull request has been opened yet.**

- **Ran for 3A (offline, 0 AIU, Node 24.21.0 via `npx -y node@24`):** `npm ci`, `npm run build` (no warning), `npm run typecheck`
  (`check-boundaries: ok`), `npm run lint` (with `tokens:check` and `api:check`), `npm test` (85 files, **1627 tests**: 143 new in 8
  files, 3 placeholder cases removed from `app.routes.spec.ts`) and `npm run format:check`, all green; fourteen mutation checks;
  `node scripts/mock-api.dist-check.mjs` on the production `dist/` (clean); `npm run start:mock` in headless Chromium, light and
  dark, at 1440 px and 390 px (counters, search, chips, a stream event moving a voyage between the panels with no reload,
  Reconnecting and back to Live).
- **Did not run for 3A:** anything against a real API, `--simulate` or TEST; browsers other than Chromium; a screen reader; a pixel
  diff (compared by eye); the 390 px layout and the keyboard in an automated test (jsdom has no layout: lanes 6B and 6C).

Earlier, **lane 2D (mock backend and `mock:api`)**, launched from `docs/paralelos2.md` section D on branch
`claude/blissful-wozniak-qr2816`, from `main` at a99a7a2: committed and pushed with the user's approval, reviewed in six findings
(see "Lane 2D" → "Review fixes"), and merged into `main` since (PR #11).

- **Ran for 2D (offline, 0 AIU, Node 24.21.0 via `npx -y node@24`):** `npm ci`, `npm run build`, `npm run typecheck`
  (`check-boundaries: ok`), `npm run lint` (with `tokens:check` and `api:check`), `npm test` (77 files, **1487 tests**, 85 new after the review fixes)
  and `npm run format:check`, all green; ten mutation checks; `npm run start:mock` in headless Chromium (the API, the event
  stream and the switches served in the page); `npm run mock:api` beside `npm start`, with `curl` and a stream reader through
  the real dev proxy (events arrive one by one); `scripts/mock-api.dist-check.mjs` on the production `dist/` (clean) and on a
  mock build (caught).
- **Did not run for 2D:** anything against a real API, `--simulate` or TEST; the mock under real screens (none reads data yet);
  the dist check in CI (lane 6D's `ci.yml`).

Earlier, **lane 1C (kit: interaction and content)**, launched from `docs/paralelos2.md` section B on branch
`claude/secao-b-paralelos2-1l7xpu`: committed with the user's approval, with `main` merged in (at c2562e9), pushed, and merged
into `main` since (PR #10).

- **Ran for 1C (offline, 0 AIU, Node 24.21.0 via `npx node@24`):** `npm ci`, the approved install of `@angular/cdk@22.2.1`
  and `marked@18.1.0`, `npm run build`, `npm run typecheck` (`check-boundaries: ok`), `npm run lint`, `npm test` and
  `npm run format:check`, all green on the lane's own tree (42 files, 900 tests, 100 new) and again after each merge of
  `main` (see "Final check" in the lane 1C section); `/_kit` served by `ng serve` and screenshotted in headless Chromium,
  light and dark, at 1100 px and 390 px; the live CDK dialog driven in that browser (focus, Esc, focus return); nine
  mutation checks of the tests.
- **Did not run for 1C:** `npm run start:mock` (lane 2D's mock was not in `main` then; 1C shows no API data); anything against
  an API; other browsers than Chromium; a pixel diff (compared by eye).

Earlier: **lane 1B (kit: state, progress and navigation), launched from `docs/paralelos2.md` section A on branch
`claude/paralelos2-section-a-h4ef52`, built on `main` at 56e815a, with `main` at 9b4e16f (lane 2A's finishing pass, PR #7, and lane 2B,
PR #8) merged into the working tree. Lane 1B is built, tested and compared with the design-system previews in a browser. **Nothing is
committed:** the merge is staged and unfinished (`git merge --no-commit`, `HEAD` is still 56e815a), so the one commit that concludes it
will carry the lane and the merge together, once the user approves it.**

- **Ran for 1B (offline, 0 AIU, Node 24.21.0 via `npx node@24`):** `npm run build`, `npm run typecheck` (`check-boundaries: ok`),
  `npm run lint` (with `tokens:check`), `npm test` (47 files, **1046 tests**: 800 before this lane and 246 new) and
  `npm run format:check`, all green on the lane's own tree; the same chain green after merging `main` (58 files, **1302 tests**);
  14 mutation checks of the tests; `/_kit` served by `ng serve --configuration mock` and screenshotted in headless
  Chromium in light and dark at 1100 px and 390 px next to the design system's previews; the live toast.
- **Did not run for 1B:** anything against a mock backend or an API (the components take no data and lane 2D has not built the mock);
  the wireframe boards in a browser; a screen reader; browsers other than Chromium. Details in "Lane 1B" below.
- **Ran for 2B (offline, 0 AIU, Node 24.21.0 via `npx node@24`):** `npm ci`, `npm run build`, `npm run typecheck`
  (`check-boundaries: ok`), `npm run lint` (with `tokens:check`), `npm test` and `npm run format:check`, all green, on the lane's
  own tree (41 files, 946 tests, 146 of them new) and again after merging `main` (see "Final check" in the lane 2B section);
  nine mutation checks of the new tests.
- **Did not run for 2B:** anything against an API, `--simulate` or the mock backend (2D has not built it); the app in a browser
  (no screen uses the new services yet).
  **Lane 2A finishing session (branch `claude/eager-cray-4c3z42`, started from `main` at 56e815a, which already holds phase 0 and lanes 1A, 2A and 2C). Lane 2A is now complete offline: the three dev dependencies are installed, `schema.d.ts` is generated, `api:types` and `api:check` exist (and `lint` runs `api:check`), `core/api/types.ts` is made of aliases of the generated types and `contract.spec.ts` is green. At the user's request (the contract is sovereign) the session also corrected `src/app/domain/types.ts`, which did not match the contract, and the domain code that read the wrong shapes, and fixed `sync-openapi.mjs`. It was merged into `main` as PR #7.**

- **Ran for the 2A finishing pass (offline, 0 AIU, Node 24.21.0 via `npx -y node@24`, copied into the session scratchpad and
  put first on `PATH`; the system Node was 22.22.0):** `npm ci`, the approved `npm install`, `npm run build`,
  `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (with `tokens:check` and now `api:check`), `npm test` (34 files,
  **910 tests**: the 800 of `main`, 82 in the new `contract.spec.ts`, 18 new in `api-client.spec.ts` and 10 for the domain
  types: 6 in the new `domain-types.spec.ts`, 3 in `models.spec.ts`, 1 in `outcome.spec.ts`), `npm run format:check`,
  `npm run api:check`, and `npm ci` again from the new lockfile, all green. Also eleven mutation checks of the new tests and
  scripts, and nine runs of `sync-openapi.mjs` (section "Lane 2A").
- **Did not run for 2A:** `scripts/smoke-api.mjs` and `scripts/capture-fixtures.mjs` (written, only syntax-checked: they need a
  local API, as the lane says); anything against the `ahoy-hosted` API (no Docker daemon, no Postgres server); the CI workflow
  (a pull request runs it, and it does not run `api:check` yet); `sync-openapi.mjs` with an https URL.
- **Earlier, for the 2A first pass (2026-10-06):** 499 tests on the lane's own tree, `npm start` in headless Chromium (the app
  boots with the new initializer and interceptor), the client over Angular's real `fetch` backend with a fake `fetch`, and
  five mutation checks of the tests.
- **Ran for 1A (offline, 0 AIU, Node 24.21.0 via `npx node@24`):** `npm ci`, `npm run build`, `npm run typecheck`,
  `npm run lint` (now also `tokens:check`), `npm test` (98 tests, 11 files), `npm run format:check`, all green;
  `/_kit` served by `ng serve` and screenshotted in headless Chromium in light and dark at 1100 px and 390 px, next to
  the design system's Button, Panel, Field, Banner and DataTable previews.
- **Did not run for 1A:** `npm run start:mock` against a mock backend (lane 2D has not built one; 1A calls no API);
  the wireframe boards in a browser; any API.
- **Phase 0:** see "Lane P0" below.

## Where we are

**Wave 4 has begun.** Lane 4B (Plan tab and decision) is built on the mock backend and waits for the user's review and approval to
commit (section "Lane 4B"). Lane 4A is merged (PR #15), so lanes 4C, 4D, 5A, 5B and 5C (`docs/paralelos4.md` sections B to F)
can run beside it.

**Lane 4D (Models tab and Change models dialog) is built on the mock backend, committed and pushed (PR #18)**: see "Lane 4D" below.

Phase 0, lane 1A (PR #4), lane 2A (PR #5 and PR #7) and lane 2C (PR #3) are merged into `main`: an
Angular 22 app that builds, tests and serves, with the CLAUDE.md conventions enforced by `tsc`, ESLint, Prettier and
`scripts/check-boundaries.mjs`, the design kit foundation and `/_kit`, the `ApiClient` with its guards, the auth seam and the runtime
`AppConfig`, and the pure domain (`statusPresentation`, `explainHalt`, AIU, time, diff).

Wave 1 is merged: lane 2A (API client, PR #5) and lane 2C (pure domain, PR #3). Lane 2A's first pass has `ApiClient` with the 19
operations of phases 3 to 6, `ApiError` and its predicates, the manual guards, `parseRunProgress`, `readStoryState`, the
`AuthStrategy` seam, `CurrentUser`, the runtime `AppConfig` (and `API_BASE` taken from it), the fixtures and the vendored contract.
**Its finishing pass is merged too (PR #7):** `openapi-typescript`, `ajv` and `yaml`
are installed (with an `overrides` entry, see the lane 2A section), `schema.d.ts` is generated, `api:types` and `api:check` exist,
`core/api/types.ts` is made of aliases of the generated types, and `contract.spec.ts` validates the fixtures, the problems and the
request bodies against the YAML with Ajv. No screen shows data yet and no call has ever reached a real API (risk R1 is still open).

**Lane 2C (domínio puro)** is merged: `src/app/domain/` has the vocabulary mappings (`statusPresentation`, `outcomePresentation`,
`explainHalt`), the AIU and time helpers, `CREW` and the only diff implementation of the project (`diff` 9.0.0), with 218 tests.
Its `types.ts` was still provisional and did not match the contract. **The 2A finishing pass corrected it, at the user's request
(the contract is sovereign), in PR #7:** the types now have the contract's fields and enums,
`reviewersConflict` reads the plan as the API sends it, and `core/api/domain-types.spec.ts` fails when the two drift apart.
What changed, and the two presentation choices that need a review, are under "Needs from lane 2C" in the lane 2A section.

**Wave 2, lane 2B (realtime and stores)** is committed on `claude/ecstatic-allen-vkmfqi`, with `main` merged in, in review:
`core/realtime/` (`FETCH`, `CLOCK`, `parseSseStream`, `EventStreamClient`, `EventBus`, the polling fallback) and `core/stores/`
(`StoriesStore`, `StoryStore`, `RunProgressBuffer`, `StoryEventsFeed`). No screen uses them yet. Lanes 1B, 1C and 2D of wave 2 run
in other sessions.

**Wave 2, lane 1B (kit: state, progress and navigation) is built and tested, not committed** (branch `claude/paralelos2-section-a-h4ef52`,
with `main` merged into the working tree and the merge not yet committed).
In `src/app/ui/`: `ah-status-badge`, `ah-phase-stepper` (full and compact), `ah-budget-meter`, `ah-outcome-pill`, `ah-filter-chips`,
`ah-section-tabs` (route tabs and the pill), `ah-top-bar` (with the Live / Reconnecting indicator), `ah-empty-state`, `ah-skeleton`,
`ToastService` with `ah-toast-host`, and the pipes `ahAiu`, `ahRelative`, `ahDateTime` and `ahActor` with a `CLOCK` token, all taking
their vocabulary from `@domain`, with 246 new tests and 11 sections in the `/_kit` gallery compared with the design system's
previews in light and dark. Lane 2B (the paragraph above) has been merged since it was written (PR #8). No screen uses any of this
yet, and no data, mock or API was involved. Lane 1B has been merged since (PR #9).

**Wave 2, lane 1C (kit: interaction and content)** is committed on `claude/secao-b-paralelos2-1l7xpu`, with `main` merged in, in
review: `ah-dialog` on the CDK `Dialog` with `DialogService`, `ah-choice-card-group`, `ah-question-card`,
`ah-model-choice-table`/`-row`, `ah-live-steps`, `ah-ships-log`, `ah-artifact-diff` with `ahMark`, and `ah-markdown` with the pure
`renderMarkdown`, each in the `/_kit` gallery. New runtime dependencies `@angular/cdk` 22.2.1 and `marked` 18.1.0. No screen uses
them yet.
Lane 1C has been merged since (PR #10).

**Wave 2, lane 2D (mock backend)** is **merged into `main`** (PR #11): `MockAhoyServer` in `src/testing/mock-backend/` (the 19 operations with the contract's checks and errors, a
simulated reconciler, `/events/stream` with `Last-Event-ID`, the switches and the eight seeded voyages), checked against the
YAML with Ajv; `npm run start:mock` serves it in the browser and `npm run mock:api` over HTTP behind the real dev proxy. With it
in `main`, the whole of wave 2 is there and wave 3 can start (`docs/paralelos3.md`).
Lane 2D has been merged since (PR #11).

**Wave 4, lane 4C (Questions)** is built and tested on the mock backend, **uncommitted** (branch `claude/jolly-pascal-ngq59j`).
`/voyages/:key/questions` lists `listQuestions` by round (the newest open, earlier rounds folded in `<details>`), each with
"Round {r} · {Crew} asks", "{k} of {n} answered" and a meter, an `ah-question-card` per question and the "What happens next"
panel. Answers are final: only a click on "Send answer" sends, "Use recommendation" fills and stops. What is typed is a draft
in memory and in `sessionStorage` (`ahoy.draft.{key}.{Qn}`) until it is sent. Conflicts keep the text. See "Lane 4C" below.

**Wave 3, lane 4A (voyage base)** is committed and pushed on `claude/quirky-gates-t6b390`, with `main` merged in, **in review**
(pull request into `main`). `/voyages/:key` now
shows the real voyage page on the `StoryStore`: breadcrumb, header (key, badge with the API words, title, the primary action for
the status, Budget, Models and Stop, the phase stepper, owner, budget meter, current run, revision round, agent config), the
Anchored banner, the seven section tabs with counts, and the default tab for the status. `VoyageContext` (one per page) is
what every tab injects. `CommandRunner` in `core/commands/` sends every command. The Stop, Resume and Budget dialogs work
against the mock, conflicts included. The tabs are still placeholders: they belong to wave 4 (`docs/paralelos4.md`). Lanes 3A, 3B and 3C are merged (PR #12, #13 and #14) and
merged into this branch.

**Wave 3, lane 3A (shell, All hands and Voyages)** is committed and pushed on `claude/determined-wright-jqbqht`, **in review** (no
pull request yet). `src/app/app.ts` is the shell: the top bar with the needs-you count, the Live indicator and the user, a search that
leads to `/voyages?q=`, one `main`, the toast host, `ThemeService`, and a clock that ticks so "22 m ago" stays fresh.
`src/app/features/harbour/` is All hands (`/`) and `src/app/features/voyages/` is Voyages (`/voyages`). Both read the `StoriesStore`,
which follows the event stream, and open a voyage in the `StoryStore` only while a row on screen needs more than its story. They are
checked on `npm run start:mock` against the `Main` and `Voyages` boards. Lanes 3B, 3C and 4A run in other sessions.

**Wave 3, lane 3B (Set sail)** is committed and pushed on `claude/focused-maxwell-wcaacl` (with `main` and lane 3A merged in; **no pull request yet**): `/voyages/new?key=&title=`
is a typed Reactive Form (`SetSailPage`, `ah-set-sail`) in `src/app/features/set-sail/`: Jira key (capitals as you type), Title,
Total budget read by `parseAiu` (never a float), the five "Crew and models" rows on `ah-model-choice-table`, "Before you sail" with
"Set sail · up to {X} AIU", and `startStory` with its refusals (`409 story_exists` with an "Open PROJ-145" link, `400` per field,
banners for the rest). Only the slots the user filled in are sent. It runs on the mock backend today, inside lane 3A's shell (the toast, the page width and the top bar's "Set sail" button come from it); 3C (The Docks) and 4A (the voyage it opens) are the other lanes of the wave.

**Wave 3, lane 3C (The Docks, planned)** is built and tested, not committed (branch `claude/dazzling-fermat-4tvzii`):
`/docks` has the "Planned screen" banner, the search, Jira status and Assignee selects, the All / Not started / In Ahoy pill
and the backlog table with the **Ahoy** column joined to the `StoriesStore`. The backlog comes from a `BacklogPort`, today a
`StubBacklogAdapter` with the wireframe's nine fictional stories. Lane 3C has been merged since (PR #14).

## Start here next

0. **User, lane 4D:** review and merge PR #18 (`src/app/features/voyage/tabs/models/**`, section "Lane 4D" below). It also
   edits one line outside the lane, `src/app/app.routes.spec.ts` (the `/models` placeholder row, as that file's comment says a
   lane must do). Lanes 4B, 4C, 5A, 5B and 5C of `docs/paralelos4.md` run in other sessions.
1. **User:** review lanes 4B and 4C (sections "Lane 4B" and "Lane 4C" below, in particular their "Decisions and deviations" and
   the edits outside their directories, in `src/app/app.routes.spec.ts`), and merge them. Lane 4B is in `main` (PR #16), lane
   4C is PR #17; lane 4A (PR #15) and every earlier lane are merged. The other lanes of wave 4 (4D, 5A, 5B, 5C) run in their
   own sessions; **when sections A to F of `docs/paralelos4.md` are all in `main`, open `docs/paralelos5.md`.**
2. **User, review:** the two presentation choices in `src/app/domain/` that the contract forced and the design system does not
   cover (run `awaiting_input` shows as `input`; `waiting` stays as the design system's word, outside the API type). See "Needs
   from lane 2C" in the lane 2A section.
3. **User:** make the cloud environment's setup script install Node 24 (sessions still start on Node 22.22.0, which
   Angular 22 rejects), and run `npm ci` (the lane 2B session started without `node_modules`). Until then each agent must put
   `npx node@24` first on its `PATH` (see "Prompt for a new session"). Proposed setup script, **untested**:
   `mkdir -p /opt/node24 && npm install --prefix /opt/node24 node@24` and
   `ln -sf /opt/node24/node_modules/node/bin/node /root/.local/bin/node` (`/root/.local/bin` comes before
   `/opt/node22/bin` in the sessions' `PATH`; `npm install -g node@24` is not an option, because npm's global bin is
   Node 22's own directory). Check with `node -v` in a new session.
4. **User, decided 2026-10-07:** keep the `.prettierignore` entries for the copied agent skills (they stay in `main`, and
   they make `npm run format:check` green), and report the two `bundle.css` defects to the design system (section
   "Lane 1A"). The report text was handed to the user; whether it was sent is not recorded here. When the design system
   has fixed them, re-sync `docs/design/` and `src/styles/ahoy-bundle.css` and delete the matching rules in
   `src/styles/_ahoy-angular.scss`.
5. **Done, for the user to know:** CI runs `api:check` because `npm run lint` does (as lane 1A did with `tokens:check`); `ci.yml`
   is untouched. If a separate CI step is preferred, remove it from `lint` and add one (lane 6D appends to `ci.yml`).
6. **Wave 3:** 3A, 3B and 3C are merged (PR #12, #13 and #14); 4A is item 1. Screens develop on `npm run start:mock`; e2e
   (6C) can use `npm run mock:api` behind the real proxy. **6D** is optional (`docs/paralelos1.md`); when it runs, add the mock
   dist check to CI (lane 2D, "Needs from other lanes").
7. Optional, whenever a session has Docker and Postgres: run `npm run dev -- --simulate` in `ahoy-hosted`, then `npm start`
   here, then `node scripts/smoke-api.mjs --confirm-simulate`, and `node scripts/capture-fixtures.mjs --confirm-simulate`
   after driving a story through the simulation. That is the first time the client would meet a real API, and it would
   confirm the `state.json` field names `readStoryState` reads. Also `curl -s localhost:4200/api/v1/health` and
   `curl -N localhost:4200/api/v1/events/stream` for the proxy against the real API (lane 2D already checked the proxy's SSE
   path against `npm run mock:api`), which is also the first test of lane 2B's SSE parser against the real server.
8. **For lanes 2B, 6A and 4A** (details under "Needs from other lanes" of lane 3A): the row details that All hands and Voyages
   both read are written twice, because features may not import each other; `StoryHandle` cannot stop watching a resource; the
   local error banners wait for `ah-error-state`.

## Prompt for a new session

> Read `CLAUDE.md`, `docs/progress.md`, `docs/plan/00-overview.md` and `docs/plan/<phase>.md`. Implement **only** lane
> `<id>`; follow the protocol in §9 of the overview. First run `node -v`: if it is below 22.22.3, run `npx -y node@24 -v`
> and put that binary first on your `PATH` for every command (see "Node in cloud sessions" below); run `npm ci` if there is no
> `node_modules`. Don't commit or push.
> Finish with your lane's report in `docs/progress.md`.

Sessions are launched from `docs/paralelos1.md` to `docs/paralelos5.md`, one section each.

## Lane 4C · Questions (2026-10-07)

Launched from `docs/paralelos4.md`, section B, on `claude/jolly-pascal-ngq59j` (the branch this session was given; plan §9 would
call it `lane/4c-questions`) through `/implement`, from `main` at 959a7b4. Committed and pushed with the user's approval (PR #17), then `main` at f7f9909 (lane 4B) merged in.

**Pre-flight.** After `git fetch origin`, `main` at 959a7b4 holds the prerequisites: lane 4A (`VoyageContext`, `CommandRunner`,
the shell and the `questions` route in `src/app/features/voyage/`) and lane 1C (`ah-question-card`). Node was v22.22.0, so every
command ran on **Node 24.21.0** from `npx -y node@24`; `npm ci` installed the locked tree. **No dependency was added or
changed.** Baseline on `main`: 104 files, 1900 tests.

### What changed

All under `src/app/features/voyage/tabs/questions/` (the lane's own directory) unless marked.

| File                                        | What                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `questions.routes.ts`                       | The placeholder is replaced by `QuestionsTab` (title "Questions · Ahoy").                                                                                                                                                                                                              |
| `questions-tab.ts`, `questions-tab.scss`    | The tab. Reads the questions from `VoyageContext.handle()`, groups them by round, draws one `ah-question-card` per question and the "What happens next" panel; sends through `context.commands`. Loading skeleton, "No questions", and "Lost contact with the harbour" with Try again. |
| `question-rounds.ts`                        | Pure: `groupRounds` (newest first, "k of n", percent), `unanswered`, `answerProblem` (1 to 20 000 characters, after trim, counted as the contract counts them), `tooLongMessage`, `answerSentToast`.                                                                                   |
| `question-drafts.ts`                        | `QuestionDrafts`: memory plus `sessionStorage` under `ahoy.draft.{key}.{Qn}`, every access in `try/catch`, read back only as a string; `DRAFT_STORAGE` token (the tab's `sessionStorage`, or `null` where the browser denies it).                                                      |
| `app.routes.spec.ts` (**outside the lane**) | One placeholder row removed (`/voyages/PROJ-123/questions`), which asserted the 4C placeholder.                                                                                                                                                                                        |

How it behaves:

- **Rounds.** The newest round is a section with the heading "Round {r} · {Crew} asks" (the crew member comes from the run of
  the question, else from the voyage's phase), "{k} of {n} answered" and a meter; earlier rounds are `<details>` folded under it.
- **Cards.** Q1 answered is final (lock, who, when). Open questions show the recommendation with "Use recommendation" (it fills
  the field and sends nothing), "Your answer" and "Send answer". An open question of a voyage that is not `awaiting_input` has no
  form and says "This voyage isn't waiting for answers right now."
- **Sending.** Only a click on "Send answer" sends `answerQuestion(key, Qn, {answer, expectedVersion})` with the trimmed text,
  through `CommandRunner` (one request per double click). On `ok` the `202` story goes to the `StoryStore`, the answered
  question replaces its row in the list, the field and the draft are cleared, and the toast says "Answer to Q2 sent. 1 question
  left." or "Answer to Q3 sent. All questions answered: Cartographer is queued.".
- **Drafts.** Each field starts from its draft and writes on every change. The fields live as long as the voyage is open, so a
  conflict, a refresh of the story or of the list never touches them; a reload reads `sessionStorage`. Only a recorded answer (or
  "Discard my text") clears one.
- **Conflicts.** `stale_version`: the runner re-reads the story, the banner "This voyage changed since you opened it" shows under
  the card, the text stays and a resend carries the new version. `already_answered`: the list is re-read, the card shows the
  answer of whoever was first, the banner "Someone already answered" shows under it and the user's text stays in a "Your text, not
  sent" block with "Discard my text". Any other failure is a banner under the card, with the text kept.
- **Limits.** More than 20 000 characters (trimmed) shows a message under the card and sends nothing.

### Tests (47 new, 3 files, plus one row removed)

- **`question-rounds.spec.ts` (11):** grouping and order, "k of n", fully answered, empty, `unanswered`, 1 to 20 000 characters
  after trim, characters counted not UTF-16 units, the length message, the two toasts.
- **`question-drafts.spec.ts` (8):** the key, a reload (new instance), per-voyage isolation, only `clear` forgets, an emptied
  text, storage that throws, no storage, the injected default.
- **`questions-tab.spec.ts` (28, on the mock backend):**
  - the list: PROJ-131 round header, "1 of 3 answered", Q1 final and Q2/Q3 open, the recommendations, "What happens next" with
    18.9 AIU and the owner, PROJ-123 all answered, PROJ-109 "No questions", a rewritten answer for two rounds (newest open, the
    other folded), a voyage not waiting for answers;
  - final answers: "Use recommendation" sends nothing, "Send answer" disabled for blank text and sending nothing, the "Recorded as"
    hint, 20 001 characters refused with no request, 20 000 accepted;
  - sending: the exact body `{answer, expectedVersion}` and the toast "1 question left", then Q3 and "All questions answered:
    Cartographer is queued" with the badge moving to Queued and no reload, the double click;
  - drafts: written under `ahoy.draft.PROJ-131.Q3`, "Use recommendation" is a draft, back after a reload, kept through an answer
    and through a forced conflict, deleted once sent, kept when the request fails (`503`), isolated between voyages;
  - conflicts: `stale_version` (notice, text, resend with the new version), `already_answered` raced for real on the mock (the
    other person's answer and the user's text), discarding a kept text, a failed send as a banner under its own card;
  - loading: `503` on the list shows Try again.

**Mutation checks (6, all caught):** no length guard before sending; the draft kept after a recorded answer; no banner for a
failed send; the toast counting the answered question as left; drafts not written to `sessionStorage`; rounds oldest first.

### Verified in the browser

`npm run start:mock` (port 4300) in headless Chromium 1194, driven by the session's global Playwright (not a dependency of the
repo; the script was in the session scratchpad). PROJ-131 against the `Questions` board: round heading, "1 of 3 answered" with
the meter, Q1 final, Q2 and Q3 with their recommendations and the side panel; a draft typed in Q3 was in `sessionStorage` and
came back after `page.reload()`; "Use recommendation" filled Q2 and sent nothing; Q2 and Q3 sent as "POC test answer, not a
product decision." (mock backend only) gave the two toasts and the badge went to Queued without a reload. Dark theme
(`data-theme="dark"`) and 390 px: no horizontal scroll, the side panel drops below. Console: only the known `/config.json` 404.

### Review (`/code-review`, standards and spec, two sub-agents)

Fixed after it:

- the round templates (`let-view`) were typed `any` under `strictTemplates`: a `RoundContext` directive with
  `ngTemplateContextGuard` types them;
- dead code removed: `QuestionRound.open` and `QuestionDrafts.has()` were read only by specs;
- "What happens next" promised "the voyage is queued" even when the voyage was not `awaiting_input`, and showed an invented model
  ("its own model · default") before the model plan was read: now it says the voyage isn't waiting for answers, and leaves the
  model sentence out until `getStoryModels` has answered.

Kept as they are, as judgement calls (none breaks a CLAUDE.md rule):

- the in-memory drafts live in the tab, so with `sessionStorage` denied a draft is lost when the user leaves the tab (the
  context belongs to 4A);
- the "Your text, not sent" block, the locked form and the loading and error states, which the spec does not list;
- an error banner stays under its card until the next send;
- `viewOf` and `QuestionsTab` hold more logic than they might (a split into pure helpers would be cleaner, not needed now).

### Decisions and deviations

1. **No `answer` method on `VoyageContext`.** The context belongs to lane 4A. The tab sends through `context.commands.run(...)`
   with `ApiClient.answerQuestion` and puts the `202` story in the `StoryStore` itself, as 4A's note for wave 4 says.
2. **The 20 000-character limit is checked by the tab, not by the card.** `ah-question-card` only disables "Send answer" for blank
   text. The tab refuses a longer answer, with a message under the card; the button stays enabled but sends nothing.
3. **The folded rounds and the open round are different elements** (`<details>` and `<section>`) around one shared template, so
   the newest round's heading is a real `h2` and not a summary.
4. **"Your text, not sent"** (with "Discard my text") is an addition: the phase file asks only that the user's text "stays
   visible" under the answer of whoever was first. The discard button stops a stale draft from showing on every visit.
5. **"What happens next" with nothing open** says "Every question is answered. Nothing on this voyage is waiting for an answer."
   instead of promising a run.
6. **The card's note** ("used the recommendation, edited") from the wireframe is not shown: the API does not say how an answer was
   written, so the tab does not guess.
7. **The toast counts every unanswered question of the voyage, in every round**, because the API makes the voyage ready only
   when the last pending question is answered.
8. **`already_answered` is tested by a race on the mock** (the other answer lands first and the request is replayed with the new
   version), because the mock's `conflictNext = "already_answered"` answers 409 without recording anyone's answer.
9. **One edit outside the lane:** `app.routes.spec.ts` (one row), as 3B and 4A did for their routes.

### Needs from other lanes

- **Lane 1C (`ah-question-card`):** a `maxLength` input (20 000) so the card itself disables "Send answer" and says why, instead of
  the tab doing it (decision 2). The card also has no place for a message under the textarea, so the tab puts it below the card.
- **Lane 4A (`VoyageContext`):** optionally an `answerQuestion(id, text)` method beside `stop`, `resume` and `setBudget`, so no
  tab needs the `ApiClient` for a command (decision 1). It is not needed for 4C to work.
- **Lane 2A / `core/api`:** nothing new.

### Next

User review and approval to commit. Then the other lanes of wave 4 and, when A to F are in `main`, `docs/paralelos5.md`.

## Lane 4B · Plan tab and decision (2026-10-07)

Launched from `docs/paralelos4.md`, section A, through `/implement`, on `claude/pensive-ritchie-9ja01b`, from `main` at 959a7b4.
Committed, pushed and merged into `main` (PR #16). **Pre-flight** after `git fetch origin`: 4A (`VoyageContext`,
`CommandRunner`, the shell, PR #15), 1C (`ah-markdown`, `ah-choice-card-group`, `ah-dialog`) and 2C (`@domain/text-diff`) are in
`main`. Node was v22.22.0: every command ran on Node 24.21.0 from `npx -y node@24`; `npm ci` installed the tree. **No dependency
was added.** Baseline on `main`: 102 files, 1900 tests.

### What changed (all in `src/app/features/voyage/tabs/plan/`)

- `plan-tab.ts`: the Plan tab. "Implementation plan" in `ah-markdown` with the tag `revision {n}` (n = `revisions[plan_accepted] + 1`),
  "by {crew} · run {id} · {ago}", "Compare with revision {n−1}" (to the Artifacts tab, no query), the legend, "No plan yet", a skeleton
  and an error with Try again; "Acceptance criteria"; "Earlier round" (last human send-back, and "{n} questions answered before this
  plan").
- `plan-document.ts` + `plan-comparison.ts`: reads `implementation-plan.md` at the artifact set's current revision and looks for the
  earlier plan to mark changes against: `findComparison` probes at most 5 revisions back with `getArtifactContent?revision=`, skips
  a `404` and a revision whose plan did not change, stops at any other error (nothing is marked rather than everything) and stops
  when the plan was replaced meanwhile. The plan shows as soon as it is read; the marks follow.
- `plan-decision.ts` + `decision-view.ts`: one `PlanDecision` per tab, shared by the panel and the dialogs: the picked card (none at
  first), the reason (one `FormControl`, so the panel's text reaches the dialog and survives any conflict), the last outcome, the
  conflict. Pure texts and body in `decision-view.ts`. The reason is also kept in memory per voyage (`PlanReasonDrafts`), because
  the "Change" link leaves for the Models tab.
- `decision-panel.ts`: "Your decision". Approve is sent from the panel, with no dialog and no reason. Send back and Reject need the
  reason first (the field shows its error, nothing opens) and then open their dialog. When no decision is open it gives way to
  "No decision needed now" or "Approved/Rejected by {who} · {when}". A gate other than `plan_accepted` gets the same three choices
  and a note that its summary arrives later.
- `plan-dialogs.ts`: `SendBackDialog` ("Send the plan back to Cartographer": round, model, cost, "What should change \*") and
  `RejectDialog` (`danger`, "Reject the plan?"). On `stale_version` the dialog stays open with the notice and the text, and the
  button reads "Send back again" / "Reject again"; on any other error (`revision_ceiling_reached` included) it stays open with the
  banner; it closes on success and on `decision_already_recorded`.
- `decision-conflict.ts`: "{actor} already {approved|sent back|rejected} this plan", "Your {send-back} wasn't recorded. The voyage
  moved on to {phase}. Your text is kept below…", **Copy my text** (Clipboard API in `try/catch`, says if it was refused) and **See
  the decision** (to Gates). The actor comes from the newest human record the user had not seen before sending; without one the
  panel says "Someone".
- `plan-criteria.ts`: the criteria come from the state; when it gives none with text, from the plan's own "Acceptance criteria" list.
- `plan.routes.ts` now routes to `PlanTab`.

### Tests (54 new, 4 files)

`plan-comparison.spec.ts` (9: the probe, 5-revision limit, no earlier revision, `404`, other errors, `304`, cancel),
`decision-view.spec.ts` (19), `plan-criteria.spec.ts` (5) and `plan-tab.spec.ts` (21, on the mock backend through the real routes:
the plan with marks and the 5 AC, the earlier round, the exact request bodies, no send without a reason, a stale version, the ceiling,
a double click, `decision_already_recorded` with Copy my text, read-only views, and Approve after a long leftover reason).

### Verified in the browser (`npm run start:mock`, headless Chromium)

PROJ-123 at 1280 px light and dark and at 390 px: the plan rev. 2 with marked blocks, 5 AC, "Earlier round" with jordan's send-back,
the Send back dialog (with the panel's text), a forced `decision_already_recorded` at 390 px. Compared by eye with `PlanReview`.
The 404s in the browser console are the probes of revisions that had no plan.

### Decisions and deviations (to review)

1. **Nothing is picked at first** (the wireframe shows Send back picked): a stray click must not approve. The button reads "Choose a
   decision" until a card is picked.
2. **The panel validates the reason before a dialog opens**, and the dialog validates it again.
3. **Past the ceiling the texts differ from the spec's template.** The API refuses a send-back when `revisions >= ceiling` (the mock
   does; the hosted code was not read), so at round 4 of 4 a send-back would be "round 5". The panel and dialog then say it may be
   refused and what follows, and the UI never disables the button: the API's `revision_ceiling_reached` is shown as the banner. **The
   exact rule at the ceiling is unconfirmed against the real API.**
4. **"Compare with revision {n−1}" names the gate revision**, while the comparison made for the marks is against an artifact-set
   revision (they can differ: every revision is a whole set). The link carries no query, because the Artifacts tab's parameters are not
   agreed.
5. **The criteria fall back to the plan's own list.** The mock's PROJ-123 state has `acceptance_criteria` without `text`, which
   `readStoryState` drops, so the panel would be empty. See "Needs from other lanes".
6. **"{n} questions answered before this plan"** counts every answered question of the voyage and is hidden at 0.
7. **Send back and Reject at a gate other than the plan's** use "the crew" and "work" in their texts; Approve takes no reason (a reason
   typed before switching to Approve is not sent, and does not block it).
8. The panel shows the model and cost box only for Send back.

### Review (`/code-review`, two axes, on the working tree against HEAD)

- **Standards:** no documented-standard violation. Judgement-call smells: duplicated `model`/`remaining`/`owner` computeds (fixed:
  moved onto `PlanDecision`), a shadowed `read` variable in `PlanDocument` (fixed). **Left as is:** `PlanDecision` mixes the form,
  the drafts and the command; the `(round, ceiling)` pair travels through four functions; one `switch` per decision in
  `decision-view.ts`.
- **Spec, fixed:** an Approve with more than 5000 characters left in the hidden reason field did nothing and said nothing (now an
  approval skips the reason check; test added); a non-content answer for the plan would have left the skeleton up for good. **Left
  as is, by decision above:** items 4, 5 and 6, and the 4B-only extras (`PlanReasonDrafts`, "…again" labels, the criteria fallback).
- **Not in the spec's list but done:** the handoff text in this file and the README (it was missing at review time).

### Files outside the lane's list, and why

`src/app/app.routes.spec.ts` (the 4B row of the placeholder table removed, as its comment tells a lane to do, and the default-tab test
now looks for `ah-plan-tab`) and `src/app/features/voyage/shell/voyage-shell.spec.ts` (one test looked for the Plan placeholder).
Other lanes remove their own rows from the same table, so expect trivial conflicts there.

### Did not run, skipped, and why

Nothing against a real API, `--simulate` or TEST; no mutation checks; `stale_version` and the ceiling banner not seen in a browser;
no screen reader, other browsers or pixel diff; the 390 px layout only by eye.

### Needs from other lanes

- **Lane 2D (mock backend) / 2A (`readStoryState`):** the seeded PROJ-123 `acceptance_criteria` has `id`, `repo` and
  `verification_mode` but no `text`, and `readStoryState` drops an entry without `text`. If the real `state.json` has the text, add it
  to the seed; if not, the reader should keep the id. 4B works either way through `plan-criteria.ts`.
- **Lane 5C (Artifacts):** "Compare with revision {n−1}" links to `/voyages/:key/artifacts` with no parameters. If the tab takes the
  revision to compare from the URL (for example `?compare=<artifact-set revision>`), say so here and 4B will pass it.
- **Lane 4D (Models):** the panel's "Change" opens `/voyages/:key/models?change=planning`.
- **Lane 5B (Gates):** "See the decision" opens `/voyages/:key/gates`.

### Next

Review and approve the commit; merge `main` into the branch before the pull request (other wave 4 lanes edit `app.routes.spec.ts`
too). Then the rest of wave 4.

## Lane 4D · Models tab and Change models dialog (2026-10-07)

Launched from `docs/paralelos4.md` section C through `/implement`, on `claude/gifted-einstein-2wo0ou`, from `main` at 959a7b4.
**Pre-flight:** `main` holds 4A (`VoyageContext`, `CommandRunner`, `voyage/tabs/models/models.routes.ts` as a placeholder),
1C (`ah-model-choice-table`, `ah-dialog`) and the mock backend. Not committed.

### What changed (all in `src/app/features/voyage/tabs/models/`)

| File                      | What it holds                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `models-change.ts`        | Pure: `choiceOf` (blank → `null`, model alone → `{model}`, never `{}`), `changedModels` (only the changed slots), `modelsRequest`, `lookoutsConflict` (effective models, case-blind), `rowSpecs`, `refusedSlots`, `parseChangeSlot` (the query string is untrusted), `slotErrors` (a `400`'s `errors[].path` onto rows). |
| `models-command.ts`       | `ModelsCommand.save`: `setStoryModels` through `context.commands.run`, the `202` plan to `StoryStore.acceptModels`, then the story read again (its version moved). Nothing is sent for an empty change.                                                                                                                  |
| `change-models-dialog.ts` | "Models per phase" on `ah-dialog` and `ah-model-choice-table`: Save is blocked with no change, with two Lookouts on one model (the error on both rows), or a reason over 2000; a `409` keeps what was typed; the server's `400` shows on its row.                                                                        |
| `models-tab.ts`           | The table (Phase, Crew member, Next run gets, Model from, Effort from, Chosen, Change/Reset only on chosen slots), "refused last run", the footer, a retry when the plan cannot be read, and `?change=<slot>` (opens once, focuses that slot, then drops the param).                                                     |
| `models.routes.ts`        | Routes to `ModelsTab`, title "Models · Ahoy".                                                                                                                                                                                                                                                                            |

45 new tests: 30 in `models-change.spec.ts`, 14 in `models-tab.spec.ts` (on the mock backend, with the real routes and dialog).

### Deviations and decisions

- **"refused last run" is on `implementation` in the mock, not `planning`.** `docs/paralelos4.md` and the phase file say PROJ-118's
  `planning` row; the seed (lane 2D) halts PROJ-118 in `implementation` (and 4A's Anchored banner says so). The rule is
  implemented as specified (voyage `halted` with `run_failed`, the last run of the slot's phase `failed`, on the model the slot
  still has), so it marks `implementation`. Either the seed or the acceptance text needs fixing; I did not touch the mock (lane 2D).
- **`VoyageContext` has no `setModels`.** `ModelsCommand` does the same as its `stop`/`resume` from this lane's directory, through
  the same `CommandRunner`. See "Needs from lane 4A".
- **One edit outside the lane:** `src/app/app.routes.spec.ts` lost the `/models` placeholder row, as the file's comment asks.
- **Reset is one click, no dialog**, and sends `{slot: null}`. Its failure shows in a banner above the table.
- **A row `400`** (`errors[].path` naming a slot, or `/models` for the reviewers) goes on its row(s) and the generic "Check the
  highlighted fields" banner shows too. Anything else the server says about the form shows only in the banner.
- Not done: the wireframe's `class="err"` row tint on a refused row (only the badge); a real `400` has not been seen (the mock's
  `/models` one is what the test uses).

### Needs from other lanes

- **Lane 4A:** a `VoyageContext.setModels(models, reason)` (and, ideally, `acceptModels` on the story round-trip) so tabs do not
  inject `ApiClient`; `ModelsCommand` can then be deleted.
- **Lane 2D:** PROJ-118 halted in `planning` (or the acceptance text changed), and a seed with a chosen model, so Change and
  Reset show without first saving one.

## Lane 4A · Voyage base: context, commands, header, tabs and dialogs (2026-10-07)

Launched from `docs/paralelos3.md`, section D, on `claude/quirky-gates-t6b390` (the branch this session was given; plan §9
would call it `lane/4a-voyage-core`), from `main` at a2a49fe. Committed and pushed with the user's explicit approval (CLAUDE.md and paralelos3 rule 8), then
`main` at 470c1e5 (lanes 3A, 3B and 3C) merged in by a merge commit; pull request into `main`.

**Pre-flight.** After `git fetch origin`, `main` at a2a49fe holds all four prerequisites:

- **1B:** `ah-status-badge`, `ah-phase-stepper`, `ah-budget-meter`, `ah-section-tabs`, `ah-empty-state` and `ah-skeleton` in
  `src/app/ui/`.
- **1C:** `ah-dialog` and `DialogService`.
- **2B:** `StoryStore`, `StoryEventsFeed` and `EventBus`.
- **2D:** `src/testing/mock-backend/` and `npm run start:mock`.

Node was v22.22.0, so every command ran on **Node 24.21.0** from `npx -y node@24`, copied into the session scratchpad and put
first on `PATH`; `npm ci` installed the locked tree. **No dependency was added or changed.** Baseline on `main`: 77 files,
1487 tests.

### What changed

| Area        | Files (under `src/app/`)                                                   | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands    | `core/commands/command-runner.ts`, `command-error.ts`                      | `CommandRunner.run(send, { onOk })`: sends with the version the user saw and returns `ok`, `stale`, `decided`, `answered`, `other` or `skipped`. `pending` is a signal; a second `run` while one is in flight is `skipped` with no request (double click). After any `409` it re-reads the story before resolving. `commandErrorView` / `apiErrorView` map each outcome to the banner of plan §5.5 (heading, plain text, `status · code · request id`).                                                                                                                                  |
| Context     | `features/voyage/context/voyage-context.ts`, `voyage-events.ts`, `crew.ts` | `VoyageContext` (provided by the shell, one per page):<br>• signals `key`, `story`, `version`, `status` (`loading` / `ready` / `error` / `notFound`), `error`, `state` (`readStoryState`), `models`, `runs`, `events`, `gateKey` (G11), `revisionRound` / `revisionCeiling` (G10), `isOwner`, `stoppedAt` (G12), `lastHalt` (G7), `counts`, `remainingNanoAiu`;<br>• `refresh()` and `handle()`;<br>• `stop`, `resume` and `setBudget` through the `CommandRunner`, putting the `202` story in the `StoryStore`.<br>Event payloads are read defensively (a wrong field reads as absent). |
| Default tab | `context/default-tab.ts`, `voyage.routes.ts`                               | `/voyages/:key` waits for the story, then replaces the URL with the §5.3 tab: Questions, Plan, Runs, Models (halted), else Plan. The `redirectTo: "plan"` is gone.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Header      | `features/voyage/header/voyage-header.ts`, `primary-action.ts`             | As the `PlanReview` and `Halted` boards: key, badge with `showApi` and the gate or halt reason, H1 (title, else the key), the primary action per status (Answer questions, Decide on the plan / Decide, Resume…, none), Budget (not when done), Models ("Change models" when halted), Stop (only while moving). Then the stepper (`stoppedAt` for Aground) and the meta line (owner and "(you)", 120 px meter, current run, revision round, short sha with the full one in `title`).                                                                                                     |
| Anchored    | `header/anchored-banner.ts`, `halt-guidance.ts`                            | Shown while `halted`:<br>• the title "Anchored: …" from `explainHalt`;<br>• the plain text and the event's detail (for `stopped_by_user`: "Stopped by X. Their reason: “…”");<br>• "To get under way again: …" per reason (9 reasons and an unknown one);<br>• the technical line `reason · runId · phase · ago · "detail"`;<br>• the worker log (last 4 KB in bytes, last 20 lines) in a closed `<details><pre>`, as text;<br>• for `run_failed`, "Change {phase} model" (→ `models?change=<slot>`, or "Change models" for `pr_review`) and "Resume as is".                             |
| Dialogs     | `features/voyage/dialogs/*.ts`                                             | Stop, Resume and Budget, with the `Dialogs` board's texts. They keep their own form, so a conflict never touches the text. On success: a toast in the past tense and close. On a conflict: they stay open with the banner. `CommandState` holds the outcome, the banner and the server's field errors (`400` → field). Budget reads the cap with `parseAiu` and refuses a cap below what is spent, with no request. Resume can't be confirmed with nothing left.                                                                                                                         |
| Shell       | `features/voyage/shell/voyage-shell.ts`                                    | Breadcrumb; header skeleton while loading; "This voyage doesn't exist" with a link to Voyages for a 404 or a malformed key (never sent); "Lost contact with the harbour" with Try again; tabs (`ah-section-tabs`, one URL each, counts on Questions, Runs and Gates); `<router-outlet>`.                                                                                                                                                                                                                                                                                                 |
| Shared spec | `app.routes.spec.ts` (**outside the lane**)                                | It asserted the 4A placeholder ("Voyage PROJ-123 · not built yet") and the placeholder `h1`. Now it gives the voyage routes the mock backend, reads `ah-placeholder h1`, and checks that PROJ-123 opens on Plan. Without this the suite fails.                                                                                                                                                                                                                                                                                                                                           |

### Tests (120 new, 11 files)

- **Runner and errors (21):** `command-runner.spec.ts` and `command-error.spec.ts`:
  - `expectedVersion`, `onOk`, the double click, skipped before load;
  - the refresh after `409`, so a resend carries the new version;
  - classification and the §5.5 headings.
- **Pure pieces (62):**
  - `halt-guidance.spec.ts`: the 9 reasons, all different, plus the wireframe's sentence, no spending promise when the budget
    is exhausted, and an unknown reason;
  - `primary-action.spec.ts`, `voyage-events.spec.ts` (log tail in bytes, G7, G10, G11, G12), `crew.spec.ts`;
  - `budget-dialog.spec.ts` (no floats; `1e3`, `-5` and 10 decimals refused; below spent), `dialog-support.spec.ts` and
    `anchored-banner.spec.ts`.
- **`VoyageContext` on the mock (14):** loading → ready, gate/round/ceiling, `stoppedAt`, last halt, counts, owner, 404, 503 →
  error, a malformed key never sent, no round after the gate is passed, the `202` reaching `StoriesStore`, resume without an
  empty reason, switching keys, commands skipped before open.
- **Shell on the mock (23):** each of the **8 seeded voyages** (badge with the API words, the action buttons, banner or none,
  stepper), the default tab for 5 statuses, the tabs with counts, 404, 503 → Try again.
  - **Stop:** the exact body `{expectedVersion, reason}` (trimmed), and the page shows Anchored without reloading; an empty
    reason sends nothing; `stale_version` keeps the dialog, the banner and the text, re-reads the story, and the resend works;
    a double click sends one request.
  - **Resume:** `{expectedVersion}` without an empty reason, or with the reason; a conflict keeps the text; no budget left →
    disabled, no request.
  - **Budget:** below spent → field error, no request; `40.5` → `budgetNanoAiu: 40500000000`; a conflict keeps both fields.

**Mutation checks (13, 12 caught):**

- caught (the runner, the context, the dialogs and the header):
  - no double-send guard (by the runner spec and by the shell spec);
  - no refresh after a `409`;
  - resume always sending `reason`;
  - a cap below spent accepted;
  - Resume's confirm not disabled without budget;
  - a wrong `run_lost` guidance;
  - halted opening on Plan;
  - Stop closing on a conflict;
  - Stop and Budget always offered;
  - `blockedAt` broken.
- **survived (1):** removing Resume's own `noBudget` check in `submit()`. The disabled confirm of `ah-dialog` already blocks the
  click, so it is a second guard, kept on purpose.

### Verified in the browser

`npm run start:mock` (port 4300) in headless Chromium 1194, driven by the session's global Playwright, which is not a
dependency of the repo. The script is in the session scratchpad.

- **Every voyage:** each of the 8 voyages opens on its default tab, with no horizontal scroll at 390 px.
- **Compared by eye with the boards, light and dark:**
  - PROJ-123 with `PlanReview`'s header;
  - PROJ-118 with `Halted`'s header and banner;
  - Stop, Resume and Budget with `Dialogs`.
- **Dark theme:** it is `data-theme="dark"` on `<html>`, not the media query.
- **Conflict:** with `globalThis.ahoyMock.switches.conflictNext = "stale_version"` the Stop dialog stays open with the notice and
  the text. The resend closes it, and the badge reads Anchored.
- **Console:** the only error is the known `/config.json` 404.
- **After merging `main` (lanes 3A, 3B and 3C):** the chain is green again (102 files, **1900 tests**: the 1780 of `main` and the
  120 of 4A). Inside lane 3A's shell, at 1280 px and 390 px: Stop on PROJ-140 shows the toast "Voyage stopped. It stays
  anchored in planning until someone resumes it.", the top bar's All hands count follows, and there is no horizontal scroll.

### Decisions and deviations

1. **The refresh after any `409`, not only `stale`.** `decided`, `answered` and `invalid_state` also mean the story moved on.
   **`skipped`** is a fifth outcome: nothing was sent (double click, or no story yet).
2. **Halted header:** Resume…, Budget, "Change models" and no Stop, as the `Halted` board shows (the API refuses to stop a
   halted voyage). The phase file lists "Budget, Models, Stop".
3. **`stopped_by_user` banner:** its vocabulary text says "Show their reason", which is an instruction to the UI. The banner
   shows "Stopped by {actor}. Their reason: “…”" instead. For the other reasons the body is the vocabulary text minus the
   sentence already in the title, then the detail.
4. **"Resume as is"** opens the Resume dialog (the cost box), not a direct resume.
5. **The revision round** shows while a gate is open, or while the voyage is back before the phase of the last gate it waited
   on (sent back to planning). It does not show once it has passed the gate.
6. **Budget extras:** "Allows X AIU less" / "The cap stays at…" for a lower or equal cap; a cap of 0 is refused in the field
   (the contract's `minimum: 1`). The amounts in the hint and the error are exact, all decimals, so 12.43 is never rounded down
   to a cap the API would refuse.
7. **Small additions:**
   - "(you)" after the owner;
   - the Budget dialog uses the `info` icon (the board's bank icon is not in `ah-icon`);
   - run ids are shown as the API gives them (the mock's are long, the wireframes show `r-03`).
8. **Malformed keys** (`isStoryKey` fails) read as "This voyage doesn't exist" and are never sent (untrusted route param).
9. **One edit outside the lane:** `app.routes.spec.ts` (see the table). It is the only shared file touched.

### Needs from other lanes

- **Lane 3A (app shell): done by the merge.** `app.ts` now renders `<ah-toast-host />` and the page `<main class="page">`, so
  the dialogs' toasts show and the voyage page takes the shell's padding.
- **Lane 2A / `core/api` owner:** `features/voyage/context/voyage-events.ts` reads the `story.halted`,
  `story.awaiting_decision` and `story.phase_changed` payloads inside the feature. CLAUDE.md puts payload guards in
  `core/api`, and lane 5B (Ship's log) will need the same readers. Proposal: move them to `core/api` as payload guards. Lane 4A
  does not own that directory. Lane 3A wrote the same readings (`haltOf`, the gate of the events) in `harbour/` and
  `voyages/` and asked for them to move up "when a third reader needs them": 4A is that third reader (lane 3A, "Needs from
  other lanes", 2B and 2C).
- **Wave 4 (4B–5C):**
  - inject `VoyageContext` (from `features/voyage/context/voyage-context`) and send commands through `context.commands` or a
    method on it;
  - use `context.handle()` for resources the context does not expose (artifacts, the event feed);
  - read `?change=<slot>` in the Models tab (4D): the Anchored banner links to it.

### Next

User review and approval to commit; then `docs/paralelos4.md`.

## Lane 3C · The Docks, planned (2026-10-07)

Launched from `docs/paralelos3.md`, section C, on `claude/dazzling-fermat-4tvzii` (the branch this session was given; plan §9
would call it `lane/3c-docks`), from `main` at a2a49fe. Committed (90e9078) and pushed with the user's explicit approval (the
lane's rules say not to before); `main` at 86e07ea (lanes 3A and 3B) was merged in afterwards.

**Pre-flight.** `git fetch origin`: `main` has lane 1B's `ah-section-tabs`, `ah-status-badge` and `ah-empty-state` in
`src/app/ui/`, and lane 2B's `StoriesStore` (and the `EventBus`) in `src/app/core/`. Node was v22.22.0, so every command ran on
**Node 24.21.0** from `npx -y node@24`, copied into the session scratchpad and put first on `PATH`. `node_modules` was present
but incomplete (no `.bin`, no `prettier`), so `npm ci` installed the locked tree. **No dependency was added or changed.**
Baseline on `main`: 77 files, 1487 tests.

### What changed

| File                                                   | What                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `features/docks/backlog-port.ts`                       | `BacklogItem`, `BacklogQuery`, `BacklogPage`, `BacklogFacets`, `BacklogScope`, the `BacklogPort` interface (`planned`, `list(query)` → `ApiResult<BacklogPage>`) and `BACKLOG_PORT`, whose default is the stub. Swapping the adapter is one provider.                    |
| `features/docks/stub-backlog-adapter.ts`               | `StubBacklogAdapter`: the wireframe's nine fictional stories, filters (text, Jira status, assignee, scope), paging by plain offsets and the facets of the whole backlog, all on the client. `planned = true`; the "updated" times count back from the `now` it is given. |
| `features/docks/docks.ts`                              | The `ah-docks` screen: banner, search and selects (typed `FormControl`s), `ah-section-tabs` pill, table with `ahTable`, Ahoy column, actions, loading, empty, error and "Load more". `priorityTrend` picks the arrow of a Jira priority.                                 |
| `features/docks/docks.routes.ts`                       | The route renders `Docks` (title "The Docks · Ahoy" unchanged).                                                                                                                                                                                                          |
| `features/docks/*.spec.ts`                             | `stub-backlog-adapter.spec.ts` (13 tests) and `docks.spec.ts` (27).                                                                                                                                                                                                      |
| `app/app.routes.spec.ts` (**outside the lane's list**) | The `/docks` placeholder case is replaced by one test that renders the real screen at `/docks`; see "Files outside the lane's list".                                                                                                                                     |

### How it behaves

- **Planned, in plain sight.** A notice banner "Planned screen. The backlog is not in the API yet…" shows for as long as
  `port.planned` is true, so an adapter for a real endpoint makes it disappear without touching the component.
- **The Ahoy column is real.** Each row looks its key up in the `StoriesStore`: a voyage shows its `ah-status-badge` and phase as
  a link to `/voyages/:key` (**Under way, Crew asks, Your orders, Anchored, Docked** or **Aground**), none shows "Not started".
  The store is kept up to date while the screen is open (`store.use`), so an event moves a row from "Not started" to a voyage
  without reading the backlog again.
- **Never a false "Not started".** Until the voyages are read the column shows a skeleton and offers no "Set sail"; if reading
  them failed it says "Unknown", shows an error banner with Try again, and the Not started / In Ahoy filters say they need them.
- **Actions.** "Set sail" → `/voyages/new?key=&title=` (the summary is the title) for a story with no voyage; "Open voyage" for one
  with a voyage. **"Jira ↗" shows only with `jiraBaseUrl` in the runtime config** (plan G13): `{jiraBaseUrl}/browse/{key}`, key
  encoded, `target="_blank" rel="noopener noreferrer"`. No bulk start, and the footer says why.
- **Counts.** "9 stories · 8 in Ahoy": the matches of the filters from the port, and the voyages the store has. It does not
  pretend to the wireframe's 142: the stub has nine and says so.
- **States.** Skeleton rows for the first read; "No stories match" with Clear filters when a filter is on; "The backlog is empty"
  when none is; an error banner with Try again; an answer to a query that was replaced meanwhile is dropped.

### Proof

All offline, 0 AIU, Node 24.21.0. **No real API was involved** (not the hosted API, not `--simulate`, not the TEST environment).

- **Chain:** `npm run build` (no warning), `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (ESLint, `tokens:check`,
  `api:check`), `npm test` (**79 files, 1527 tests**, 0 failed, 0 skipped) and `npm run format:check`, all exit 0. After merging `main` (3A and
  3B): the same five, all exit 0, **91 files, 1780 tests** (the 1740 of `main` and 40 new).
- **Tests that prove the acceptance criteria:**
  - _The filters and the three states of the Ahoy column with the stub:_ `docks.spec.ts` "with the planned stub" (nine rows and
    columns; Not started, Under way, Crew asks, Your orders, Anchored and Docked joined from the store; the pill, search, Jira
    status and assignee filters; clear filters) over the real `StubBacklogAdapter` and a `StoriesStore` on a `FakeApi`.
  - _Swapping the adapter changes no component:_ "with another backlog" runs the same `Docks` over a hand-written `FakeBacklog`
    (rows, no banner when not planned, the exact queries sent, Load more, empty, error and recovery, stale answers dropped).
  - _No `jiraBaseUrl`, no "Jira ↗":_ "Jira links".
  - _Never a wrong "Not started":_ "while the voyages are not known" (loading and failed).
  - _The stub itself:_ `stub-backlog-adapter.spec.ts` (filters, scope with keys, paging, a foreign cursor, facets).
  - _The route:_ `app.routes.spec.ts` renders `/docks` and checks the h1, the banner and the title.
- **In a browser:** `ng serve --configuration mock` (port 4210) and headless Chromium 1194 through the session's global Playwright
  (not a project dependency; the script lives in the scratchpad, not in the repo), `localStorage["ahoy.mock.actor"] =
"alex@example.com"`: nine rows, "9 stories · 8 in Ahoy" (the mock's eight voyages), **Not started 4 rows and In Ahoy 5 rows**
  (PROJ-140, 131, 123, 118, 097 are in the mock), `scrollWidth` 1280 and **390** (no sideways scroll of the page; at 390 px
  the table scrolls inside its panel, as the wireframe's `.scroll` does). Compared by eye with the `Docks` board in light and
  dark. The one console error is the dev server's 404 for `/config.json` (known, the app runs on the defaults).

### Decisions and deviations (to review)

1. **`scope` and `ahoyKeys` in the query.** The lane's text puts `scope` in `list(...)`, but a backlog adapter cannot know which
   stories have a voyage. The query therefore also carries `ahoyKeys` (the keys in the store) for the two scopes that need it, and
   an adapter that tracks Ahoy's state may ignore it. The keys are sent as one string-compared value, so a status change in the
   store does not read the backlog again; the scopes wait for the store.
2. **`planned` on the port** (not in the lane's text): the banner and "planned" are data of the adapter, not a constant of the
   screen.
3. **`facets` in `BacklogPage`** (not in the lane's text): the Jira status and Assignee options come from the whole backlog and do
   not shrink with the filters. "Unassigned" is always an option; `assignee: null` in the query means unassigned.
4. **`limit` in the query**, 25 per page; `BACKLOG_PORT` defaults to the stub in `root`, with no route provider.
5. **No debounce on the search and no filter in the URL.** Each keystroke reads the port (instant for the stub, and a stale answer is
   dropped); a real, remote adapter should debounce. The lane does not ask for `?scope=` and F3 mentions the URL only for the voyages
   list, so the pill is in the component's state.
6. **Component styles instead of `src/styles/`** (as lane 1C): the priority arrows (inline SVG, `--status-input-fg`, `--ink-muted`,
   `--accent-text`) and the table's own horizontal scroll. Each rule says why. The page box (width and gutter) is the shell's
   `main.page`; the first version of this lane had its own because the shell was not in `main` yet, and the merge removed it.
7. **"Updated" uses the kit's `ahRelative` pipe** ("2 h ago", "1 d ago", "8 d ago"), not the wireframe's "today" and "yesterday". The
   pipe reads the kit's `CLOCK` (`@ui/pipes/clock`), which is not the realtime `CLOCK`; the spec provides both.
8. **Priority arrows** follow Jira's names (High/Highest up, Low/Lowest down, anything else a dash); the meaning is also in the
   text beside the arrow, so colour is never the only signal.

### Files outside the lane's list, and why

- `src/app/app.routes.spec.ts` (lane P0's): it required the `/docks` placeholder and its "lane 3C" text, so replacing the
  placeholder broke it. The case left the table and one test renders the real screen on fakes. Lanes 3A and 3B took their own
  rows out of the same table, which is where the merge conflicted; the result has none of the four rows and keeps the test.
- `docs/progress.md` (this section and the header) and the README "Status", as every lane does.

### Did not run, skipped, and why

- **Nothing against a real API, `--simulate` or TEST**, by design. There is no backlog endpoint to run against (G3).
- **In a browser:** Load more (the stub has nine items, the page size is 25), the loading skeleton, the error banners and the Jira
  link (no `jiraBaseUrl` in the dev server) were only unit-tested.
- **Not checked:** other browsers than Chromium, a real phone (390 px was viewport emulation), a pixel diff (by eye), a screen
  reader (only the markup is tested), mutation checks of the new tests.
- **Skipped test suites:** none.

### Needs from other lanes

- **3A (shell):** nothing now. The top bar already has the "planned" tag on "The Docks" and the shell gives the page box, which the
  Docks uses; its relative times follow the shell's ticking `CLOCK`.
- **Backend (optional, `ahoy-hosted#23`):** `GET /backlog`. Then write a `BacklogPort` adapter for it (with `planned = false`,
  debounced search, and `ahoyKeys` ignored if it knows the voyages), provide it in `BACKLOG_PORT` and delete the stub.
- **6C (e2e):** `/docks` under `npm run start:mock` has the nine stub rows against the mock's eight voyages; set the actor to
  `alex@example.com` for "you".

---

## Lane 3B · Set sail (2026-10-07)

Launched from `docs/paralelos3.md`, section B, through `/implement` on `claude/focused-maxwell-wcaacl` (the branch this session
was given; plan §9 would call it `lane/3b-set-sail`), from `main` at a2a49fe. **Committed (b42d869) and pushed with the user's explicit approval**: the `/implement` skill says to commit and CLAUDE.md says never without the user's specific approval, so the work was left in the working tree until the user answered "Commit e push". Later the user asked to bring `main` in (see "Bringing `main` in").

**Pre-flight.** `git fetch origin`: `HEAD` is `origin/main` (a2a49fe), clean tree. `main` has `ah-field`, `ah-banner` and `ahButton`
(1A), `ah-model-choice-table` in `src/app/ui/model-choice/` (1C), and `MockAhoyServer` with `npm run start:mock` (2D); the 2A
`ApiClient.startStory` and the 2B `StoriesStore` it needs are there too. Node was v22.22.0, so every command ran on **Node 24.21.0**
from `npx -y node@24`, copied into the session scratchpad and put first on `PATH`; `npm ci` installed the locked tree (there was no
`node_modules`). **No dependency was added or changed.**

### What changed

| File (all in `src/app/features/set-sail/`) | Tests       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start-request.ts`                         | 63          | Pure. `budgetProblem`/`budgetNanoAiu` (through `parseAiu`: empty, `0`, `1e3`, `-5`, `25,5`, `.5`, more than 9 places and unsafe sizes are refused; `25.5` is 25 500 000 000), `keyProblem`/`normalizeKey` (`^[A-Z][A-Z0-9]+-[0-9]+$`, at most 40), `modelProblem` (the contract's `ModelId`), `chosenModel`, `buildStartRequest` (only filled slots, `models` and a blank `title` left out, `null` when anything would be refused) `titleProblem` (500 code points once trimmed, as the API counts) and `describeAiu` ("25", "25.5").                                                                                                                                                                                                                                                          |
| `start-errors.ts`                          | 13          | Pure. `startFeedback(error, key)`: `409 story_exists` → error on the key plus the key to open; `400 validation_failed` → each `errors[].path` beside its field (both spellings; `/models` is one `lookouts` message for both Lookout rows), what names no field → banner; `503`/network → "Lost contact with the harbour" with `retry`; `invalid_response` → "Ahoy sent something unexpected"; `401` → "Sign-in needed"; others → title, detail and `status · code · request id`. `withoutField` drops the answer for a field the user edits.                                                                                                                                                                                                                                                  |
| `set-sail-validators.ts`                   | (page spec) | Angular validators over the pure functions (key, budget, title, model id), with the messages each field shows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `set-sail-page.ts`                         | 37          | `SetSailPage` (`ah-set-sail`): typed `FormGroup`, `?key=`/`?title=` through input binding (read as `unknown`, only a single string counts), capitals as you type with the caret kept, `ah-field` and `ah-model-choice-table`, "Before you sail", "Before you sail" (with the button, Cancel and the refusal banner, with Try again when the harbour was unreachable), "How a voyage goes". `submit()` clears the last refusal, marks everything touched, focuses the first problem (or scrolls the banner into view), never sends an invalid form or one with the Lookout conflict, locks the fields and holds the button until the voyage is open, and puts the created story in `StoriesStore`. A voyage that sets sail after the user left still gets its toast, but the user is not moved. |
| `set-sail.routes.ts`                       | 1           | The placeholder is replaced by `SetSailPage`, titled "Set sail · Ahoy".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Seams (agreed with the user before any test was written)

1. **Request (pure):** form text → `StartStoryRequest`, and the validation of key, budget and model id.
2. **Errors (pure):** `ApiError` → what the form shows.
3. **Page** (`TestBed` + `RouterTestingHarness` over the mock backend, with a hand-written interceptor that records every
   `POST`, can hold the answer and can replace it): the plan's acceptance criteria.

### Proof

All offline, 0 AIU, Node 24.21.0. **No real API was involved.**

- **Chain:** `npm run build` (no warning), `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (ESLint, `tokens:check`,
  `api:check`), `npm test` (**81 files, 1600 tests**, 0 failed, 0 skipped) and `npm run format:check`, all exit 0.
- **Acceptance, by test:** invalid key, empty budget, `0`, `1e3`, `-5`, `25.5` (→ 25 500 000 000 nano-AIU) and more than 9 places;
  two Lookouts on one model → the error under both rows, the first one focused, nothing sent; one Lookout alone → sent;
  `PROJ-145` with budget 25 and `planning` = `claude-sonnet-5` / `high` → the request body is exactly
  `{key, budgetNanoAiu: 25000000000, models: {planning: {model, reasoningEffort}}}`; no `models` key when every row is blank; a
  double click sends one `POST` and the button is disabled ("Setting sail…") until the answer; `201` → toast "Voyage PROJ-145 set
  sail.", the story in `StoriesStore`, navigation to `/voyages/PROJ-145`; `409 story_exists` → error on the key, "Open PROJ-123"
  linking to `/voyages/PROJ-123`, the typed text kept, the error gone when the key is edited; `400` → errors beside the field
  and under the model row; `503` → the banner (in the summary, beside the button) with Try again, the typed text kept, the old banner gone while a retry is out or when the next attempt is blocked locally; the fields are locked while the request is out; a voyage that set sail after the user left shows its toast and does not navigate; `?key=A&title=X` → `?key=B` blanks the title.
- **Mutation checks, first round** (each made the suite fail, then was reverted; the tree was clean after): budget read through a float (11
  tests failed), blank slots sent (13), a blank title sent (8), `models` never omitted (4), key not in capitals (3),
  `story_exists` not recognised (2), `/models` under one Lookout only (1), editing the key not clearing its error (2), the double
  submit guard removed (1), the button released before the navigation (2), an invalid form sent (1), the old feedback not cleared
  before a retry (1; **this mutant first survived**, the 503 test could not tell because the navigation destroys the page, so the
  test now holds the retry and looks while it is out), the store not updated (1), the query key not normalised (1).
- **Mutation checks, after the review fixes** (12 more): navigating after the user left (1), the refusal applied to a destroyed
  view (**this mutant first "survived" because my script counted only failed tests, and Vitest reports the resulting NG0911 as an
  unhandled error with exit code 1; the script now reads the exit code too, and the mutant is killed**), fields not locked in
  flight (1), the old banner kept when the form is still invalid (2), the shared `/models` message not on the rows (1), the title
  kept when the query drops it (1), a blank key counting as from The Docks (1), no Try again button (1), the title counted in
  UTF-16 units (2) or untrimmed (1), Try again never offered (2), editing a Lookout keeping the shared message (2).
- **`npm run start:mock` in headless Chromium** (`ng serve --configuration mock`; a throw-away script in the session scratchpad
  with the session's Playwright, not a project dependency): `/voyages/new?key=proj-145&title=Export%20to%20CSV` in light and dark at
  1100 px and 390 px compared by eye with the `SetSail` wireframe: `scrollWidth` equals the window width in all four (no sideways
  scroll); an empty submit shows the two errors and focuses the key; a real set sail of `PROJ-145` (25, planning
  `claude-sonnet-5`/`high`) landed on `/voyages/PROJ-145/plan` and the mock's `story.started` event held
  `budgetNanoAiu: 25000000000` and `models: {planning: {model, reasoningEffort}}` and nothing else; `?key=PROJ-123` →
  "PROJ-123 already has a voyage." with the link `/voyages/PROJ-123`; the two Lookouts on `gpt-5.6-terra` showed the error under
  both rows with "Your choice" tags and Reset on the filled rows. The one console error is `/config.json` answering 404 on the dev server, as in lane 2D's report. After the review fixes, a `failNext=503` at 390 px: the banner sits above the button, inside the viewport (its bottom is 0.5 px from the window's), Try again set sail `PROJ-160`, `scrollWidth` 390.

### Decisions and deviations (to review)

1. **No default is shown, and the tag only says "Your choice"** (G5, plan deviation 2): a blank row has the placeholder "Default" and
   no source tag; a row with a model or an effort says "Your choice" and gets Reset. "Server default" is not shown because the
   default may come from the agent's own config (the wireframe itself says "Agent config" for implementation). The wireframe's
   "Default from" column and the sentence "Leave a field blank to use the default shown" are replaced by "Optional. Leave a field
   blank and the server decides."
2. **"How a voyage goes"** lists the seven phases from `@domain/phases` and drops the wireframe's sentence "Today intake,
   planning and plan review run end to end; the rest follow.", which the plan does not ask for and which I could not check.
3. **An effort without a model is allowed** (`ModelChoice` is "a model, a reasoning effort, or both"); the row then sends only
   `reasoningEffort`.
4. **A model id is checked against the contract's `ModelId`** (letters, digits and `. _ : / -`, at most 200) before sending;
   the plan says nothing about it, the API would answer `400`.
5. **Title hint:** the plan prefilled the field but gave no text; the hint reads "Shown next to the key in lists."
6. **Cancel** goes to The Docks when the page came from there (`?key=` present) and to `/voyages` otherwise; "← Back to The Docks" and
   the "Filled in from The Docks" pill appear only with `?key=`.
7. **The refusal banner sits in "Before you sail", above the buttons** (not at the top of the page, where a phone user at the button would not see it), announces as `alert` (the kit's `error` banner defaults to `status`) and scrolls into view; field errors are shown beside the fields and the first one takes the focus. Only an unreachable harbour (`503`, network) offers "Try again" (plan §5.5); the other refusals have nothing a retry would change. `invalid_response` says "The voyage may or may not have been created.
   Check All voyages before trying again.", because a tooling failure must not read as a refusal.
8. **The button stays disabled until the navigation finishes**, not only until the answer, so nothing can send a second request
   between the `201` and the page changing.
9. **The fields lock while the request is out** (a disabled `<fieldset>`, which does not touch the form's model), so the answer can never land on a key the user has since changed.
10. **The query string describes the prefill:** when it changes while the page is open, the key and the title follow it and a title it no longer carries goes blank. A blank `?key=` does not count as from The Docks.
11. **The title is counted in code points, once trimmed**, the way the API counts it (JSON Schema `maxLength`) and the way the request sends it; 500 emoji fit.
12. **Left unfixed on purpose** (see "Review"): the "Open PROJ-145" link sits under the field, not in its error line.
13. **Component styles instead of `src/styles/`** (as lane 1C did, plan rule 2). The page has no gutter or `page-max` of its own: they
    belong to the shell (3A).

### Review (`/code-review`, two axes, run on the working tree against a2a49fe)

A standards reviewer and a spec reviewer ran in parallel and read-only. What came out, and what was done:

- **Fixed, test first:** the refusal banner moved next to the button and scrolls into view (spec c1); the old banner no longer
  survives a blocked attempt (c2); the answer can no longer land on edited text because the fields lock (c3); a voyage that sets
  sail after the user left no longer navigates them, and a late refusal no longer touches the destroyed view, which really throws
  NG0911 (c4); a changed query string refreshes key and title, and a blank key is not "from The Docks" (c5); the title is
  counted as the API counts it, which also removes the standards review's duplicated title rule (c6); a `/models` refusal clears
  from both rows when either is edited (c7); the exact-body tests use `toStrictEqual` (c8); "Try again" for an unreachable
  harbour (spec a2, standards A2); the grammar copied from `parseAiu` is gone from `budgetProblem`; the page's `textOf` is
  `singleText`; the unused `server` in the spec helper and the duplicated `link` helper are gone; a comment says why
  `unauthenticated` is compared by hand (`isUnauthenticated` is a type guard whose false branch narrows `error` wrongly);
  the stale "2D is item 1" line.
- **Not fixed, and why:** the "Open PROJ-145" link is outside `ah-field` and not in `aria-describedby` (the kit's `ah-field`
  has no slot for an action under the error: **for lane 1A**); the client-side `ModelId` check, `focusFirstProblem`, effort-only
  slots, the title hint and the Cancel destination are beyond the plan's text, and stay as decisions 3 to 6 above; the smells
  "the five slots are listed three times", `describeAiu` living in this lane instead of `@domain/aiu` (not ours to edit) and
  the repeated "up to X AIU" text were left as they are.
- **Not a finding:** `docs/agents/issue-tracker.md` does not exist (the `code-review` skill asks for it); the spec here is files,
  so nothing was blocked.

### Files outside the lane's list, and why

- `src/app/app.routes.spec.ts` (phase 0): the `CASES` table asserted the 3B placeholder at `/voyages/new`; that row is removed and
  `set-sail.routes.spec.ts` tests the real route. **Lane 3A edits the same table for `/` and `/voyages`**: a merge conflict there
  is possible and trivial.
- `docs/progress.md` (this section, the header, "Where we are", "Start here next") and the README "Status".

### Did not run, skipped, and why

- **Nothing against a real API, `--simulate` or TEST**, by design.
- **The toast on screen, before the merge:** the shell had no `ah-toast-host` then, so the first browser run showed none; after lane 3A's shell was merged in it showed (see "Bringing `main` in").

- **Where the page leads:** `/voyages/PROJ-145` and `/docks` are still placeholders (4A and 3C), since 3A did not build them.
- **Not checked:** browsers other than Chromium, a real phone (390 px was viewport emulation), a pixel diff, a screen reader (only
  the ARIA attributes are tested), Enter in a field (the page uses a native `<form>` and `ngSubmit`; the double-submit guard is
  tested through the button), the NG0911 outside Vitest (it is proved by the unhandled-error report of the mutant).
- **Skipped test suites:** none.

### Needs from other lanes

- **3A (shell), done by 3A, checked after the merge:** `<ah-toast-host />`, the page width and the top bar's "Set sail" button to `/voyages/new` are in the shell. **One thing left for 3A:** the top bar keeps "Voyages" active at `/voyages/new` (the `SetSail` board has no tab active there).
- **3C (The Docks):** link "Set sail" to `/voyages/new?key=PROJ-145&title=…`; the page reads `key` (upper-cased) and `title`.
- **4A (voyage shell):** `/voyages/:key` is where a created voyage opens; the page puts the story in `StoriesStore` first.
- **User:** review the decisions above and open the pull request (none has been opened).

### Bringing `main` in (2026-10-07, asked by the user)

`origin/main` had moved to 503f97e: lane 3A (PR #12), 3 commits. The merge (a merge commit, no history rewritten) conflicted in
exactly the three files this lane shares with 3A:

- `src/app/app.routes.spec.ts`: 3A removed its three placeholder rows, this lane removed the 3B one. All four are gone.
- `README.md`: both Status bullets are kept, with one "Next" line.
- `docs/progress.md`: rebuilt from `main`'s text with this lane's header, "Where we are" paragraph, "Start here next" sentences and
  section put back in; lane 3A's header paragraph now starts "Earlier:".

No source file conflicted: 3A owns `app.ts`, `harbour/` and `voyages/`, this lane `set-sail/`. After the merge: `npm ci`,
`npm run build` (no warning), `npm run typecheck` (`check-boundaries: ok`), `npm run lint`, `npm test` (**89 files, 1740
tests**: 1627 + 114 − 1), `npm run format:check` and `node scripts/mock-api.dist-check.mjs` (no trace of the mock), all green.
In headless Chromium on `npm run start:mock`, at 1100 px and 390 px: All hands → the top bar's "Set sail" → `/voyages/new`
(tab title "Set sail · Ahoy") → `PROJ-145`, budget 25, `planning` `claude-sonnet-5`/`high` → the toast "Voyage PROJ-145 set
sail." shows, the page lands on `/voyages/PROJ-145/plan`, and `scrollWidth` equals the window width (no sideways scroll).

### Final check

On Node 24.21.0, the working tree of `claude/focused-maxwell-wcaacl` with `main` at 503f97e merged in:

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle; no warning)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint; build-tokens: ok; openapi-typescript --check and openapi-mirror: ok)
$ npm test                    exit 0 (Test Files 89 passed (89); Tests 1740 passed (1740): 1627 of main + 114 new - 1 removed row)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
$ node scripts/mock-api.dist-check.mjs   exit 0 (no trace of the mock in dist/)
```

(Before the merge, on a2a49fe: 81 files and 1600 tests, 1487 + 114 − 1.)

---

## Lane 3A · Shell, All hands and Voyages (2026-10-07)

Launched from `docs/paralelos3.md`, section A, on `claude/determined-wright-jqbqht` (the branch this session was given; plan §9
would call it `lane/3a-harbour`), from `main` at a2a49fe. Committed and pushed with the user's explicit approval (CLAUDE.md and
paralelos3 rule 8): 8051c60 is the lane as first built; the second commit has the fixes from its review and this report. A pull
request into `main` was asked for by the user at the end of the session.

**Pre-flight.** `git fetch origin`: `main` (a2a49fe) has `ah-top-bar`, `ah-status-badge`, `ah-filter-chips`, `ah-phase-stepper` and
`ah-budget-meter` in `src/app/ui/` (1B), `EventBus` in `core/realtime/` and `StoriesStore` in `core/stores/` (2B), and
`src/testing/mock-backend/` with `npm run start:mock` (2D, PR #11). Node was v22.22.0, so every command ran on **Node 24.21.0** from
`npx -y node@24`, copied into the session scratchpad; `npm ci` installed the locked tree. **No dependency was added or changed.**
Baseline on `main`: 77 files, 1487 tests (lane 2D's report).

**Seams.** The session ran the project's `implement` skill (started by the user as `/implement`), which asks for `/tdd` at
pre-agreed seams and `/code-review` at the end. The seams were the ones lane 3A's plan names ("Testes: ordenação 'longest wait
first'; texto de 'What's needed' por estado; URL ↔ chip; `?q=`") and the behaviours of its acceptance list: a stream event moves a
row, the shell feeds the top bar, the skeleton, empty and error states. The user was not asked to confirm them one by one.

### What changed

| Area      | Files                                                                                                                 | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shell     | `src/app/app.ts`                                                                                                      | `ah-top-bar` fed by `StoriesStore.needsYou()` (count), `EventBus.status()` (Live: `connecting` and `live` show Live, `reconnecting` the pill, `offline` "Live updates are off") and `CurrentUser`; a search that waits 250 ms and then leads to `/voyages?q=` (on the list it keeps `?status=` and replaces the address; any navigation cancels a pending search); one `main` (`page-max`, 24 px gutter, 16 px under 600 px); `ah-toast-host`; `ThemeService`; a 30 s ticking `CLOCK` for the pipes; keeps `StoriesStore` in use for the whole session, which holds the stream open. |
| All hands | `features/harbour/all-hands.ts`, `needs.ts`, `row-details.ts`, `harbour.routes.ts`                                    | Tiles (Crew asks, Your orders, Anchored → `/voyages?status=`), "Needs you" (the store's longest-wait order, "What's needed" and the action by status, Waiting, budget), "At sea" (crew member, with model · effort of the run), "Calm seas", skeleton, "Lost contact with the harbour" / "Ahoy sent something unexpected" with Try again. `needs.ts` is the pure text and action; `row-details.ts` opens a voyage in `StoryStore` for the rows on screen.                                                                                                                            |
| Voyages   | `features/voyages/voyages.ts`, `notes.ts`, `filters.ts`, `row-details.ts`, `voyages.routes.ts`                        | Chips with the API word and the count and `?status=` (anything but the six statuses reads as All), table with Status, Voyage, Phase, compact stepper, Note, Owner, Budget and "Updated ↓", `?q=` on key or title, "Showing N of M" with Load more (50 rows at a time), skeleton, empty per status or search, and the error banner. For an aground voyage the stepper takes its position from the last `story.phase_changed` (G12).                                                                                                                                                   |
| Tests     | `app.spec.ts`; `harbour/{needs,row-details,all-hands}.spec.ts`; `voyages/{notes,filters,row-details,voyages}.spec.ts` | 143 new tests over fakes (see Proof). `app.routes.spec.ts` loses the three placeholder cases of `/` and `/voyages`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Proof

All offline, 0 AIU, Node 24.21.0. **No real API was involved** (not the hosted API, not `--simulate`, not the TEST environment).

- **Chain:** `npm run build` (no warning), `npm run typecheck` (`check-boundaries: ok`), `npm run lint`, `npm test` (**85 files,
  1627 tests**: the 1487 of `main`, 143 new, 3 removed) and `npm run format:check`, all exit 0 (see "Final check").
- **New tests:**

  | File                          | Tests | What it proves                                                                                                                                                                                                                                                                              |
  | ----------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `harbour/needs.spec.ts`       | 27    | **"What's needed" for each status** (Crew asks with the latest round, Your orders with `revisions[gate] + 1` of the ceiling, Anchored with the code and the detail, a reason it does not know shown as sent), the action by status, the crew of each phase, the gate of the events.         |
  | `harbour/row-details.spec.ts` | 9     | Reads only what a status needs, **lets go of a voyage that leaves the list and of all when the page goes**, and **stops following what a voyage no longer needs** (an `awaiting_input` voyage that runs does not refetch its questions).                                                    |
  | `harbour/all-hands.spec.ts`   | 21    | The board over a fake API and stream: tiles 1 / 1 / 2, **longest wait first**, the text, action, link and name of each row, "At sea" with model · effort, "Calm seas", skeleton, the two failures with Try again, and **a stream event moving a voyage between the panels**.                |
  | `voyages/notes.spec.ts`       | 21    | The Note of each status, `blockedAt` (G12), `rejectionOf` and `haltOf` from events.                                                                                                                                                                                                         |
  | `voyages/filters.spec.ts`     | 8     | `filterOf` (the six statuses, and anything else from the address bar reads as All), `matchesQuery` (key or title, case, text taken literally), `chipCounts` (what the search leaves).                                                                                                       |
  | `voyages/row-details.spec.ts` | 7     | The same lease rules for Voyages: what each status reads, release on leaving and on destroy, no refetch of what is no longer needed.                                                                                                                                                        |
  | `voyages/voyages.spec.ts`     | 31    | **URL ↔ chip** (pressed from `?status=`, `?status=` and `?q=` written and kept, back button, invalid status), **`?q=`**, counts under a search, the columns and the note of the eight voyages, the stepper, events read only for rows that need them, Load more, the states, a live change. |
  | `app.spec.ts`                 | 19    | The shell on the real routes: order, count, Live (including the first connection and a dropped stream), the user, the search (debounce, from another page, with the status kept, cleared), theme, titles, toast, relative times that move on.                                               |

- **AIU in the fixtures is never a float:** specs read amounts with `parseAiu` (`8.3 * AIU` is not an integer; the review found
  it, and `voyages.spec.ts` now asserts the "8.3 / 20" cell it hid).
- **Mutation checks** (each made the suite fail, then was reverted; `git status` unchanged after): the revision round without `+ 1`
  (4 tests failed), the needs-you order reversed (8), rows never let go on destroy (1), a voyage that keeps what it no longer
  needs (1), leaving voyages not let go (2), the address status read without checking (2), a search that ignores the title (7),
  chip counts that ignore the search (2), a Load more window that never restarts (1), an aground voyage that loses where it
  stopped (1), a search with no pause (1), the stored theme not applied (2), the first connection shown as Reconnecting (1),
  relative times that stop ticking (1). Two first attempts did not compile (a mutation of mine) and were redone.
- **`npm run start:mock` in headless Chromium 1194** (the session's Playwright from `/opt/node22`, not a project dependency; a
  throw-away script in the scratchpad, not in the repository), light and dark, 1440 px and 390 px, run on the first commit and
  again on the final code: tiles `1 Crew asks`, `1 Your orders`, `2 Anchored` and "All hands 4" in the top bar; Voyages chips
  `All 8`, `ready 0`, `running 2`, `awaiting_input 1`, `awaiting_decision 1`, `halted 2`, `terminal 2`; typing "invoice" in the top
  bar led to `/voyages?q=invoice` with PROJ-123 alone; a chip kept the `?q=`; answering PROJ-131's two open questions on the mock
  (POC test answers, "not a product decision", 0 AIU) moved it from "Needs you" to "At sea" with the page's own marker intact (no
  reload), tiles `0 / 1 / 2`; `dropStreams()` showed "Reconnecting to live updates…" and it was "Live" again 3.5 s later.
  **Both pages had `scrollWidth` 390 at 390 px, light and dark.** Screens were compared by eye with the `Main` and `Voyages`
  boards: same columns, tiles, badges, steppers and notes.
- **Found in the browser and fixed:** at 390 px All hands had `scrollWidth` 1044. The visually hidden "Action" header (`ah-sr`,
  absolutely positioned) had no positioned ancestor, so the scroll box did not clip it and it sat at the table's far edge. The
  scroll box is now `position: relative`, the table has a `min-width` so it scrolls inside its box instead of squeezing, and the
  key link never wraps. No jsdom test can see this (no layout): it is browser-verified only.

### Decisions and deviations (to review)

1. **Duplicated code between the two features, on purpose.** `harbour/` and `voyages/` may not import each other, and `core/`,
   `ui/` and `domain/` belong to other lanes, so each has its own `row-details.ts`, `crewOfPhase`, `haltOf`, the gate of the
   events and the error text. They should move up when a third reader needs them (lane 4A's header reads the same things). See
   "Needs from other lanes".
2. **Load more windows a list the store already has.** `StoriesStore.loadAll()` follows the API's cursor to the end, so the table
   shows 50 rows at a time on the client; "Showing N of M" counts the voyages the status and the search leave. This also bounds
   how many voyages a table opens in `StoryStore`.
3. **Chip counts follow `?q=`.** A chip says what pressing it would show. With no search they are the totals of the board.
4. **Rows open a voyage only while they are on screen**, and read only what their status needs (questions for Crew asks, the state
   for Your orders, events for Anchored and Aground; All hands also reads the events of a voyage that waits, for its gate: G11).
   The hold lives as long as the page, so All hands → Voyages → All hands reads the events of anchored voyages again: the "cache"
   of G7 is the page's own. A longer cache needs lane 2B's `StoryEventsFeed` to keep feeds for a while.
5. **A hold cannot stop watching.** When a voyage stops needing something it read, the row gets a new hold, opened before the old
   one is let go, so the stream stays open and what was read stays in the store.
6. **`connecting` shows as Live** (one of the two choices lanes 1B and 2B left open): the amber pill, and what a screen reader says
   about it, is for a stream that dropped, not for every start-up. If the first attempt fails the status is `reconnecting` within a
   second.
7. **The search waits 250 ms** (the 1B hand-off asks for a debounce), so from another page it adds one history entry. On the list it
   replaces the address and keeps `?status=`. Any navigation cancels a search still waiting.
8. **`ThemeService` is injected once in `App`**, so the theme chosen in `/_kit` applies from the first page (open since lane 1A).
9. **A ticking `CLOCK`** (30 s) for the pipes, from the shell, as lane 1B suggested: "22 m ago" and "Waiting 48 m" stay fresh.
10. **Copy the plan does not give**, written in the DS voice: the error banner, "Nothing at sea", the empty states of Voyages ("No
    anchored voyages · Every voyage is moving or in port.", "No voyages match “…”", "No voyages yet"), "The delivery is ready for
    review", "A decision is waiting", "The voyage is anchored", "Waiting for answers". Lane 6A reviews the copy.
11. **"What's needed" for Anchored is the full `explainHalt(...).short` sentence**, as the plan says ("texto curto de `explainHalt`"),
    which is longer than the board's hand-written "The run failed before any prompt". For `stopped_by_user` the detail is quoted
    and the Voyages Note says "Stopped by {who}".
12. **Phone layout the boards do not draw:** the tiles stack under 720 px; tables keep a 860 px minimum and scroll inside a focusable
    box (`role="region"`, `tabindex="0"`, `aria-label`); the top bar's own padding stays at the bundle's 24 px (the page gutter is
    16 px under 600 px).
13. **Seeds versus boards.** The mock's seeds match the boards by status and count, not word for word (PROJ-118 is in
    `implementation` there, the titles differ), so the steppers and notes read from the seeds, not from the boards' text.
14. **`start:mock` shows the avatar `DE`** (`dev@example.com`): `CurrentUser` reads `AppConfig.actor`, whose default applies when
    `/config.json` is absent (404, as in earlier lanes). The mock's `ahoy.mock.actor` changes who the API sees, not the avatar.

### Review (two axes, by two sub-agents, read-only)

`/code-review` against `origin/main` (the work was uncommitted then, so the diff was the working tree and the new files). The
repository has no `docs/agents/issue-tracker.md`; the spec was the two documents of the user's request.

- **Fixed in the second commit:** AIU fixtures built with floats (now `parseAiu`); no spec for `row-details` and nothing proved
  its release (two specs now); leases that never shrank for a voyage whose status moved on (decision 5); `HaltNote.reason` and
  `detail`, never read (removed); `liveStateOf` retyping `StreamStatus` (imported); the unexported-by-use constants; the
  unnamed `row.crew.crew` (`AtSeaCrew.member`, `RunModel`); `notes.ts` mixing the note with filters (`filters.ts`); the phase
  list written twice (`PHASES`); the "↓" read aloud (`aria-hidden`); `AllHands` against `VoyagesPage` (`AllHandsPage`); the
  search debounce and `ThemeService` the 1B hand-off asked for; the first connection shown as Reconnecting.
- **Left as it is, and why:** the duplication of decision 1 (and the copies of the `question()` builder, the eight-voyage fixture and
  the cell-text helper in specs: shared test helpers would live in lane 2B's `core/realtime/testing/`); the `story.status` switches in
  `needs.ts` and `row-details.ts` that must stay in step (one map would couple copy and reading, for two small switches); the
  three near-identical empty states of Voyages (they differ in the action element, and content projection cannot take a
  `@switch`); the magic `q` and `status` (Angular binds query parameters to inputs by name); `whatsNeeded(story, detail)` against
  `needsAction(story, gate)` (the action needs one value of the detail); the copy of decision 10 and the Anchored text of
  decision 11 (the plan's wording).

### Files outside the lane's list, and why

- `src/app/app.routes.spec.ts` (lane P0's): the three cases that expected the 3A placeholders ("All hands", "Voyages", and
  `/voyages?status=halted&q=PROJ`) are gone, because those screens are real now; their titles and content are covered by
  `app.spec.ts` and the two features' specs. A lane that replaces a placeholder takes its row out of that table.
- `docs/progress.md` (this section, the header, "Where we are", "Start here next") and the README "Status".

`src/app/app.spec.ts` is new and is the test of `src/app/app.ts`, which the lane owns.

### Did not run, skipped, and why

- **Nothing against a real API, `--simulate` or TEST**, by design.
- **Browsers other than Chromium, a screen reader, a pixel diff** (compared by eye), real phones (390 px was viewport emulation).
- **The 390 px layout and keyboard use in an automated test:** jsdom has no layout, and the plan's test list does not ask for it;
  lanes 6B (axe) and 6C (e2e) do. The layout was checked in the browser (above); the keyboard only through the markup (links,
  buttons, a focusable scroll box).
- **Skipped test suites:** none.

### Needs from other lanes

- **2B (`core/stores`):** `StoryHandle` has no `unwatch`, which decision 5 works around; a way to keep a story's event feed for a
  while would give G7 its cache across pages (decision 4). The row logic of both features (what a status needs read, the last
  `story.halted`, the open gate) is a candidate for a shared "row details" in `core/stores`, with `crewOfPhase` and `haltOf` in
  `domain/` (lane 2C), once 4A's header needs them.
- **6A:** replace the two local error banners (`all-hands.ts`, `voyages.ts`) by `ah-error-state`; the skip link, focus on the `h1`,
  and a review of the copy of decision 10.
- **6B and 6C:** an axe pass over `/` and `/voyages`, the 390 px check without horizontal scroll, and keyboard use of the chips,
  the rows and the scroll boxes.
- **4A and the voyage lanes:** the actions of All hands link to `/voyages/:key/questions`, `/plan` and `/models`, and to
  `/voyages/:key` for "Decide"; they are placeholders until those lanes land.
- **User:** review the decisions above, in particular 2, 4, 6 and 11; open the pull request and merge it.

### Final check

On Node 24.21.0, the working tree of `claude/determined-wright-jqbqht` (from `main` at a2a49fe):

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle; no warning)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint; build-tokens: ok; openapi-typescript --check and openapi-mirror: ok)
$ npm test                    exit 0 (Test Files 85 passed (85); Tests 1627 passed (1627): 1487 of main + 143 new - 3 removed)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
$ node scripts/mock-api.dist-check.mjs   exit 0 (no trace of the mock in dist/)
```

---

## Lane 2D · Mock backend and `mock:api` (2026-10-07)

Launched from `docs/paralelos2.md`, section D, on `claude/blissful-wozniak-qr2816` (the branch this session was given; plan §9
would call it `lane/2d-mock-backend`), from `main` at a99a7a2 (phase 0, 1A, 1B, 1C, 2A with its finishing pass, 2B and 2C).
Committed (0997aba) and pushed with the user's explicit approval in this session (CLAUDE.md and paralelos2 rule 7), with a
pull request into `main`.

**Pre-flight.** `git fetch origin`: `main` has `openapi/ahoy-v1.yaml`, the `ApiClient` (2A), `src/app/core/api/schema.d.ts`,
`npm run api:types` and `npm run api:check`, `core/api/contract.spec.ts` with its Ajv helper `src/testing/fixtures/contract.ts`,
and the lane 2A section says "Done, offline" (2A finished); `src/app/domain/` has the vocabulary (2C). Node was v22.22.0, so
every command ran on **Node 24.21.0** from `npx -y node@24`, copied into the session scratchpad and put first on `PATH`; `npm ci`
installed the locked tree. **No dependency was added or changed.** Baseline on `main`: 68 files, 1402 tests, all green.

**Source read, not loaded:** to make the mock behave like the real API, `Danielimaalmeida/ahoy-hosted` was attached read-only
and cloned at 1890d5a (the commit the vendored contract records) to `/home/user/ahoy-hosted`, outside this repository; its
`CLAUDE.md` was not loaded (as lane 2A's decision 12). Read: `apps/api/src/server.ts` (routing, contract checks, problem
bodies, cursors, the event stream), `packages/core/src/service/commands.ts` (each command's checks, in order, and its
events), `packages/core/src/domain/story-state.ts` (send-back, ceiling, decisions), `apps/reconciler/src/reconciler.ts`
(run ids, `run.queued`/`run.finished`/`story.halted` payloads) and the phase table in `packages/core/src/testing/support.ts`.

### What changed

| Area                 | Files                                                                                  | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server               | `src/testing/mock-backend/server.ts`                                                   | `MockAhoyServer.handle(request)`, which never throws. Routes built from the contract's `paths` as the real server builds them; `404` for no route, `400 bad_request` with `Allow` for a wrong method, `401` without `X-Ahoy-Actor` (`/health` is anonymous), `400 validation_failed` with every difference. The 19 operations of phases 3 to 6 with the hosted commands' checks in their order; the four of phase 7 answer `500 internal_error` (any operation may). `reset()`, `close()`, `dropStreams()`. |
| Contract checks      | `schema.ts`                                                                            | `SchemaChecker`: the JSON Schema keywords the contract's request schemas use, run against the contract document itself (the JSON mirror), with Ajv's wording and the real API's paths (`body/budgetNanoAiu`, `query.limit`, `path.key`). Text Postgres cannot store (NUL, lone surrogate) is refused as the real API does.                                                                                                                                                                                  |
| State                | `voyage.ts`, `world.ts`                                                                | Per voyage: story, runs, questions, gate records, artifact revisions (complete sets, sha256, size), model choices, human gates, revision rounds, decision log; renders `ModelPlan` (sources as the hosted `readModelPlan`) and the state document (`readStoryState`'s fields). One global event log with increasing ids.                                                                                                                                                                                    |
| Reconciler           | `simulator.ts`, `content.ts`                                                           | The lifecycle on the mock's clock (see the README of the directory): runs queued, dispatched, `run.progress` batches (steps then one `spend`), finished and judged; questions on the first planning run; plan revisions; `send_back` archives the plan as `implementation-plan.round<N>.md`; ceiling 4; approve → implementation → pr_review (two lens runs) → delivery_gate; reject → blocked; stop cancels the run 0.5 s later (resume refuses until then); budget exhaustion halts.                      |
| Event stream         | `event-stream.ts`                                                                      | `GET /events/stream` as a `ReadableStream`: `: connected`, replay after `Last-Event-ID` (else `after`), live events with greater ids, `: keepalive` after 15 s idle, `story=` filter, broken by `dropStreams` or by an aborted request.                                                                                                                                                                                                                                                                     |
| Seeds                | `seeds.ts`                                                                             | The eight voyages of plan deliverable 6, times relative to the start. PROJ-123's plan revision 2 is the fixture's text (same sha256 and ETag as `listArtifacts.json`).                                                                                                                                                                                                                                                                                                                                      |
| Switches             | `switches.ts`                                                                          | `latencyMs`, `failNext=<status>` (problem; 502/504 an HTML page), `conflictNext=<409 code>`, `dropStream`; from the query string or `localStorage` (`ahoy.mock.*`, one-shots removed) in the browser, from `/__mock/switches` on `mock:api`.                                                                                                                                                                                                                                                                |
| Adapters             | `fetch-adapter.ts`, `src/app/core/mock/mock-backend.ts`                                | `createMockFetch(server)` (API URLs from the mock, others to a fallback; streams; latency; abort). `MOCK_SERVER`, `createMockServer()`, `provideMockBackend(server)` (`MOCK_SERVER` and a `FETCH` sending the current user as the actor) and `mockBackendInterceptor` for `HttpClient` (errors as `HttpErrorResponse`, 304 too, latency on the mock's clock).                                                                                                                                               |
| `npm run start:mock` | `src/app/core/mock/install.ts`, `src/environments/environment.mock.ts`, `angular.json` | `installMockBackend()` wraps the page's `fetch`: `HttpClient` (`withFetch`) and `FETCH` call `fetch` per request, so the whole API, stream included, is served in the browser and `app.config.ts` is untouched. The actor is `ahoy.mock.actor` or `dev@example.com` (the proxy's default). `globalThis.ahoyMock` is the server. Only the `mock` configuration's `fileReplacements` now points at `environment.mock.ts` (that one line changed).                                                             |
| `npm run mock:api`   | `scripts/mock-api.mjs`, the `mock:api` line of `package.json`                          | The same server over `node:http` on `127.0.0.1:8080` (`MOCK_API_PORT`, `MOCK_API_HOST`), **run by Node 24's type stripping** with a `module.registerHooks` resolver for extensionless imports and the `@core`/`@testing` aliases: no build step, no `tsconfig`, no dependency. SSE written chunk by chunk (`flushHeaders`, `X-Accel-Buffering: no`); `dropStream` destroys the socket. Control routes `/__mock/switches`, `/__mock/reset`, `/__mock/health`.                                                |
| Production check     | `scripts/mock-api.dist-check.mjs`                                                      | After `npm run build`: fails (exit 1) when `dist/` holds any of six markers of the mock (its switch names, banner, server name, directory, problem text, the contract mirror).                                                                                                                                                                                                                                                                                                                              |
| Docs                 | `src/testing/mock-backend/README.md`, this section, README "Status"                    | How to run it, switches, rules for the directory.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

`src/testing/mock-backend/.gitkeep` was removed.

### Proof

All offline, 0 AIU, Node 24.21.0. **No real API was involved** (not the hosted API, not `--simulate`, not the TEST environment).

- **Chain:** `npm run build` (no warning), `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (ESLint, `tokens:check`,
  `api:check`), `npm test` (**77 files, 1482 tests**: the 1402 of `main` and **80 new**, 0 failed, 0 skipped) and
  `npm run format:check`, all exit 0 (outputs under "Final check").
- **New tests:**

  | File                                | Tests | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
  | ----------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `mock-backend/conformance.spec.ts`  | 7     | **Every answer of a broad session** (every read of every seed, a whole voyage with every command, 20 error cases, the switches) checked with the 2A Ajv helper: successes against their operation's schema and declared status (201, 202...), errors are `Problem`s with the real `type`/`title` and a declared status (or 500); artifact ETags match the listing; **every event** against `Event`, **every `run.progress` payload** against `RunProgressPayload`; ids increase by one in time order. Statuses 200, 201, 202, 400, 401, 404, 409, 422, 500 and 503 all occur.                                                                                                                                                                                                                                                                                                                                               |
  | `mock-backend/server.spec.ts`       | 25    | Actor and `/health`; 404 and `Allow`; parameter and body errors word for word; invalid JSON; phase 7 → 500; the eight seeds and their details (PROJ-123 round 2, PROJ-131 1 of 3, PROJ-140's gap of 38 and `[REDACTED]`, PROJ-118's `workerLog`, PROJ-102 rejected by jordan); determinism; cursor paging and a foreign cursor; status filter; event paging and `lastEventId`; artifacts, 304, older revisions, 404s; model sources; stale version; `story_exists` with `Location`; reviewers on one model; model choices set and cleared; budget rules; stop/resume rules; answers; decision rules.                                                                                                                                                                                                                                                                                                                        |
  | `mock-backend/simulator.spec.ts`    | 8     | **The whole voyage on the server** (set sail → questions → plan → send-back → plan rev. 2 → approve → reviews → delivery → done, with spend summed); the event order of a run and its batches; reject → blocked; **the fifth send-back answers `revision_ceiling_reached`**; stop, cancellation 0.5 s later, resume refused meanwhile; PROJ-140's run finishing from the seeded line 43; `budget_exhausted` and budget-then-resume; versions only increase; `reset`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
  | `mock-backend/event-stream.spec.ts` | 9     | Stream framing, replay and live order; **`Last-Event-ID` wins over `after` with no repeat**; `story=`; keepalive at exactly 15 s; `dropStreams` and abort break the body; 401 without actor; `createMockFetch` (actor, fallback, invalid JSON, artifact text and 304, latency and abort on the clock).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
  | `mock-backend/switches.spec.ts`     | 7     | `failNext` once (503 problem, 500, 502 HTML), `conflictNext` after validation and only for commands (with `currentVersion`), `dropStream`, refused values, `localStorage` one-shots removed and a blocked storage, the query string.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
  | `mock-backend/schema.spec.ts`       | 10    | **The mock's checker and Ajv agree** on 53 request bodies of 7 operations and 10 parameter values; Ajv's wording; unstorable text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
  | `mock-backend/sha256.spec.ts`       | 6     | FIPS vectors, block boundaries (55/56/64 bytes), UTF-8; the fixture's sha256, ETag and size; `ManualClock`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
  | `core/mock/mock-backend.spec.ts`    | 6     | **The acceptance test: the whole voyage through `ApiClient` calls** over `mockBackendInterceptor` (no browser): `startStory`, `listQuestions`, `answerQuestion` ×2, `getArtifactContent` and its `not_modified`, `decideHumanGate` send_back, `getStoryState` + `readStoryState` (round 1, ceiling 4), approve, delivery approve → `done`, gate records, runs, `getRun`, `listStoryEvents` paged by `lastEventId`. Also: errors through the client's predicates (`isStale` with `currentVersion`, `isNotFound`, `isValidationFailed`, `isUnreachable` for 503, `{kind:"network",status:502}` for the HTML page, `conflictNext`); latency; **`StoriesStore.loadAll()`** on the seeds (counts, `needsYou` oldest first); **lane 2B's `EventStreamClient` on the mock `FETCH`: live, dropped, reconnected after 1 s with `Last-Event-ID`, no duplicate, ids in order, nothing open after `stop()`**; non-API requests pass on. |
  | `core/mock/install.spec.ts`         | 2     | `installMockBackend` on a fake page: API from the mock as `dev@example.com`, `/config.json` to the real `fetch`, `ahoyMock`; actor from `localStorage`; query and per-request `localStorage` switches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

- **Mutation checks** (each made the suite fail, then was reverted; `git diff` clean after): version check skipped (2 tests
  failed), `Last-Event-ID` ignored (2), `additionalProperties` ignored (3), plan archived under another name (1), reviewers
  allowed on one model (1), abort not breaking a stream (2), a seeded progress line 0 (1, the conformance spec), interceptor
  passing errors as successes (2), `failNext` not one-shot (5), keepalive never sent (1).
- **`npm run start:mock` in a browser:** `ng serve --configuration mock`, then headless Chromium 1194 (the session's
  Playwright 1.56.1, not a project dependency) on `/voyages?ahoy.mock.latencyMs=50`: the console shows the mock's banner with
  `latencyMs=50`; in the page, `fetch("/api/v1/stories?limit=500")` gave the eight voyages, `/api/v1/health` ok,
  `/api/v1/events/stream` `text/event-stream` with `: connected` and the replay, `globalThis.ahoyMock` is set, and
  `/config.json` still went to the dev server (404, as before). No screen shows API data yet (wave 3).
- **`npm run mock:api` with `npm start`, through the real dev proxy** (no API, Docker or Postgres): `curl -s
localhost:4200/api/v1/health` → `{"status":"ok","database":"ok"}`; `GET /stories?status=halted` → PROJ-126 and PROJ-118;
  `GET /stories/PROJ-404` → `404 application/problem+json`; `POST /stories` → `201` with `owner` `dev@example.com` (the proxy's
  `X-Ahoy-Actor`); without the proxy, no actor → `401`; `/__mock/switches?failNext=503` → the next request `503 unavailable`.
  **The stream through the proxy delivers events one by one:** timestamps on arrival read 0.98 s, 2.48 s, 3.48 s, 5.48 s...
  as the simulated run ticked, so neither the proxy nor the mock buffers (this also settles, against the mock, phase 0's open
  item "`curl -N` through the proxy").
- **Production build without the mock:** `node scripts/mock-api.dist-check.mjs` → `ok (18 files in dist/ahoy-frontend, no
trace of the mock)`; the same script on an `ng build --configuration mock` output exits 1 and names all six markers in
  `main.js`, so it does detect the mock.

### Decisions and deviations (to review)

1. **Intentional deviations from the contract or the real API**, all in the mock only:
   - the phase 7 operations (`resolveConsensus`, `decideWorkPackage`, `reopenWork`, `unblockStory`) answer `500
internal_error` "The mock backend does not simulate …" (the contract lets any operation answer 500);
   - `failNext`, `conflictNext` and `dropStream` produce answers the real API would give only in those situations;
   - `decision_already_recorded` happens only through `conflictNext`: after a decision the real API, like the mock, has moved
     the story on, so a second decision meets `stale_version` or `invalid_state` first;
   - runs report `runtime: "fake"`, and their spend, tokens and timings are invented;
   - the state document carries the fields the UI reads (`human_gates`, `revisions`, `revision_ceiling`, `models`,
     `acceptance_criteria`, `work_packages`, `child_repos`, `gate_results`, `decision_log`...), not every field of a real
     `state.json`;
   - the mock also writes `story.terminal` (as the real reconciler does; not among the contract's example types, so clients
     ignore it).
2. **Run ids follow the real API**, `<key>-<phase>-<attempt>-<4 hex>` (`proj-140-planning-001-5c54`), not the wireframes'
   `r-02`: `getRun` is global, so ids must be unique across stories, and the UI should meet the real shape. The suffix is
   derived from the key, phase and attempt, so it is the same on every run.
3. **delivery_gate is a human gate, as in the phase table:** after the plan is approved the mock runs implementation and the
   two reviews quickly, then waits for a `delivery_accepted` decision before `done` (the plan's "approve → … until done"
   would skip a gate the real API has). The acceptance test approves both gates.
4. **The browser mock wraps the page's `fetch`** instead of registering an interceptor in `app.config.ts`, which this lane does
   not own and which reads no environment providers. `HttpClient` (`withFetch`) and `FETCH` both look `fetch` up per call, so
   one adapter serves both; `mockBackendInterceptor` exists for `TestBed` (and for a composition root that wants it later).
5. **The mock checks requests itself** (`SchemaChecker`) against the contract document rather than with Ajv, so Ajv (a dev
   dependency) is not in the mock's browser bundle nor needed by `mock:api`; `schema.spec.ts` keeps both in agreement. The
   2A helper `contract.ts` is used, unchanged, for the conformance tests.
6. **`mock:api` runs TypeScript directly** with Node 24 (type stripping and `module.registerHooks`, both without flags in
   24.21.0, no warning printed): no `tsconfig` of its own, no `out-tsc` build. The mock's files therefore avoid `enum`,
   `namespace` and parameter properties. It refuses Node below 23.
7. **Actor:** in the browser the mock acts as `dev@example.com` (the dev proxy's default `AHOY_ACTOR`, and `AppConfig`'s
   default `actor`) unless `localStorage["ahoy.mock.actor"]` says otherwise; `provideMockBackend` and the interceptor use
   `CurrentUser`. The seeds keep the wireframes' owners (alex, sam, priya, jordan), so "(you)" shows only on voyages the
   current actor starts.
8. **Determinism:** in specs the clock is a `ManualClock` at `SEED_AT` (2026-10-06 10:10 UTC) and two servers answer byte
   for byte alike; in the browser and `mock:api` the seeds lead up to the moment the mock starts, so relative times read
   naturally ("22 m ago"), and PROJ-109 and PROJ-140 move on their own.
9. **`src/testing/mock-backend/spec-helpers.ts`** (`testServer`, `call`, `StreamTap`, `settle`) is for specs; `core/mock`'s
   specs use it too.

### Files outside the lane's list, and why

None. The lane's list was followed: `src/testing/mock-backend/**`, `src/app/core/mock/**`,
`src/environments/environment.mock.ts`, the `mock` configuration of `angular.json` (its `fileReplacements` target, one line),
`scripts/mock-api.*` (`mock-api.mjs` and `mock-api.dist-check.mjs`) and the `mock:api` line of `package.json`; plus this file
and the README "Status", as every lane does.

### Did not run, skipped, and why

- **Nothing against a real API, `--simulate` or TEST**, by design: the lane exists to avoid them.
- **The mock under the screens:** no screen reads API data yet (wave 3); `start:mock` was checked by calling the API from the
  page, not by looking at a screen.
- **`mock-api.dist-check.mjs` in CI:** not wired (`ci.yml` belongs to lane 6D); it ran by hand. See "Needs from other lanes".
- **Browsers other than Chromium; Windows line endings; Node 22** (`mock:api` needs Node 24, like Angular 22).
- **Skipped test suites:** none.

### Needs from other lanes

- **User:** review and merge the pull request. The decisions above, in particular 2 (run ids), 3
  (delivery gate) and 4 (`fetch` wrapped in the browser).
- **6D (CI):** add `npm run build && node scripts/mock-api.dist-check.mjs` to `ci.yml` (the build step can be shared), so a
  production bundle with the mock fails CI.
- **6C (e2e):** `npm run mock:api` + `npm start` gives the real proxy path; `/__mock/reset` between tests and
  `/__mock/switches?...` for failures. Or `npm run start:mock` with `?ahoy.mock.*`.
- **3A, 3B, 4A–4D, 5A–5C (screens):** develop on `npm run start:mock`; the seeds match the wireframe boards; set
  `localStorage["ahoy.mock.actor"] = "alex@example.com"` to be the wireframes' "you"; `ahoyMock.dropStreams()` in the console
  rehearses Reconnecting. In `TestBed`: `provideHttpClient(withInterceptors([mockBackendInterceptor]))`,
  `provideMockBackend(testServer().server)` and the spec helpers.
- **2B:** nothing to change: `EventStreamClient` reconnected against the mock as designed. For your list of known event
  types: the real reconciler also writes `story.terminal` and `run.cancel_requested`, which the contract's examples omit.
- **P0 / 6A (README "Commands"):** add rows for `npm run mock:api` and `node scripts/mock-api.dist-check.mjs` (this lane may only
  touch "Status").

### Review fixes (2026-10-07)

A two-axis review of the pull request (standards and spec) found six things to fix, all inside the lane's files. Each new
test failed on the code as pushed (0997aba) and passes now; offline, 0 AIU, Node 24.21.0.

| Finding                                                                                                             | Fix                                                                                                                                                                                                                                                       | Proof                                                                                         |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "valida sempre as respostas": answers were only checked by `conformance.spec.ts`, not under `start:mock`/`mock:api` | `MockAhoyServer.handle` checks each answer of a routed operation against the contract (declared status, media type, schema, with `SchemaChecker`); one that breaks it becomes `500 internal_error` naming each difference. `failNext` answers are exempt. | `server.spec.ts` (+1); the 80 earlier tests and the conformance session still pass with it on |
| `integer` accepted any `Number.isInteger`, so `budgetNanoAiu: 1e300` was stored (CLAUDE.md "Numbers")               | `SchemaChecker` requires `Number.isSafeInteger` for `integer` (stricter than Ajv, which the real API leaves to Postgres)                                                                                                                                  | `server.spec.ts` (+1): `2 ** 53` → `400`                                                      |
| Spend computed with a float division (`Math.floor(cost * ticks / totalTicks)`)                                      | `spentSoFar()` in `simulator.ts`, integer arithmetic only                                                                                                                                                                                                 | `simulator.spec.ts` (+1)                                                                      |
| `failNext=409` answered `stale_version` without `currentVersion`                                                    | it carries the version of the story the path names (1 when none), as `conflictNext` does                                                                                                                                                                  | `switches.spec.ts` (+1); `mock:api` by `curl`                                                 |
| `mock:api` answered a body over 1 MB `404 not_found` (it was sent to path `/`)                                      | `400 bad_request` "Request body is too large", the real API's answer                                                                                                                                                                                      | `mock:api` by `curl` (no spec runs the script)                                                |
| One keepalive timer for every stream: a stream that wrote just after a round waited up to ~30 s                     | the timer wakes when the stream that wrote longest ago has been silent for 15 s                                                                                                                                                                           | `event-stream.spec.ts` (+1)                                                                   |

Also a doc comment on `SwitchName`, and the headers of `server.ts`, `schema.ts` and the directory's README. **Not changed:**
decisions 3 (delivery gate) and 8 (PROJ-109 and PROJ-140 move on their own outside specs) still wait for the user; the dist
check in CI is still lane 6D's; the review's code smells (repeated `MockRequest` building, `isRecord` in three places, the
timestamp `replace`) were left as they are.

After the fixes: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` (**77 files, 1487 tests**, 0 failed, 0
skipped), `npm run format:check` and `node scripts/mock-api.dist-check.mjs`, all exit 0.

### Final check

On Node 24.21.0, the working tree of `claude/blissful-wozniak-qr2816` (from `main` at a99a7a2):

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle; no warning)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint; build-tokens: ok; openapi-typescript --check and openapi-mirror: ok)
$ npm test                    exit 0 (Test Files 77 passed (77); Tests 1482 passed (1482): 1402 of main + 80 new)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
$ node scripts/mock-api.dist-check.mjs   exit 0 (18 files in dist/ahoy-frontend, no trace of the mock)
```

---

## Lane 1C · Kit: interaction and content (2026-10-07)

Launched from `docs/paralelos2.md`, section B, on `claude/secao-b-paralelos2-1l7xpu` (the branch this session was given; plan
§9 would call it `lane/1c-kit-interaction`). Committed with the user's approval, then `main` merged in (see "Final check");
the push and the pull request wait for the user. Pre-flight: `git fetch origin`; `origin/main` (56e815a) has lane 1A
(`src/styles/tokens.css`, `src/styles/ahoy-bundle.css`, `src/app/ui/icon/`) and lane 2C (`src/app/domain/` with
`statusPresentation`, `outcomePresentation`, `explainHalt`, `text-diff.ts`), and the branch started at that commit.

### Node and dependencies

- `node -v` was v22.22.0; `npx -y node@24` gave v24.21.0, copied into the session scratchpad and put first on `PATH`.
  Every command below ran on Node 24.21.0 with npm 10.9.4.
- **Installed, with the user's explicit approval in this session** (both are on plan §10): `@angular/cdk` **22.2.1** and
  `marked` **18.1.0**, the exact versions `npm view` returned, as runtime dependencies pinned exactly. The lock file
  gained only those two packages (the CDK's `parse5` was already in the tree through `jsdom`). `npm install` reported 0
  vulnerabilities.

### What changed

| Component    | Files                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dialog       | `ui/dialog/dialog.ts`                           | `<ah-dialog>` (`DialogShell`): icon tile by `kind` (`default`, `danger`, `sendback`; `icon` overrides), title, close button, body, footer with Cancel (`cancelLabel`) and one confirm (`ah-btn--danger` for `danger`, else primary). Body order: error region, `[ahDialogLead]`, `[ahDialogCost]`, the rest. `busy` swaps the confirm label for `busyLabel` ("Sending…"), sets `aria-disabled` on every button (so focus stays put), `aria-busy`, a `role="status"` line, ignores further confirms and sets `DialogRef.disableClose` so Esc and the backdrop can't close it. `error: DialogError` shows a notice (409) or error banner at the top. `confirmDisabled` for an invalid form. Outputs `confirm` and `dismissed`. `DialogService.open(component, { data, width })` opens on the CDK `Dialog`: modal, `aria-labelledby` the title (id passed through a `DIALOG_TITLE_ID` provider), focus on the first field (else on the dialog), restored to the opener. No business logic. |
| ChoiceCard   | `ui/choice-card/choice-card.ts`                 | `<ah-choice-card-group [options] label>`: a `ControlValueAccessor` over native radios in `ah-choice` cards (title + `ah-choice__desc`), `role="radiogroup"`, one generated `name`; the checked card gets the bundle's ring. Arrow keys move to the next enabled card, wrapping, and focus it; disabled options and the control's disabled state are honoured.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| QuestionCard | `ui/question-card/question-card.ts`             | `<ah-question-card>`: `open` (ring, recommendation with "Use recommendation", labelled textarea, "Send answer" with "Answers are final once sent. Recorded as …"), `answered` (answer, `actorLabel · absoluteTime · note`, "Final" lock, nothing editable) and `disabled` (question and recommendation, `disabledReason` instead of the form). The parent owns the `FormControl`. "Use recommendation" sets the control (dirty), focuses the field and emits `useRecommendation`, never `send`. `send` emits the trimmed text, only when it isn't blank, not `busy` and the control isn't disabled.                                                                                                                                                                                                                                                                                                                                                                                     |
| ModelChoice  | `ui/model-choice/model-choice.ts`               | `<ah-model-choice-row>`: phase (`pr_review` for both Lookouts) and crew from `CREW`, mono model input (placeholder "Default: …"), effort select (Default or "Default (medium)", then `low` … `max`), `ah-source` tag, reset button with `aria-label` "Reset planning to default". Reset clears both controls and emits `null` (`restoreDefault`). `error` shows under the row and the input points to it (`aria-invalid`, `aria-describedby`). `<ah-model-choice-table [rows] [controls]>` renders the rows and, with the rule of the domain's `reviewersConflict`, shows "The two Lookouts must use different models: both would run on …" under **both** reviewer rows; a blank model counts as its default when the default is known (as in the Dialogs wireframe). Exposes `conflict()` for the save button; emits `restoreDefault` with the slot.                                                                                                                                  |
| LiveSteps    | `ui/live-steps/live-steps.ts`                   | `<ah-live-steps [steps]>`: `role="log"`, tool rows (time `HH:MM:SS`, tool icon, name, mono summary), message rows (first 200 characters, "…"), gap rows ("38 steps not shown"). `[REDACTED]` is split out and wrapped in `ah-redacted` **by interpolation** (`redactedSegments`). Scrolls to new steps only while the reader is within 24 px of the bottom. Footer "Newest at the bottom… This is a view, not a control…". No actions. The step shape mirrors 2A's `RunProgressTool`/`RunProgressMessage` plus a `gap` row (ui can't import core).                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ShipsLog     | `ui/ships-log/ships-log.ts`                     | `<ah-ships-log [entries]>`: `{id, at, title, details, actor, kind, run?}` rows in the given order (newest first), `absoluteTime`, dot `human`/`pass`/`wait`/plain (`aria-hidden`), bold title, details, run id as an `ah-key` `routerLink`, actor via `actorLabel` ("Ahoy"). `role="list"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ArtifactDiff | `ui/artifact-diff/artifact-diff.ts`             | `<ah-artifact-diff [previous] [next] [context] label>` over the domain's `diffLines` and `hunks`; `diffBlocks` numbers removed lines in the old revision and the rest in the new one; `+ ` / `− ` signs so the change never relies on colour; "No changes between these revisions." when equal. `[ahMark]` directive (`Mark`) adds `ah-mark`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Markdown     | `ui/markdown/render-markdown.ts`, `markdown.ts` | `renderMarkdown(src, { changedBlocks })`: one `Marked` instance (GFM) with overrides: raw HTML **escaped** (block and inline), images replaced by "[image: alt]" (nothing loads), links only for absolute `http:`/`https:`/`mailto:` (parsed with `URL`), with `target="_blank" rel="noopener noreferrer"` and escaped `href`/`title`, anything else rendered as its text; task-list checkboxes as text. `changedBlocks` are indices into the domain's `markdownBlocks(src)`: blocks are located in the source and every top-level token that overlaps a changed block is wrapped in `<div class="ah-mark">` (a loose list spanning several blocks is marked once). `<ah-markdown [source] [changedBlocks]>` binds the result to `[innerHTML]` (Angular sanitizes again) in the `reading` style: 13.5/22, 75ch, headings, lists, code, tables, quotes.                                                                                                                                  |
| Gallery      | `ui/_kit/sections/1c-*.ts`                      | Eight sections: the Dialog preview inline plus the send-back (busy) and reject (error with `tech`) kinds and a **live CDK dialog** (a pretend stop: the first confirm shows the 409 notice, the second closes); ChoiceCard; QuestionCard in its three states; ModelChoice with the Lookouts error and a disabled Save; LiveSteps; ShipsLog; ArtifactDiff with `ahMark`; Markdown (a plan with its changed blocks marked, and hostile markdown shown inert). All example data is fictional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Dependencies | `package.json`, `package-lock.json`             | `@angular/cdk` 22.2.1 and `marked` 18.1.0 (see above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Proof

All on Node 24.21.0, offline, 0 AIU. No API, mock or real, was involved: lane 1C has no data.

- **Tests: 42 files, 900 tests** (100 new; the 800 before the lane unchanged): `render-markdown` 32, `markdown` 2,
  `dialog` 12, `1c-sections` 12, `model-choice` 9, `question-card` 8, `live-steps` 8, `choice-card` 6, `artifact-diff` 6,
  `ships-log` 5.
- **Markdown security (the lane's XSS suite):** `<script>` block and inline, `<img onerror>`, `[x](javascript:…)` in 10
  spellings (mixed case, spaces, tab, entity, `data:`, `vbscript:`, `file:`, autolink, reference link), relative and
  protocol-relative links, embedded `<div onclick>`, `<iframe>`, `<style>`, `<form>`, `<svg onload>`, inline
  `<a href="javascript:">` and `<b onmouseover>`, a remote image, quote injection in `href`/`title`, HTML in code spans and
  fences, a hostile fence language, task checkboxes. Every output is parsed and checked to have no script, img, iframe,
  object, embed, svg, style, link, form, input or video, no `on*`, `src`, `srcset`, `style` or `action` attribute, no
  `javascript:` anywhere, and only `http(s)`/`mailto` links. The component test renders hostile markdown in `TestBed`,
  clicks every element, checks that a global flag the payloads would set stays unset, and that **Angular's sanitizer
  logged nothing** (it found nothing left to strip).
- **Dialog, on the real CDK `Dialog` in jsdom:** modal and labelled by its title; initial focus on the first field (on the
  dialog when there is none); Esc, Cancel and the close button close with `undefined` and no `confirm`; the focus returns
  to the opener; the concrete dialog's result comes back through `closed`; while `busy`, two more clicks, Esc, Cancel and
  close do nothing (one `confirm`), and after `busy` ends Esc closes again; the 409 notice shows at the top of the body
  with the typed text kept; the three kinds give the right tile, icon and confirm variant.
- **Mutation checks (each made the suite fail, then was reverted):** dialog without the initial-field focus (1 test),
  without `disableClose` while busy (1), without the busy guard on confirm (1), with `restoreFocus: false` (3); markdown
  passing raw HTML through (5), accepting any link scheme (10), rendering `<img>` (2), dropping `target`/`rel` (2), not
  escaping `title` (1).
- **In headless Chromium 1194** (`ng serve`, development; a throw-away CDP script in the session scratchpad, not in the
  repo): `/_kit` in light and dark at 1100 px and 390 px, each 1C section screenshotted and compared by eye with its
  `preview.html`. The live dialog: `cdk-dialog-container` has `role="dialog"` and is labelled "Drop anchor on PROJ-140?",
  the textarea has the focus, the dark backdrop shows (`rgba(0, 0, 0, 0.32)`), Esc closes it and the focus is back on
  "Open a live dialog: Stop". At 390 px the page has no sideways scroll (`scrollWidth` 390) after the ModelChoice fix
  below; at 1100 px neither.
- `npm run build` (production) has no new warning; no `anyComponentStyle` budget was exceeded.

### Decisions and deviations

- **Component styles instead of `src/styles/`.** Plan rule 2 puts new CSS in `src/styles/`, which lane 1A owns. Each rule
  1C needs lives in its own component (`:host { display: contents | block }`, the preview's inline layouts, the send-back
  dialog tile with `status-sendback-*`, the markdown `reading` styles under `.ah-markdown` with
  `ViewEncapsulation.None`, because `[innerHTML]` content carries no Angular attributes). Each block says why. None
  restyles a bundle class except where the bundle has no rule for the case (below).
- **ModelChoice on phones.** The bundle's `.ah-model` grid (`120px 1fr 130px auto`) is wider than a 390 px screen and
  pushed the page sideways (`scrollWidth` 473). Under 600 px the row puts the phase and the source on their own lines.
  **For the design system:** consider a narrow layout for `.ah-model`. The effort select also clips "Default (medium)"
  at 130 px, as the preview does.
- **The send-back dialog tile** (`ah-dialog__icon--sendback`) is not in the bundle; tokens.json documents
  `status-sendback-*` for it. **For the design system:** add it to `bundle.css`.
- **Busy uses `aria-disabled`**, not `disabled`, on the dialog buttons, so the focused confirm keeps the focus.
- **`renderMarkdown` lives in `ui/markdown/`** (it uses `marked`, so it can't be in `domain/`), and imports only
  `markdownBlocks` from the domain, as lane 2C asked.
- **Model rows count a blank model as its known default** when checking the Lookouts (the Dialogs wireframe flags a
  blank defect reviewer whose default equals the typed design model). With no known default, a blank model is not a
  conflict, as `reviewersConflict` says. After the merge of `main`, `ModelPlan` is the API's shape (a list of slots with
  `storyKey`, `version`, `phase`, `lens`, `chosen`), so the table no longer builds one to call `reviewersConflict`: it
  compares the two effective models itself, with the same rule. This was the only code change the merge needed.
- **Output names** avoid DOM event names (ESLint `no-output-native`): `send` (not `submit`), `restoreDefault` (not
  `reset`), `dismissed`.
- **Agent text is always interpolated** in QuestionCard, LiveSteps, ShipsLog and ArtifactDiff; only `ah-markdown` uses
  `[innerHTML]`, never `bypassSecurityTrust*`.

### Files outside the lane's list, and why

- `package.json`, `package-lock.json`: the two approved dependencies.
- **`src/app/ui/_kit/kit.spec.ts` (lane 1A's), one assertion.** It required the gallery to have exactly lane 1A's six
  sections, so any 1B or 1C section broke it. It now checks that 1A's sections come first and that ids are unique.
  **Lane 1B will need the same change**; whichever lane merges second keeps this version.
- `docs/progress.md` (this section and the header) and the README "Status".

### Did not run, skipped, and why

- **`npm run start:mock`:** lane 2D's mock backend is not in `main`, and 1C shows no API data; `/_kit` ran on
  `ng serve` (development) instead.
- **Nothing against an API** (`--simulate` or otherwise): the lane has no I/O.
- **Not checked:** other browsers than Chromium, real phones (390 px was viewport emulation), a pixel diff (by eye), a
  screen reader (only the ARIA attributes are tested).
- **Keyboard arrows on the radios** are proved in jsdom through the component's own handler; native radio arrow
  behaviour in Chromium was not driven separately (the handler calls `preventDefault`, so only one move happens).
- **Skipped test suites:** none.

### Needs from other lanes

- **For lane 4A (dialogs):** write each dialog as a component whose template is `<ah-dialog>`, open it with
  `DialogService.open`, set `busy` while the command runs, on a 409 set `error` to
  `{ variant: "notice", heading: "This voyage changed since you opened it", text }` and keep the form, and close the
  `DialogRef` with the result. Put the cost box in `[ahDialogCost]` (`<ah-banner variant="cost">`).
- **For lanes 4B/4C:** `ah-question-card` takes a `FormControl<string>` per question and emits `send`;
  `ah-choice-card-group` is a form control; `ah-markdown` takes `changedBlocks(previous, next)` from the domain.
- **For lane 4D:** `ah-model-choice-table` takes `rows` and `controls`; read `conflict()` to disable Save, and send `null`
  for each slot in `restoreDefault`.
- **For lanes 5A/5C:** `ah-live-steps` takes `LiveStep[]` (map 2A's `RunProgressTool`/`Message`, and add a `gap` row
  from `omitted`); `ah-ships-log` takes `ShipsLogEntry[]`; `ah-artifact-diff` takes two revisions' text.
- **For the design system:** the `.ah-model` phone layout and the send-back dialog tile (above).

### Final check

Run at the end of the lane, on Node 24.21.0:

```
$ node -v                     v24.21.0
$ npm run build               exit 0
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (no problems; build-tokens: ok)
$ npm test                    exit 0 (Test Files 42 passed (42); Tests 900 passed (900))
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

After committing (e2b28bd) and merging `main` at 9b4e16f (lane 2A's finishing pass, PR #7, and lane 2B, PR #8), on the
merged tree, Node 24.21.0, after `npm ci`:

```
$ npm run build               exit 0
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint, tokens:check, api:check)
$ npm test                    exit 0 (Test Files 53 passed (53); Tests 1156 passed (1156): 1056 of main + 100 of lane 1C)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

The merge had text conflicts only in `README.md` "Status" and in this file (header, "Where we are", "Start here next" and the
lane sections, which git had interleaved with lane 2B's): this file was rebuilt from `main`'s version with the lane 1C section
added whole. One code change was needed, in `ah-model-choice-table` (see "Decisions and deviations").

Then `main` at c2562e9 (lane 1B, PR #9) merged in, on Node 24.21.0:

```
$ npm run build               exit 0
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint, tokens:check, api:check)
$ npm test                    exit 0 (Test Files 68 passed (68); Tests 1402 passed (1402): 1302 of main + 100 of lane 1C)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

Conflicts: `README.md` "Status", this file (rebuilt again from `main`'s version with the lane 1C section added) and the one
assertion of `kit.spec.ts` both kit lanes changed: lane 1B's version is kept (lane 1A's sections, by lane), plus lane 1C's check
that every section id is unique. No code change was needed. `/_kit` was not re-checked in a browser after this merge.

---

## Lane 1B · Kit: state, progress and navigation (2026-10-07)

Launched from `docs/paralelos2.md`, section A. **Not committed:** every change is in the working tree of
`claude/paralelos2-section-a-h4ef52` (the branch this session was given; plan §9 would call it `lane/1b-...`), waiting for the
user's approval to commit and push. Pre-flight (`git fetch origin main`): lane 1A (`tokens.css`, `ahoy-bundle.css`, `ui/icon/`) and
lane 2C (`src/app/domain/` with `statusPresentation`, `outcomePresentation`, `explainHalt`, `text-diff.ts`) were both in `main`
(56e815a), and the lane was built on that. `main` has moved since (9b4e16f: lane 2A's finishing pass, PR #7, and lane 2B, PR #8):
see "Integration with `main`" below.

### Node

`node -v` was v22.22.0. `npx -y node@24 -v` gave v24.21.0; that binary was copied into the session scratchpad and put first on
`PATH`. Every command below ran on Node 24.21.0 with npm 10.9.4, after `npm ci` (nothing new installed: **no dependency was
added**).

### What changed

All in `src/app/ui/`. Every component is standalone, OnPush and zoneless, and takes its vocabulary from `@domain`.

| Component                  | Selector / name                                         | Inputs → what it renders                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status-badge/`            | `ah-status-badge`                                       | `[status]` (required) `[phase]` `[showApi]` `[detail]`. `statusPresentation` gives label and class; `showApi` adds `ah-api` with the API word, and `detail` appends a second one ("awaiting_decision · plan_accepted"). A status the vocabulary does not know shows as its own word in the neutral colour.                                                                                                                         |
| `outcome-pill/`            | `ah-outcome-pill`                                       | `[value]`. The host **is** the pill (`ah-badge ah-badge--<modifier>`), the API word as label, no dot; `outcomePresentation` gives the class, an unknown word stays neutral.                                                                                                                                                                                                                                                        |
| `phase-stepper/`           | `ah-phase-stepper`, `phaseProgress()`                   | `[phase]` `[status]` `[stoppedAt]` `[compact]`. Full: `role="list"` of seven `ah-step` (✓ done, number current/ahead, `!` stopped), `aria-current="step"` on the current or stopped one, each item named "planning, stopped". Compact: seven `ah-dots` bars as `role="img"` with "Phase 3 of 7", "Stopped at phase 2", "Blocked at phase 3", "Blocked" or "Done". `phaseProgress` (pure, in `phase-steps.ts`) holds the rules.     |
| `budget-meter/`            | `ah-budget-meter`, `formatCap()`                        | `[spentNanoAiu]` `[capNanoAiu]` (integer nano-AIU) `[decimals]` (1) `[width]` (120 px) `[variant]` `full` "**12.4** / 30 AIU" or `compact` mono "12.4 / 30" `[label]`. `role="meter"`, `aria-valuemin/max/now` in AIU (now clamped to the cap), `aria-valuetext`. The cap drops trailing zeros ("30", "28.6"). Amounts that are not safe non-negative integers show "— / —", no value. The fill never changes colour.              |
| `filter-chips/`            | `ah-filter-chips`                                       | `[counts]` `[(selected)]` (`"all"` or a `StoryStatus`) `[label]`. All, then Queued, Under way, Crew asks, Your orders, Anchored and **In port** (`terminal`), each with badge, API word and count; `aria-pressed`, one at a time, pressing the pressed one does nothing. A missing count shows none.                                                                                                                               |
| `section-tabs/`            | `ah-section-tabs`                                       | `[items]` (`SectionTab`: `id`, `label`, `link`, `queryParams`, `count`, `exact`) `[label]` `[variant]` `tabs`/`pill` `[(selected)]`. A tab with `link` is an `<a routerLink>` with `aria-current="page"` (prefix match unless `exact`); one without is a toggle `<button aria-pressed>` selected through `selected`. `<nav>` when any tab has a link, else `role="group"`. Counts muted, `0` shown. Wraps (bundle), never scrolls. |
| `top-bar/`                 | `ah-top-bar`                                            | `[needsYou]` `[live]` `live \| reconnecting \| offline` `[user]` `{ email, initials }` `[(query)]`. Logo, nav (All hands with `ah-count`, hidden at 0; Voyages; The Docks with `ah-soon`) with `aria-current="page"`, search, a persistent `role="status"` holding "Live" / the "Reconnecting to live updates…" pill / "Live updates are off", **Set sail** (the only primary button), avatar with the e-mail as name and `title`. |
| `empty-state/`             | `ah-empty-state`                                        | `[heading]` `[icon]` (anchor); the projected text is the sentence and `[ahEmptyAction]` the way forward.                                                                                                                                                                                                                                                                                                                           |
| `skeleton/`                | `ah-skeleton`, `ah-skeleton-rows`                       | `ah-skeleton [width] [height]`: one bar (the host has `ah-skeleton`). `ah-skeleton-rows [rows] [columns]`: `columns` are `{ track, height? }` grid tracks; the container is `aria-busy="true"`, fixed `px` columns fill their track, flexible ones vary 85/65/75 % from row to row.                                                                                                                                                |
| `toast/`                   | `ToastService`, `ah-toast-host`                         | `toasts.show(text)`: about 5 s (`TOAST_DURATION_MS`), at most 3 at once (`MAX_TOASTS`, the oldest goes), blank text ignored, timers cleared on destroy, never an action. One `<ah-toast-host />` in the shell: an always-present `role="status"` `aria-atomic="false"` region, fixed at the bottom centre.                                                                                                                         |
| `pipes/`                   | `ahAiu`, `ahRelative`, `ahDateTime`, `ahActor`, `CLOCK` | `nano \| ahAiu[: decimals]` ("12.4"); `at \| ahRelative[: 'waiting']` ("22 m ago" / "22 m", reads `CLOCK`, impure); `at \| ahDateTime` ("Wed 09:48"); `actor \| ahActor` (`ahoy-reconciler` → "Ahoy"). A missing value is "—". `CLOCK` is `InjectionToken<() => Date>`, the real clock by default.                                                                                                                                 |
| `_kit/sections/1b-*.ts`    | gallery                                                 | `1b-sections.ts` lists 11 sections (one per component, plus Pipes), each in its own file; `1b-sections.spec.ts` checks them.                                                                                                                                                                                                                                                                                                       |
| `src/styles/_ahoy-1b.scss` | styles                                                  | The few rules the bundle lacks, each commented: `display: contents` hosts, the status badge + API word row, 18 px badges in chips, `aria-pressed` look for pill tabs, the 40 px empty-state icon, skeleton rows, the toast host's place. Loaded by one `@use` line in `src/styles.scss`.                                                                                                                                           |

**Using it (for 3A, 3B, 3C, 4A and the voyage lanes):**

```html
<ah-top-bar [needsYou]="needsYou()" [live]="liveState()" [user]="user()" [(query)]="query" />
<ah-status-badge [status]="story.status" [phase]="story.phase" showApi detail="plan_accepted" />
<ah-phase-stepper [phase]="story.phase" [status]="story.status" [stoppedAt]="blockedAt()" />
<ah-phase-stepper [phase]="story.phase" [status]="story.status" compact />
<ah-budget-meter
  [spentNanoAiu]="story.spentNanoAiu"
  [capNanoAiu]="story.budgetNanoAiu"
  [width]="64"
  variant="compact"
/>
<ah-filter-chips [counts]="counts()" [(selected)]="status" />
<ah-section-tabs label="Voyage sections" [items]="tabs()" />
<ah-outcome-pill [value]="gate.outcome" />
{{ story.updatedAt | ahRelative }} · {{ story.spentNanoAiu | ahAiu }} · {{ event.actor | ahActor }}
```

### Proof

All on Node 24.21.0, offline, 0 AIU. **No API, mock or real, was involved:** lane 1B has no data (the dev server ran with
`ng serve --configuration mock`, which is still the development build until lane 2D, and showed only `/_kit`).

- **Chain:** `npm run build` (production, no `kit-routes` chunk, `grep` finds no `_kit` or `Kit ·` in `dist/`; the main bundle is
  unchanged at 219.55 kB because nothing uses the components yet; `styles.css` is 31.09 kB with the 1B rules),
  `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (with `tokens:check`), `npm test` and `npm run format:check`, all exit 0.
- **Tests on the lane's own tree (56e815a): 47 files, 1046 tests, 0 failed, 0 skipped** (800 before this lane: 15 + 83 + 484 + 218).
  New, **246 in 15 files**:

  | File                                  | Tests | What it proves                                                                                                                                                                                                                                                                                          |
  | ------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `status-badge/status-badge.spec.ts`   | 61    | **Every status × every phase** (the five non-terminal statuses × no phase, the 7 phases and `blocked`; `terminal` in each phase and in `blocked`) against the table of `vocabulary.md`, written out in the spec; the dot, the API word, the detail, an unknown status.                                  |
  | `outcome-pill/outcome-pill.spec.ts`   | 23    | The 19 words of the OutcomePill README, each with its class and no dot; a run in `awaiting_input` (as `branch`); an unknown word; reacting to input.                                                                                                                                                    |
  | `phase-stepper/phase-stepper.spec.ts` | 59    | **6 statuses × 7 phases**, full and compact: one `current` (or one `stopped` when anchored/aground, none when docked), the passed ones done; Aground at each of 6 stops, without a stop, an unknown phase; ✓ / number / `!`; roles, `aria-label`s, `aria-current`; the pure rule never marks two steps. |
  | `budget-meter/budget-meter.spec.ts`   | 12    | **0, 41 and 100 %**, overshoot, 1.84 / 28.6, `formatCap`, a cap of 0, six kinds of invalid amount, width, compact variant, the fill never gets another class.                                                                                                                                           |
  | `filter-chips/filter-chips.spec.ts`   | 14    | Seven chips in order with badge, class, API word and count; one pressed; click, same-chip click, outside change; missing counts.                                                                                                                                                                        |
  | `section-tabs/section-tabs.spec.ts`   | 11    | Links and `href`s, `aria-current` following navigation (prefix vs `exact`, query-parameter tabs), counts (a number, 0, none), the pill as a labelled group of `aria-pressed` buttons with two-way selection.                                                                                            |
  | `top-bar/top-bar.spec.ts`             | 22    | Layout order; `aria-current` for 6 URLs and after navigation; the count hidden at 0; Set sail the only primary button; **Live ↔ Reconnecting ↔ off** in one live region; avatar; search in and out.                                                                                                     |
  | `empty-state/…`, `skeleton/…`         | 4, 8  | Icon, title, sentence, action; `aria-busy`, rows, grid tracks, bar heights, widths.                                                                                                                                                                                                                     |
  | `toast/toast.spec.ts`                 | 10    | Fake timers: stays 4999 ms, goes at 5000, each timed from its own start; no action; blank ignored; the 3-toast cap and its timers cleared (spied `setTimeout`/`clearTimeout`); timers cleared on destroy.                                                                                               |
  | `pipes/*.spec.ts`                     | 14    | `ahAiu` 3, `ahRelative` 6 (fake clock, a ticking signal clock, real clock), `ahDateTime` 2, `ahActor` 3.                                                                                                                                                                                                |
  | `_kit/sections/1b-sections.spec.ts`   | 8     | The 11 gallery sections and their key content, the toast demo with its own host.                                                                                                                                                                                                                        |

- **Mutation checks:** 14 deliberate breaks of the production code, each caught by the tests and then restored (the whole chain was
  rerun green afterwards): halted marked `current` (10 failed), a second `current` (40), `aria-valuenow` unclamped (1), cap keeping
  trailing zeros (9), All hands matching by prefix (7), Reconnecting still showing Live (2), chips ignoring the selection (3), timers
  never cleared (2), toast lasting 10 s (2), an unknown outcome turning red (10), Aground ignoring the blocked phase (1), tabs
  without `aria-current` (3), the relative pipe pure (2), the skeleton without `aria-busy` (1).
- **Browser, `/_kit` against the previews:** `ng serve --configuration mock` and headless Chromium 1194 driven by Playwright 1.56.1
  (installed globally in the session, **not** a dependency of the repo; the script lives in the session scratchpad). Each of the 11
  sections screenshotted at 1100 px in light and dark, and compared by eye with the `preview.html` of StatusBadge, PhaseStepper,
  BudgetMeter, OutcomePill, FilterChips, SectionTabs, TopBar, EmptyState, Skeleton and Toast, wrapped with the generated `tokens.css`
  and the bundle (`docs/design/` untouched). They match in both themes, except the deliberate differences below.
- **390 px:** `scrollWidth` 390 in light and dark, and no element of the 11 sections pokes out of the viewport. The top bar wraps
  (logo and nav, search, then Live, Set sail and the avatar), the stepper and the chips wrap, the tabs wrap onto a second line.
- **Live toast:** pressing "Show a toast" showed one in a `position: fixed` `role="status"` region at the bottom, and it was gone
  5.3 s later.
- **One 404 in the console** on every page: `/config.json`, which the dev server does not serve (the app falls back to its defaults,
  as lane 2A's report says). Nothing else logged.

### Deliberate differences from the previews

- **Links styled as buttons are readable.** The TopBar preview's "Set sail" and the EmptyState preview's button are blue on blue
  or blue text because of bundle defect 1 (lane 1A); here they use 1A's corrected colours.
- **Pill tabs use `aria-pressed`, not `aria-selected`.** `aria-selected` is not a valid attribute on a `<button>`; the look is the same
  through one rule in `_ahoy-1b.scss`.
- **The compact stepper is `role="img"`** with the `aria-label`, and the full one is a labelled `role="list"` whose items name their
  state ("planning, stopped"); the preview has `aria-label` on plain `div`s.
- **Stopped label:** "Stopped at phase 2" (DS preview) for Anchored, "Blocked at phase 3" (the Voyages wireframe) for Aground, "Done" for
  Docked. The wireframe says "Phase 1 of 7" for an Anchored voyage; the DS wins.
- The top bar has an `offline` state the DS does not draw (see "Decisions to review"), and the gallery's top bars show no current
  destination because `/_kit` is none of the three routes (the unit tests prove `aria-current`).
- **Bundle observation (not changed):** `.ah a { color: accent-text }` is more specific than `.ah-tabs__item` and `.ah-nav__item`, so
  the links of the tabs and of the nav are blue instead of `ink-soft` / `ink-muted`. The previews show the same, so this lane matches
  them. For the design system, next to the two defects in lane 1A's section.

### Decisions to review

1. **`CLOCK` lives in `ui/pipes/clock.ts`.** `ui/` may not import `core/` and `core/` may not import `ui/`, so the "shared token" of the
   plan cannot be one symbol; lane 2B reached the same conclusion and has its own in `core/realtime/clock.ts`, a `Clock` object
   (`now()` and `schedule()`). Mine is a function, `() => Date`, real by default, so the shell bridges them with one provider:
   `{ provide: UI_CLOCK, useFactory: () => { const clock = inject(CORE_CLOCK); return () => clock.now(); } }`. A clock that reads a
   signal makes every `ahRelative` in view refresh as it ticks (tested).
2. **`ahRelative` takes a second argument** (`'waiting'`) for the "Waiting" column (`waitingTime`); not in the plan, small.
3. **Top-bar search is `[(query)]`** (a `model`), not an output named `query`: `queryChange` emits on every keystroke (the shell should
   debounce before it navigates to `/voyages?q=`), and `query` puts back the text of the current `?q=` after a reload.
4. **`offline` shows the neutral pill "Live updates are off".** The DS only draws Live and Reconnecting; the plan lists `offline` as a state
   of the indicator and lane 2B ends in `offline` after a 4xx. Wording to confirm.
5. **Route tabs are data** (`items`), not projected `routerLink`s as the README's one line says: easier for 4A to build from counts and
   easier to test. A tab with no `exact` is current on the pages below it, and a tab without query parameters is current whatever the
   query string is, so make it `exact` when its siblings differ by query parameters.
6. **`ah-status-badge` host is `inline-flex` with an 8 px gap** (the badge and its API word), the one wrapper that is not
   `display: contents`.

### Files outside the lane's list, and why

- `src/styles/_ahoy-1b.scss` (new) and **one `@use` line plus a comment line** in `src/styles.scss`: the phase file says new CSS goes in
  `src/styles/`, and lane 1A's report invites each lane to add its own partial this way. Lane 1C will add one line next to it.
- `src/app/ui/_kit/kit.spec.ts` (lane 1A's): **one assertion changed.** It listed _all_ gallery sections and so failed as soon as any lane
  added its own; it now lists the lane 1A ones (`filter(s => s.lane === "1A")`). Lane 1C will hit the same failure, and the same one-line
  change merges trivially.

### Integration with `main` (9b4e16f)

`main` moved while this lane was being built: lane 2A's finishing pass (PR #7: `schema.d.ts`, the domain types made to match the
contract, `contract.spec.ts`) and lane 2B (PR #8: `core/realtime/` and `core/stores/`). It is merged into the working tree with
`git merge --no-commit --no-ff origin/main`: **nothing is committed** and `HEAD` is still 56e815a, so `git status` says "All
conflicts fixed but you are still merging" and the commit that concludes it carries the lane and the merge together.

- **Conflicts.** Only two files conflicted when the lane and `main` were tried together (in a scratch clone, with the lane committed
  on 56e815a): `README.md` (the "Status" bullets, where both sides appended) and `docs/progress.md` (the header, "Where we are" and "Start
  here next", where both sides rewrote the same lines). **No source file conflicts:** apart from those two documents, `main` touched none
  of the files this lane changed. The merge itself was done with those two documents restored to `HEAD`, so it applied without a conflict;
  the lane's part of them was then written back on top of `main`'s text, with the two statements of `main`'s own that the merge made
  stale corrected (lane 2B is merged, PR #8).
- **What `main` changed under the lane's feet, checked on the merged tree.** `domain/types.ts` now has the contract's shapes: `Phase`
  is a plain `string` (the components already took a string), `GateOutcome` lost `waiting`, `RunStatus` gained `awaiting_input`, and
  `outcomePresentation` maps that to `input`. The gallery and the pill tests now cover `awaiting_input`; nothing else needed a change.
  `EventBus.status()` has a fourth value, `connecting` (see "Needs from other lanes", lane 3A), and lane 2B's `CLOCK` is a
  different type from the one in `ui/pipes/` (see "Decisions to review" 1); neither needs a change in `ui/`.
- **Chain on the merged tree** (Node 24.21.0, after `npm ci` from `main`'s lockfile): `npm run build`, `npm run typecheck`
  (`check-boundaries: ok`), `npm run lint` (with `tokens:check`, `api:check` and `openapi-mirror`), `npm test` (**58 files, 1302 tests**: the
  1056 of `main`, which already holds lane 2B, plus this lane's 246) and `npm run format:check`, all exit 0.

### Did not run, skipped, and why

- **`npm run start:mock` against a mock backend:** lane 2D has not built it, and these components take no data; the gallery was served by
  the `mock` configuration, which is still a copy of `development`.
- **Wireframe boards in a browser:** not opened (they need the Claude Design runtime). The top-bar, stepper and chip compositions were
  checked against the design system's previews and the Voyages wireframe's HTML, read as text.
- **Not checked:** browsers other than Chromium, a real phone (390 px was viewport emulation), a screen reader, a pixel diff (the
  comparison was by eye), keyboard order in a real browser (the unit tests cover roles and attributes, not tabbing).
- **Not exercised by the app:** nothing uses these components yet, so the production bundle does not contain them.
- **Skipped test suites:** none.

### Needs from other lanes

- **From the user:** review of this lane, then approval to commit and push; an answer on the points under "Decisions to review".
- **For lane 3A (shell):** put `<ah-toast-host />` once in `App`; feed `ah-top-bar` (`needsYou` from `StoriesStore.needsYou()`, `user` from
  `CurrentUser`: `{ email: actor, initials }`) and debounce `queryChange` before navigating; map `EventBus.status()`, which is
  `connecting | live | reconnecting | offline`, to `[live]`, which takes `live | reconnecting | offline` (as lane 2B suggests: `connecting`
  shows as `reconnecting`, or as `live` if you prefer no flash at start-up); provide the `ui` `CLOCK` from lane 2B's (see "Decisions to
  review" 1), with a ticking clock if the lists should keep "22 m ago" fresh; inject `ThemeService` once (still open from lane 1A).
- **For lane 2C:** `statusPresentation` has no fallback for an unknown status (it returns `undefined`; the doc says "neutral"), so
  `ah-status-badge` guards it; and the label **"In port"** of the filter lives in `ui/filter-chips` (`IN_PORT_LABEL`) because `domain/` only
  has the `IN_PORT` word. Move it to `domain/status.ts` if you want one place.
- **For lane 4A:** the voyage header needs `ah-status-badge` with `showApi` and `detail` (gate or halt reason), and
  `ah-phase-stepper` with `[stoppedAt]` for Aground (from `story.phase_changed`).
- **For lanes 3A and 5A:** put `ah-skeleton-rows` inside `ah-panel-body` and give a scroll box `position: relative` (lane 1A's defect 2).
- **For lane 1C:** the one-line `kit.spec.ts` change above, and a partial `_ahoy-1c.scss` + `@use` if it needs global CSS.

### Final check

Run at the end of the lane, on the lane's own tree (56e815a), on Node 24.21.0 (the merged tree is under "Integration with `main`"):

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle, no kit-routes chunk)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint, then build-tokens: ok)
$ npm test                    exit 0 (Test Files 47 passed (47); Tests 1046 passed (1046))
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

---

## Lane 2B · Realtime and stores (2026-10-07)

Launched from `docs/paralelos2.md`, section C, on branch `claude/ecstatic-allen-vkmfqi` (the branch this session was given; plan
§9 would call it `lane/2b-realtime-stores`), from `main` at 56e815a. Committed and pushed with the user's approval on
2026-10-07, after merging `main` at a0cefc4 (lane 2A's finishing pass, PR #7); pull request into `main` open.

**Pre-flight.** In `main`: `openapi/ahoy-v1.yaml`, the `ApiClient` in `src/app/core/api/` (2A) and `src/app/domain/` with the
vocabulary and its types (2C). `src/app/core/api/schema.d.ts` is **missing** (2A is waiting for its dependencies); the user
decided that the hand-written `src/app/core/api/types.ts` counts as the prerequisite, since only that file changes when the
generator arrives. Node was v22.22.0, so every command ran on Node 24.21.0 from `npx -y node@24`, copied into the session
scratchpad and put first on `PATH`. The session started without `node_modules`; `npm ci` installed the locked tree (no
dependency added or changed).

### What changed

All in `src/app/core/realtime/` and `src/app/core/stores/`, the two directories the lane owns, plus this file and the README
"Status" bullets. `src/app/core/stores/.gitkeep` was removed.

| File                                        | What it is                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `realtime/fetch.ts`                         | `FETCH` now has a root default, `globalThis.fetch` (it had none). `app.config.ts` still provides the same value; harmless, left alone (not this lane's file).                                                                                                                                                                                                                                                                            |
| `realtime/clock.ts`                         | `Clock` (`now()`, `schedule(ms, fn)` giving a cancellable `Timer`), `systemClock`, the `CLOCK` token, and `RANDOM` for the jitter. Every wait of the data layer goes through it.                                                                                                                                                                                                                                                         |
| `realtime/sse.ts`                           | `SseDecoder` (text in pieces, messages out) and `parseSseStream(body)`: WHATWG event-stream rules (LF, CRLF and CR; a CR at the end of a chunk is held until the next one; comments; multi-line `data`; `id` carried over and refused with a NUL; `retry` and unknown fields ignored; a message cut off by the end is dropped). UTF-8 decoded with `TextDecoder` in stream mode, BOM dropped.                                            |
| `realtime/event-stream-client.ts`           | `EventStreamClient`: `fetch` of `/events/stream[?story=&after=]` with `Accept: text/event-stream`, the `AuthStrategy` headers and `cache: "no-store"`; `Last-Event-ID` on reconnection. `reconnectDelay`: 1 s doubling to 30 s, ±20 % jitter, reset after 30 s stable. 4xx is terminal (`offline`, `refusedWith`); 5xx, network, a non-SSE 200, a failing `AuthStrategy` and an ended stream reconnect. 3 failures in 60 s → `degraded`. |
| `realtime/event-bus.ts`                     | `EventBus`: one global stream (no `story=`), opened by the first subscriber of `events()`/`eventsFor(key)` and closed by the last. `status`, `degraded`, `lastEventId`, `refusedWith`, `subscribers`; `watchStory(key)` for the polling; `resync` (every 10 s while degraded). Delivers each event once per story, in order, whatever its source.                                                                                        |
| `realtime/polling.ts`                       | `PollingFallback`, run by the bus while degraded and subscribed: `listStoryEvents?after=` of every watched story every 3 s (up to 10 pages of 500 per round, rounds never overlap, a failure waits for the next round), and the 10 s `resync` tick.                                                                                                                                                                                      |
| `realtime/event-id.ts`                      | `isEventId`, `compareEventIds` (numeric order without `Number`, ids may pass 2^53), `laterEventId`.                                                                                                                                                                                                                                                                                                                                      |
| `realtime/event-types.ts`                   | `KNOWN_EVENT_TYPES` (the 24 examples of the contract's `EventType`), `isKnownEventType`, `RUN_PROGRESS`.                                                                                                                                                                                                                                                                                                                                 |
| `stores/resource.ts`                        | `StoreResource<T>`: `status` (`idle`, `loading`, `ready`, `error`), `value`, `error`, `busy`, `refresh()` (single flight; a refresh asked for meanwhile runs once more after it), `accept(value)`, `dispose()`. `newestVersion` keeps the greater `version`.                                                                                                                                                                             |
| `stores/stories-store.ts`                   | `StoriesStore`: `loadAll()` (`limit=500` until `nextCursor` is null, shared while in flight, list kept on error), `stories`, `counts`, `inPort`, `needsYou` (oldest `updatedAt` first), `atSea`, `find(key)`, `upsert(story)`, `use(destroyRef?)`. While used: a known event other than `run.progress` → one `getStory` per story per 300 ms; `404` removes it; `resync` reloads.                                                        |
| `stores/story-store.ts`                     | `StoryStore.for(key, { watch, destroyRef })` → a handle with `story`, `state`, `runs`, `questions`, `gates`, `models`, `artifacts` (`StoreResource`s), `watch(...)`, `events()` (the feed) and `release()`. `STALE_AFTER` maps each known event type to the resources it touches; observed ones are refetched once per 300 ms, the others only marked stale. `accept(story)`, `acceptModels(plan)`.                                      |
| `stores/run-progress-buffer.ts`             | `RunProgressBuffer`: `ingest`, `run(runId)` → `{ entries, spend, omitted, steps }`, `follow(key, destroyRef?)`, `hydrate(key)`. Entries are steps (one per `line`) and gap rows; a gap of the rise in `omitted` goes before its batch. 1000 events per run, 50 runs.                                                                                                                                                                     |
| `stores/story-events-feed.ts`               | `StoryEventsFeed.for(key, destroyRef?)` → `status`, `error`, `events`, `newestFirst`, `truncated`, `refresh()`, `release()`. History read from the start (G8), then merged with the stream; `run.progress` goes to the buffer, not into the feed. At most 2000 events.                                                                                                                                                                   |
| `stores/leases.ts`, `stores/event-pages.ts` | `LeaseMap` (shared entries, disposed by the last release), `releaseOnDestroy`; `readStoryEvents` (pages of 500 from a cursor, at most 200 pages).                                                                                                                                                                                                                                                                                        |
| `realtime/testing/*`                        | Spec helpers, plain TypeScript, never imported by production code and absent from `dist/`: `FakeClock` and `settle`, `FakeFetch` and `SseBody`, `FakeApi`, `anEvent`/`aStory`, `provideFakes`.                                                                                                                                                                                                                                           |

How the features use it (for 3A, 4A, 5A, 5B, 6A):

```ts
inject(StoriesStore).use(inject(DestroyRef)); // list, counts, inbox; holds the stream open
const voyage = inject(StoryStore).for(key, { watch: ["story", "runs"], destroyRef: inject(DestroyRef) });
voyage.story.value();
voyage.runs.status();
voyage.watch("questions");
voyage.events().newestFirst();
inject(StoryStore).accept(result.value); // after a 202/201 (4A's CommandRunner)
inject(RunProgressBuffer).follow(key, inject(DestroyRef));
inject(RunProgressBuffer).run(runId)(); // live steps (5A)
await inject(RunProgressBuffer).hydrate(key); // steps of runs that ended (run detail)
inject(EventBus).status(); // the top bar's Live indicator
```

### Decisions and deviations (to review)

1. **`ResourceStatus` has a fourth value, `idle`**, for a resource nobody has asked for yet (the plan lists `loading | ready |
error`). A refresh with a value in hand keeps `ready` (with `busy` true) instead of going back to `loading`, so screens do not
   flash a skeleton on every event; `error` keeps the last value.
2. **`CLOCK` holds the timers too** (`schedule`), not only `now()`, so that back-off, polling and debounce run on a fake in tests
   without `vi.useFakeTimers`. **It cannot be shared with 1B as the plan says:** `ui/` may not import `core/` (plan §5.2), so the
   pipes of 1B need their own token in `ui/` (or an input). See "Needs from other lanes".
3. **Jitter is ±20 %** around 1, 2, 4, 8, 16 s, capped at 30 s. **Every 4xx is terminal**, as the plan says, `429` and `408`
   included.
4. **What counts as a failure** for back-off and `degraded`: a refused connection (5xx, network, a 200 that is not
   `text/event-stream`, such as the dev server's `index.html` when the proxy is missing), a failing `AuthStrategy`, and a stream
   that drops or ends. Being live again clears `degraded`; 30 s live also forgets the failures. `stop()` and the last
   unsubscription leave the status `offline`.
5. **`Last-Event-ID`** comes from the SSE `id:` field when it is a decimal event id, else from the event's own `id`; anything
   else is never sent back (a bad value would make the API answer 400, which is terminal). `after` is sent only on the first
   connection.
6. **De-duplication is per story** in the bus (the last id delivered per story, for at most 1000 stories), because the stream's
   replay after a reconnection and the polling overlap. Ids are compared as decimal strings.
7. **The polling cursor** of a story is the last id the bus delivered for it; a story never seen on the stream is read from the
   start on its first round (consumers de-duplicate). The global stream id is not used as a story cursor, because the contract
   does not say ids are global.
8. **`story.started` causes a `getStory`** like any other event, instead of reading the story from the payload, whose shape the
   contract does not give. The 300 ms window starts with the first event and does not restart with later ones, so a busy story
   cannot postpone its refresh for ever. Event types the app does not know never cause a read (contract: ignore them).
9. **`STALE_AFTER`** (event type → resources) is this lane's reading of the contract and the wireframes; review it.
   `artifacts.updated` does not touch `story`, `run.progress` touches nothing.
10. **`RunProgressBuffer` keeps events, not rows**, sorted by id, and derives the rows; so a late or replayed event lands in its
    place. Past 1000 events per run the oldest go, and a gap row at the top counts the steps let go; later gaps count from the
    last `spend` let go. A batch with no step whose `omitted` rose gives a gap at the end.
11. **`StoryEventsFeed` does not keep `run.progress`** (hundreds per run, G8, R6) and hands it to the buffer, so reading a story's
    history also gives the run detail its archived steps. It keeps the newest 2000 other events (`truncated` says so).
12. **Stores live while held.** `StoriesStore.use`, `StoryStore.for`, `StoryEventsFeed.for` and `RunProgressBuffer.follow` count
    holders (a `DestroyRef` releases them) and stop their subscriptions, timers and late answers with the last one. The list
    keeps its data after the last release and reloads on the next `use`.
13. **Test helpers live in `core/realtime/testing/`**, because the lane may only edit its own directories. They are type-checked
    with the app, never imported by production code, and absent from `dist/` (checked). Moving them to `src/testing/` is a
    one-line import change per spec if 2D wants to share `FakeFetch`/`SseBody`.

### Proof

All offline, 0 AIU, Node 24.21.0.

- **Chain:** `npm run build` (exit 0, no warning), `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (with
  `tokens:check`), `npm test` (41 files, **946 tests**, 0 failed, 0 skipped) and `npm run format:check`, all green.
- **New tests (146), all on a fake `fetch`, a fake clock and a fake API; no network, no real waiting:**

  | File                                   | Tests | What it proves                                                                                                                                                                                                                                                                                                                                                                                              |
  | -------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `realtime/sse.spec.ts`                 | 27    | Every rule above; the same messages for a frame with 2-, 3- and 4-byte characters and CRLF **cut at every character, at every byte, at every pair of bytes** of its first message, and one byte per chunk; BOM (cut too); bad UTF-8; a read error rejects; stopping early cancels the body.                                                                                                                 |
  | `realtime/event-stream-client.spec.ts` | 28    | Headers (only `Accept` with `NoAuthStrategy`; the strategy's headers asked for on each connection); URL with `story`/`after`; events in order, garbage skipped; **reconnects with `Last-Event-ID`**; **401/403/400/404/429 end offline and never retry**; 5xx back-off 1 → 2 → 4 s; 3 failures in 60 s → degraded, live → not; the 60 s window; reset after 30 s stable; `stop` aborts and leaves no timer. |
  | `realtime/event-bus.spec.ts`           | 13    | One connection for all subscribers, closed with the last; `eventsFor`; once per story; a refusal; **polling every 3 s after degradation, with `after`, only for watched stories, `resync` every 10 s, stopped when the stream recovers (its replay not delivered twice)** and when the last subscriber leaves; nothing left after destroy.                                                                  |
  | `realtime/event-id.spec.ts`            | 3     | Id shape, numeric order past 2^53, `laterEventId`.                                                                                                                                                                                                                                                                                                                                                          |
  | `stores/stories-store.spec.ts`         | 21    | Paging (1203 stories, 3 calls of 500); counts and In port; **`needsYou` oldest first**, ties by key; error keeps the list; a failed later page; shared load; upserts during a load; **three events in 300 ms give one `getStory`** (fake clock); insert, 404 remove, other errors; `run.progress` and unknown types ignored; release cancels everything; `DestroyRef`; resync while degraded.               |
  | `stores/story-store.spec.ts`           | 17    | Only observed resources are read; one refetch per 300 ms; stale when unobserved, read when observed again; shared handles; list kept in step; **a 202 answer shows at once and a slow read cannot undo it**; models; errors keep values; the feed through `events()`; **nothing subscribed, scheduled or applied after the last release**; `DestroyRef`; app destroy.                                       |
  | `stores/run-progress-buffer.spec.ts`   | 19    | **Dedupe by `line`** and by id; **gaps from the difference of consecutive `spend`s over three batches, placed before the batch**; no gap at 0; trailing steps; `at` fallback; unreadable payloads; **the 1000 limit** and its gap; 50 runs; `follow`; `hydrate` from the start (fixture), shared and retried.                                                                                               |
  | `stores/story-events-feed.spec.ts`     | 9     | History in pages of 500 from the start; newest first without `run.progress`, which reaches the buffer; stream merge, also during the read; refresh from the cursor; error; **the 2000 cap**; shared feed and release; a late answer after release is dropped.                                                                                                                                               |
  | `stores/resource.spec.ts`              | 9     | `StoreResource` states, single flight, `accept`, `newestVersion`, `dispose`; `LeaseMap`.                                                                                                                                                                                                                                                                                                                    |

- **Mutation checks:** nine deliberate breaks of the production code, each caught, then restored: 4xx retried (5 tests failed),
  no `Last-Event-ID` (3), CR not held across chunks (5), UTF-8 not decoded in stream mode (4), gap after its batch (2), no debounce
  (3), voyage keeps its subscription after release (3), no de-duplication in the bus (2), no 60 s window (1).
- **Bundle:** `dist/` holds none of the spec helpers.

### Did not run, skipped, and why

- **Nothing ran against an API:** not the hosted API, not `--simulate` (no Docker daemon or Postgres in this session), not the mock
  backend (lane 2D is being built in another session). So the parser and the reconnection have only met the fake `fetch`; the
  real stream through the dev proxy is still untested (phase 0's open item, "Start here next" 6).
- **No browser run:** no component injects the new services yet, so the app is unchanged at start-up.
- **Skipped test suites:** none.

### Needs from other lanes

- **1B:** `CLOCK` is in `core/realtime/clock.ts`, which `ui/` may not import. Give the pipes a `now` of their own (a token in `ui/`
  or an input); the composition root can provide both from one clock. For the top bar: `EventBus.status()` is
  `connecting | live | reconnecting | offline`; the shell (not `ui/`) maps it to the indicator's `live | reconnecting | offline`
  (`connecting` shows as `reconnecting`, or as `live` if you prefer no flash on start-up).
- **2D:** the mock backend can provide `FETCH` with a `fetch` that serves `/events/stream` (`Content-Type: text/event-stream`,
  frames `id:`/`event:`/`data:`, honour `Last-Event-ID` and `after`); `SseBody`/`FakeFetch` in `core/realtime/testing/` show the
  shape. `dropStream` should end or break the body, which makes the client reconnect with `Last-Event-ID`.
- **2A:** nothing. When `types.ts` aliases `schema.d.ts`, nothing here changes.
- **P0 / composition root:** `app.config.ts` can drop its `FETCH` provider (the token has the same default now).
- **3A / 6A (shell):** something must hold the stream for the Live indicator on every screen: `StoriesStore.use(destroyRef)` in
  the shell does it, or `EventBus.events().pipe(takeUntilDestroyed())`.
- **4A:** after a command's `202`/`201`, call `StoryStore.accept(story)` (and `acceptModels(plan)` for `setStoryModels`).
- **5A / 5B:** `RunProgressBuffer.run(runId)` gives the rows of `ah-live-steps` (gap rows already placed; "N steps not shown"
  never appears for 0); `StoryEventsFeed.newestFirst()` is the ship's log.

### Final check

```
$ node -v                     v24.21.0
$ npm run build               exit 0
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint, then build-tokens: ok)
$ npm test                    exit 0 (Test Files 41 passed (41); Tests 946 passed (946))
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

After merging `main` at a0cefc4 (lane 2A's finishing pass, PR #7: generated types, `contract.spec.ts`, the domain types fix), on the
merged tree, Node 24.21.0, after `npm ci` from the new lockfile. Nothing in `core/realtime/` or `core/stores/` had to change:

```
$ npm run build               exit 0
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint, tokens:check, api:check)
$ npm test                    exit 0 (Test Files 43 passed (43); Tests 1056 passed (1056): 910 of main + 146 of lane 2B)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

The merge had two text conflicts, both in the handoff text (`README.md` "Status" and the header, "Where we are" and "Start here
next" of this file); both sides were kept and brought up to date.

---

## Lane 1A · Kit foundation (2026-10-06)

Launched from `docs/paralelos1.md`, section A. **Not committed:** every change is in the working tree of
`claude/brave-keller-c1j5st` (the branch this session was given; plan §9 would call it `lane/1a-kit-foundation`),
waiting for the user's approval to commit and push. Phase 0 was already in `main` (pre-flight checked with
`git fetch origin` and `git log origin/main`).

### Node

`node -v` was v22.22.0. `npx -y node@24 -v` gave v24.21.0; that binary was copied into the session scratchpad and put
first on `PATH`. Every command below ran on Node 24.21.0 with npm 10.9.4.

### What changed

| Area          | Files                                                                                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens        | `scripts/build-tokens.mjs`, `src/styles/tokens.css` (generated), `package.json` scripts `tokens`, `tokens:check`                      | Every colour, spacing, radius, shadow and size token becomes `--<name>`; `.` is escaped (`--space-1\.5`); `type.families` → `--font-sans`, `--font-mono`. Light in `:root, [data-theme="light"]` (83 properties), dark in `[data-theme="dark"]` (59: the 56 colours and 3 shadows; the rest inherit light). Each block also sets `color-scheme`, so native controls follow the theme. Values are checked to be plain CSS (no `;`, `{`, `}`, `\`, comments). `--check` writes nothing and fails when `tokens.css` is missing or differs from what `tokens.json` produces, or when any `var(--x)` in `src/styles/` or `src/app/` names a property nothing defines. |
| Styles        | `src/styles/ahoy-bundle.css`, `src/styles/_ahoy-angular.scss`, `src/styles.scss`                                                      | The bundle is a byte-for-byte copy of `components/bundle.css` under a header naming its source and version; its Google Fonts `@import` stays. `_ahoy-angular.scss` holds only what the bundle can't: `body { margin: 0 }`, `display: contents` for wrapper hosts, the link-button colour fix (below), `ah-panel__actions`, `ah-field__optional`, `ah-banner__body`; each rule says why.                                                                                                                                                                                                                                                                          |
| Theme         | `src/app/ui/theme/theme.service.ts`                                                                                                   | `ThemeService` (`theme` signal, `set`, `toggle`): `data-theme` on `<html>`, light by default, remembered under `ahoy.theme` in `localStorage`. Every storage access is in `try/catch`; a stored value that is not a theme is ignored. `THEME_STORAGE` token so tests use a fake. No button in the app (F16).                                                                                                                                                                                                                                                                                                                                                     |
| Icons         | `src/app/ui/icon/icons.ts`, `icon.ts`                                                                                                 | `ICON_NAMES` (16, in the README's order), closed `IconName`, `ICONS: Record<IconName, IconShape[]>` (exhaustive by type), `isIconName`. `<ah-icon name size label>`: inline SVG, `stroke="currentColor"`, 1.8 stroke, sizes 16 (default), 12, 18; `aria-hidden` unless `label` is set, then `role="img"` + `aria-label`. Shapes are data rendered with `@switch`: no `innerHTML`.                                                                                                                                                                                                                                                                                |
| Logo, favicon | `src/app/ui/logo/logo.ts`, `public/favicon.svg`, `src/index.html`, `public/favicon.ico` (deleted)                                     | `<ah-logo [link]>`: the wheel mark and "Ahoy" in `ah-logo`, a `routerLink` to `/` by default, plain text with `link = null`. The favicon is a copy of `ahoy-app-icon.svg`; the Angular default `favicon.ico` is gone.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Button        | `src/app/ui/button/button.ts`                                                                                                         | `button[ahButton], a[ahButton]` directive: `ahButton="default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | primary | soft | ghost | danger | danger-outline"`(bare = default),`size="sm | md  | lg"`; adds the bundle classes and leaves the element's own type, disabled state and classes alone. `buttonClasses(variant, size)` is exported. |
| Panel         | `src/app/ui/panel/panel.ts`                                                                                                           | `ah-panel` (the `<section class="ah-panel">`), `ah-panel-head` (`heading`, `subtitle`, `level` 2 or 3, free content, actions marked `ahPanelActions` pushed right), `ah-panel-body`, `ah-panel-foot`. With a heading, the section gets `aria-labelledby` to a unique id.                                                                                                                                                                                                                                                                                                                                                                                         |
| Field         | `src/app/ui/field/field.ts`                                                                                                           | `ah-field` (`label`, `required`, `optional`, `hint`, `unit`, `errorText`, `errorMessages`) around one `input/select/textarea[ahInput]` (`mono` for keys and model ids). Label `for`, `aria-required`, `aria-invalid` and `aria-describedby` (error, unit, hint ids, only those shown) go on the control; the asterisk is `aria-hidden`. Shows the first error of the `NgControl` once it is touched or changed, kept current through `control.events`; message = `errorMessages[key]`, else the validator's own string, else a default. `errorText` (a server error) shows whatever the state. Ids are unique; a control's own `id` is kept.                     |
| Banner        | `src/app/ui/banner/banner.ts`                                                                                                         | `<ah-banner variant heading tech icon announce>`: `notice` (refresh icon), `error` (anchor icon), `info` (info icon) and `cost` (the `ah-cost` box: bold amount, projected "who is billed" as a hint). Icons at 18px; `tech` adds `ah-tech` last. `announce` defaults follow the preview (`notice` → `role="alert"`, `error` → `role="status"`, others none) and can be overridden.                                                                                                                                                                                                                                                                              |
| Table, tags   | `src/app/ui/table/table.ts`, `src/app/ui/tags/source.ts`                                                                              | Directives `table[ahTable]`, `td/th[ahNowrap]`, `[ahKey]`, `[ahApi]`, `[ahCellSub]` (they add the bundle class); `<ah-source [chosen]>` (`ah-source`, `ah-source--chosen`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Gallery       | `src/app/ui/_kit/kit.routes.ts`, `kit.ts`, `kit-section.ts`, `sections/1a-*.ts`, `sections/1b-sections.ts`, `sections/1c-sections.ts` | `/_kit` (dev builds only, as in phase 0) shows the logo, a Light/Dark switch (`aria-pressed` buttons, through `ThemeService`) and one labelled section per component: Logo and icons, Button, Panel, Field (a typed reactive form; the cap starts touched so its error shows, as in the preview), Banner, DataTable and tags. Each lane lists its sections in its own `sections/<lane>-sections.ts`; the 1B and 1C files exist and are empty, so those lanes never edit `kit.ts`.                                                                                                                                                                                |
| Tooling       | `package.json`, `.prettierignore`                                                                                                     | `npm run lint` = `eslint . && npm run tokens:check`, so CI (which runs `lint`) enforces fresh tokens without touching `ci.yml`. `.prettierignore` also skips the bundle copy and the agent-skill copies (below).                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Using the kit (for 1B, 1C and the feature lanes):**

```html
<button ahButton="primary" size="sm" type="button"><ah-icon name="sail" />Set sail</button>
<ah-panel>
  <ah-panel-head heading="Needs you" subtitle="4 voyages"
    ><a ahButton size="sm" ahPanelActions routerLink="…">All</a></ah-panel-head
  >
  <ah-panel-body>…</ah-panel-body>
</ah-panel>
<ah-field
  label="Total budget"
  required
  unit="AIU"
  hint="…"
  [errorMessages]="{ min: 'At least 12.4 AIU, what’s already spent.' }"
>
  <input ahInput formControlName="budget" inputmode="decimal" />
</ah-field>
<ah-banner variant="error" heading="Anchored: …" tech="run_failed · r-03">Plain words first.</ah-banner>
```

### Proof

All on Node 24.21.0, offline, 0 AIU. No API, mock or real, was involved: lane 1A has no data.

- **`tokens:check`**, run on a scratch copy of `tokens.json`, `tokens.css` and the bundle (`node scripts/build-tokens.mjs
--check <root>`), so `docs/design/` was never edited:
  1. as generated: `ok`, exit 0;
  2. `bg` changed in `tokens.json`, not regenerated: "tokens.css is out of date", exit 1;
  3. regenerated: `ok`, exit 0;
  4. `avatar` and `badge-height` removed from `tokens.json` and regenerated: "undefined custom property
     src/styles/ahoy-bundle.css: --avatar" and "--badge-height", exit 1;
  5. `space-1.5` renamed: "--space-1.5" undefined (the bundle's escaped `var(--space-1\.5)` is matched), exit 1;
  6. `tokens.css` deleted: "is missing", exit 1;
  7. a value of `red; } body { x: y`: "token bg has an unexpected value", exit 1, nothing written.
- **Icons against the sources:** a throw-away script (session scratchpad, not in the repo) parsed the 16 files in
  `assets/Icons/` and compared every `path`, `circle` and `rect` with `ICONS`: 16 files, 16 names, 0 mismatches.
- **Tests: 11 files, 98 tests** (83 new; P0's 15 unchanged): `icon` 21 (the 16 icons render on the 24px grid in the
  SVG namespace, geometry copied, sizes, `aria-hidden` vs label; `ICON_NAMES` equals the README table, which is typed
  `satisfies Record<IconName, string>`, so a missing or extra name fails to compile), `button` 21 (the 18
  variant × size cases, native button and link kept, input changes), `field` 17 (label `for`, asterisk hidden,
  `aria-required`, `aria-describedby` ids exist, no error until touched, first error with a valid
  `aria-describedby`, validator text, cleared when valid, `markAllAsTouched`, server error, own id, textarea, unique
  ids, and 7 `firstErrorMessage` cases), `theme.service` 7 (default light, stored dark, invalid value, set/toggle and
  storage, refused storage, no storage), `panel` 5, `banner` 4, `kit` 4 (every section labelled, the theme switch
  changes `<html>` and `aria-pressed`, the preview's field error, 16 icons), `logo` 2, `table` 1, `source` 1.
- **The a11y tests catch regressions:** removing the Field's `aria-invalid` binding and the Panel's `aria-labelledby`
  made 4 tests fail (restored afterwards).
- **Visual check, `/_kit` against the previews:** `ng serve` (development configuration) and headless Chromium 1194
  driven over the DevTools protocol by a throw-away script. `/_kit` at 1100 px in light and dark, and at 390 px in
  light and dark; the Button, Panel, Field, Banner and DataTable `preview.html` files, wrapped with the generated
  `tokens.css` and the bundle, at 900 px in light and dark. Compared by eye: Button, Panel, Field and Banner match in
  both themes, except the deliberate differences below. Google Fonts loaded in the browser (`document.fonts`:
  Plus Jakarta Sans 600 loaded). At 390 px the page has no sideways scroll (`scrollWidth` 375 with the scrollbar); the
  table scrolls inside its own box, as the DataTable README allows.
- **Every page uses the DS:** on `/voyages` (a P0 placeholder) the body's computed `font-family` is the DS sans stack
  and its background is `bg` (`rgb(246, 248, 250)`).
- **Production build:** `npm run build` has no `kit-routes` chunk and `grep` finds no `_kit`, `Kit · Ahoy`, `ah-kit` or
  `kit__` in `dist/ahoy-frontend/`; `styles.css` holds the tokens (`--space-1\.5: 6px`) and the bundle;
  `index.html` links `favicon.svg`.

### Deliberate differences from the previews, and two bundle defects

- **Bundle defect 1, links styled as buttons.** `bundle.css` has `.ah a { color: var(--accent-text) }`, which is more
  specific than `.ah-btn--primary`, so `<a class="ah-btn ah-btn--primary">` shows blue text on blue: the DataTable
  preview's own "Answer" and "Review plan" are unreadable. `_ahoy-angular.scss` restores each variant's text colour on
  `.ah a.ah-btn`. The bundle copy itself is untouched. **For the design system:** fix it in `bundle.css`, then delete
  these rules here.
- **Bundle defect 2, `.ah-sr` escapes scroll boxes.** It is `position: absolute` with no positioned ancestor, so inside
  a table wrapped in an `overflow-x: auto` box it widened the page at 390 px. The gallery's scroll box has
  `position: relative`; every lane that wraps a table should do the same.
- Icons follow the Icons README (1.8 stroke, 16/12/18 px); the Button preview draws its icon at 15 px with a 2 stroke
  and the Banner preview at 18 px with a 2 stroke.
- The Field preview's textarea has an inline `min-height: 60px`; `ah-field` keeps the bundle's 84 px.
- The gallery adds an `info` banner (not in the preview) and shows the table without budget meters (lane 1B's
  `ah-budget-meter`); its badges are the bundle's raw classes until lane 1B's `ah-status-badge`.

### Decisions

- **Wrapper hosts add no box.** `ah-icon`, `ah-logo`, `ah-panel*`, `ah-field` and `ah-banner` render the README markup
  inside a `display: contents` host, so flex and grid layouts see the README element (the banner's icon is the
  flex item, a field is the grid cell). ARIA attributes are always on the inner element. `ah-source` puts the class on
  its host instead, because `.ah-source` is already `inline-flex`.
- **Table helpers are attribute directives** (`ahKey`, `ahApi`, `ahCellSub`), not elements, so a key can be an
  `<a routerLink>` and keep link semantics.
- **`ThemeService` lives in `src/app/ui/theme/`**, a folder the lane list does not name: `ui/` is the only layer `_kit`
  may import, and the service is not specific to the gallery. It applies the stored theme only once something
  injects it (today only `/_kit`); see "Needs from lane 3A".
- **Gallery layout CSS** (`kit-*`) sits in the `Kit` component with `ViewEncapsulation.None`, not in `src/styles/`, so
  it only loads with the lazy, dev-only page and never reaches production CSS.
- **`lint` runs `tokens:check`**, so a stale `tokens.css` fails CI without editing `.github/workflows/ci.yml` (lane 6D
  appends to it).

### Files outside the lane's list, and why

- `package.json`: the `tokens` and `tokens:check` scripts the plan asks for, and `lint` running `tokens:check`.
- `src/index.html`, `public/favicon.svg`, `public/favicon.ico` (deleted): the favicon deliverable.
- `src/app/ui/theme/`: see Decisions.
- `src/app/ui/_kit/sections/1b-sections.ts` and `1c-sections.ts`: empty lists, the seam that keeps 1B and 1C out of
  `kit.ts`; they now belong to those lanes.
- `.prettierignore`: the bundle copy (a re-synced copy, like `docs/design/`), and **`.agents/`, `.github/skills/`,
  `.opencode/`**. The "Added skills" commit on `main` brought 24 Markdown files there that Prettier would rewrite, so
  `npm run format:check` (and CI) already failed on `main` before this lane. They are copied agent skills, so they are
  ignored rather than reformatted. **The user decides:** keep the ignore, or reformat them at the source.

### Did not run, skipped, and why

- **`npm run start:mock`:** the definition of done asks UI lanes to check on the mock backend; lane 2D has not built it
  (until then `mock` equals `development`), and lane 1A shows no data. `/_kit` was checked with `ng serve`
  (development) instead.
- **Wireframe boards:** not opened; this lane was compared with the design system's previews only.
- **Not checked:** other browsers than Chromium, real phones (390 px was viewport emulation), and a pixel diff (the
  comparison was by eye).
- **`build-tokens.mjs` has no automated test:** it is a Node script outside `ng test`; the 7 runs above are its proof.
- **Skipped test suites:** none.

### Needs from other lanes

- **From the user / the design system:** fix the two `bundle.css` defects above, then re-sync `docs/design/` and
  `src/styles/ahoy-bundle.css` (lane 1A's copy) and remove the matching rules from `_ahoy-angular.scss`.
- **For lane 3A:** inject `ThemeService` once at start-up (in `App` or an app initializer) if a theme chosen in `/_kit`
  should apply on every page after a reload; without it, pages are light until `/_kit` is opened.
- **For lanes 1B and 1C:** add gallery sections to `src/app/ui/_kit/sections/<lane>-sections.ts` only. A wrapper
  component whose host must not add a box needs a `display: contents` rule in `src/styles/` (ask 1A, or add your own
  partial and one `@use` line in `src/styles.scss`). Use `ah-icon` for icons and `ahButton` for buttons.
- **For lanes that wrap a table in a scroll box (3A, 3C, 5A, 5B):** give the box `position: relative` (bundle defect 2).
- **For lane 6D:** the production build **inlines the Google Fonts CSS** (Angular's font inlining), so `ng build` needs
  network access to `fonts.googleapis.com`, and at run time the page loads font files from `fonts.gstatic.com` only.
  The favicon is now `favicon.svg`.

### Final check

Run at the end of the lane, on Node 24.21.0:

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle, no kit-routes chunk)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (no problems; build-tokens: ok)
$ npm test                    exit 0 (Test Files 11 passed (11); Tests 98 passed (98))
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

---

## Lane P0 · Foundation (2026-10-06)

Committed and pushed to `ccr-be69922d-w5i04m` with the user's approval.

### Node in cloud sessions (0.1)

- `node -v` was **v22.22.0**, below Angular 22's `^22.22.3 || ^24.15.0 || >=26.0.0`. `npx -y node@24 -v` gave
  **v24.21.0**. The binary from the npx cache was copied into the session scratchpad and put first on `PATH`; npm
  10.9.4 (the system one) ran under it. Every command below ran on Node 24.21.0.
- **The environment's setup script must install Node 24** so sessions don't depend on this workaround (the plan's
  `npm install -g node@24` is still untested).
- `.nvmrc` = `24`; `package.json` `engines.node` = `^22.22.3 || ^24.15.0 || >=26.0.0` (Angular 22's range).

### What changed

| Task | Result                                                                                                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.2  | Scaffold with `ng new` 22.2.1 in a temporary folder (flags in `docs/architecture.md`), moved in without its README and `.vscode/`. `CLAUDE.md`, `.claude/` and `.git/` untouched. `package.json`: name `ahoy-frontend`, `private`, `"type": "module"`; runtime dependencies exact, dev `^` (TypeScript `~`, see below). |
| 0.3  | `tsconfig.json` with every CLAUDE.md flag plus `noPropertyAccessFromIndexSignature` and Angular's three strict options; aliases `@domain/*`, `@core/*`, `@ui/*`, `@features/*`, `@testing/*`. **No flag clashed with Angular's types.**                                                                                 |
| 0.4  | `.prettierrc.json` (120, double quotes, `trailingComma: all`, `proseWrap: preserve`), `.prettierignore`; `eslint.config.js` (rules in `docs/architecture.md`); Husky `pre-commit` → `lint-staged` (`prettier --write --ignore-unknown`).                                                                                |
| 0.5  | Scripts `start`, `start:mock`, `build`, `test`, `lint`, `typecheck`, `check:boundaries`, `format`, `format:check` (plus `ng`, `watch`, `prepare`).                                                                                                                                                                      |
| 0.6  | `proxy.conf.mjs`: `/api/v1` → `AHOY_API_TARGET` (default `http://127.0.0.1:8080`), `secure: false`, `changeOrigin: true`, header `X-Ahoy-Actor: $AHOY_ACTOR` (default `dev@example.com`); rejects a malformed or non-http(s) target at start-up. Documented in README and `docs/architecture.md`.                       |
| 0.7  | Folders of §5.1; `scripts/check-boundaries.mjs`; every §5.3 route lazy with a placeholder and its own `<title>`; `app.config.ts` with router (`withComponentInputBinding`), `HttpClient` (`withFetch`), `API_BASE`, `FETCH`, `provideAppInitializer`; `index.html` with `<title>Ahoy</title>`, `lang="en"`.             |
| 0.8  | `.github/workflows/ci.yml`: Node from `.nvmrc`, `npm ci`, `format:check`, `lint`, `typecheck`, `build`, `test`. Publishes nothing.                                                                                                                                                                                      |
| 0.9  | `docs/design/`: 12 wireframes + `canvas.json`; DS `README.md`, `vocabulary.md`, `tokens.json`, `design-system.json`, `bundle.css`, 22 components (`README.md` + `preview.html`) plus the `Cover` preview, 16 icons and 3 logos; `SOURCES.md` with versions and how to re-sync.                                          |
| 0.10 | `docs/architecture.md`, this file, `README.md`. `CLAUDE.md` adapted (diff approved by the user, applied).                                                                                                                                                                                                               |

### Proof

All on Node 24.21.0, offline, 0 AIU.

- **Acceptance chain:** `npm ci && npm run build && npm run typecheck && npm run lint && npm test && npm run format:check`
  green (see "Final check" below for the exact output).
- **Tests:** 1 file, **15 tests** (`src/app/app.routes.spec.ts`): each of the 14 URLs (13 routes of §5.3, one with query
  parameters, plus `**`) shows its placeholder, its lane and its document title; `/voyages/PROJ-123` redirects to
  `/voyages/PROJ-123/plan` and the shell receives the key. `/_kit` is not in the unit tests (its presence depends on the
  build configuration); it was checked in the browser and in the build output instead.
- **`npm start`:** served on `localhost:4200`; headless Chromium (`--dump-dom`) rendered `/`, `/voyages`,
  `/voyages/new`, `/docks`, `/voyages/PROJ-123` (→ Plan), `/voyages/PROJ-123/models`, `/voyages/PROJ-123/runs/r-02`
  and `/_kit`, each with its placeholder and title.
- **`/_kit` only in dev:** `ng build --configuration development` and `--configuration mock` emit a `kit-routes` chunk;
  the production build does not, and `grep` finds no `_kit` or `Kit · Ahoy` in `dist/ahoy-frontend/`.
- **Boundaries:** with three throw-away files (since removed), `check-boundaries` reported 7 violations and exited 1:
  `ui` → `@core/api/api-base` and → `../../core/realtime/fetch`; `domain` → `@angular/core` and → `@ui/...`; feature
  `docks` → `@features/harbour/...` (re-export) and → `../voyages/...` (dynamic import); a feature → `@testing/...`.
  After removal: `check-boundaries: ok`.
- **TypeScript flags:** a throw-away `domain/` file (since removed) made `tsc -p tsconfig.app.json` fail with TS2375
  (`exactOptionalPropertyTypes`), TS2322 (`noUncheckedIndexedAccess`), TS2366 (`noImplicitReturns`), TS4114
  (`noImplicitOverride`), TS4111 (`noPropertyAccessFromIndexSignature`) and TS1484 (`verbatimModuleSyntax`).
- **ESLint rules:** throw-away files (since removed) were rejected for `@ts-ignore`, `any`, `enum`, `namespace`,
  `as unknown as`, `export default`, a non-`ah` selector, `ChangeDetectionStrategy.Eager`, `<img>` without `alt`, and a
  `(click)` on a `<div>` without keyboard handler or focus (12 errors).
- **Proxy, against a stub only:** with `npm start` running and a throw-away Node server on `127.0.0.1:8080` (not the
  Ahoy API; it echoed headers and sent one SSE event per second):
  - `curl -s localhost:4200/api/v1/health` reached the stub with `X-Ahoy-Actor: dev@example.com`, no `Authorization`,
    and `Host: 127.0.0.1:8080` (`changeOrigin`);
  - `curl -N localhost:4200/api/v1/events/stream` delivered events at 1.01 s, 2.02 s, 3.02 s and 4.02 s: **no
    buffering** through the dev-server proxy (risk R4, for the dev server only; the Ingress is not tested);
  - with nothing on 8080 the proxy answered `502` (`ECONNREFUSED`).
- **No secrets:** no token, `.env` or `.local/` in the tree; `.gitignore` now ignores `.env`, `.env.*`, `/.local` and
  `/.work`.

### Did not run, skipped, and why

- **Proxy against `ahoy-hosted`:** not run. The session has the Docker CLI but no daemon (`/var/run/docker.sock`
  missing) and no Postgres server, which the hosted API needs; the hosted repository was not cloned. Only the stub
  check above ran.
- **CI on GitHub:** the workflow was not run (nothing pushed).
- **Wireframes in a browser:** not opened. They reference `./support.js` (the Claude Design runtime), which the artifact
  does not publish; see `docs/design/SOURCES.md`.
- **`tokens.css`:** not in the artifacts; lane 1A generates it.
- **Skipped test suites:** none. Template type-checking is covered by `ng build`, not by `npm run typecheck`.

### Installed versions

Versions from `npm view` on 2026-10-06, installed with `npm install` and checked with `npm ls --depth=0`.

| Package                                                                           | Version  | Kind           | Approval                          |
| --------------------------------------------------------------------------------- | -------- | -------------- | --------------------------------- |
| `@angular/common`, `compiler`, `core`, `forms`, `platform-browser`, `router`      | 22.2.1   | runtime, exact | §10 row 1 (Angular)               |
| `rxjs`                                                                            | 7.8.2    | runtime, exact | §10 row 1                         |
| `tslib`                                                                           | 2.8.1    | runtime, exact | §10 row 1                         |
| `@angular/build`, `@angular/cli`, `@angular/compiler-cli`                         | ^22.2.1  | dev            | §10 row 1                         |
| `typescript`                                                                      | ~6.0.3   | dev            | §10 row 1 ("6.0.x")               |
| `vitest`                                                                          | ^5.0.3   | dev            | §10 row 2                         |
| `jsdom` (the DOM environment the `ng new --test-runner=vitest` scaffold asks for) | ^30.1.2  | dev            | §10 row 2 ("the DOM environment") |
| `angular-eslint`                                                                  | ^22.5.0  | dev            | §10 row 3                         |
| `eslint`                                                                          | ^10.12.0 | dev            | §10 row 3                         |
| `typescript-eslint`                                                               | ^8.71.1  | dev            | §10 row 3                         |
| `prettier`                                                                        | ^3.9.9   | dev            | §10 row 4                         |
| `husky`                                                                           | ^9.1.7   | dev            | §10 row 4                         |
| `lint-staged`                                                                     | ^17.6.0  | dev            | §10 row 4                         |

Notes:

- **TypeScript:** npm `latest` is 7.0.2, but `@angular/build` 22.2.1 requires `>=6.0 <6.1` and `typescript-eslint`
  8.71.1 `<6.1.0`, so 6.0.3 (the newest 6.0) is installed with `~` instead of `^`. This is the one dev dependency not
  on `^`; `CLAUDE.md` says so.
- **Not installed** (approved, but for later lanes): `@angular/cdk` (1C), `marked` (1C), `diff` (2C),
  `openapi-typescript` (2A), `ajv` and `yaml` (2A, 2D), `@playwright/test` and `@axe-core/playwright` (6B, 6C).
- No `zone.js` (zoneless) and no `@eslint/js` (not on the list; ESLint's core recommended rules are therefore not
  enabled, only typescript-eslint's and angular-eslint's).

### Decisions and deviations from the plan

- `<ah-root class="ah">` instead of `<app-root class="ah">`: the component prefix is `ah`.
- A `**` route with a "Not found" placeholder for lane 6A (not in §5.3).
- `/voyages/:key` redirects to `plan` until lane 4A adds the status-based default tab.
- The run detail is a top-level route (before `voyages/:key`), not a child of the voyage shell.
- `API_BASE` lives in `core/api/api-base.ts` (lane 2A owns it), `FETCH` in `core/realtime/fetch.ts` (2B), `AppConfig`
  and the no-op `initAppConfig` in `core/config/app-config.ts` (2A).
- The shared placeholder `ah-placeholder` is in `src/app/ui/placeholder/` (owned by P0; lane 6A removes it).
- `start:mock` uses the `mock` configuration, which until lane 2D is a copy of `development` (same environment file).
- The scaffold's `app.spec.ts` (it checked the demo page) was replaced by `app.routes.spec.ts`.
- The scaffold's `.editorconfig` set `quote_type = single` for `.ts`, and Prettier 3 reads it: the first format pass
  produced single quotes. Fixed to `double`, and `.prettierrc.json` now sets `"singleQuote": false` explicitly so the
  editor config can't override the hosted style again.
- Full detail in `docs/architecture.md`.

### Needs from other lanes

- **From the user:** merge of phase 0 into `main`; Node 24 in the environment's
  setup script.
- **For lane 1A:** `src/styles.scss` and `src/styles/` are empty; `index.html` has no fonts or icon yet (the bundle
  imports Google Fonts, decision §12 q4). `src/app/ui/_kit/kit.routes.ts` is a placeholder to replace.
- **For lane 2A:** fill `initAppConfig` (`/config.json`) and decide whether `API_BASE` comes from `AppConfig.apiBase`.
- **For lane 2D:** add `src/environments/environment.mock.ts` and point the `mock` configuration's `fileReplacements`
  at it (it may import `src/testing/`; `check-boundaries` already allows that one file and `src/app/core/mock/`).
- **For lane 2D (decided by the user on 2026-10-06):** no `json-server`. The same `MockAhoyServer` also runs as an HTTP
  server through a dependency-free `node:http` adapter (`npm run mock:api` on `127.0.0.1:8080`), so `npm start` can use
  it through the real proxy. Added to deliverable 9 and the acceptance of lane 2D in `docs/plan/phase-2-data-layer.md`.

### Final check

Run at the end of the lane, on Node 24.21.0, after `npm ci` (the five `npm run` steps were repeated after the quote
fix above, with the same results):

```
$ node -v                     v24.21.0
$ npm ci                      exit 0 (383 packages)
$ npm run build               exit 0 (production bundle, 13 lazy chunks, no kit-routes)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (no problems)
$ npm test                    exit 0 (Test Files 1 passed (1); Tests 15 passed (15))
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

---

## Lane 2C · Domínio puro (2026-10-06)

Branch `lane/2c-domain`, a partir de `main` (fase 0 já fundida). Commit e push aprovados pelo utilizador a
2026-10-06; PR aberto para `main`.

### O que mudou

| Ficheiro                  | Resultado                                                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/domain/types.ts` | Tipos provisórios da API com nomes de domínio (`Story`, `Run`, `Question`, `GateRecord`, `Artifact`, `AhoyEvent`, `ModelPlan`, `SlotModel`, `StoryStatus`, `RunStatus`, `GateOutcome`, `ModelSlot`, `ReasoningEffort`, …). A 2A troca por reexports do `schema.d.ts`. |
| `phases.ts`               | `PHASES` (7, por ordem), `phaseIndex` (1-based; `null` para `blocked` e desconhecidas), `GATE_FOR_PHASE` (G11).                                                                                                                                                       |
| `status.ts`               | `statusPresentation(status, phase)` → `{label, modifier, api}` com os 7 estados do `vocabulary.md`; `IN_PORT`.                                                                                                                                                        |
| `halt.ts`                 | `HALT_REASONS` com os 9 textos exatos do `vocabulary.md`, `isHaltReason`, `explainHalt(reason, detail?)`.                                                                                                                                                             |
| `outcome.ts`              | `outcomePresentation(value)` para gates e runs; desconhecido fica neutro (`queued`).                                                                                                                                                                                  |
| `models.ts`               | `MODEL_SLOTS`, `CREW`, `MODEL_SOURCE_LABELS`, `EFFORT_SOURCE_LABELS`, `crewLabel` (reserva: texto da API, G14), `reviewersConflict`.                                                                                                                                  |
| `aiu.ts`                  | `formatAiu`/`parseAiu` só com aritmética inteira, `remainingNano`, `budgetPercent`, `capCoversSpent`.                                                                                                                                                                 |
| `time.ts`                 | `relativeTime`, `absoluteTime`, `waitingTime`, `formatDuration`; `now` por parâmetro.                                                                                                                                                                                 |
| `identifiers.ts`          | `STORY_KEY_PATTERN`/`isStoryKey`, `shortSha`, `actorLabel`, `formatTokens`.                                                                                                                                                                                           |
| `text-diff.ts`            | `diffLines`, `hunks`, `changedBlocks` e `markdownBlocks` sobre `diff` 9.0.0 (jsdiff). Única implementação de diff do projeto.                                                                                                                                         |
| `package.json`            | `diff` `9.0.0` (runtime, exato; aprovado no §10). O `package-lock.json` só ganhou essa entrada.                                                                                                                                                                       |
| `.prettierignore`         | As cópias de skills (`.agents/`, `.opencode/`, `.github/skills/`) ficam fora do Prettier (decidido pelo utilizador a 2026-10-06), para o `format:check` do CI ficar verde.                                                                                            |

Decisões que convém rever:

- `explainHalt().short` é sempre um prefixo exato do texto do `vocabulary.md` (a primeira frase quando há mais do que
  uma; o texto todo quando não há), para não inventar palavras. Onde o wireframe tem rótulo próprio ("The run failed
  before any prompt"), a 3A pode usá-lo na coluna "What's needed".
- `formatAiu` imprime exatamente `decimals` casas; quem mostra caps inteiros passa `0` ("12.4 / 30 AIU").
- Estado ou outcome desconhecidos ficam neutros; um motivo de halt desconhecido mostra o código da API tal como está.
- Os índices de `changedBlocks` referem-se a `markdownBlocks(next)`; `markdownBlocks` fica exportada para a 1C/4B
  partirem o markdown da mesma maneira.
- `types.ts` é provisório: não há `schema.d.ts` em `main` (a 2A ainda não correu).
  - **Corrigido a 2026-10-07 pela sessão que terminou a 2A**, a pedido do utilizador (o contrato é soberano): os tipos têm agora os
    campos e os enums do contrato, e `reviewersConflict` lê `slots` como lista. Ver "Needs from lane 2C" na secção da lane 2A.

### Provas (offline, 0 AIU, Node 24.21.0)

- `npm run build` exit 0; `npm run typecheck` exit 0 (`check-boundaries: ok`); `npm run lint` exit 0;
  `npm run format:check` exit 0 (depois de ignorar as cópias de skills no `.prettierignore`).
- `npm test`: **10 ficheiros, 233 testes, 0 falhas** — 218 novos: `aiu` 53, `time` 32, `identifiers` 27, `text-diff`
  26, `halt` 24, `outcome` 21, `models` 15, `phases` 11, `status` 9.
- `parseAiu`/`formatAiu`: ida e volta exata em `0.1`, `12.4`, `24.06`, `30`, `0.000000001`; recusa `1e3`, `-1`, `+1`,
  `25.`, `.5`, `25,5`, 10 casas e valores fora de `Number.isSafeInteger`; `formatAiu` recusa não-inteiros e `NaN`.
- `text-diff`: igual, só adições, só remoções, linha alterada, linha movida, vazio, hunks com 3 de contexto,
  merge/split de hunks, secção `@@ Summary @@`/`@@ WP1 … @@`, `@@ @@` sem secção; `changedBlocks` (bloco novo,
  alterado, removido, igual, sem revisão anterior, documento anterior vazio).
- `check-boundaries: ok` confirma que `domain/` não importa Angular, rxjs, `node:`, `core`, `ui` nem `features`; a
  única importação externa é o `diff`.
- `npx prettier --check src/app/domain` verde.

### Não correu / saltado, e porquê

- **`npm run format:check` (repo inteiro): estava vermelho antes desta lane**, por 24 ficheiros `.md` em `.agents/`,
  `.opencode/` e `.github/skills/` (commit 132728f "Added skills"). Resolvido neste PR com a decisão do utilizador:
  essas cópias passam a estar no `.prettierignore`, como `docs/design/`. Agora verde.
- **Nada contra a API, o mock ou `--simulate`:** a lane é TypeScript puro, sem I/O; não havia nada para correr.

### Needs from lane 2A

- Substituir `src/app/domain/types.ts` por reexports do `schema.d.ts` gerado, com os nomes de domínio, e confirmar os
  nomes dos campos e os valores dos enums (`RunStatus`, `GateOutcome`, `ModelSlot`, `SlotModel`/`ModelPlan`,
  `HaltReason`) contra o contrato real. Até lá são provisórios.
- Confirmar a forma de `ModelPlan` que o `reviewersConflict` lê (`slots["review-design"|"review-defect"].model`).

### Needs from lanes 1B/1C/4B/4C/4D/5A/5C (contrato a consumir)

- `changedBlocks` devolve índices para `markdownBlocks(next)`; a 1C deve partir o markdown com a mesma função.
- `explainHalt` devolve `{short, text, detail}`; o `detail` vem separado para o banner o poder citar (4A).
- `reviewersConflict(plan)` devolve o modelo em conflito ou `null` (4D).
- `outcomePresentation` devolve `{label, modifier}` com a palavra da API no label (1B/5A/5B).

### Próximos passos

- Revisão da lane (alimenta quatro lanes da Onda 2) e merge em `main` quando aprovada.

---

## Lane 2A · API client (2026-10-06, finished 2026-10-07)

**Done, offline.** The first pass (2026-10-06) built everything that needed no new dependency; the session's permission classifier
had denied the `npm install` of `openapi-typescript`, `ajv` and `yaml` ("Untrusted Code Integration"), and that lane did not try
another way round it. The finishing pass (2026-10-07, "Finishing pass" below) ran the install the user approved, generated
`schema.d.ts`, added `api:types` and `api:check`, moved `core/api/types.ts` onto the generated types and added `contract.spec.ts`.
It is in the working tree of `claude/eager-cray-4c3z42`, started from `main` at 56e815a (which already had this lane's first pass as
PR #5, lane 1A and lane 2C), so there was nothing to merge in. **Nothing is committed or pushed** (CLAUDE.md). Still true: the client
has never met a real API.

First pass: two commits on branch `claude/charming-clarke-tlb24e`: the lane's own commit (from `main` at 132728f), pushed after the user
approved it in the session (CLAUDE.md requires that approval; the environment's stop hook had only asked for a push), and a merge
of `main` at d29002b (lane 1A, PR #4), made when the user asked for a pull request into `main`, ready for review. The merge had
three text conflicts, all places where both lanes added lines (`package.json` scripts, the README Status bullets,
`docs/progress.md`); both sides were kept. The contract was read from `Danielimaalmeida/ahoy-hosted` at commit
`1890d5aa84819480275f79060cae5d529be21ee8` (read-only; the repository was attached to the session and cloned outside this one).

### What changed

| #   | Deliverable                             | State                | Where                                                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Vendored contract                       | done                 | `openapi/ahoy-v1.yaml` (the hosted file, byte for byte, under a 3-line header with the source and the commit), `scripts/sync-openapi.mjs`, `npm run api:sync`; finishing pass: `npm run api:types` (writes `core/api/schema.d.ts` and the JSON mirror `src/testing/fixtures/openapi.json`), `npm run api:check`, `scripts/openapi-mirror.mjs`. |
| 2   | `ApiClient`                             | done                 | `core/api/api-client.ts`: the 19 operations of phases 3 to 6, each `Promise<ApiResult<T>>`, never rejecting.                                                                                                                                                                                                                                   |
| 3   | `ApiError`                              | done                 | `core/api/api-error.ts`: `ApiError` (`problem`, `network`, `invalid_response`), `ApiResult`, 12 predicates plus `isUnreachable`, `formControlPath`, `fieldErrors`.                                                                                                                                                                             |
| 4   | Guards                                  | done                 | `core/api/guard-kit.ts`, `guards.ts`, `run-progress.ts` (`parseRunProgress`), `story-state.ts` (`readStoryState`), `types.ts` (aliases of the generated types since the finishing pass).                                                                                                                                                       |
| 5   | Auth seam and `CurrentUser`             | done                 | `core/auth/auth-strategy.ts` (`AuthStrategy`, `NoAuthStrategy`, `AUTH_STRATEGY`), `auth.interceptor.ts`, `current-user.ts`. No request carries `Authorization`.                                                                                                                                                                                |
| 6   | `AppConfig`                             | done                 | `core/config/app-config.ts` (`parseAppConfig`, `loadAppConfig`, `AppConfigStore`, `initAppConfig`), `core/api/api-base.ts` (`API_BASE` from the config).                                                                                                                                                                                       |
| 7   | Fixtures and `contract.spec.ts`         | done                 | `src/testing/fixtures/`: one JSON per operation (19), `problems.json` (15), the mirror `openapi.json`, the Ajv helper `contract.ts` (lane 2D reuses it); `core/api/contract.spec.ts` (82 tests).                                                                                                                                               |
| 8   | `smoke-api.mjs`, `capture-fixtures.mjs` | written, **not run** | `scripts/`. Both refuse any host but this machine, need `--confirm-simulate`, never send `Authorization`, and `capture-fixtures` only does GETs. Output of the capture goes to `src/testing/fixtures/captured/`, which a `.gitignore` keeps out of git until reviewed.                                                                         |

The 19 methods: `getHealth`, `listStories`, `startStory`, `getStory`, `stopStory`, `resumeStory`, `setStoryBudget`,
`getStoryModels`, `setStoryModels`, `listStoryRuns`, `getRun`, `listQuestions`, `answerQuestion`, `listGateRecords`,
`decideHumanGate`, `getStoryState`, `listArtifacts`, `getArtifactContent`, `listStoryEvents`. The phase 7 operations and the
stream (2B) are not there, as the plan says.

### Finishing pass (2026-10-07)

All on Node 24.21.0 (`npx -y node@24`; the system Node was 22.22.0), offline, 0 AIU. The user's explicit approval covered exactly
`npm install --save-dev openapi-typescript@7.13.0 ajv@8.20.0 yaml@2.9.1`, the `overrides` entry if npm refused, and nothing else.

1. **Install.** `npm ci` first (384 packages) to get a baseline. The approved command was then refused by npm with `ERESOLVE`:
   `openapi-typescript@7.13.0` declares the peer `typescript ^5.x`, the project is on `~6.0.3`. The `overrides` entry the report
   described was added (`"openapi-typescript": { "typescript": "$typescript" }`) and the same command ran again: 26 packages added
   (the three, plus `openapi-typescript`'s own dependencies such as `@redocly/openapi-core`), `0 vulnerabilities`. `npm ls`: one
   `typescript@6.0.3`, `ajv@8.20.0`, `yaml@2.9.1`, `openapi-typescript@7.13.0 overridden`. The lockfile diff is only additions: no
   package that was already there changed version (`ajv` 8.20.0 and `yaml` 2.9.1 were already in `node_modules` through other
   packages, so they became direct dependencies without a second copy; ESLint keeps its own `ajv@6`). `npm ci` from the new lockfile
   works, which is what CI runs. `package.json` has them as `^8.20.0`, `^7.13.0`, `^2.9.1` (CLAUDE.md: dev dependencies use `^`).
   **Does the generator work with TypeScript 6? Yes**, on 6.0.3: it generated 1619 lines in about 100 ms, a second run gave
   a byte-identical file, `tsc` with every strict flag of the project accepts the result (and, once `types.ts` imports it, the whole
   app and spec compile), `--check` exits 0 on a fresh file and exits 1 ("Generated types are not up-to-date!") on a tampered one.
   Not proven: that a newer `openapi-typescript` keeps working on TypeScript 6; the override only silences the declared peer.
2. **Scripts.** `api:types` = `openapi-typescript openapi/ahoy-v1.yaml -o src/app/core/api/schema.d.ts --immutable && node
scripts/openapi-mirror.mjs`; `api:check` = the same with `--check` (the flag exists in 7.13.0), then `node
scripts/openapi-mirror.mjs --check`. Beyond the report: both also handle the JSON mirror (item 4), so one command regenerates, and
   one checks, everything derived from the YAML. `schema.d.ts` and the mirror are in `.prettierignore` (the mirror because Prettier
   would reflow its arrays); `schema.d.ts` was already ignored by ESLint.
3. **`core/api/types.ts`.** Every type is an alias of `components["schemas"][...]` (or of an `operations[...]` parameter or answer),
   and it is still the only file that imports `schema.d.ts`. Each of the 12 runtime lists (`STORY_STATUSES` and the others) is written
   through `listOf<Union>()([...])`, a type-level check: the call fails to compile unless the list is exactly the members of the
   generated union, and the error names `missingFromList` and `notInContract`. `guards.ts`, `api-client.ts` and every spec compiled
   against the generated types without a change (`Shape<T>` still makes a guard that forgets or invents a field fail). **Four types are not plain aliases, on purpose, and each says why in the file:** `Problem` (`code` stays a `string`: errors must
   never fail on a code a newer API added; the enum is `ProblemCode` and `PROBLEM_CODES`), `AhoyEvent` (`payload`) and
   `StoryStateDocument` (`state`), which stay `Readonly<Record<string, unknown>>` because the contract says only `type: object`, which
   the generator turns into `Record<string, never>` (nothing could be read from it), and `EventPage`, whose `items` are those
   `AhoyEvent`s. `ItemList<T>`, `ArtifactContent` and `ifNoneMatch` of
   `ArtifactContentQuery` are client-side shapes that are not in the contract.
4. **`contract.spec.ts`**, as the report described: `scripts/openapi-mirror.mjs` (used by `api:types`, `api:check` and now by
   `sync-openapi.mjs`) parses the YAML with `yaml` (`uniqueKeys`, so a duplicate key is an error) into `src/testing/fixtures/openapi.json`;
   `api:check` compares its parsed value with the YAML's, not bytes. The Ajv helper is `src/testing/fixtures/contract.ts`: `Ajv2020`
   from `ajv/dist/2020` with `{ strict: false, allErrors: true }`, the document registered as `ahoy`, the `#/components/` to
   `ahoy#/components/` rewrite, and `date-time` registered by hand (RFC 3339 with a real calendar date, leap years and `Z`). It works
   inside `ng test` (CommonJS Ajv under the Angular builder), with no `loader` entry in `angular.json`. The spec lives in
   `core/api/contract.spec.ts` (82 tests) and checks: the contract has exactly the 19 operations the client implements plus the 5
   it does not yet (the four phase 7 ones and `streamEvents`), so a re-sync that adds an operation fails here; each of the 18 JSON
   fixtures against the success schema of its operation; `getArtifactContent.json` by its parts (the contract answers raw text);
   every entry of `problems.json` against `Problem`, and that there is one per code; request bodies; the validator itself (it names
   the field for a negative or fractional amount, a missing field, a bad status, a malformed key, an extra field and an impossible
   timestamp, and lists every difference); `isDateTime` on 21 cases; and each of the 12 lists of `types.ts` against the YAML's enum.
   **The bodies the client actually sends are validated in `api-client.spec.ts`**, in the test that already inspects them (7
   commands), and a new test per operation (18) checks that the method and the path the table expects are the ones the contract
   gives that `operationId`: 134 tests became 152.
5. **Domain types, at the user's request.** The finishing pass found that `src/app/domain/types.ts` did not match the contract
   (lane 2C's directory; the user said to correct it: the OpenAPI contract is sovereign). "Needs from lane 2C" below has what was
   wrong and what changed. `core/api/domain-types.spec.ts` (6 tests) keeps it honest: `expectTypeOf<Domain.X>().toEqualTypeOf<Api.X>()`
   for 7 enums and 11 resources, which `npm run typecheck` checks, plus run-time checks that the domain functions accept real values.
6. **`api:check` in CI.** `npm run lint` is now `eslint . && npm run tokens:check && npm run api:check`, as lane 1A did with
   `tokens:check`; CI runs `lint`, so it enforces the generated types and the mirror without touching `ci.yml` (lane 6D's).
7. **`sync-openapi.mjs` keeps the provenance of the vendored copy** (decision 17): reading `openapi/ahoy-v1.yaml` itself keeps the
   `# Source:` and `# Commit:` its header already records; a vendored copy with no such header is refused.
8. **Docs.** This section, the header and handoff of this file, the README Status and `src/testing/fixtures/README.md`.

### Proof, first pass (2026-10-06)

All on Node 24.21.0, offline, 0 AIU.

- **Chain:** `npm run build`, `npm run typecheck` (`tsc` app and spec, then `check-boundaries: ok`), `npm run lint`,
  `npm test`, all exit 0. `npx prettier --check scripts/ openapi/ src/ package.json`: all files pass.
- **Tests:** 13 files, **499 tests, 0 failed, 0 skipped** (15 of phase 0). New:

  | File                                   | Tests | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
  | -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `core/api/api-client.spec.ts`          | 134   | Each of the 19 operations with `HttpTestingController`: method, URL and body, the value (the `items` for the plain lists), a `problem+json` answer, a network error, a body of the wrong shape (`invalid_response` naming the call), no `Authorization`, the timeout. Also: all 15 problem codes, gateway pages, 2xx that is not JSON, an interceptor that throws, path encoding, query building, base with a trailing slash, `getArtifactContent` (ETag, 304, empty file, error read from text). |
  | `core/api/api-client.fetch.spec.ts`    | 15    | The same client over Angular's **real** `fetch` backend with a fake `fetch` returning real `Response` objects: headers sent (only `Accept`, plus `Content-Type` for a POST), `problem+json` parsed, 502/503/504 HTML, HTML with a 200, a rejected fetch, the 30 s timeout (fake timers), a 304 with no body, UTF-8 text.                                                                                                                                                                          |
  | `core/api/guards.spec.ts`              | 101   | Every fixture accepted; all 13 fields of a story refused when missing or wrong; **fractional, negative, NaN, infinite and beyond-2^53 AIU amounts refused** in stories, runs and usage; enums, patterns, nulls, unknown fields tolerated.                                                                                                                                                                                                                                                         |
  | `core/api/guard-kit.spec.ts`           | 28    | The checks and combinators the guards are made of, and the message each refusal gives.                                                                                                                                                                                                                                                                                                                                                                                                            |
  | `core/api/run-progress.spec.ts`        | 34    | `parseRunProgress`: the three kinds, an unknown kind, every field of `spend`, fractional or negative amounts.                                                                                                                                                                                                                                                                                                                                                                                     |
  | `core/api/story-state.spec.ts`         | 18    | `readStoryState` on the fixture and on garbage (never throws, `__proto__` safe).                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | `core/api/api-error.spec.ts`           | 45    | Predicates, `problemToError`, `formControlPath` (both path styles, escapes, non-controls), `fieldErrors`, `ApiResult` helpers.                                                                                                                                                                                                                                                                                                                                                                    |
  | `core/api/api-base.spec.ts`            | 6     | `API_BASE` follows `AppConfig.apiBase`; `trimBase`.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | `core/auth/auth.interceptor.spec.ts`   | 14    | With `NoAuthStrategy` a request is left exactly as it was; a strategy with headers is applied to the API only and per request; a strategy that fails fails the request.                                                                                                                                                                                                                                                                                                                           |
  | `core/auth/current-user.spec.ts`       | 20    | `initialsOf` (`alex@example.com` gives `AL`, as in the design system), `CurrentUser` follows the config, `is()`.                                                                                                                                                                                                                                                                                                                                                                                  |
  | `core/config/app-config.spec.ts`       | 65    | `parseAppConfig` field by field (same-origin `apiBase`, `actor`, `jiraBaseUrl`), the start-up read with 404, HTML, bad JSON, network error, bad fields (one warning each).                                                                                                                                                                                                                                                                                                                        |
  | `core/config/app-config.fetch.spec.ts` | 4     | The start-up read over the real `fetch` backend, including a stalled server (5 s timeout).                                                                                                                                                                                                                                                                                                                                                                                                        |

- **Mutation checks:** five deliberate breaks of the production code were each caught, then restored (all 499 green again):
  AIU guard accepting fractions (6 tests failed), interceptor adding headers to every URL (6), client without the 304 branch (1),
  form paths ignoring the `body/` prefix (4), config accepting any `apiBase` (13).
- **Real browser:** `npm start`, then headless Chromium on `/`, `/voyages` and `/voyages/PROJ-123/plan`: each rendered its placeholder
  and title, so the app boots with the new initializer and the interceptor registered. The dev server answers `/config.json` with a
  404, so the app ran on the defaults, and the page logged no warning or error.
- **`sync-openapi.mjs`:** ran against the local clone; the body is identical to the hosted file, re-syncing from the vendored copy
  changes nothing, and it refuses a file outside a git checkout without `--commit`, a file that is not OpenAPI 3.1, a missing file,
  an `http:` URL and a malformed `--commit`.

### Proof, finishing pass (2026-10-07)

All on Node 24.21.0, offline, 0 AIU. No API, mock or real, was involved.

- **Chain:** `npm run build`, `npm run typecheck` (`check-boundaries: ok`), `npm run lint` (with `tokens:check`), `npm test`,
  `npm run format:check` and `npm run api:check`, all exit 0 (outputs under "Final check"). `npm ci` from the new lockfile exit 0.
- **Tests: 34 files, 910 tests, 0 failed, 0 skipped** (800 on `main` before): `core/api/contract.spec.ts` **82 new**,
  `core/api/api-client.spec.ts` 134 → 152 (18 new: the method and path of each operation against the contract), and 10 for the domain
  types: `core/api/domain-types.spec.ts` **6 new**, `domain/models.spec.ts` 3 new (the Lookouts in a list, two other slots on one model, the effort
  sources) and `domain/outcome.spec.ts` 1 new (run `awaiting_input`).
- **Mutation checks**, each run on a backup and restored afterwards (fixtures, YAML, mirror and `schema.d.ts` compared with `cmp`
  or `git diff` after each):

  | #   | Break                                                                                                                                                                      | Result                                                                                                                                                          |
  | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | A   | `getStory.json`: `spentNanoAiu` 12.5                                                                                                                                       | 2 tests fail: `/spentNanoAiu must be integer`                                                                                                                   |
  | B   | `listStories.json`: the first story loses `version`                                                                                                                        | 1 fails: `/items/0 must have required property 'version'`                                                                                                       |
  | C   | `getRun.json`: an extra field                                                                                                                                              | 1 fails: `/ must NOT have additional properties (surprise)`                                                                                                     |
  | D   | `api-client.spec.ts`: the `setStoryBudget` body with `budgetNanoAiu: 40_000_000_000.5`                                                                                     | 1 fails: `/budgetNanoAiu must be integer`. Only the contract check objects: the client passes the body through, so `toEqual(c.body)` still held.                |
  | E   | `openapi.json`: a status edited by hand                                                                                                                                    | `api:check` exit 1 ("does not equal openapi/ahoy-v1.yaml. Run `npm run api:types`") and the `STORY_STATUSES` test fails                                         |
  | F   | the YAML gains a story status `archived`                                                                                                                                   | `api:check` exit 1; after `api:types`, `tsc` fails at `STORY_STATUSES` with `missingFromList: "archived"`. The Angular test build fails too, so no spec result. |
  | G   | `types.ts`: a value dropped from a list, one added, one renamed                                                                                                            | `tsc` fails each time, naming `missingFromList: "terminal"`, `"bogus"` and `"lowest"`                                                                           |
  | H   | `domain/types.ts`: `Artifact.sizeBytes` renamed `size`; `agent_profile` back in `EffortSource`; `waiting` back in `GateOutcome`; `awaiting_input` dropped from `RunStatus` | `tsc` fails each time in `domain-types.spec.ts` (and in `models.ts` for the effort source), naming the type that differs                                        |

- **`sync-openapi.mjs`, after decision 17:** re-syncing from `openapi/ahoy-v1.yaml` with and without `--commit` leaves the YAML and the
  mirror byte-identical (`cmp`); a vendored copy with no header is refused (exit 1, file untouched); a sync from a file outside this
  repository still works (its `# Source:` is the "local copy" line, as before). The YAML ended identical to HEAD after each run.
- **`sync-openapi.mjs`** (changed to write the mirror): a YAML with a duplicate key and one with a syntax error are refused with exit
  1 before anything is written (YAML and mirror untouched); a sync from a file outside this repository exits 0 and gives the same
  contract body and an identical mirror. `openapi-mirror.mjs` with an unknown flag exits 1 with its usage.
- **Production build:** `grep` finds no `ajv`, `date-time`, `x-sse-data-schema` or `openapi-typescript` in `dist/`. Ajv, the mirror
  and the generated file reach only `ng test`.
- **Throw-away probes** (a file in `src/testing/`, deleted at once, not in `git status`): which domain types accept a real API
  value. Result in "Needs from lane 2C".

### Did not run, skipped, and why

- **`scripts/smoke-api.mjs` and `scripts/capture-fixtures.mjs`:** not run, as the lane says (they need a local API). Checked with
  `node --check` only, so their logic, including the refusal of a non-local host, has not been exercised.
- **Nothing ran against the `ahoy-hosted` API.** This session has the `docker` and `psql` clients but no Docker daemon and no
  Postgres server. So the client has still never met a real API (risk R1 stays open), and the `state.json` field names that
  `readStoryState` reads (`acceptance_criteria`, `work_packages`, `human_gates`, `revisions`, `revision_ceiling`, and inside
  them `depends_on`, `open_pr`, `timestamp`) were **confirmed from the hosted renderer** (`encodeStory` in
  `packages/core/src/domain/story-document.ts` and its e2e test at 1890d5a), **not from a live `--simulate` answer**.
- **No GitHub run of any of this exists yet.** The acceptance criteria "`api:check` limpo" and "`contract.spec.ts` verde" are met locally
  and offline. CI will run both on a pull request: `contract.spec.ts` is in `npm test`, and `api:check` is now part of `npm run lint`.
- **Not tried:** a `loader` entry for `.yaml` in `angular.json` (not needed, so `angular.json` is untouched); a newer
  `openapi-typescript` than 7.13.0 on TypeScript 6; the mirror on Windows line endings (`api:check` compares parsed values, not
  bytes, for that reason, but it ran on Linux only).
- **`sync-openapi.mjs` with an https URL:** not run (only local paths).
- **CI on GitHub:** not run on the branch alone (the workflow runs on pull requests and on pushes to `main`); the pull request runs it.
- **`npm run format:check` on the whole repository:** it was red on `main` at 132728f, from 24 skill files under `.agents/skills`,
  `.github/skills` and `.opencode/skills` (the "Added skills" commit), which this lane did not touch. Lane 1A's `.prettierignore`
  entries, now in `main`, make it green again, and it is green on the merged tree.
- **Skipped test suites:** none.

### Decisions and deviations

1. **The wire types are aliases of the generated ones** since the finishing pass (the first pass wrote them by hand, field by
   field; the generated types turned out to match them, so no guard changed). `Shape<T>` in the guard kit makes a guard that
   forgets, or invents, a field of its type fail to compile, and `listOf<Union>()` does the same for the 12 lists of values.
2. **`API_BASE` now comes from `AppConfig.apiBase`** (the lane asked for a decision). `/config.json` can say
   `"apiBase": "/some/prefix/api/v1"`; the value is accepted only if it is a path on this origin (one leading `/`, no scheme or host,
   no `.` or `..` segment), else the default `/api/v1` is used and one warning is logged. F9 (same origin) still holds. To make it
   work, **`src/app/app.config.ts` was edited, outside the directories this lane owns:** it registers
   `withInterceptors([authInterceptor])` on `provideHttpClient(withFetch())` and no longer provides `API_BASE` itself (the token has
   a default that reads the config). Nothing else there changed. Without that edit neither the interceptor nor the decision would
   take effect.
3. **Guards are strict about the contract's closed enums** (`status`, run status, outcomes, slots, sources, efforts) and about
   patterns and AIU amounts, and tolerant about what the contract leaves open: `phase`, `haltReason`, `agent`, `runtime`, the event
   `type` and, for errors, the problem `code`. Extra fields are always tolerated. A status the vendored contract does not list
   makes the answer an `invalid_response` that names it, which is the signal to re-sync the contract.
4. **How an answer becomes an `ApiError`:** `status` 0 (offline, refused, aborted, **timed out**) is `{ kind: "network" }`; a
   502, 503 or 504 without problem details (a gateway page, the dev proxy with no API behind it) is `{ kind: "network", status }`
   (the optional `status` is an addition to the plan's `{ kind: "network" }`); any other error status without problem details is
   `invalid_response` (`getX: HTTP 401 without problem details`); a 2xx that is not JSON, a wrong shape and anything thrown inside the
   pipeline (an `AuthStrategy` that rejects) are `invalid_response` too. The problem's `status` is the HTTP status of the answer, and its
   `type` is not kept.
5. **Every request has a 30 s timeout** (`REQUEST_TIMEOUT_MS`), and the start-up read of `/config.json` 5 s, so a hung request
   becomes a network failure instead of a screen that spins for ever. Not in the plan; easy to change.
6. **Return shapes:** the three plain lists give an array (`listStoryRuns`, `listQuestions`, `listGateRecords` unwrap `items`);
   `listStories`, `listArtifacts` and `listStoryEvents` keep their envelope (`nextCursor`, `revision`, `lastEventId`);
   `getArtifactContent` gives `{ kind: "content", text, etag, mediaType }` or `{ kind: "not_modified" }` for a 304;
   `getStoryState` gives `state` as `Readonly<Record<string, unknown>>` (an object, checked), a refinement of the plan's `unknown`.
7. **`readStoryState`** gives maps (`humanGates`, `revisions`), applies the hosted default ceiling of 4 when the state sets none, reads an
   unset package status as `pending` (as the hosted code does) and never throws.
8. **`AuthStrategy`** is called per request by `authInterceptor` and only for URLs under `API_BASE`; `NoAuthStrategy` returns `{}`.
   The event stream (2B) must call `AUTH_STRATEGY` itself because it uses `fetch`.
9. **`CurrentUser`** has the signals `id` and `initials`, and `is(actor)`. Initials: the e-mail's local part as words, first letters of
   the first two (`alex.rivera@` gives `AR`), or the first two letters of a single word (`alex@` gives `AL`, as in the design system).
10. **Fixtures:** named by operation id. The text of an artifact is `getArtifactContent.json`
    (`{ path, mediaType, etag, text }`, the ETag being the quoted sha256 that `listArtifacts` lists for it) because a markdown file
    cannot be imported by a spec. `src/testing/fixtures/mutate.ts` breaks a fixture one field at a time for the guard tests. All data is
    fictional, from the wireframes (PROJ-123, alex@example.com). The `.gitkeep` files of `core/auth` and `testing/fixtures` were removed.
11. **`package.json`:** first pass: only the `api:sync` script, no dependency. Finishing pass: the three dev dependencies, the
    `overrides` entry (decision 14) and the scripts `api:types` and `api:check`.
12. **`ahoy-hosted`'s own `CLAUDE.md` was not loaded:** it still holds the `node:test` and `NodeNext` conventions that plan §4 replaced.
13. **Merging `main` (lane 1A):** `package.json` keeps `api:sync` next to 1A's `tokens` and `tokens:check`, and `lint` stays `eslint . &&
npm run tokens:check`; the README Status has the three bullets (phase 0, 1A, 2A), with 1A's corrected to "merged, PR #4"; in this file the
    handoff sections (header, "Where we are", "Start here next", "Prompt for a new session") now cover both lanes. Lane 1A's own section
    is verbatim, including its sentence that it was not committed, which stopped being true when PR #4 merged.

14. **`overrides` for the peer `typescript`.** `"overrides": { "openapi-typescript": { "typescript": "$typescript" } }` in `package.json`,
    as the first pass's report said it would be needed. It makes npm resolve the generator's `typescript ^5.x` peer to the project's
    `~6.0.3`; nothing else is overridden. If `openapi-typescript` ever declares TypeScript 6 itself, delete it.
15. **A JSON mirror of the YAML, because a spec cannot read the YAML** (probes of the first pass: no `node:fs` in specs, no imports
    from outside `src/`, no `?raw`). It is generated, in `.prettierignore`, and `api:check` compares it with the YAML by value.
    The alternative the first pass left untested, a `loader` for `.yaml` in `angular.json`, would have touched a file this lane does
    not own.
16. **`api:types` also writes the mirror and `api:check` also checks it**, and `sync-openapi.mjs` writes it too (after validating
    the YAML, so a bad contract never replaces the vendored copy). The report only asked for `sync` to write it; with the other two
    there is one command to regenerate, and one to check, everything derived from the YAML.
17. **`npm run api:sync` was not a no-op when its source was the vendored copy; fixed in this pass.** It read the origin from the git
    remote of the checkout that holds the file, which for `openapi/ahoy-v1.yaml` is this repository, so it rewrote
    `# Source: github.com/Danielimaalmeida/ahoy-hosted (...)` to `.../ahoy-frontend (...)` (the first pass's claim that re-syncing from
    the vendored copy "changes nothing" was wrong for that line; found by running it, and the file was restored from a backup). Now,
    when the source is the target, it keeps the `# Source:` and `# Commit:` of the header, and refuses a copy without one.
18. **Two checks added to `api-client.spec.ts`** beyond the report's "request bodies against the request schemas": each operation
    of the table is tested with the method and path the contract gives its `operationId`. They are cheap, and they are the only
    thing that ties the client's URLs to the contract.
19. **`contract.spec.ts` fails when the contract gains or loses an operation** (it lists the 19 the client implements and the 5 it
    does not). That is deliberate: a re-sync that adds an operation must be looked at. Add the new `operationId` to
    `NOT_IN_THE_CLIENT_YET` there (or implement it) in the same change.

20. **The domain's types are copies, kept identical by a spec.** The boundary rule (`domain/` imports no `core/`) stays, so the
    contract's shapes are written out in `domain/types.ts` and `core/api/domain-types.spec.ts` (core may import `@domain`) fails when one
    differs from `core/api/types.ts`, at `npm run typecheck` (type identity) and in `npm test` (real values go through the domain
    functions, and every run status and gate outcome of the contract has a presentation that is not the neutral fallback by accident).
    This edits lane 2C's directory, which CLAUDE.md reserves to that lane; it was done because the user asked for it.
21. **`lint` runs `api:check`** (item 6 of the finishing pass); `ci.yml` is untouched.

### What the real API does that the plan did not say

From the hosted sources at 1890d5a (`apps/api/src/server.ts`, `packages/core`), not from a live answer:

- **`errors[].path` has two forms.** The contract check writes `body/budgetNanoAiu`, `body` (the whole body) and `query.limit`; the
  story's own rules write JSON pointers such as `/reason`, `/models` and `/models/review-defect`. `formControlPath` reads both.
- **A problem never has `instance`**, its `title` is the code with spaces (`stale version`, not display text) and its `type` is
  `urn:ahoy:problem:<code>`. So the "request id" of the plan's "Lost contact with the harbour" pattern is empty today.
- **Timestamps** are `toISOString()`, with milliseconds. `Date.parse` accepts 30 February, so the timestamp guard says "an RFC 3339
  date-time `Date` can read", no more.
- **An artifact's content** comes with the stored media type (no charset) and `ETag: "<sha256>"`; a 304 has no body.
- **A send-back deletes the gate's entry in `human_gates`** and counts the round in `revisions[<gate>]`; an approve or reject writes
  `status` there (`approved` is what the hosted e2e test checks). So the plan's "round x of 4" is `revisions[gate] + 1`, and the next
  send-back after the ceiling answers `revision_ceiling_reached`.
- **`lastEventId`** of `listStoryEvents` is null only when there is no event and no `after`; with `after` and nothing new it echoes `after`.
- **The contract is stricter than the first pass's types in places a `string` hid** (found because the validator refused a body of
  mine): `StartStoryRequest.controlRef` must match `^[0-9a-f]{40}$` (a commit sha, not `main`); `StoryKey`, `RunId`, `EventId` and
  `ArtifactPath` have patterns and maximum lengths; `Timestamp` is an RFC 3339 `date-time`; `Limit` is 1 to 500 and `Cursor` at most
  200 characters; `NanoAiu` has no maximum (the guards add `Number.isSafeInteger`). A form that sends these should validate them first.

### Needs from other lanes

- **From the user:** approval to commit and push this working tree (nothing is committed); the review of it, including the two
  presentation choices in `src/app/domain/` ("Needs from lane 2C" above); whether `api:check` should stay in `lint` or become its
  own CI step (decision 21); Node 24 in the setup script (still open from phase 0). The approval to install the dependencies was used
  and is spent.
- **Lane 2C: `domain/types.ts` did not match the contract, and was corrected in this pass** (the user: "the OpenAPI contract is
  sovereign"). A throw-away probe (a file in `src/testing/`, deleted) had asked `tsc` to pass each real type of `core/api/types.ts`
  where the domain's was wanted. It said:

  | Domain type    | What failed                                                                                                                                               | What it is now                                                                                                                                                   |
  | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `Story`        | `phase` any `string` (domain: a closed union); `title`, `haltReason` nullable (domain: `string`, optional); no `controlSha`, `currentRunId`, `createdAt`. | The contract's 13 fields. `Phase = string`; `PHASES` stays the seven the UI knows.                                                                               |
  | `Run`          | No `spentNanoAiu`: the spend is `usage.nanoAiu`. `model` nullable; no `storyKey`, `runtime`, `gate`, ...                                                  | The contract's 17 fields, with `Usage` and `GateVerdict`.                                                                                                        |
  | `Question`     | No `storyKey`, no `answered`: it is answered when `answer` is not null.                                                                                   | The contract's 9 fields.                                                                                                                                         |
  | `GateRecord`   | No `at`: it is `createdAt`; `actor` required, `runId` nullable.                                                                                           | The contract's 9 fields.                                                                                                                                         |
  | `Artifact`     | No `size`: it is `sizeBytes`; also `sha256`, `mediaType`, `runId`, `createdAt`.                                                                           | The contract's 7 fields.                                                                                                                                         |
  | `AhoyEvent`    | No `at`, no `data`: they are `createdAt` and `payload`; `storyKey` and `actor` required.                                                                  | The contract's 6 fields (`payload` stays `Readonly<Record<string, unknown>>`).                                                                                   |
  | `ModelPlan`    | **`slots` is an array** of slots, not a record by slot name, so `reviewersConflict(plan)` **could not work on a real plan**.                              | `{ storyKey, version, slots: readonly SlotModel[] }`; `SlotModel` has `slot`, `phase`, `lens`, `chosen`. `reviewersConflict` finds the two Lookouts in the list. |
  | `RunStatus`    | The API has `awaiting_input` (11 values); the domain lacked it.                                                                                           | 11 values.                                                                                                                                                       |
  | `GateOutcome`  | The domain had `waiting`, which the API never sends.                                                                                                      | The API's 8 values. `outcomePresentation("waiting")` still works: see the second choice below.                                                                   |
  | `EffortSource` | The domain allowed `agent_profile`; the API's effort sources are `revision`, `story`, `configuration`, `phase_table`, `model_default`.                    | Those 5. `EFFORT_SOURCE_LABELS` no longer has an `agent_profile` entry.                                                                                          |

  `StoryStatus`, `ModelSlot`, `ReasoningEffort` and `ModelSource` were already identical. `domain/` may not import `@core`, so it keeps its
  own types, and **`core/api/domain-types.spec.ts` proves they stay in line** (decision 20). **Two choices for lane 2C and the design system
  to review:** (1) a run in `awaiting_input` is shown as `input` (like a `branch` gate, "questions for a human"), because the contract has the
  status and OutcomePill does not list it; without a mapping it would read as the neutral `queued`. (2) `waiting` stays in
  `outcomePresentation` because OutcomePill names it ("waiting for a person", `ah-badge--decision`), but it is a UI word for a human gate
  nobody has decided, never an API outcome (a pending gate has no record), and the type says so. Files changed in `src/app/domain/`:
  `types.ts`, `models.ts` (and `models.spec.ts`), `outcome.ts` (and `outcome.spec.ts`); `status.ts` and `halt.ts` needed no change.

- **For lane 2C (the boundary, from the first pass):** `check-boundaries` forbids `domain/` importing `@core`, so the plan's "re-export the types of `schema.d.ts`" cannot be
  done as written. Either `domain/` keeps its own structurally identical types (the types in `core/api/types.ts` are assignable to
  them, and the guards return those), or the boundary rule is relaxed for a type-only import. The names and shapes `core/api` exports:
  `Story`, `StoryPage`, `Run`, `Question`, `GateRecord`, `Artifact`, `AhoyEvent`, `ModelPlan`, `SlotModel`, `ModelChoice`, `Usage`,
  `GateVerdict`, and the unions `StoryStatus`, `RunStatus`, `GateOutcome`, `ModelSlot`, `ReasoningEffort`, `ModelSource`,
  `EffortSource`, with runtime arrays (`STORY_STATUSES`...). `DEFAULT_REVISION_CEILING` (4) is in `core/api/story-state.ts`.
- **For lane 2B:** inject `ApiClient`, `API_BASE` and `AUTH_STRATEGY` (the stream calls `headers()` itself); use `isEvent` and
  `parseRunProgress(event.payload)` for `run.progress`; `listStoryEvents` gives `lastEventId` for `after`. `FETCH` and
  `core/realtime/` are untouched.
- **For lane 2D:** the fixtures in `src/testing/fixtures/` are shaped like the real answers and can seed the mock. The mock should
  answer errors the way the real API does (`type: "urn:ahoy:problem:<code>"`, `title` the code with spaces, `errors[].path` in both
  forms, `currentVersion` on `stale_version`). The Ajv helper for conformance tests is **`src/testing/fixtures/contract.ts`** (done):
  `violations(schema, value)`, `responseViolations(operationId, body)`, `requestViolations(operationId, body)`, `operations()`,
  `enumOf(...)`, over the generated mirror `openapi.json`. Do not write a second one. Mind that the real contract refuses what the
  first pass's types allowed (see "What the real API does"): a mock answer that fails it is the mock's bug.
- **For lane 4A:** `CommandRunner` can switch on `isStale`, `isDecisionAlreadyRecorded`, `isAlreadyAnswered`, `isStoryExists`,
  `isInvalidState`, `isRevisionCeilingReached`, `isLegacyStory`, `isValidationFailed` (with `fieldErrors` for the form), `isNotFound`,
  `isUnauthenticated` and `isUnreachable` (network or `unavailable`); an `invalid_response` is never to be shown as a verdict.
- **For lane 3A and the voyage lanes:** `CurrentUser` (`id()`, `initials()`, `is(actor)`) and `readStoryState` for the plan screen.
- **For lane 6D:** `/config.json` takes `apiBase`, `actor` and `jiraBaseUrl` (all optional; `null` or missing means the default; an
  empty `jiraBaseUrl` means no Jira). `actor` must equal the `AHOY_ACTOR` of the dev proxy. Serve it with `Cache-Control: no-cache` and with a
  real 404 when there is none (the app also copes with an HTML page).
- **For the composition root and docs (P0, 6A):** the README "Commands" table has no row for `npm run api:sync`, `api:types` or
  `api:check` (this lane may only touch the Status line); `docs/architecture.md` still says `API_BASE` is provided by `app.config.ts`.

### Final check

Run at the end of the lane, on Node 24.21.0, on the lane's own commit (before `main` was merged in):

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle; 13 lazy chunks; main 219.55 kB raw)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (no problems)
$ npm test                    exit 0 (Test Files 13 passed (13); Tests 499 passed (499))
$ npx prettier --check scripts/ openapi/ src/ package.json   exit 0 (all files use Prettier code style)
$ npm run format:check        exit 1 (24 files, all under .agents/skills, .github/skills and .opencode/skills; none is from this lane)
```

After merging `main` (lane 1A, d29002b), on the merged tree:

```
$ node -v                     v24.21.0
$ npm run build               exit 0 (production bundle; main 249.16 kB raw)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint, then build-tokens: ok)
$ npm test                    exit 0 (Test Files 23 passed (23); Tests 582 passed (582): 15 + 83 + 484)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```

After the finishing pass (2026-10-07), on the working tree of `claude/eager-cray-4c3z42` (from `main` at 56e815a), on Node 24.21.0:

```
$ node -v                     v24.21.0
$ npm ci                      exit 0 (also from the new lockfile with the overrides entry; 411 packages audited, 0 vulnerabilities)
$ npm run build               exit 0 (production bundle; no ajv, no mirror, no generated file in dist/)
$ npm run typecheck           exit 0 (tsc app + spec; check-boundaries: ok)
$ npm run lint                exit 0 (eslint, then build-tokens: ok)
$ npm test                    exit 0 (Test Files 33 passed (33); Tests 900 passed (900): 800 + 82 + 18)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
$ npm run api:check           exit 0 (openapi-typescript 7.13.0 --check; openapi-mirror: ok)
```

After the domain types, `lint` with `api:check` and the `sync-openapi.mjs` fix (same session, same working tree), on Node 24.21.0:

```
$ node -v                     v24.21.0
$ npm run build               exit 0
$ npm run typecheck           exit 0 (tsc app + spec, with the domain-types identities; check-boundaries: ok)
$ npm run lint                exit 0 (eslint, then build-tokens: ok, then api:check: openapi-typescript --check and openapi-mirror: ok)
$ npm test                    exit 0 (Test Files 34 passed (34); Tests 910 passed (910): 800 + 82 + 18 + 10)
$ npm run format:check        exit 0 (All matched files use Prettier code style!)
```
