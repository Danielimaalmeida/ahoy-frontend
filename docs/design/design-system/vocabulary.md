# Vocabulary

The nautical words Ahoy uses, and the API term behind each. Use these exactly; don't invent new ones without adding them here.

## Places and things

| Ahoy says             | Means                                          | API                                                                 |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Voyage                | A story: one Jira issue delivered through Ahoy | `Story`                                                             |
| Crew, crew member     | The AI agents                                  | `agent` (Navigator, Cartographer, Lookout)                          |
| Set sail              | Start a story                                  | `POST /stories` (`startStory`)                                      |
| All hands             | The "Needs you" inbox                          | stories with status `awaiting_input`, `awaiting_decision`, `halted` |
| At sea                | Voyages being worked on, nothing needed        | status `running`, `ready`                                           |
| The Docks             | The team's Jira backlog (planned screen)       | not in the API yet                                                  |
| Ship's log            | The activity timeline                          | `/stories/{key}/events`                                             |
| Drop anchor / Stop    | Halt a voyage                                  | `stopStory`                                                         |
| Weigh anchor / Resume | Clear a halt                                   | `resumeStory`                                                       |
| Your orders           | A human gate decision                          | `decideHumanGate`                                                   |

## Statuses

| Badge       | API status                  | Plain meaning                                                   |
| ----------- | --------------------------- | --------------------------------------------------------------- |
| Queued      | `ready`                     | Ahoy acts next                                                  |
| Under way   | `running`                   | A crew member's run is in progress                              |
| Crew asks   | `awaiting_input`            | Agent questions need answers                                    |
| Your orders | `awaiting_decision`         | A human gate is open                                            |
| Anchored    | `halted`                    | Stopped until a person resumes it; always shown with its reason |
| Docked      | `terminal`, phase `done`    | Delivered                                                       |
| Aground     | `terminal`, phase `blocked` | Rejected or failed for good                                     |
| In port     | `terminal`                  | Filter name for Docked and Aground together                     |

## Halt reasons (Anchored because…)

| API                        | Say                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `stopped_by_user`          | Someone on the crew stopped it. Show their reason.                                    |
| `gate_rejected`            | An automated check rejected the crew's output, and it can't be retried automatically. |
| `budget_exhausted`         | The voyage has spent its whole AIU budget. Raise the budget, then resume.             |
| `run_failed`               | A crew member's run failed, for example a refused model or a crash.                   |
| `run_lost`                 | Ahoy lost contact with a run and can't tell how it ended.                             |
| `run_result_invalid`       | A run finished, but its result couldn't be read or broke the rules.                   |
| `dispatch_failed`          | Ahoy couldn't start the run at all. Nothing was spent.                                |
| `revision_ceiling_reached` | The plan was sent back the maximum number of times (about 4).                         |
| `reconciler_error`         | Something went wrong inside Ahoy while moving the voyage on.                          |

## Model sources

| Tag                    | API source                              |
| ---------------------- | --------------------------------------- |
| This revision only     | `revision`                              |
| Chosen for this voyage | `story`                                 |
| Server default         | `configuration`                         |
| Agent config           | `phase_table` (the pinned `phases.tsv`) |
| Agent's own            | `agent_profile`                         |
| Model's own (effort)   | `model_default`                         |
