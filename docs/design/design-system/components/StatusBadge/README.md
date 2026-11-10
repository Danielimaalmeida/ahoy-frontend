# StatusBadge

A pill that shows a voyage's status in plain words, with the API status always available next to it.

| Badge          | Class                | API status                              |
| -------------- | -------------------- | --------------------------------------- |
| Queued         | `ah-badge--queued`   | `ready`                                 |
| Running        | `ah-badge--running`  | `running`                               |
| Needs answers  | `ah-badge--input`    | `awaiting_input`                        |
| Needs decision | `ah-badge--decision` | `awaiting_decision`                     |
| Halted         | `ah-badge--halted`   | `halted` (always shown with its reason) |
| Done           | `ah-badge--done`     | `terminal`, phase `done`                |
| Blocked        | `ah-badge--blocked`  | `terminal`, phase `blocked`             |

Use the label alone in lists. On a voyage header, put the API word beside it in `ah-api` (mono, muted), for example "Needs decision · awaiting_decision". The colour pairs are `status-*-bg` / `status-*-fg`; each passes 4.5:1 in both themes. The dot repeats the colour so the badge also reads at a glance in a crowded table.

## Markup

```html
<span class="ah-badge ah-badge--decision"><i class="ah-badge__dot"></i>Needs decision</span> <span class="ah-api">awaiting_decision</span>
```

## Angular

`<ah-status-badge [status]="story.status" [phase]="story.phase" [showApi]="true">`: maps the API status and phase to the label and modifier in one place.
