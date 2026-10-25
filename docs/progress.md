# Ahoy frontend · progress

Updated 2026-10-25 (Meetings: images on notes; before that, 2026-10-24, decisions and actions with an owner, and live
refresh). One page: replace it, do not append; git history is the archive (the
3,692-line page before this one: `git show b1f9b88:docs/progress.md`). The review of both repositories, with its
proposals (not yet agreed), is `ahoy-hosted`'s `docs/harness-review-2026-10-20.md`; the user kept Meetings outside its
freeze on 2026-10-24 (`ahoy-hosted` `design.md` §1 and §5).

## Where we are

- **On `main`:** the shell with All hands and Needs you, Voyages, Set sail with the model catalogue, the Docks (the Jira
  backlog with readiness, harness fit and Refine), the voyage page (header with Stop, Resume, Budget, Models, Unblock,
  Refresh design and the pull request links; tabs Plan, Questions, Work packages, Runs, Gates, Artifacts, Log and
  Models), the run detail with live steps, Metrics, the halt diagnosis, knowledge-review lessons, WebEAM sign-in with
  the qnumber allow-list, and Meetings slices 1 to 3 (topics, notes, carry-over, user stories drafted by an agent,
  Grill me, Copy for Confluence).
- **Under review, stacked:** `feat/meeting-decisions-actions` (PR #39): a note is a note, decision, action or
  question; an action has an owner, a due day and a done box; an "Open actions" panel; a meeting in progress is read
  again every 5 s; Copy for Confluence starts with Decisions and Actions. On top of it, **this branch**
  (`feat/meeting-note-images`): images on a note, pasted into the line, dropped on the topic or chosen with Add image
  (PNG, JPEG, WebP, GIF; 5 MB and 10 per note, checked here and again by the API from the bytes), shown as thumbnails
  read once through `ApiClient` (an `<img>` cannot send the token) and opened large with Download; removable while the
  meeting has not ended; carried over with their note; Copy for Confluence says "(2 images)".
- **Contract:** `openapi/ahoy-v1.yaml` is vendored from `ahoy-hosted` `46946eb` (PR #61 on PR #60, neither merged),
  with the redaction placeholders kept. Needs from `ahoy-hosted`: PRs #60 and #61 merged and migrations 0018 and 0019
  applied before these branches can run against an API.
- **Never run against an API.** No record of the app against a local `ahoy-hosted --simulate` or TEST: every screen was
  checked by unit and component tests on the mock backend only.

## Proof

- **Last full run** (2026-10-25, this branch, cloud container, Node 24, a local stand-in for `@acme-fedev/auth`
  because the private registry is not reachable): Vitest 163 files, 2,945 tests, all passed; `tsc` for app and specs,
  `check-boundaries`, `eslint`, `stylelint`, `ng build` and `prettier --check` passed; `openapi-mirror --check` and
  `npm run test:scripts` (10) passed. Offline only: the images were proven on the mock backend (upload, bytes, 304,
  SVG refused, cap, delete, carry-over) and in component tests with a fake `URL.createObjectURL`; never in a browser
  against an API.
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
1. Merge `ahoy-hosted` PRs #60 and #61, then PR #39 and this branch. On a machine with the private registry and Node 24, repeat the full
   check with the real `@acme-fedev/auth`: `npm ci`, then
   `npm run build && npm run typecheck && npm run lint && npm test && npm run format`.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, migrations up to 0018): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings (migrations 0018 and 0019: an action ticked done, two browsers on one meeting in progress, a screenshot
   pasted into a note and opened large).
4. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click,
   then publishing to Confluence through its API (today the page copies wiki markup).
5. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
