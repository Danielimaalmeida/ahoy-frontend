# Field

A labelled form control with optional hint, unit suffix and error.

- Labels sit above the control, 12.5px semibold. Required fields get a `ah-req` asterisk; optional ones say "(optional)" in muted text.
- Hints say what the value does, not how to type it: "A hard cap for every run of this voyage together."
- Errors replace nothing: they appear under the control in `danger-text`, and the control gets `aria-invalid="true"`. Say what is wrong and how to fix it: "At least 12.4 AIU, what's already spent."
- Units go in `ah-suffix__unit` (AIU). Model ids and Jira keys use `ah-input--mono`.
- Typed text is never thrown away: on a 409 conflict the form keeps it (see Banner).

## Markup
```html
<div class="ah-field">
  <label class="ah-label" for="bud">Total budget <span class="ah-req">*</span></label>
  <div class="ah-suffix"><input id="bud" class="ah-input" inputmode="decimal" value="25"><span class="ah-suffix__unit">AIU</span></div>
  <span class="ah-hint">A hard cap for every run of this voyage together.</span>
</div>
```

## Angular
Pair with Reactive Forms: `<ah-field label="Total budget" [required]="true" hint="…" unit="AIU">` projecting the input, showing the first error from the control.
