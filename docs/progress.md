# Ahoy frontend · progress

Updated 2026-10-31 (Team settings › Teams, Figma and Agents, with `ahoy-hosted`'s `feat/teams-figma-agents-settings`,
laid out as the design's "Later" boards; tested on the mock HTTP backend only). One page:
replace it, do not append; git history is the archive (the 3,692-line page before this one:
`git show b1f9b88:docs/progress.md`). The review of both repositories, with its
proposals (not yet agreed), is `ahoy-hosted`'s `docs/harness-review-2026-10-20.md`; the user kept Meetings outside its
freeze on 2026-10-24 (`ahoy-hosted` `design.md` §1 and §5).

## Where we are

- **This branch (`feat/teams-figma-agents-settings`, 2026-10-31, on top of `feat/jira-settings`):** Team settings has
  five sections, each with its state in the side navigation (Teams On, Off or "Webhook needed"; Figma On, Off or
  "Token needed"; Agents "2 of 4 on" or "1 paused"). **Teams** (`/settings/teams`): the crew's channel as the host of
  its Workflows webhook only, who set it, where the cards' "Open Crew" button goes, the last card and whether Teams
  took it; Send a test card after a confirmation that the whole channel sees it (0 AIU); connect, change the webhook
  or the address, and disconnect after a second press; the "Teams is off" state. **Figma** (`/settings/figma`): the
  token as `••••` and its last four, Test token (who it reads as, or a refusal with the request it made), save,
  replace and remove after a second press; the design phase's UI builders, chosen from the content repository's
  profiles at HEAD (kept as they are when the profiles cannot be read), and the design kit prefix. **Agents**
  (`/settings/agents`): who runs Pre-refinement, Halt diagnosis, Story drafts and Business-rule review, chosen from the
  profiles at HEAD; Story drafts and Business-rule review can be off, and turning one on warns that it spends AIU
  outside a story's budget and asks for a confirmation before the change is sent with `confirmSpend: true` (D19 as the
  user agreed it); a job whose profile is gone shows as paused; the knowledge repository as owner/name. Each section
  has its own history. Non-admins read everything and change nothing; without `AHOY_SECRETS_KEY` the webhook and the
  token cannot be saved, and say why; a webhook or token the API's key cannot open is asked for again. After the code
  review: the forms are typed Reactive Forms; without the key the card links still change and the Figma token can
  still be removed; an Agents save that another admin beat shows their jobs instead of sending over them; a sample
  sprint-start card previews what the channel gets. The Copilot token page waits on security and is not built.
- **Open, merging first:** Team settings › Jira (PR #50, with `ahoy-hosted` #73).
- **Merged on 2026-10-31:** Team settings › SonarQube (PR #49, with `ahoy-hosted` #72).
- **Merged on 2026-10-30:** one image for every team, toward a Helm chart (PR #48, F17, architecture "Runtime
  configuration"): `/config.json` read once before bootstrap. `environment.test.ts` still holds FIO's realm and client
  as the fallback until the TEST deployment mounts `/config.json`.
- **On `main`:** the shell with All hands and Needs you, Voyages, Set sail with the model catalogue, the Docks (the Jira
  backlog with readiness, harness fit and Refine), the voyage page (header with Stop, Resume, Budget, Models, Unblock,
  Refresh design and the pull request links; tabs Plan, Questions, Work packages, Runs, Gates, Artifacts, Log and
  Models), the run detail with live steps, Metrics, the halt diagnosis, knowledge-review lessons, WebEAM sign-in with
  the qnumber allow-list, Meetings slices 1 to 3 and the Crew page.
- **Contract:** `openapi/ahoy-v1.yaml` is vendored from `ahoy-hosted`'s `feat/teams-figma-agents-settings`
  (`f52d99b`; the commit in its header changes if that branch moves before merging), formatted with this repository's
  Prettier; `schema.d.ts` and the test mirror are regenerated from it. Needs on the API: migrations 0025 to 0030,
  `AHOY_SECRETS_KEY` and `AHOY_ADMIN_QNUMBERS`. Merge and deploy with the `ahoy-hosted` pull request.
- **Never run against an API.** No record of the app against a local `ahoy-hosted --simulate` or TEST: every screen was
  checked by unit and component tests on the mock backend only (Crew and Team settings over
  `HttpTestingController`). No Teams, Figma or Jira was called.

## Proof

- **Last full run** (2026-10-31, `feat/teams-figma-agents-settings`, cloud container, Node 22, a local stand-in for
  `@acme-fedev/auth` in `node_modules` because the private registry is not reachable, dependencies installed without
  the lock file, with `@angular/compiler-cli`, `build` and `cli` at the locked 22.2.1): Vitest 183 files, 3,211 tests,
  all passed (new: the Teams page 13, the Figma page 12, the Agents page 12, the frame 2 more, `domain/teams-settings`
  8, `domain/figma-settings` 6, `domain/agent-settings` 6, the three sections' guards and client 8, eleven contract
  fixtures); `npm run typecheck` (app, specs, `check-boundaries`), `npm run lint` (eslint, stylelint) and `ng build`
  passed (the `crew-page.ts`, `docks.ts` and `metrics.scss` styles are over the 4 kB warning budget and two meetings
  dialogs warn NG8011, as on `main`). `prettier --check` flags only `docs/architecture.md` and
  `src/app/features/meetings/meetings.spec.ts`, which fail on `main` too. Not run: Node 24, the real
  `@acme-fedev/auth`, nginx, Playwright, a browser, and the pages against a real API.
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
1. Merge `ahoy-hosted` #73 (`feat/jira-settings`, migration 0027) and this repository's #50, then `ahoy-hosted`'s
   `feat/teams-figma-agents-settings` (migrations 0028 to 0030) and this branch. On a machine with the private registry and Node 24, repeat the full
   check with the real `@acme-fedev/auth`: `npm ci`, then
   `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix or drop `test:scripts`.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, migrations up to 0030): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings (migrations 0018, 0019 and 0022: an action ticked done, two browsers on one meeting in progress, a
   screenshot pasted into a note and opened large, a meeting cancelled and one marked done, a question answered after
   its meeting ended and reopened) and Crew (migration 0021 and the board in Team settings › Jira: add the team, a swap for a
   holiday, its Undo) and Team settings (`AHOY_SECRETS_KEY`, `AHOY_ADMIN_QNUMBERS`: add a server, put a
   repository on it, change its host with the token, and read the history; connect a fake Jira, preview a query, set
   a board and add a fixed field; connect a fake Teams webhook and send a test card, save a fake Figma token and test it,
   turn Business-rule review on and see the confirmation). The Copilot token page waits on security.
4. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click,
   then publishing to Confluence through its API (today the page copies wiki markup).
5. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
