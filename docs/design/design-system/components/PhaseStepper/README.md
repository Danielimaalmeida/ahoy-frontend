# PhaseStepper

Shows where a voyage is in intake → planning → plan_review → implementation → pr_review → delivery_gate → done.

- `ah-step--done`: passed phases (accent-soft, check mark).
- `ah-step--current`: the phase the voyage is in (accent fill). Exactly one.
- `ah-step--stopped`: the phase a voyage is anchored or aground in (status-halted colours, "!"). Replaces current.
- plain `ah-step`: phases still ahead. Show all of them, even ones without screens yet.

Labels are the API phase names; they are short and people learn them. In tables use the compact `ah-dots` form (7 bars, `is-done`, `is-current`, `is-stopped`) with an `aria-label` such as "Phase 3 of 7".

## Markup
```html
<div class="ah-stepper" aria-label="Phases">
  <span class="ah-step ah-step--done"><b class="ah-step__n">✓</b>intake</span><span class="ah-step__sep"></span>
  <span class="ah-step ah-step--current"><b class="ah-step__n">2</b>planning</span>
</div>
```

## Angular
`<ah-phase-stepper [phase]="story.phase" [status]="story.status" [compact]="false">`.
