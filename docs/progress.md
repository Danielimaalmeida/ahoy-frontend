# Ahoy frontend · progress

Updated 2026-11-15. The one status page: what is proven and how, what is not, and what comes next. Replace it after
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
  comments, Meetings, People with each person's side, Confluence, My Copilot token) and the Setup page; the Product
  page (admins only) with proposals to Jira or a meeting, look-ups and Apply.
- **How it is proven.** Every screen is proven by unit and component tests on the mock backend (Crew and Team settings
  over `HttpTestingController`). On 2026-11-07 every page was opened in Chromium on `ng serve` against a local
  `ahoy-hosted` with fictional data, for layout only; the inline story edit was seen in Chromium against a local API at
  1280px and 390px, in light and dark, with the keyboard path. No flow (a voyage to `done`, a gate, a Teams, Figma,
  Jira or Confluence call) has run against `npm run dev -- --simulate` end to end, a live API or TEST, and no
  Playwright e2e, 200% zoom or screen-reader check has run.
- **On `feat/defect-reproduction`** (not merged): Team settings › Environments (add, edit, remove, Test sign-in),
  Defects › Reproduction, and in Backlog › Defects the verdict and Reproduce. Besides their tests, the three were
  opened in Chromium on 2026-11-15 against a local `ahoy-hosted` API of `feat/environment-sign-in-test` with no
  dispatcher (0 AIU, fictional data, the verdict written into the database by hand), at 1280px and 390px, light and
  dark, the dialogs opened with the keyboard and closed with Escape. No reproduction or Test sign-in has run.
- **On `feat/reproduction-evidence`** (not merged, on top of the branch above): a verdict's tag in Backlog › Defects
  opens the reproduction's steps, screenshots and recording under the defect. Seen in Chromium against a local API with
  fictional evidence (0 AIU); no run has produced any.
- **The required checks rarely ran.** They need Node 24 and the company's private registry (`@acme-fedev/*`), which a
  cloud session cannot reach: most branches since 2026-11-05 ran substitutes instead (Node 22 or 26, the auth library
  stubbed in `node_modules`). The last full run with the real auth library was `feature/R3DA-14787-cli` (2026-11-11,
  Node 24.22.2 through `npx node@24`): format, build, typecheck, lint and `ng test` (220 files, 3,809 tests) passed.
  The latest substitute run, `feat/conversation-cap-ceiling` (2026-11-16, Node 24.22.3 through `npx node@24`, the
  auth library stubbed): build, typecheck, lint and format passed; `ng test` ran 238 files and 4,103 tests with three
  failures, all in `app.config.spec.ts`, which needs the real library's `MockAuthService` the stub lacks.
- **Contract:** the vendored `openapi/ahoy-v1.yaml` follows `ahoy-hosted`'s `main`, with the Product page's model and
  team defaults (migration 0055: `/settings/product`, a conversation's `model`, `jiraProject`, `confluenceSpaces` and
  `teamDefaults`, a turn's `mentions`) and defect reproduction (PRs #126 to #128 and #130, migrations 0056 to 0059: the
  environments, `Defect.reproduction` and its `evidence`, `reproduceDefect`, `testEnvironment`, `getDefectEvidence`,
  the reproduction fields of `DefectSettings`); `schema.d.ts` and the test mirror are generated from it. Deploy that
  API and its migrations with or before this front end: an older API sends none of them, and the pages refuse its
  answer. On `feat/conversation-cap-ceiling` it follows `ahoy-hosted`'s branch of the same name (a conversation's
  `budgetCapNanoAiu`), which an older API does not send either.

## Not checked yet

What each feature still needs beyond the tests above. Its pull request has the detail.

