import { Component, booleanAttribute, input } from "@angular/core";

/**
 * The tag saying where a value comes from (`ah-source`), such as "Server default"; `chosen` marks a value someone
 * picked for this voyage (`ah-source--chosen`). The text is projected.
 */
@Component({
  selector: "ah-source",
  host: { class: "ah-source", "[class.ah-source--chosen]": "chosen()" },
  template: `<ng-content />`,
})
export class Source {
  /** The value was chosen for this voyage rather than inherited. */
  readonly chosen = input(false, { transform: booleanAttribute });
}
