# Ahoy frontend · progress

Updated 2026-10-28 (review fixes to Meetings' answers to questions, merged the same day as PR #45; before that the
same day, the Crew page restyled to its design, and Meetings' cancel, mark done without Start and stakeholders by
name). One page:
replace it, do not append; git history is the archive (the 3,692-line page before this one:
`git show b1f9b88:docs/progress.md`). The review of both repositories, with its
proposals (not yet agreed), is `ahoy-hosted`'s `docs/harness-review-2026-10-20.md`; the user kept Meetings outside its
freeze on 2026-10-24 (`ahoy-hosted` `design.md` §1 and §5).

## Where we are

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
- **This branch (`fix/meeting-answers-review`, 2026-10-28):** the review's fixes to answers. Removing a question's last
  answer marks it open again, on the page and in the mock, as the API now does; moving or removing a topic, and
  editing a note, refresh the open actions and questions; one of the two lists failing no longer drops the other; and
  an image refused on an answer after the meeting ended now says why.
- **Contract:** `openapi/ahoy-v1.yaml` is vendored from `ahoy-hosted` `36e7243` (branch `feat/meeting-answers`, PR
  #67, not merged), with the redaction placeholders kept. Needs on the API: migrations 0021, 0022 and 0024 applied and
  `JIRA_BOARD_ID` set. Merge and deploy with the `ahoy-hosted` pull request.
- **Never run against an API.** No record of the app against a local `ahoy-hosted --simulate` or TEST: every screen was
  checked by unit and component tests on the mock backend only (Crew over `HttpTestingController`).

## Proof

- **Last full run** (2026-10-28, `fix/meeting-answers-review`, cloud container, Node 24, a local stand-in for
  `@acme-fedev/auth` because the private registry is not reachable, dependencies installed without the lock file, with
  `@angular/compiler-cli`, `build` and `cli` at the locked 22.2.1): Vitest 166 files, 3,016 tests, all passed; `tsc`
  for app and specs, `check-boundaries`, `eslint`, `stylelint`, `ng build` and `openapi-mirror --check` passed
  (`crew-page.ts` and `docks.ts` styles are over the 4 kB warning budget, as on `main`). `prettier --check` flags only
  `docs/architecture.md`, which fails on `main` too. `npm run test:scripts` cannot run (`main` removed
  `scripts/redact.mjs` but `package.json` still names it). Answers are proven by component tests on the mock backend
  (answer, Reopen, the panel, after the meeting ended with an image and a refused one, removing the last answer, the
  Confluence text) and by the guards, mock and contract specs; not run in a browser or against an API; Playwright was
  not run.
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
1. Merge the `ahoy-hosted` answers pull request (migration 0024), then this branch. On a machine with the private registry and Node 24, repeat the full
   check with the real `@acme-fedev/auth`: `npm ci`, then
   `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix or drop `test:scripts`.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, migrations up to 0024): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings (migrations 0018, 0019 and 0022: an action ticked done, two browsers on one meeting in progress, a
   screenshot pasted into a note and opened large, a meeting cancelled and one marked done, a question answered after
   its meeting ended and reopened) and Crew (migration 0021 and `JIRA_BOARD_ID`: add the team, a swap for a
   holiday, its Undo).
4. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click,
   then publishing to Confluence through its API (today the page copies wiki markup).
5. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
