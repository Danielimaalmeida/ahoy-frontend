import { Component } from "@angular/core";
import { TopBar } from "@ui/top-bar/top-bar";

/**
 * Gallery: the TopBar preview in its three stream states. The destinations are real links, so none is current on
 * `/_kit`; `aria-current` is proved by the unit tests.
 */
@Component({
  selector: "ah-kit-top-bar",
  imports: [TopBar],
  template: `
    <ah-top-bar [needsYou]="4" live="live" [user]="user" />
    <ah-top-bar [needsYou]="4" live="reconnecting" [user]="user" />
    <ah-top-bar [needsYou]="0" live="offline" [user]="user" />
  `,
})
export class KitTopBar {
  protected readonly user = { email: "alex@example.com", initials: "AL" };
}
