# ModelChoice

One row per phase to choose the model and reasoning effort: intake, planning, implementation and review (the one Lookout of `pr_review`), with where each value comes from.

- **Model** is a select filled from `GET /models`. The first option is the default from the catalogue's `defaults` ("Default · GPT-5.6 Terra"). Each model shows its `label`, with its id in brackets. The last option, "Other model id…", reveals a mono text input for any Copilot model id; the API accepts it.
- **Effort** is a select listing only the efforts the chosen model takes (`reasoningEfforts`). When the catalogue doesn't say (`null`), offer all five. When the model takes none (`[]`), disable the select with "No effort setting".
- Nothing here proves the owner's Copilot account may use the model. The worker checks before the first prompt (0 AIU); if it refuses, the voyage anchors with `run_failed`.
- The source tag (`ah-source`) uses the crew's words: Chosen for this voyage (`ah-source--chosen`), Server default, Agent config, Agent's own, Model's own.
- A reset button gives a slot back to the default (`null` in the API).
- A change applies from that phase's next run; an active run keeps its model. Say so near the save button.
