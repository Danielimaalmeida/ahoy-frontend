# OutcomePill

A small pill for an automated gate verdict, a human decision or a run's status, used in gate history and run tables.

| Outcome | Class |
| --- | --- |
| `pass`, `approve`, run `succeeded` | `ah-badge--done` |
| `branch` (questions for a human) | `ah-badge--input` |
| `send_back` | `ah-badge--sendback` |
| `fail`, `error`, `reject`, `halt`, run `failed`, `lost`, `timed_out`, `auth_failed`, `output_violation`, `budget_exceeded` | `ah-badge--halted` |
| waiting for a person | `ah-badge--decision` |
| run `queued`, `cancelled` | `ah-badge--queued` |
| run `running` | `ah-badge--running` |

Show the API word itself as the label (no dot): these are audit records, and people compare them with logs. The colour only groups them.

## Markup
```html
<span class="ah-badge ah-badge--sendback">send_back</span>
```
