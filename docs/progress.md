# Ahoy frontend · progress

Updated 2026-10-31 (Team settings: SonarQube servers and repositories that admins change in the UI, with
`ahoy-hosted`'s D19, laid out as the approved design; tested on the mock HTTP backend only). One page:
replace it, do not append; git history is the archive (the 3,692-line page before this one:
`git show b1f9b88:docs/progress.md`). The review of both repositories, with its
proposals (not yet agreed), is `ahoy-hosted`'s `docs/harness-review-2026-10-20.md`; the user kept Meetings outside its
freeze on 2026-10-24 (`ahoy-hosted` `design.md` §1 and §5).

## Where we are

- **This branch (`feat/team-settings`, 2026-10-31):** the Team settings page (`/settings`, linked from the account
  menu), with `ahoy-hosted`'s branch of the same name, laid out as the design the user approved (the "Ahoy Team
  settings" canvas: Main, the two dialogs and the states). It lists the SonarQube servers (the token as `••••` and its
  last four characters, who set it and when, the last change), the repositories put on a server, and the history in
  words in a side panel with each author's initials. Admins (shown by a tag) add, edit and remove servers and
  repositories in dialogs with a subtitle: the token is a password field typed once, editing keeps it unless a new one
  is typed, a new host asks for it again before Save is offered, and a server with repositories shows Remove off with
  the reason. Others read only; without `AHOY_SECRETS_KEY` Add server is off and says why. SonarQube is set only here
  (`ahoy-hosted` no longer reads `SONAR_*`), so the page has no read-only "set by the deployment" state. `ah-dialog`
  takes an optional `subtitle`; `domain/time` adds `absoluteDay` and `absoluteDayTime` ("Thu 29 Oct 09:02", with the
  year when it is not this one). After a code review: the page reads the settings again after every command, refused
  or not, and keeps only the latest of overlapping reads; a refused read is not shown as "only admins change"; a host
  typed another way (case, default port) is the same host; an http host warns that the token would travel
  unencrypted. The contract sync also brought the knowledge reviews' `pullRequestUrl` and `pullRequestError`
  (`ahoy-hosted` 0025) into the guard, the mock and the fixtures.
- **Merged on 2026-10-30:** one image for every team, toward a Helm chart (PR #48, F17, architecture "Runtime
  configuration"): `/config.json` read once before bootstrap. `environment.test.ts` still holds FIO's realm and client
  as the fallback until the TEST deployment mounts `/config.json`.
- **On `main`:** the shell with All hands and Needs you, Voyages, Set sail with the model catalogue, the Docks (the Jira
  backlog with readiness, harness fit and Refine), the voyage page (header with Stop, Resume, Budget, Models, Unblock,
  Refresh design and the pull request links; tabs Plan, Questions, Work packages, Runs, Gates, Artifacts, Log and
  Models), the run detail with live steps, Metrics, the halt diagnosis, knowledge-review lessons, WebEAM sign-in with
  the qnumber allow-list, and Meetings slices 1 to 3 (topics, notes, carry-over, user stories drafted by an agent,
  Grill me, Copy for Confluence).
- **Merged since:** decisions and actions on meeting notes (PR #39 and #41), images on notes (PR #40), the Crew page
  (PR #42, with `ahoy-hosted` #64, restyled in PR #43), the user's local changes (`f4ec304`), Meetings' cancel, mark
  done without Start and stakeholders by name (PR #44, with `ahoy-hosted` #65) and answers to questions (PR #45, whose
  `ahoy-hosted` side, #67, is not merged yet).
- **Contract:** `openapi/ahoy-v1.yaml` is vendored from `ahoy-hosted`'s `feat/team-settings` (`8105413`), with the redaction
  placeholders kept; `schema.d.ts` and the test mirror are regenerated from it. Needs on the API: migrations 0025 and
  0026, `AHOY_SECRETS_KEY` and `AHOY_ADMIN_QNUMBERS`. Merge and deploy with the `ahoy-hosted` pull request.
- **Never run against an API.** No record of the app against a local `ahoy-hosted --simulate` or TEST: every screen was
  checked by unit and component tests on the mock backend only (Crew and Team settings over
  `HttpTestingController`).

## Proof

- **Last full run** (2026-10-31, `feat/team-settings`, cloud container, Node 22, a local stand-in for
  `@acme-fedev/auth` and `@acme-fedev/playwright-helpers` copied into `node_modules` because the private registry is
  not reachable, dependencies installed without the lock file, with `@angular/compiler-cli`, `build` and `cli` at the
  locked 22.2.1): Vitest 172 files, 3,088 tests, all passed (new: the Team settings page 13, its store 2,
  `domain/settings` 5, `domain/time` 3, the dialog's subtitle 1, the account menu's link 1); `npm run typecheck` (app, specs, `check-boundaries`), `npm run lint` (eslint, stylelint) and
  `ng build` passed (the `crew-page.ts` and `metrics.scss` styles are over the 4 kB warning budget, as on `main`).
  `prettier --check` flags only `docs/architecture.md` and `src/app/features/meetings/meetings.spec.ts`, which fail on
  `main` too. Not run: Node 24, the real `@acme-fedev/auth`, nginx, Playwright, a browser, and the page against a real
  API.
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
1. Merge `ahoy-hosted`'s `feat/team-settings` (migrations 0025 and 0026), then this branch. On a machine with the private registry and Node 24, repeat the full
   check with the real `@acme-fedev/auth`: `npm ci`, then
   `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix or drop `test:scripts`.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, migrations up to 0026): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings (migrations 0018, 0019 and 0022: an action ticked done, two browsers on one meeting in progress, a
   screenshot pasted into a note and opened large, a meeting cancelled and one marked done, a question answered after
   its meeting ended and reopened) and Crew (migration 0021 and `JIRA_BOARD_ID`: add the team, a swap for a
   holiday, its Undo) and Team settings (`AHOY_SECRETS_KEY`, `AHOY_ADMIN_QNUMBERS`: add a server, put a
   repository on it, change its host with the token, and read the history).
4. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click,
   then publishing to Confluence through its API (today the page copies wiki markup).
5. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
