import { Component, input } from "@angular/core";

/** Stand-in for a screen a later lane builds; shows its name and owner. Bound from route `data`. */
@Component({
  selector: "ah-placeholder",
  template: `
    <section class="ah-placeholder">
      <h1>{{ heading() }}</h1>
      <p>Not built yet · lane {{ lane() }}</p>
    </section>
  `,
})
export class Placeholder {
  readonly heading = input.required<string>();
  readonly lane = input.required<string>();
}
