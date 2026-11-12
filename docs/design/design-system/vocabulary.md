# Vocabulary

Ahoy keeps its nautical theme in names and headings, and uses plain words wherever people act or must read a state at a glance. This page lists both, with the API term behind each. Use these exactly; don't invent new ones without adding them here.

## Names and headings (themed)

| Ahoy says         | Means                                          | API                                                                 |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Voyage            | A story: one Jira issue delivered through Ahoy | `Story`                                                             |
| Crew              | The AI agents                                  | `agent` (Navigator, Cartographer, Lookout)                          |
| First Mate        | The agent that discusses ideas (concept)       | not in the API yet                                                  |
| All hands on deck | Heading of the Needs you page                  | stories with status `awaiting_input`, `awaiting_decision`, `halted` |
| Calm seas         | Empty Needs you page                           | none                                                                |

## Navigation and actions (plain)

| Label                      | Means                                    | API                                                                 |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| Needs you                  | The inbox of voyages waiting on a person | stories with status `awaiting_input`, `awaiting_decision`, `halted` |
| Ideas                      | Ideas discussed before Jira (concept)    | not in the API yet                                                  |
| Backlog                    | The team's Jira backlog (planned screen) | not in the API yet                                                  |
| Activity                   | The timeline of a voyage's events        | `/stories/{key}/events`                                             |
| In progress                | Voyages being worked on, nothing needed  | status `running`, `ready`                                           |
| Start voyage               | Start a story                            | `POST /stories` (`startStory`)                                      |
| Stop                       | Halt a voyage                            | `stopStory`                                                         |
| Resume                     | Clear a halt                             | `resumeStory`                                                       |
| Approve, Send back, Reject | A human gate decision                    | `decideHumanGate`                                                   |

## Statuses

| Badge          | API status                  | Plain meaning                                                   |
| -------------- | --------------------------- | --------------------------------------------------------------- |
| Queued         | `ready`                     | Ahoy acts next                                                  |
| Running        | `running`                   | An agent's run is in progress                                   |
| Needs answers  | `awaiting_input`            | Agent questions need answers                                    |
| Needs decision | `awaiting_decision`         | A human gate is open                                            |
| Halted         | `halted`                    | Stopped until a person resumes it; always shown with its reason |
| Done           | `terminal`, phase `done`    | Delivered                                                       |
| Blocked        | `terminal`, phase `blocked` | Rejected or failed for good                                     |
| Finished       | `terminal`                  | Filter name for Done and Blocked together                       |

## Halt reasons (Halted because…)

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
