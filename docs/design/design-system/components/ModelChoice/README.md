# ModelChoice

One row per phase (and per reviewer lens) to choose the model and reasoning effort, showing where the current value comes from.

- Model is a free-text mono input: the API cannot list the models an account may use. Its placeholder shows the default ("Default: gpt-5.6-terra") when known.
- Effort is a select: Default, low, medium, high, xhigh, max. Some models take fewer or none; the worker checks before the first prompt (0 AIU) and anchors the voyage if refused.
- The source tag (`ah-source`) uses the crew's words: Chosen for this voyage (`ah-source--chosen`), Server default, Agent config, Agent's own, Model's own.
- A reset button gives a slot back to the default (`null` in the API).
- The two Lookouts must use different models; show the error under both rows.
- A change applies from that phase's next run; an active run keeps its model. Say so near the save button.
