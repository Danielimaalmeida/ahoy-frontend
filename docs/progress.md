# Ahoy frontend · progress

Updated 2026-10-20 (documentation cleanup and engineering review). One page: replace it, do not append; git history is
the archive (the 3,692-line page before this one: `git show b1f9b88:docs/progress.md`). The review of both
repositories, with its proposals (not yet agreed), is `ahoy-hosted`'s `docs/harness-review-2026-10-20.md`.

## Where we are

- **On `main`:** the shell with All hands and Needs you, Voyages, Set sail with the model catalogue, the Docks (the Jira
  backlog with readiness, harness fit and Refine), the voyage page (header with Stop, Resume, Budget, Models, Unblock,
  Refresh design and the pull request links; tabs Plan, Questions, Work packages, Runs, Gates, Artifacts, Log and
  Models), the run detail with live steps, Metrics, the halt diagnosis, knowledge-review lessons, WebEAM sign-in with
  the qnumber allow-list, and Meetings slices 1 to 3 (topics, notes, carry-over, user stories drafted by an agent,
  Grill me).
- **Contract:** `openapi/ahoy-v1.yaml` is vendored from `ahoy-hosted` `4b36d33`, which is what `ahoy-hosted` `main` holds.
  Needs from `ahoy-hosted`: none.
- **Never run against an API.** No record of the app against a local `ahoy-hosted --simulate` or TEST: every screen was
  checked by unit and component tests and, until 2026-10-10, on the in-browser mock, which no build configuration wires
  in any more (`npm run start:mock` is gone).

## Proof

- **Last full Vitest run** (2026-10-17, Refresh design, cloud container, Node 24.22.0, a local stand-in for
  `@acme-fedev/auth`): 161 files, 2,842 tests passed and 8 failed; the same 8 fail on `main` (meetings 4, voyages 2,
  top bar 1, All hands 1: the Meetings top-bar link and seeds). `typecheck`, `ng build`, `lint` and `api:check`
  passed; `npm run format` warned on 10 files, as on `main`.
- **Merged without any Angular check:** "Blocked is not Ended" (PR #31) and its review fixes, Meetings slice 2, slice 3
  and the grill discard fix. Their sessions ran only a stand-in `tsc`, the pure specs and Prettier; `ng build`, strict
  templates, `lint`, Vitest and `api:check` did not run, and slices 2 and 3 added their part of `schema.d.ts` by hand.
- **CI:** none runs on github.com. `test.yml` and `lints-format.yml` call `ATC-GitHub/reusable-workflows` on
  `atc-ubuntu-latest`, which do not exist there, and `npm ci` needs the private registry for `@acme-fedev/*`. Every run
  fails before it starts; PR #37 merged with no check run.
- **This change** (docs only): Prettier on the changed files; nothing else could run here (`npm ci` fails with `404` on
  `@acme-fedev/playwright-helpers`).

## Open decisions

- Which Prettier configuration stays: `.prettierrc` (single quotes, 80 columns) is read before `.prettierrc.json`
  (double quotes, 120 columns), while CLAUDE.md asks for double quotes.
- Whether to wire the mock backend back into a build (`start:mock`) or delete it.
- `@acme-fedev/auth` is `^8.0.0` in runtime dependencies (the rule is exact pins) and `@acme-fedev/playwright-helpers`,
  a test helper, is a runtime dependency. Changing either is a dependency change and needs approval.

## Next, in order

0. **Decide on the review** (its §7): above all, nothing merges without a check that ran.
1. On a machine with the private registry and Node 24: `npm ci`, `npm run api:check` (or `npm run api:types`), then
   `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix what fails: at least the 8
   known unit failures and whatever strict templates and lint find in Meetings slices 2 and 3.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, migrations up to 0016): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings.
4. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
