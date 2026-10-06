import { Component, input } from "@angular/core";
import { RouterOutlet } from "@angular/router";

/** Voyage page shell: header and section tabs around the tab outlet (lane 4A builds it). */
@Component({
  selector: "ah-voyage-shell",
  imports: [RouterOutlet],
  template: `
    <p>Voyage {{ key() }} · not built yet · lane 4A</p>
    <router-outlet />
  `,
})
export class VoyageShell {
  /** The Jira key from `/voyages/:key`. */
  readonly key = input.required<string>();
}
