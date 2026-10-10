# Design references: sources

Snapshot copied on **2026-10-06** by lane P0, so agents don't depend on access to the Claude Design artifacts. These files
are references, not code: they are excluded from lint, format, `tsc` and the build. **Don't edit them; re-sync them.**

| Folder           | Artifact                                                                    | Version           | Type          |
| ---------------- | --------------------------------------------------------------------------- | ----------------- | ------------- |
| `wireframes/`    | "Ahoy UI wireframes", <https://claude.ai/artifact/LTbtxVqPbLAodmy4Vr44dY>   | `1791303315-8e37` | Design        |
| `design-system/` | "Ahoy" (design system), <https://claude.ai/artifact/LAzfVgbze8zdoaShrSabtf> | `1791303933-1d4d` | Design System |

## What is here

- `wireframes/`: the 12 boards (`Main`, `Voyages`, `Docks`, `SetSail`, `PlanReview`, `Questions`, `Running`, `Halted`,
  `Records`, `RunDetail`, `Dialogs`, `States`) as `<Name>.dc.html`, plus `canvas.json` (board layout). Copied from the
  artifact's `project/` folder.
- `design-system/`: `README.md`, `vocabulary.md`, `tokens.json`, `design-system.json`, `components/bundle.css`, and
  `components/<Name>/{README.md,preview.html}` for the 22 components (ArtifactDiff, Banner, BudgetMeter, Button,
  ChoiceCard, DataTable, Dialog, EmptyState, Field, FilterChips, LiveSteps, ModelChoice, OutcomePill, Panel,
  PhaseStepper, QuestionCard, SectionTabs, ShipsLog, Skeleton, StatusBadge, Toast, TopBar), plus
  `components/Cover/preview.html` (the DS cover card, no README). Copied from the artifact's `project/` folder.
- `design-system/assets/Icons/*.svg` (16) and `design-system/assets/Logos/*.svg` (3): the artifact's uploaded assets, named
  after `assetGroups` in `design-system.json` (the artifact stores them by blob id).

## Known gaps

- `tokens.css` is **not** in the artifacts (the DS page generates it). Lane 1A generates it from `tokens.json`.
- The wireframes load `./support.js` (the Claude Design runtime), which the artifact does not publish. The boards still
  open as static HTML in a browser: their markup and inline styles are complete; only the `<x-dc>` runtime is missing.
  Not verified in a browser in phase 0.
- The data in the wireframes is fictional (PROJ-123, alex@example.com).
- The artifacts' own runtime (`artifact-type/`, `SKILL.md`, `index.html`) is not copied: it is the Claude Design viewer,
  not part of the design.

## How to re-sync

1. List the files and the current version of each artifact (`Artifact` tool, `action: "list"`, `scope: "files"`, with the
   URL above). If the version is unchanged, stop.
2. Read the `project/` files with `action: "read"` and `paths` (one call per artifact), and copy them over this folder.
3. For the SVGs, read `assetGroups` in `design-system.json`, then read each asset **one at a time** with `path` set to its
   `blob` id (a multi-path read of asset ids failed on 2026-10-06), and save it as `assets/<Group>/<name>`.
4. Update the versions and the date in this file, and say in `docs/progress.md` what changed. If `bundle.css` changed,
   lane 1A's copy in `src/styles/` must be re-synced too.