| Feature                                                                                                         | Not checked yet                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Needs you: phase in words with "Phase N of 8"; a "Defect" tag from `issueType`                                  | A browser (mockup only); an API with ahoy-hosted's `issueType` (no tag until it is deployed)               |
| The Product page (`/product`, admins only): proposals, look-ups, Apply, a model each, team defaults, read keys  | A browser after this branch; the stream on an API; a live session; Apply on a real Jira                    |
| Team settings › Figma › Runner key (generate, show once, copy, replace, remove)                                 | A browser and an API; a run fetching node trees with the key saved in GitHub                               |
| Environments, Defects › Reproduction, the verdict and Reproduce in Backlog › Defects                            | A Test sign-in and a reproduction that ran (a cluster Job); a screen reader; 200% zoom                     |
| A reproduction's steps, screenshots and recording under its defect; the Defects cards below 1280px              | Evidence a real run kept, a 24 MiB recording, an expired file; a screen reader; 200% zoom                  |
| Create in Confluence, Team settings › Confluence                                                                | A real Confluence; updating a page once it exists is not built                                             |
| Each person on a side of a meeting (People, `MeStore`)                                                          | A browser                                                                                                  |
| Backlog layouts; still pages on load (Voyages, Meetings, All hands)                                             | All hands: a browser. A voyage with a long history now delays All hands' first paint (a trade-off)         |
| The 7 empty states (Voyages, Meetings, notes)                                                                   | A browser, against the designs; the first-use copy for Voyages and Meetings is ours, not the designer's    |
| The `local` configuration (`npm run start:local`, no WebEAM)                                                    | A browser against a running API                                                                            |
| Design system re-sync, `docs/accessibility.md`, the a11y fixes                                                  | The `focus`, `line-strong` and dark `danger` overrides are not yet published to the design-system artifact |
| Metrics › Trends                                                                                                | Seen on the in-browser mock before the review fixes, not after; not against an API                         |
| Defects table, defect start as a named person                                                                   | A browser or an API                                                                                        |
| Plan panel and its models in Team settings › Phases                                                             | An API with a saved panel                                                                                  |
| D23 steps 1 to 5: meeting side names, People, Setup, My Copilot token, MCP defaults                             | An API                                                                                                     |
| Meeting notes UX (move a topic anywhere, one-off Jira target, search)                                           | Against a local API                                                                                        |
| Voyage page tidy-up: header More menu, Jira link on the key, phase names, PR comments folded, delivery decision | Against a local API and a real Jira link from Settings; a screen reader on the More menu                   |
| Cancel and Start again, Deploy and Release to TEST, Assess comments, running indicator, artifacts list          | A browser or an API                                                                                        |

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
1. **The Product page's session cap** (`feat/conversation-cap-ceiling`, with `ahoy-hosted`'s branch of the same name):
   the Cap field takes up to the conversation's `budgetCapNanoAiu` (`AHOY_MAX_PHASE_BUDGET_AIU`); review and merge,
   the API first or together. Then the user tries the page against `npm run dev -- --simulate` and says whether the
   per-conversation look-ups stand.
2. **Defect reproduction** (`ahoy-hosted`'s PRs #126 to #128 and #130 are merged). On TEST, after the deploy: add the
   environment, Test sign-in, then one Reproduce from the Backlog, and open its verdict to see the screenshots and the
   recording, before turning Reproduce before starting on.
3. On a machine with the private registry and Node 24, repeat the full check with the real `@acme-fedev/auth`:
   `npm ci`, then `npm run build && npm run typecheck && npm run lint && npm test && npm run format`. Fix or drop
   `test:scripts`.
4. Make CI run where the reusable workflows and the registry exist (the company GHES), and require it before merging.
5. **Before the next TEST deploy** (with `ahoy-hosted`'s, see its `docs/progress.md`): mount a `/config.json` with
   FIO's `auth` (realm and client from `environment.test.ts`, and the three redirect URIs exactly as FIO's client
   registered them: today's build sends `<origin>/`, and `<origin>//ui/oauth/silent-refresh.html` for silent refresh)
   and `jiraBaseUrl` (`https://atc.acmegroup.net/jira`), then sign in once on TEST; after that, drop the values from
   `environment.test.ts` so the image carries no team's (audit #16).
6. **After the deploy, on TEST:** an admin saves our team's two meeting side names in Team settings › Meetings (or the
   meeting pages and Confluence copies say "Us" and "Stakeholders"); each person saves and tests their Copilot token in
   My Copilot token; check the plan panel's section as an admin; check the 7 empty states against the designs (light,
   dark, 390px), agree the first-use copy with the designer, and move the 3 app icons into the design system.
7. Run the app against a local `ahoy-hosted` (`npm run dev -- --simulate`, 0 AIU, every migration applied): start a
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
8. Meetings, next slices in `ahoy-hosted` `design.md` §5: a topic from a note and a story placeholder in one click, then
   updating a meeting's Confluence page once it exists.
9. Only if the review's freeze is not agreed: the hosted features with no screen yet (the review's follow-ups and the
   fixers' answers beside the delivery gate, the anchor amendment beside a `child_ready` rejection).

Each step: the full check above on Node 24, then replace this page. Never contact TEST or a `--live` API without
explicit approval.
