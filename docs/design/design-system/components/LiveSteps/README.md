# LiveSteps

The read-only, scrolling list of a running agent's steps (`run.progress` events), newest at the bottom.

- Each row: time, an icon (tool or message), the tool name in `ah-steps__tool`, and its short summary (a path, a pattern, a command) or the message's first 200 characters.
- Some steps are left out on purpose. Show a gap row, "38 steps not shown", where they were; never imply the list is complete.
- Masked credentials appear as `[REDACTED]` in `ah-redacted`.
- Show the run's live spend next to its cap above the list. When the run ends, its result replaces the live spend and the steps stay as history.
- This is a view, not a control: no per-step actions, no chat. Use `role="log"`.
