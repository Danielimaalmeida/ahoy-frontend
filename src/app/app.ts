import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

/** Root component. Lane 3A adds the top bar and toast host around the outlet. */
@Component({
  selector: "ah-root",
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
