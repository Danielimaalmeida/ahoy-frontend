# Dialog

A modal for actions that change a voyage: stop, resume, change budget, change models, send back, reject.

- Title asks or states the action ("Weigh anchor and resume?"); the icon tile hints at its kind (`ah-dialog__icon--danger` for stop and reject).
- The body says exactly what will happen, then a cost box (`ah-cost`) if it may spend AIU, then the fields.
- The footer has Cancel and one confirm button whose label repeats the action, with the amount when it spends ("Resume · up to 10.2 AIU").
- Destructive confirms use `ah-btn--danger`. Escape and Cancel close without changes.
- Every request carries the story version; on a 409 the dialog stays open, shows the notice banner and keeps the text.

## Angular
Angular CDK `Dialog` with this markup as the template; focus starts on the first field.
