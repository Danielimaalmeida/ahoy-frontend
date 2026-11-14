# Ahoy frontend · progress

Updated 2026-11-14. The one status page: what is proven and how, what is not, and what comes next. Replace it after
each item; never append to it. The detail of a change (its checks, test counts and screenshots) goes in its commit and
pull request, and git history keeps every earlier version of this page (`git show cbb8f39:docs/progress.md` is the last
long one, with an entry per branch since 2026-10-30). The review of both repositories, with its proposals (not yet
agreed), is `ahoy-hosted`'s `docs/harness-review-2026-10-20.md`; the user kept Meetings outside its freeze on
2026-10-24 (`ahoy-hosted` `design.md` §1 and §5).

## Where we are

- **On `main`:** the shell with All hands and Needs you; Voyages; Set sail with the model catalogue and the plan panel;
  the Docks (the Jira backlog with readiness, harness fit and Refine; Backlog › Defects with Try to fix); the voyage page
  (header with Stop, Resume, Cancel, Start again, Budget, Models, Unblock, Refresh design, Deploy and Release to TEST
  and the pull request links; tabs Plan, Questions, Work packages, Runs, Gates, Artifacts, Log and Models, with Assess
  comments at the delivery gate); the run detail with live steps; Metrics with Trends; the halt diagnosis;
  knowledge-review lessons; WebEAM sign-in; Meetings (topics, notes, decisions, actions, questions, images, search,
  drafted stories edited in place, Create in Jira and Create in Confluence); the Crew page; Team settings (SonarQube,
  Jira, Teams, Figma with the runner key, Agents, Phases with the plan panel, Defects, Branch releases, Pull request
  comments, Meetings, People with each person's side, Confluence, My Copilot token) and the Setup page.
- **How it is proven.** Every screen is proven by unit and component tests on the mock backend (Crew and Team settings
  over `HttpTestingController`). On 2026-11-07 every page was opened in Chromium on `ng serve` against a local
  `ahoy-hosted` with fictional data, for layout only; the inline story edit was seen in Chromium against a local API at
  1280px and 390px, in light and dark, with the keyboard path. No flow (a voyage to `done`, a gate, a Teams, Figma,
  Jira or Confluence call) has run against `npm run dev -- --simulate` end to end, a live API or TEST, and no
  Playwright e2e, 200% zoom or screen-reader check has run.
- **The required checks rarely ran.** They need Node 24 and the company's private registry (`@acme-fedev/*`), which a
  cloud session cannot reach: most branches since 2026-11-05 ran substitutes instead (Node 22 or 26, the auth library
  stubbed in `node_modules`). The last full run with the real auth library was `feature/R3DA-14787-cli` (2026-11-11,
  Node 24.22.2 through `npx node@24`): format, build, typecheck, lint and `ng test` (220 files, 3,809 tests) passed.
  The latest substitute run, `feat/runner-key` (2026-11-14, Node 22.23.4, the auth library stubbed): build, typecheck
  and lint passed; `ng test` ran 224 files and 3,889 tests with one failure, `app.config.spec.ts`'s "refuses the mock
  sign-in in a production environment", which tests the real library's refusal the stub lacks; format fails on
  `docs/architecture.md` alone, as on `main`.
- **Contract:** the vendored `openapi/ahoy-v1.yaml` follows `ahoy-hosted`'s `main` and the runner key of its PR #117
  (migration 0051, `generateRunnerKey`, `deleteRunnerKey`, `FigmaSettings.runnerKey`); `schema.d.ts` and the test
  mirror are generated from it. Merge and deploy that API and its migrations with or before this front end: an older
  API sends no `runnerKey`, and the Figma page refuses its answer.

## Not checked yet

What each feature still needs beyond the tests above. Its pull request has the detail.

| Feature                                                                                                | Not checked yet                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Team settings › Figma › Runner key (generate, show once, copy, replace, remove)                        | A browser and an API; a run fetching node trees with the key saved in GitHub                               |
| Create in Confluence, Team settings › Confluence                                                       | A real Confluence; updating a page once it exists is not built                                             |
| Each person on a side of a meeting (People, `MeStore`)                                                 | A browser                                                                                                  |
| Backlog layouts; still pages on load (Voyages, Meetings, All hands)                                    | All hands: a browser. A voyage with a long history now delays All hands' first paint (a trade-off)         |
| The 7 empty states (Voyages, Meetings, notes)                                                          | A browser, against the designs; the first-use copy for Voyages and Meetings is ours, not the designer's    |
| The `local` configuration (`npm run start:local`, no WebEAM)                                           | A browser against a running API                                                                            |
| Design system re-sync, `docs/accessibility.md`, the a11y fixes                                         | The `focus`, `line-strong` and dark `danger` overrides are not yet published to the design-system artifact |
| Metrics › Trends                                                                                       | Seen on the in-browser mock before the review fixes, not after; not against an API                         |
| Defects table, defect start as a named person                                                          | A browser or an API                                                                                        |
| Plan panel and its models in Team settings › Phases                                                    | An API with a saved panel                                                                                  |
| D23 steps 1 to 5: meeting side names, People, Setup, My Copilot token, MCP defaults                    | An API                                                                                                     |
| Meeting notes UX (move a topic anywhere, one-off Jira target, search)                                  | Against a local API                                                                                        |
| Cancel and Start again, Deploy and Release to TEST, Assess comments, running indicator, artifacts list | A browser or an API                                                                                        |

## Proof

- **`api:check`:** its mirror half passes; its `schema.d.ts` half fails, also on `main`, because the file is kept
  Prettier-formatted and `openapi-typescript --check` compares the raw output. The formatted output of
  `npm run api:types` is byte-identical to the committed file.
- **Merged without any Angular check:** "Blocked is not Ended" (PR #31) and its review fixes, Meetings slice 2, slice 3
  and the grill discard fix (their sessions ran only a stand-in `tsc`, the pure specs and Prettier).
- **CI:** none runs on github.com. `test.yml` and `lints-format.yml` call `ATC-GitHub/reusable-workflows` on
  `atc-ubuntu-latest`, which do not exist there, and `npm ci` needs the private registry for `@acme-fedev/*`.

## Open decisions

- Whether to wire the mock backend back into a build (`start:mock`) or delete it.
- `@acme-fedev/auth` is `^8.0.0` in runtime dependencies (the rule is exact pins) and `@acme-fedev/playwright-helpers`,
  a test helper, is a runtime dependency. Changing either is a dependency change and needs approval.

## Next, in order

0. **Decide on the review** (its §7): above all, nothing merges without a check that ran. Keep one source of truth:
   the company copy is synced here by copying its working tree over `main`, which on 2026-11-12 brought back three
   config files `main` had removed as unread (now removed again). Pull `main` into the company copy before the next
   sync, and delete there what `main` deletes: `.prettierrc.json`, `eslint.config.mjs`, `.tool-versions` and
   `proxy.conf.mjs`.
1. On a machine with the private registry and Node 24, repeat the full check with the real `@acme-fedev/auth`:
   `npm ci`, then `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix or drop
   `test:scripts`.
2. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
3. **Before the next TEST deploy** (with `ahoy-hosted`'s, see its `docs/progress.md`): mount a `/config.json` with
   FIO's `auth` (realm and client from `environment.test.ts`, and the three redirect URIs exactly as FIO's client
   registered them: today's build sends `<origin>/`, and `<origin>//ui/oauth/silent-refresh.html` for silent refresh)
   and `jiraBaseUrl` (`https://atc.acmegroup.net/jira`), then sign in once on TEST; after that, drop the values from
   `environment.test.ts` so the image carries no team's (audit #16).
4. **After the deploy, on TEST:** an admin saves our team's two meeting side names in Team settings › Meetings (or the
   meeting pages and Confluence copies say "Us" and "Stakeholders"); each person saves and tests their Copilot token in
   My Copilot token; check the plan panel's section as an admin; check the 7 empty states against the designs (light,
   dark, 390px), agree the first-use copy with the designer, and move the 3 app icons into the design system.
5. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, every migration applied): start a
   voyage, approve the plan, follow it to `done`; then Unblock, Retry and Accept on a package, Refresh design and
   Meetings (an action ticked done, two browsers on one meeting in progress, a screenshot pasted into a note and opened
   large, a meeting cancelled and one marked done, a question answered after its meeting ended and reopened, a topic
   moved to a one-off, a one-off's Jira target and a drafted story, search, undo a removal) and Crew (add the team, a
   swap for a holiday, its Undo) and Team settings (`AHOY_SECRETS_KEY`, `AHOY_ADMIN_QNUMBERS`: add a server, put a
   repository on it, change its host with the token, and read the history; connect a fake Jira, preview a query, set a
   board and add a fixed field; connect a fake Teams webhook and send a test card, save a fake Figma token and test it,
   generate a runner key and replace it, turn Business-rule review on and see the confirmation; lower a phase's cap,
   raise one with the confirmation, and save a catalogue; at the delivery gate, Assess comments with a note; set a
   defects query and priorities, wait for a pass, ignore a defect and undo it; add a repository's release workflow and
   deploy a package's branch with a fake `gh`).
6. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click, then
   updating a meeting's Confluence page once it exists.
7. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
