# Ahoy frontend · progress

Updated 2026-10-28 (Meetings: cancel, mark done without Start, and stakeholders by name, asked for by the user on
2026-10-28; before that, 2026-10-27, the Crew page). One page: replace it, do not append; git history is the archive
(the 3,692-line page before this one: `git show b1f9b88:docs/progress.md`). The review of both repositories, with its
proposals (not yet agreed), is `ahoy-hosted`'s `docs/harness-review-2026-10-20.md`; the user kept Meetings outside its
freeze on 2026-10-24 (`ahoy-hosted` `design.md` §1 and §5).

## Where we are

- **On `main`:** the shell with All hands and Needs you, Voyages, Set sail with the model catalogue, the Docks (the Jira
  backlog with readiness, harness fit and Refine), the voyage page (header with Stop, Resume, Budget, Models, Unblock,
  Refresh design and the pull request links; tabs Plan, Questions, Work packages, Runs, Gates, Artifacts, Log and
  Models), the run detail with live steps, Metrics, the halt diagnosis, knowledge-review lessons, WebEAM sign-in with
  the qnumber allow-list, and Meetings slices 1 to 3 (topics, notes, carry-over, user stories drafted by an agent,
  Grill me, Copy for Confluence).
- **Merged since:** decisions and actions on meeting notes (PR #39 and #41), images on notes (PR #40) and the Crew
  page (PR #42): a `/crew` page with the sprint person and the lunch and retro host, the upcoming sprints from Jira,
  Change and Undo, the rotation and time off.
- **This branch (`feat/meeting-close-and-guests`, 2026-10-28):** a planned meeting has Cancel meeting, Mark done and
  Start meeting. Mark done ends it without starting it; Cancel gives it the new status `cancelled` (read-only, a
  banner, "· cancelled" in the left column). Both open the closing dialog: Mark done ticks the topics nobody took a
  note on, Cancel ticks every open topic; the person can untick any. When the series has no next meeting and no cadence,
  the dialog says so and keeps the topics. Stakeholders are names ("Ana Silva") or e-mails,
  in the new meeting dialog (split on commas, and e-mails also on spaces) and in "who raised it"; the API field is now `raisedByStakeholder`.
- **Contract:** `openapi/ahoy-v1.yaml` is vendored from `ahoy-hosted` `3a28dbe` (its PR #65, not merged), with the
  redaction placeholders kept. Needs from `ahoy-hosted`: PR #65 merged and migration 0022 applied.
- **Never run against an API.** No record of the app against a local `ahoy-hosted --simulate` or TEST: every screen was
  checked by unit and component tests on the mock backend only (Crew over `HttpTestingController`).

## Proof

- **Last full run** (2026-10-28, this branch, cloud container, Node 24, a local stand-in for `@acme-fedev/auth`
  because the private registry is not reachable, dependencies from the scratch install of 2026-10-27): Vitest 166
  files, 2,993 tests, all passed; `tsc` for app and specs, `check-boundaries`, `eslint`, `stylelint` and `ng build`
  passed; `openapi-mirror --check` passed. `prettier --check` flags only `docs/architecture.md`, which fails on `main`
  too. `npm run test:scripts` cannot run: `main` (`f4ec304`) removed `scripts/redact.mjs` and its test, but
  `package.json` still names them.
  Cancel, Mark done and names are proven by component tests on the mock backend and by the conformance test against
  the contract; never in a browser against an API. Playwright was not run.
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

0. **Decide on the review** (its §7): above all, nothing merges without a check that ran.
1. Merge `ahoy-hosted` PR #65, then this branch. On a machine with the private registry and Node 24, repeat the full
   check with the real `@acme-fedev/auth`: `npm ci`, then
   `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix or drop `test:scripts`.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, migrations up to 0022): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings (migrations 0018, 0019 and 0022: an action ticked done, two browsers on one meeting in progress, a
   screenshot pasted into a note and opened large, a meeting cancelled and one marked done) and Crew (migration 0021 and `JIRA_BOARD_ID`: add the team, a swap for a
   holiday, its Undo).
4. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click,
   then publishing to Confluence through its API (today the page copies wiki markup).
5. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
